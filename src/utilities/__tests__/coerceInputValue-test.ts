import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  GraphQLScalarType,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql';
import type { GraphQLInputType } from 'graphql';

import { handlePre15 } from '../../__testUtils__/handlePre15';

import { identityFunc } from '../../jsutils/identityFunc';

import { toExecutorSchema } from '../../executorSchema/toExecutorSchema';

import { coerceInputValue } from '../coerceInputValue';

const TestNonNull = new GraphQLNonNull(GraphQLInt);
const TestScalar = new GraphQLScalarType({
  name: 'TestScalar',
  parseValue(input: any) {
    if (input.error != null) {
      throw new Error(input.error);
    }
    return input.value;
  },
  serialize: identityFunc, // necessary pre v15
});
const TestEnum = new GraphQLEnumType({
  name: 'TestEnum',
  values: {
    FOO: { value: 'InternalFoo' },
    BAR: { value: 123456789 },
  },
});
const TestInputObject = new GraphQLInputObjectType({
  name: 'TestInputObject',
  fields: {
    foo: { type: new GraphQLNonNull(GraphQLInt) },
    bar: { type: GraphQLInt },
  },
});
const TestList = new GraphQLList(GraphQLInt);
const TestNestedList = new GraphQLList(new GraphQLList(GraphQLInt));
const PassThroughScalar = new GraphQLScalarType({
  name: 'PassThroughScalar',
  serialize: identityFunc, // necessary pre v15
});
const makeTestInputObject = (suffix: string, defaultValue: any) =>
  new GraphQLInputObjectType({
    name: 'TestInputObject' + suffix,
    fields: {
      foo: {
        type: PassThroughScalar,
        defaultValue,
      },
    },
  });
const testInputObjectWithDefaultInt = makeTestInputObject('WithDefaultInt', 7);
const testInputObjectWithDefaultNull = makeTestInputObject(
  'WithDefaultNull',
  null,
);
const testInputObjectWithDefaultNaN = makeTestInputObject(
  'WithDefaultNaN',
  NaN,
);
const TestListOfObjects = new GraphQLList(
  new GraphQLInputObjectType({
    name: 'TestObjectWithLength',
    fields: {
      length: { type: GraphQLInt },
    },
  }),
);
const TestListOfNonNullInt = new GraphQLList(new GraphQLNonNull(GraphQLInt));
const TestNonNullInt = new GraphQLNonNull(GraphQLInt);

const query = new GraphQLObjectType({
  fields: {
    test: {
      args: {
        testNonNull: { type: TestNonNull },
        testScalar: {
          type: TestScalar,
        },
        testEnum: {
          type: TestEnum,
        },
        testInputObject: { type: TestInputObject },
        testList: {
          type: TestList,
        },
        testNestedList: {
          type: TestNestedList,
        },
        testInputObjectWithDefaultInt: { type: testInputObjectWithDefaultInt },
        testInputObjectWithDefaultNull: {
          type: testInputObjectWithDefaultNull,
        },
        testInputObjectWithDefaultNaN: { type: testInputObjectWithDefaultNaN },
        testListOfObjects: { type: TestListOfObjects },
        testNonNullInt: { type: TestNonNullInt },
        testListOfNonNullInt: { type: TestListOfNonNullInt },
      },
      type: GraphQLInt,
    },
  },
  name: 'Query',
});

const schema = new GraphQLSchema({ query });
const executorSchema = toExecutorSchema(schema);

interface CoerceResult {
  value: unknown;
  errors: ReadonlyArray<CoerceError>;
}

interface CoerceError {
  path: ReadonlyArray<string | number>;
  value: unknown;
  error: string;
}

function coerceValue(
  inputValue: unknown,
  type: GraphQLInputType,
): CoerceResult {
  const errors: Array<CoerceError> = [];
  const value = coerceInputValue(
    executorSchema,
    inputValue,
    type,
    (path, invalidValue, error) => {
      errors.push({ path, value: invalidValue, error: error.message });
    },
  );

  return { errors, value };
}

function expectValue(result: CoerceResult) {
  expect(result.errors).to.deep.equal([]);
  return expect(result.value);
}

function expectErrors(result: CoerceResult) {
  return expect(result.errors);
}

