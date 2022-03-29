import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { GraphQLSchema } from 'graphql';
import { buildSchema } from 'graphql';

import { handlePre15 } from '../../__testUtils__/handlePre15';

import { composeSubschemas } from '../composeSubschemas';
import { toExecutorSchema } from '../toExecutorSchema';

describe('ExecutorSchema:', () => {
  it('throws with unexpected Query type', () => {
    const testSchema: GraphQLSchema = buildSchema(`
      type QueryRoot {
        someField: String
      }

      schema {
        query: QueryRoot
      }
    `);

    const executorSchema = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema],
      }),
    ).throws(
      'Subchema 0 defines a root type with name "QueryRoot", expected name "Query".',
    );
  });

  it('does not throw with custom Query type', () => {
    const testSchema: GraphQLSchema = buildSchema(`
      type QueryRoot {
        someField: String
      }

      schema {
        query: QueryRoot
      }
    `);

    const executorSchema = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema],
        queryTypeName: 'QueryRoot',
      }),
    ).not.to.throw();
  });

  it('throws with unexpected Mutation type', () => {
    const testSchema: GraphQLSchema = buildSchema(`
      type Query {
        someField: String
      }

      type MutationRoot {
        someField: String
      }

      schema {
        mutation: MutationRoot
      }
    `);

    const executorSchema = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema],
      }),
    ).throws(
      'Subchema 0 defines a root type with name "MutationRoot", expected name "Mutation".',
    );
  });

  it('does not throw with custom Mutation type', () => {
    const testSchema: GraphQLSchema = buildSchema(`
      type Query {
        someField: String
      }

      type MutationRoot {
        someField: String
      }

      schema {
        mutation: MutationRoot
      }
    `);

    const executorSchema = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema],
        mutationTypeName: 'MutationRoot',
      }),
    ).does.not.throw();
  });

  it('throws with unexpected Subscription type', () => {
    const testSchema: GraphQLSchema = buildSchema(`
      type Query {
        someField: String
      }

      type SubscriptionRoot {
        someField: String
      }

      schema {
        subscription: SubscriptionRoot
      }
    `);

    const executorSchema = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema],
      }),
    ).throws(
      'Subchema 0 defines a root type with name "SubscriptionRoot", expected name "Subscription".',
    );
  });

  it('does not throw with custom Subscription type', () => {
    const testSchema: GraphQLSchema = buildSchema(`
      type Query {
        someField: String
      }

      type SubscriptionRoot {
        someField: String
      }

      schema {
        subscription: SubscriptionRoot
      }
    `);

    const executorSchema = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema],
        subscriptionTypeName: 'SubscriptionRoot',
      }),
    ).does.not.throw();
  });

  it('throws with type clash', () => {
    const testSchema1: GraphQLSchema = buildSchema(`
      scalar SomeType

      type Query {
        someField: SomeType
      }
    `);

    const testSchema2: GraphQLSchema = buildSchema(`
      enum SomeType

      type Query {
        someField: SomeType
      }
    `);

    const executorSchema1 = toExecutorSchema(testSchema1);
    const executorSchema2 = toExecutorSchema(testSchema2);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema1, executorSchema2],
      }),
    ).throws(
      'Subchema 0 includes a type with name "SomeType" of kind "SCALAR", but a type with name "SomeType" in subschema 1 is of kind "ENUM".',
    );
  });

  it('does not throw', () => {
    // TODO: set up new executable test schema
    const testSchema: GraphQLSchema = buildSchema(`
      interface Mammal {
        mother: Mammal
        father: Mammal
      }

      interface Pet {
        name(surname: Boolean): String
      }

      interface Canine${handlePre15(' implements Mammal', '')} {
        name(surname: Boolean): String
        mother: Canine
        father: Canine
      }

      enum DogCommand {
        SIT
        HEEL
        DOWN
      }

      type Dog implements Pet & Mammal & Canine {
        name(surname: Boolean): String
        nickname: String
        barkVolume: Int
        barks: Boolean
        doesKnowCommand(dogCommand: DogCommand): Boolean
        isHouseTrained(atOtherHomes: Boolean = true): Boolean
        isAtLocation(x: Int, y: Int): Boolean
        mother: Dog
        father: Dog
      }

      type Cat implements Pet {
        name(surname: Boolean): String
        nickname: String
        meows: Boolean
        meowsVolume: Int
        furColor: FurColor
      }

      union CatOrDog = Cat | Dog

      type Human {
        name(surname: Boolean): String
        pets: [Pet]
        relatives: [Human]!
      }

      enum FurColor {
        BROWN
        BLACK
        TAN
        SPOTTED
        NO_FUR
        UNKNOWN
      }

      input ComplexInput {
        requiredField: Boolean!
        nonNullField: Boolean! = false
        intField: Int
        stringField: String
        booleanField: Boolean
        stringListField: [String]
      }

      type ComplicatedArgs {
        # TODO List
        # TODO Coercion
        # TODO NotNulls
        intArgField(intArg: Int): String
        nonNullIntArgField(nonNullIntArg: Int!): String
        stringArgField(stringArg: String): String
        booleanArgField(booleanArg: Boolean): String
        enumArgField(enumArg: FurColor): String
        floatArgField(floatArg: Float): String
        idArgField(idArg: ID): String
        stringListArgField(stringListArg: [String]): String
        stringListNonNullArgField(stringListNonNullArg: [String!]): String
        complexArgField(complexArg: ComplexInput): String
        multipleReqs(req1: Int!, req2: Int!): String
        nonNullFieldWithDefault(arg: Int! = 0): String
        multipleOpts(opt1: Int = 0, opt2: Int = 0): String
        multipleOptAndReq(req1: Int!, req2: Int!, opt1: Int = 0, opt2: Int = 0): String
      }

      type QueryRoot {
        human(id: ID): Human
        dog: Dog
        cat: Cat
        pet: Pet
        catOrDog: CatOrDog
        complicatedArgs: ComplicatedArgs
      }

      schema {
        query: QueryRoot
      }

      directive @onField on FIELD
    `);

    const executorSchema1 = toExecutorSchema(testSchema);
    const executorSchema2 = toExecutorSchema(testSchema);

    expect(() =>
      composeSubschemas({
        subschemas: [executorSchema1, executorSchema2],
        queryTypeName: 'QueryRoot',
      }),
    ).not.to.throw();
  });
});
