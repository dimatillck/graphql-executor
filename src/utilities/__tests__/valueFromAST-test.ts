import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  GraphQLInt,
  GraphQLFloat,
  GraphQLString,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  parseValue,
  GraphQLSchema,
  GraphQLObjectType,
} from 'graphql';
import type { GraphQLInputType } from 'graphql';

import { handlePre15 } from '../../__testUtils__/handlePre15';

import type { ObjMap } from '../../jsutils/ObjMap';
import { invariant } from '../../jsutils/invariant';
import { identityFunc } from '../../jsutils/identityFunc';

import { toExecutorSchema } from '../../executorSchema/toExecutorSchema';

import { valueFromAST } from '../valueFromAST';

const passthroughScalar = new GraphQLScalarType({
  name: 'PassthroughScalar',
  parseLiteral(node) {
    invariant(node.kind === 'StringValue');
    return node.value;
  },
  parseValue: identityFunc,
  serialize: identityFunc, // necessary pre v15
});

const throwScalar = new GraphQLScalarType({
  name: 'ThrowScalar',
  parseLiteral() {
    throw new Error('Test');
  },
  parseValue: identityFunc,
  serialize: identityFunc, // necessary pre v15
});

const returnUndefinedScalar = new GraphQLScalarType({
  name: 'ReturnUndefinedScalar',
  parseLiteral() {
    return undefined;
  },
  parseValue: identityFunc,
  serialize: identityFunc, // necessary pre v15
});

const testEnum = new GraphQLEnumType({
  name: 'TestColor',
  values: {
    RED: { value: 1 },
    GREEN: { value: 2 },
    BLUE: { value: 3 },
    NULL: { value: null },
    NAN: { value: NaN },
    NO_CUSTOM_VALUE: { value: undefined },
  },
});

const testNonNullEnum = new GraphQLNonNull(testEnum);

// Boolean!
const nonNullBool = new GraphQLNonNull(GraphQLBoolean);
// [Boolean]
const listOfBool = new GraphQLList(GraphQLBoolean);
// [Boolean!]
const listOfNonNullBool = new GraphQLList(nonNullBool);
// [Boolean]!
const nonNullListOfBool = new GraphQLNonNull(listOfBool);
// [Boolean!]!
const nonNullListOfNonNullBool = new GraphQLNonNull(listOfNonNullBool);

const testInputObj = new GraphQLInputObjectType({
  name: 'TestInput',
  fields: {
    int: { type: GraphQLInt, defaultValue: 42 },
    bool: { type: GraphQLBoolean },
    requiredBool: { type: nonNullBool },
  },
});

const query = new GraphQLObjectType({
  fields: {
    test: {
      args: {
        testInt: { type: GraphQLInt },
        testFloat: { type: GraphQLFloat },
        testString: { type: GraphQLString },
        testID: { type: GraphQLID },
        testPassthroughScalar: { type: passthroughScalar },
        testThrowScalar: { type: throwScalar },
        testReturnUndefinedScalar: { type: returnUndefinedScalar },
        testEnum: { type: testEnum },
        testNonNullEnum: { type: testNonNullEnum },
        testNonNullBool: { type: nonNullBool },
        testListOfBool: { type: listOfBool },
        testNonNullListOfBool: { type: nonNullListOfBool },
        testNonNullListOfNonNullBool: { type: nonNullListOfNonNullBool },
        testInputObj: { type: testInputObj },
      },
      type: GraphQLInt,
    },
  },
  name: 'Query',
});

const schema = new GraphQLSchema({ query });
const executorSchema = toExecutorSchema(schema);