describe('coerceInputValue', () => {
  describe('for GraphQLNonNull', () => {
    it('returns no error for non-null value', () => {
      const result = coerceValue(1, TestNonNull);
      expectValue(result).to.equal(1);
    });

    it('returns an error for undefined value', () => {
      const result = coerceValue(undefined, TestNonNull);
      expectErrors(result).to.deep.equal([
        {
          error: 'Expected non-nullable type "Int!" not to be null.',
          path: [],
          value: undefined,
        },
      ]);
    });

    it('returns an error for null value', () => {
      const result = coerceValue(null, TestNonNull);
      expectErrors(result).to.deep.equal([
        {
          error: 'Expected non-nullable type "Int!" not to be null.',
          path: [],
          value: null,
        },
      ]);
    });
  });

  describe('for GraphQLScalar', () => {
    it('returns no error for valid input', () => {
      const result = coerceValue({ value: 1 }, TestScalar);
      expectValue(result).to.equal(1);
    });

    it('returns no error for null result', () => {
      const result = coerceValue({ value: null }, TestScalar);
      expectValue(result).to.equal(null);
    });

    it('returns no error for NaN result', () => {
      const result = coerceValue({ value: NaN }, TestScalar);
      expectValue(result).to.satisfy(Number.isNaN);
    });

    it('returns an error for undefined result', () => {
      const result = coerceValue({ value: undefined }, TestScalar);
      expectErrors(result).to.deep.equal([
        {
          error: 'Expected type "TestScalar".',
          path: [],
          value: { value: undefined },
        },
      ]);
    });

    it('returns an error for undefined result', () => {
      const inputValue = { error: 'Some error message' };
      const result = coerceValue(inputValue, TestScalar);
      expectErrors(result).to.deep.equal([
        {
          error: 'Expected type "TestScalar". Some error message',
          path: [],
          value: { error: 'Some error message' },
        },
      ]);
    });
  });

  describe('for GraphQLEnum', () => {
    it('returns no error for a known enum name', () => {
      const fooResult = coerceValue('FOO', TestEnum);
      expectValue(fooResult).to.equal('InternalFoo');

      const barResult = coerceValue('BAR', TestEnum);
      expectValue(barResult).to.equal(123456789);
    });

    it('returns an error for misspelled enum value', () => {
      const result = coerceValue('foo', TestEnum);
      expectErrors(result).to.deep.equal([
        {
          error: handlePre15(
            'Value "foo" does not exist in "TestEnum" enum. Did you mean the enum value "FOO"?',
            'Expected type "TestEnum".',
          ),
          path: [],
          value: 'foo',
        },
      ]);
    });

    it('returns an error for incorrect value type', () => {
      const result1 = coerceValue(123, TestEnum);
      expectErrors(result1).to.deep.equal([
        {
          error: handlePre15(
            'Enum "TestEnum" cannot represent non-string value: 123.',
            'Expected type "TestEnum".',
          ),
          path: [],
          value: 123,
        },
      ]);

      const result2 = coerceValue({ field: 'value' }, TestEnum);
      expectErrors(result2).to.deep.equal([
        {
          error: handlePre15(
            'Enum "TestEnum" cannot represent non-string value: { field: "value" }.',
            'Expected type "TestEnum".',
          ),
          path: [],
          value: { field: 'value' },
        },
      ]);
    });
  });

  describe('for GraphQLInputObject', () => {
    it('returns no error for a valid input', () => {
      const result = coerceValue({ foo: 123 }, TestInputObject);
      expectValue(result).to.deep.equal({ foo: 123 });
    });

    it('returns an error for a non-object type', () => {
      const result = coerceValue(123, TestInputObject);
      expectErrors(result).to.deep.equal([
        {
          error: 'Expected type "TestInputObject" to be an object.',
          path: [],
          value: 123,
        },
      ]);
    });

    it('returns an error for an invalid field', () => {
      const result = coerceValue({ foo: NaN }, TestInputObject);
      expectErrors(result).to.deep.equal([
        {
          error:
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: NaN',
          path: ['foo'],
          value: NaN,
        },
      ]);
    });

    it('returns multiple errors for multiple invalid fields', () => {
      const result = coerceValue({ foo: 'abc', bar: 'def' }, TestInputObject);
      expectErrors(result).to.deep.equal([
        {
          error:
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: "abc"',
          path: ['foo'],
          value: 'abc',
        },
        {
          error:
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: "def"',
          path: ['bar'],
          value: 'def',
        },
      ]);
    });

    it('returns error for a missing required field', () => {
      const result = coerceValue({ bar: 123 }, TestInputObject);
      expectErrors(result).to.deep.equal([
        {
          error: 'Field "foo" of required type "Int!" was not provided.',
          path: [],
          value: { bar: 123 },
        },
      ]);
    });

    it('returns error for an unknown field', () => {
      const result = coerceValue(
        { foo: 123, unknownField: 123 },
        TestInputObject,
      );
      expectErrors(result).to.deep.equal([
        {
          error:
            'Field "unknownField" is not defined by type "TestInputObject".',
          path: [],
          value: { foo: 123, unknownField: 123 },
        },
      ]);
    });

    it('returns error for a misspelled field', () => {
      const result = coerceValue({ foo: 123, bart: 123 }, TestInputObject);
      expectErrors(result).to.deep.equal([
        {
          error:
            'Field "bart" is not defined by type "TestInputObject". Did you mean "bar"?',
          path: [],
          value: { foo: 123, bart: 123 },
        },
      ]);
    });
  });

  describe('for GraphQLInputObject with default value', () => {
    it('returns no errors for valid input value', () => {
      const result = coerceValue({ foo: 5 }, testInputObjectWithDefaultInt);
      expectValue(result).to.deep.equal({ foo: 5 });
    });

    it('returns object with default value', () => {
      const result = coerceValue({}, testInputObjectWithDefaultInt);
      expectValue(result).to.deep.equal({ foo: 7 });
    });

    it('returns null as value', () => {
      const result = coerceValue({}, testInputObjectWithDefaultNull);
      expectValue(result).to.deep.equal({ foo: null });
    });

    it('returns NaN as value', () => {
      const result = coerceValue({}, testInputObjectWithDefaultNaN);
      expectValue(result).to.have.property('foo').that.satisfy(Number.isNaN);
    });
  });

  describe('for GraphQLList', () => {
    it('returns no error for a valid input', () => {
      const result = coerceValue([1, 2, 3], TestList);
      expectValue(result).to.deep.equal([1, 2, 3]);
    });

    it('returns no error for a valid iterable input', () => {
      function* listGenerator() {
        yield 1;
        yield 2;
        yield 3;
      }

      const result = coerceValue(listGenerator(), TestList);
      expectValue(result).to.deep.equal([1, 2, 3]);
    });

    it('returns an error for an invalid input', () => {
      const result = coerceValue([1, 'b', true, 4], TestList);
      expectErrors(result).to.deep.equal([
        {
          error:
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: "b"',
          path: [1],
          value: 'b',
        },
        {
          error:
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: true',
          path: [2],
          value: true,
        },
      ]);
    });

    it('returns a list for a non-list value', () => {
      const result = coerceValue(42, TestList);
      expectValue(result).to.deep.equal([42]);
    });

    it('returns a list for a non-list object value', () => {
      const result = coerceValue({ length: 100500 }, TestListOfObjects);
      expectValue(result).to.deep.equal([{ length: 100500 }]);
    });

    it('returns an error for a non-list invalid value', () => {
      const result = coerceValue('INVALID', TestList);
      expectErrors(result).to.deep.equal([
        {
          error:
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: "INVALID"',
          path: [],
          value: 'INVALID',
        },
      ]);
    });

    it('returns null for a null value', () => {
      const result = coerceValue(null, TestList);
      expectValue(result).to.deep.equal(null);
    });
  });

  describe('for nested GraphQLList', () => {
    it('returns no error for a valid input', () => {
      const result = coerceValue([[1], [2, 3]], TestNestedList);
      expectValue(result).to.deep.equal([[1], [2, 3]]);
    });

    it('returns a list for a non-list value', () => {
      const result = coerceValue(42, TestNestedList);
      expectValue(result).to.deep.equal([[42]]);
    });

    it('returns null for a null value', () => {
      const result = coerceValue(null, TestNestedList);
      expectValue(result).to.deep.equal(null);
    });

    it('returns nested lists for nested non-list values', () => {
      const result = coerceValue([1, 2, 3], TestNestedList);
      expectValue(result).to.deep.equal([[1], [2], [3]]);
    });

    it('returns nested null for nested null values', () => {
      const result = coerceValue([42, [null], null], TestNestedList);
      expectValue(result).to.deep.equal([[42], [null], null]);
    });
  });

  describe('with default onError', () => {
    it('throw error without path', () => {
      expect(() =>
        coerceInputValue(executorSchema, null, TestNonNullInt),
      ).to.throw(
        'Invalid value null: Expected non-nullable type "Int!" not to be null.',
      );
    });

    it('throw error with path', () => {
      expect(() =>
        coerceInputValue(executorSchema, [null], TestListOfNonNullInt),
      ).to.throw(
        'Invalid value null at "value[0]": Expected non-nullable type "Int!" not to be null.',
      );
    });
  });
});
