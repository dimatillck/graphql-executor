import type {
  GraphQLDirective,
  GraphQLNamedType,
  GraphQLObjectType,
  OperationTypeNode,
} from 'graphql';

import { inspect } from '../jsutils/inspect';
import { invariant } from '../jsutils/invariant';
import type { Maybe } from '../jsutils/Maybe';
import type { ObjMap } from '../jsutils/ObjMap';

import type { ExecutorSchema } from './executorSchema';
import {
  isScalarType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isEnumType,
  isInputObjectType,
} from './predicates';
import { toExecutorSchemaImpl } from './toExecutorSchema';

interface CompositeSchema {
  executorSchema: ExecutorSchema;
  subschemas: ReadonlyArray<ExecutorSchema>;
}

interface ComposeSubschemasOptions {
  subschemas: ReadonlyArray<ExecutorSchema>;
  queryTypeName?: string;
  mutationTypeName?: string;
  subscriptionTypeName?: string;
}

type NamedTypeKind =
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT';

function getNamedTypeKind(type: GraphQLNamedType): NamedTypeKind {
  if (isScalarType(type)) {
    return 'SCALAR';
  }
  if (isObjectType(type)) {
    return 'OBJECT';
  }
  if (isInterfaceType(type)) {
    return 'INTERFACE';
  }
  if (isUnionType(type)) {
    return 'UNION';
  }
  if (isEnumType(type)) {
    return 'ENUM';
  }
  if (isInputObjectType(type)) {
    return 'INPUT_OBJECT';
  }
  /* c8 ignore next 3 */
  // Not reachable. All possible type kinds have been considered.
  invariant(false, 'Unexpected type kind: ' + inspect(type));
}

export function composeSubschemas({
  subschemas,
  queryTypeName = 'Query',
  mutationTypeName = 'Mutation',
  subscriptionTypeName = 'Subscription',
}: ComposeSubschemasOptions): CompositeSchema {
  const rootTypeNames = [queryTypeName, mutationTypeName, subscriptionTypeName];

  const typeRefMap: ObjMap<
    Array<{ subschemaIndex: number; type: GraphQLNamedType }>
  > = Object.create(null);
  const typeMap: ObjMap<GraphQLNamedType> = Object.create(null);
  const directiveMap: ObjMap<GraphQLDirective> = Object.create(null);

  for (
    let subschemaIndex = 0;
    subschemaIndex < subschemas.length;
    subschemaIndex++
  ) {
    const subschema = subschemas[subschemaIndex];

    const rootTypes = [
      subschema.getRootType('query' as OperationTypeNode),
      subschema.getRootType('mutation' as OperationTypeNode),
      subschema.getRootType('subscription' as OperationTypeNode),
    ];

    for (let j = 0; j < rootTypeNames.length; j++) {
      const rootType = rootTypes[j];
      const rootTypeName = rootTypeNames[j];
      if (rootType) {
        if (rootType.name !== rootTypeName) {
          throw new Error(
            `Subchema ${subschemaIndex} defines a root type with name "${rootType.name}", expected name "${rootTypeName}".`,
          );
        }
      }
    }

    for (const type of subschema.getNamedTypes()) {
      const typeName = type.name;
      if (!typeName.startsWith('__')) {
        if (!typeRefMap[typeName]) {
          typeRefMap[typeName] = [{ subschemaIndex, type }];
          continue;
        }
        typeRefMap[typeName].push({ subschemaIndex, type });
      }
    }

    for (const directive of subschema.getDirectives()) {
      directiveMap[directive.name] = directive;
    }
  }

  for (const [typeName, typeRefs] of Object.entries(typeRefMap)) {
    const { subschemaIndex: initialSubschemaIndex, type: initialType } =
      typeRefs[0];
    const initialKind = getNamedTypeKind(initialType);
    for (let i = 1; i < typeRefs.length; i++) {
      const { subschemaIndex, type } = typeRefs[i];
      const kind = getNamedTypeKind(type);
      if (kind !== initialKind) {
        throw new Error(
          `Subchema ${initialSubschemaIndex} includes a type with name "${typeName}" of kind "${initialKind}", but a type with name "${typeName}" in subschema ${subschemaIndex} is of kind "${kind}".`,
        );
      }

      typeMap[typeName] = type;
    }
  }

  const executorSchema = toExecutorSchemaImpl({
    description: undefined,
    typeMap,
    directiveMap,
    // these are validated to be of type GraphQLObjectType above
    queryType: typeMap[queryTypeName] as Maybe<GraphQLObjectType>,
    mutationType: typeMap[mutationTypeName] as Maybe<GraphQLObjectType>,
    subscriptionType: typeMap[subscriptionTypeName] as Maybe<GraphQLObjectType>,
  });

  return {
    executorSchema,
    subschemas,
  };
}
