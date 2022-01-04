import {
  Kind,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';
import { inspect } from '../jsutils/inspect.mjs';
import { invariant } from '../jsutils/invariant.mjs';
import { memoize1 } from '../jsutils/memoize1.mjs';

function is(x, type) {
  if (Object.prototype.toString.call(x) === `[object ${type}]`) {
    return true;
  }

  const prototype = Object.getPrototypeOf(x);

  if (prototype == null) {
    return false;
  }

  return is(prototype, type);
}

function _isScalarType(type) {
  return is(type, 'GraphQLScalarType');
}

function _isObjectType(type) {
  return is(type, 'GraphQLObjectType');
}

function _isInterfaceType(type) {
  return is(type, 'GraphQLInterfaceType');
}

function _isUnionType(type) {
  return is(type, 'GraphQLUnionType');
}

function _isEnumType(type) {
  return is(type, 'GraphQLEnumType');
}

function _isInputObjectType(type) {
  return is(type, 'GraphQLInputObjectType');
}

function _isListType(type) {
  return Object.prototype.toString.call(type) === '[object GraphQLList]';
}

function _isNonNullType(type) {
  return Object.prototype.toString.call(type) === '[object GraphQLNonNull]';
}

function _toExecutorSchema(schema) {
  const listTypes = new Set();
  const nonNullTypes = new Set();
  const namedTypes = new Set();
  const inputTypes = new Set();
  const leafTypes = new Set();
  const abstractTypes = new Set();
  const objectTypes = new Set();
  const inputObjectTypes = new Set();
  const rootTypeTreeNode = {
    [Kind.NAMED_TYPE]: new Map(),
  };
  const subTypesMap = new Map();
  const possibleTypesMap = new Map();

  function addTypeToTypeTree(
    originalType,
    type = originalType,
    node = rootTypeTreeNode,
  ) {
    if (_isListType(type)) {
      let listTypeNode = node[Kind.LIST_TYPE];

      if (!listTypeNode) {
        listTypeNode = node[Kind.LIST_TYPE] = {
          [Kind.NAMED_TYPE]: new Map(),
        };
      }

      addTypeToTypeTree(originalType, type.ofType, listTypeNode);
    } else if (_isNonNullType(type)) {
      let nonNullTypeNode = node[Kind.NON_NULL_TYPE];

      if (!nonNullTypeNode) {
        nonNullTypeNode = node[Kind.NON_NULL_TYPE] = {
          [Kind.NAMED_TYPE]: new Map(),
        };
      }

      addTypeToTypeTree(originalType, type.ofType, nonNullTypeNode);
    } else {
      node[Kind.NAMED_TYPE].set(type.name, originalType);
    }
  }

  function processType(type) {
    if (_isListType(type) && !listTypes.has(type)) {
      listTypes.add(type);
      processType(type.ofType);
    } else if (_isNonNullType(type) && !nonNullTypes.has(type)) {
      nonNullTypes.add(type);
      processType(type.ofType);
    } else if (_isScalarType(type) && !namedTypes.has(type)) {
      namedTypes.add(type);
      leafTypes.add(type);
    } else if (_isObjectType(type) && !namedTypes.has(type)) {
      namedTypes.add(type);
      objectTypes.add(type);
      addTypeToTypeTree(type);

      for (const field of Object.values(type.getFields())) {
        processType(field.type);

        for (const arg of field.args) {
          inputTypes.add(arg.type);
          addTypeToTypeTree(arg.type);
          processType(arg.type);
        }
      }

      for (const iface of Object.values(type.getInterfaces())) {
        processType(iface);
        let subTypes = subTypesMap.get(iface);

        if (!subTypes) {
          subTypes = new Set();
          subTypesMap.set(iface, subTypes);
        }

        subTypes.add(type);
        let possibleTypes = possibleTypesMap.get(iface);

        if (!possibleTypes) {
          possibleTypes = [];
          possibleTypesMap.set(iface, possibleTypes);
        }

        possibleTypes.push(type);
      }
    } else if (_isInterfaceType(type) && !namedTypes.has(type)) {
      namedTypes.add(type);
      abstractTypes.add(type);
      addTypeToTypeTree(type);

      for (const field of Object.values(type.getFields())) {
        processType(field.type); // TODO: add test

        /* c8 ignore next 5 */

        for (const arg of field.args) {
          inputTypes.add(arg.type);
          addTypeToTypeTree(arg.type);
          processType(arg.type);
        }
      } // NOTE: pre-v15 compatibility

      if ('getInterfaces' in type) {
        for (const iface of Object.values(type.getInterfaces())) {
          processType(iface);
          let subTypes = subTypesMap.get(iface);

          if (!subTypes) {
            subTypes = new Set();
            subTypesMap.set(iface, subTypes);
          }

          subTypes.add(type);
        }
      }
    } else if (_isUnionType(type) && !namedTypes.has(type)) {
      namedTypes.add(type);
      abstractTypes.add(type);
      addTypeToTypeTree(type);
      let subTypes = subTypesMap.get(type);

      if (!subTypes) {
        subTypes = new Set();
        subTypesMap.set(type, subTypes);
      }

      let possibleTypes = possibleTypesMap.get(type);

      if (!possibleTypes) {
        possibleTypes = [];
        possibleTypesMap.set(type, possibleTypes);
      }

      for (const possibleType of type.getTypes()) {
        processType(possibleType);
        subTypes.add(possibleType);
        possibleTypes.push(possibleType);
      }
    } else if (_isEnumType(type) && !namedTypes.has(type)) {
      namedTypes.add(type);
      leafTypes.add(type);
    } else if (_isInputObjectType(type) && !namedTypes.has(type)) {
      namedTypes.add(type);
      inputObjectTypes.add(type);

      for (const field of Object.values(type.getFields())) {
        inputTypes.add(field.type);
        addTypeToTypeTree(field.type);
        processType(field.type);
      }
    }
  }

  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  const subscriptionType = schema.getSubscriptionType();

  for (const type of Object.values(schema.getTypeMap())) {
    processType(type);
  }

  for (const fieldDef of [
    SchemaMetaFieldDef,
    TypeMetaFieldDef,
    TypeNameMetaFieldDef,
  ]) {
    processType(fieldDef.type);

    for (const arg of fieldDef.args) {
      inputTypes.add(arg.type);
      addTypeToTypeTree(arg.type);
      processType(arg.type);
    }
  }

  for (const directive of [...schema.getDirectives()]) {
    for (const arg of directive.args) {
      inputTypes.add(arg.type);
      addTypeToTypeTree(arg.type);
      processType(arg.type);
    }
  }

  function isListType(type) {
    return listTypes.has(type);
  }

  function isNonNullType(type) {
    return nonNullTypes.has(type);
  }

  function isNamedType(type) {
    return namedTypes.has(type);
  }

  function isInputType(type) {
    return inputTypes.has(type);
  }

  function isLeafType(type) {
    return leafTypes.has(type);
  }

  function isAbstractType(type) {
    return abstractTypes.has(type);
  }

  function isObjectType(type) {
    return objectTypes.has(type);
  }

  function isInputObjectType(type) {
    return inputObjectTypes.has(type);
  }

  function getNamedType(typeName) {
    var _schema$getType;

    // cast necessary pre v15 to convert null to undefined
    return (_schema$getType = schema.getType(typeName)) !== null &&
      _schema$getType !== void 0
      ? _schema$getType
      : undefined;
  }

  function getType(typeNode, typeTreeNode = rootTypeTreeNode) {
    switch (typeNode.kind) {
      case Kind.LIST_TYPE: {
        return getType(typeNode.type, typeTreeNode[Kind.LIST_TYPE]);
      }

      case Kind.NON_NULL_TYPE: {
        return getType(typeNode.type, typeTreeNode[Kind.NON_NULL_TYPE]);
      }

      case Kind.NAMED_TYPE:
        return typeTreeNode[Kind.NAMED_TYPE].get(typeNode.name.value);
    }
  }

  function getRootType(operation) {
    if (operation === 'query') {
      return queryType !== null && queryType !== void 0 ? queryType : undefined;
    } else if (operation === 'mutation') {
      return mutationType !== null && mutationType !== void 0
        ? mutationType
        : undefined;
    } else if (operation === 'subscription') {
      return subscriptionType !== null && subscriptionType !== void 0
        ? subscriptionType
        : undefined;
    }
    /* c8 ignore next 3 */
    // Not reachable. All possible operation types have been considered.

    false ||
      invariant(false, 'Unexpected operation type: ' + inspect(operation));
  }

  function getPossibleTypes(abstractType) {
    var _possibleTypesMap$get;

    // TODO: add test
    return (_possibleTypesMap$get = possibleTypesMap.get(abstractType)) !==
      /* c8 ignore next */
      null && _possibleTypesMap$get !== void 0
      ? _possibleTypesMap$get
      : [];
  }

  function isSubType(abstractType, maybeSubType) {
    var _subTypesMap$get$has, _subTypesMap$get;

    return (_subTypesMap$get$has =
      (_subTypesMap$get = subTypesMap.get(abstractType)) === null ||
      _subTypesMap$get === void 0
        ? void 0
        : _subTypesMap$get.has(maybeSubType)) !==
      /* c8 ignore start */
      null && _subTypesMap$get$has !== void 0
      ? _subTypesMap$get$has // TODO: add test
      : false;
    /* c8 ignore stop */
  }

  return {
    isListType,
    isNonNullType,
    isNamedType,
    isInputType,
    isLeafType,
    isAbstractType,
    isObjectType,
    isInputObjectType,
    getNamedType,
    getType,
    getRootType,
    getPossibleTypes,
    isSubType,
  };
}

export const toExecutorSchema = memoize1(_toExecutorSchema);