describe('valueFromAST', () => {
  function expectValueFrom(
    valueText: string,
    type: GraphQLInputType,
    variables?: ObjMap<unknown>,
  ) {
    const ast = parseValue(valueText);
    const value = valueFromAST(executorSchema, ast, type, variables);
    return expect(value);
  }

  it('rejects empty input', () => {
    expect(valueFromAST(executorSchema, null, GraphQLBoolean)).to.deep.equal(
      undefined,
    );
  });

  it('converts according to input coercion rules', () => {
    expectValueFrom('true', GraphQLBoolean).to.equal(true);
    expectValueFrom('false', GraphQLBoolean).to.equal(false);
    expectValueFrom('123', GraphQLInt).to.equal(123);
    expectValueFrom('123', GraphQLFloat).to.equal(123);
    expectValueFrom('123.456', GraphQLFloat).to.equal(123.456);
    expectValueFrom('"abc123"', GraphQLString).to.equal('abc123');
    expectValueFrom('123456', GraphQLID).to.equal('123456');
    expectValueFrom('"123456"', GraphQLID).to.equal('123456');
  });

  it('does not convert when input coercion rules reject a value', () => {
    expectValueFrom('123', GraphQLBoolean).to.equal(undefined);
    expectValueFrom('123.456', GraphQLInt).to.equal(undefined);
    expectValueFrom('true', GraphQLInt).to.equal(undefined);
    expectValueFrom('"123"', GraphQLInt).to.equal(undefined);
    expectValueFrom('"123"', GraphQLFloat).to.equal(undefined);
    expectValueFrom('123', GraphQLString).to.equal(undefined);
    expectValueFrom('true', GraphQLString).to.equal(undefined);
    expectValueFrom('123.456', GraphQLString).to.equal(undefined);
  });

  it('convert using parseLiteral from a custom scalar type', () => {
    expectValueFrom('"value"', passthroughScalar).to.equal('value');
    expectValueFrom('value', throwScalar).to.equal(undefined);
    expectValueFrom('value', returnUndefinedScalar).to.equal(undefined);
  });

  it('converts enum values according to input coercion rules', () => {
    expectValueFrom('RED', testEnum).to.equal(1);
    expectValueFrom('BLUE', testEnum).to.equal(3);
    expectValueFrom('3', testEnum).to.equal(undefined);
    expectValueFrom('"BLUE"', testEnum).to.equal(undefined);
    expectValueFrom('null', testEnum).to.equal(null);
    expectValueFrom('NULL', testEnum).to.equal(null);
    expectValueFrom('NULL', testNonNullEnum).to.equal(null);
    expectValueFrom('NAN', testEnum).to.deep.equal(NaN);
    expectValueFrom('NO_CUSTOM_VALUE', testEnum).to.equal(
      handlePre15('NO_CUSTOM_VALUE', undefined),
    );
  });

  it('coerces to null unless non-null', () => {
    expectValueFrom('null', GraphQLBoolean).to.equal(null);
    expectValueFrom('null', nonNullBool).to.equal(undefined);
  });

  it('coerces lists of values', () => {
    expectValueFrom('true', listOfBool).to.deep.equal([true]);
    expectValueFrom('123', listOfBool).to.equal(undefined);
    expectValueFrom('null', listOfBool).to.equal(null);
    expectValueFrom('[true, false]', listOfBool).to.deep.equal([true, false]);
    expectValueFrom('[true, 123]', listOfBool).to.equal(undefined);
    expectValueFrom('[true, null]', listOfBool).to.deep.equal([true, null]);
    expectValueFrom('{ true: true }', listOfBool).to.equal(undefined);
  });

  it('coerces non-null lists of values', () => {
    expectValueFrom('true', nonNullListOfBool).to.deep.equal([true]);
    expectValueFrom('123', nonNullListOfBool).to.equal(undefined);
    expectValueFrom('null', nonNullListOfBool).to.equal(undefined);
    expectValueFrom('[true, false]', nonNullListOfBool).to.deep.equal([
      true,
      false,
    ]);
    expectValueFrom('[true, 123]', nonNullListOfBool).to.equal(undefined);
    expectValueFrom('[true, null]', nonNullListOfBool).to.deep.equal([
      true,
      null,
    ]);
  });

  it('coerces lists of non-null values', () => {
    expectValueFrom('true', listOfNonNullBool).to.deep.equal([true]);
    expectValueFrom('123', listOfNonNullBool).to.equal(undefined);
    expectValueFrom('null', listOfNonNullBool).to.equal(null);
    expectValueFrom('[true, false]', listOfNonNullBool).to.deep.equal([
      true,
      false,
    ]);
    expectValueFrom('[true, 123]', listOfNonNullBool).to.equal(undefined);
    expectValueFrom('[true, null]', listOfNonNullBool).to.equal(undefined);
  });

  it('coerces non-null lists of non-null values', () => {
    expectValueFrom('true', nonNullListOfNonNullBool).to.deep.equal([true]);
    expectValueFrom('123', nonNullListOfNonNullBool).to.equal(undefined);
    expectValueFrom('null', nonNullListOfNonNullBool).to.equal(undefined);
    expectValueFrom('[true, false]', nonNullListOfNonNullBool).to.deep.equal([
      true,
      false,
    ]);
    expectValueFrom('[true, 123]', nonNullListOfNonNullBool).to.equal(
      undefined,
    );
    expectValueFrom('[true, null]', nonNullListOfNonNullBool).to.equal(
      undefined,
    );
  });

  it('coerces input objects according to input coercion rules', () => {
    expectValueFrom('null', testInputObj).to.equal(null);
    expectValueFrom('123', testInputObj).to.equal(undefined);
    expectValueFrom('[]', testInputObj).to.equal(undefined);
    expectValueFrom(
      '{ int: 123, requiredBool: false }',
      testInputObj,
    ).to.deep.equal({
      int: 123,
      requiredBool: false,
    });
    expectValueFrom(
      '{ bool: true, requiredBool: false }',
      testInputObj,
    ).to.deep.equal({
      int: 42,
      bool: true,
      requiredBool: false,
    });
    expectValueFrom('{ int: true, requiredBool: true }', testInputObj).to.equal(
      undefined,
    );
    expectValueFrom('{ requiredBool: null }', testInputObj).to.equal(undefined);
    expectValueFrom('{ bool: true }', testInputObj).to.equal(undefined);
  });

  it('accepts variable values assuming already coerced', () => {
    expectValueFrom('$var', GraphQLBoolean, {}).to.equal(undefined);
    expectValueFrom('$var', GraphQLBoolean, { var: true }).to.equal(true);
    expectValueFrom('$var', GraphQLBoolean, { var: null }).to.equal(null);
    expectValueFrom('$var', nonNullBool, { var: null }).to.equal(undefined);
  });

  it('asserts variables are provided as items in lists', () => {
    expectValueFrom('[ $foo ]', listOfBool, {}).to.deep.equal([null]);
    expectValueFrom('[ $foo ]', listOfNonNullBool, {}).to.equal(undefined);
    expectValueFrom('[ $foo ]', listOfNonNullBool, {
      foo: true,
    }).to.deep.equal([true]);
    // Note: variables are expected to have already been coerced, so we
    // do not expect the singleton wrapping behavior for variables.
    expectValueFrom('$foo', listOfNonNullBool, { foo: true }).to.equal(true);
    expectValueFrom('$foo', listOfNonNullBool, { foo: [true] }).to.deep.equal([
      true,
    ]);
  });

  it('omits input object fields for unprovided variables', () => {
    expectValueFrom(
      '{ int: $foo, bool: $foo, requiredBool: true }',
      testInputObj,
      {},
    ).to.deep.equal({ int: 42, requiredBool: true });

    expectValueFrom('{ requiredBool: $foo }', testInputObj, {}).to.equal(
      undefined,
    );

    expectValueFrom('{ requiredBool: $foo }', testInputObj, {
      foo: true,
    }).to.deep.equal({
      int: 42,
      requiredBool: true,
    });
  });
});
