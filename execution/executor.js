'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.defaultTypeResolver =
  exports.defaultFieldResolver =
  exports.Executor =
    void 0;

var _graphql = require('graphql');

var _directives = require('../type/directives.js');

var _inspect = require('../jsutils/inspect.js');

var _memoize = require('../jsutils/memoize1.js');

var _memoize1and = require('../jsutils/memoize1and1.js');

var _memoize2 = require('../jsutils/memoize2.js');

var _invariant = require('../jsutils/invariant.js');

var _devAssert = require('../jsutils/devAssert.js');

var _isPromise = require('../jsutils/isPromise.js');

var _isObjectLike = require('../jsutils/isObjectLike.js');

var _promiseReduce = require('../jsutils/promiseReduce.js');

var _Path = require('../jsutils/Path.js');

var _isAsyncIterable = require('../jsutils/isAsyncIterable.js');

var _isIterableObject = require('../jsutils/isIterableObject.js');

var _resolveAfterAll = require('../jsutils/resolveAfterAll.js');

var _publisher = require('../jsutils/publisher.js');

var _toError = require('../jsutils/toError.js');

var _toExecutorSchema = require('./toExecutorSchema.js');

var _values = require('./values.js');

var _mapAsyncIterable = require('./mapAsyncIterable.js');

var _flattenAsyncIterable = require('./flattenAsyncIterable.js');

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

/**
 * Executor class responsible for implementing the Execution section of the GraphQL spec.
 *
 * This class is exported only to assist people in implementing their own executors
 * without duplicating too much code and should be used only as last resort for cases
 * such as experimental syntax or if certain features could not be contributed upstream.
 *
 * It is still part of the internal API and is versioned, so any changes to it are never
 * considered breaking changes. If you still need to support multiple versions of the
 * library, please use the `versionInfo` variable for version detection.
 *
 * @internal
 */
class Executor {
  /**
   * A memoized method that looks up the field context given a parent type
   * and an array of field nodes.
   */

  /**
   * A memoized method that retrieves a value completer given a return type.
   */

  /**
   * Creates a field list, memoizing so that functions operating on the
   * field list can be memoized.
   */

  /**
   * Appends to a field list, memoizing so that functions operating on the
   * field list can be memoized.
   */
  constructor(executorArgs) {
    _defineProperty(
      this,
      'splitDefinitions',
      (0, _memoize.memoize1)((document) => this._splitDefinitions(document)),
    );

    _defineProperty(
      this,
      'selectOperation',
      (0, _memoize1and.memoize1and1)((operations, operationName) =>
        this._selectOperation(operations, operationName),
      ),
    );

    _defineProperty(
      this,
      'getFieldContext',
      (0, _memoize2.memoize2)((parentType, fieldNodes) =>
        this._getFieldContext(parentType, fieldNodes),
      ),
    );

    _defineProperty(
      this,
      'getValueCompleter',
      (0, _memoize.memoize1)((returnType) =>
        this._getValueCompleter(returnType),
      ),
    );

    _defineProperty(
      this,
      'createFieldList',
      (0, _memoize.memoize1)((node) => [node]),
    );

    _defineProperty(
      this,
      'updateFieldList',
      (0, _memoize2.memoize2)((fieldList, node) => [...fieldList, node]),
    );

    _defineProperty(
      this,
      'buildFieldResolver',
      (resolverKey, defaultResolver) =>
        (exeContext, fieldContext, source, info) => {
          var _fieldDef$resolverKey;

          const { fieldDef, initialFieldNode } = fieldContext;
          const resolveFn =
            (_fieldDef$resolverKey = fieldDef[resolverKey]) !== null &&
            _fieldDef$resolverKey !== void 0
              ? _fieldDef$resolverKey
              : defaultResolver;
          const { contextValue, variableValues } = exeContext; // Build a JS object of arguments from the field.arguments AST, using the
          // variables scope to fulfill any variable references.

          const args = exeContext.getArgumentValues(
            fieldDef,
            initialFieldNode,
            variableValues,
          ); // The resolve function's optional third argument is a context value that
          // is provided to every resolve function within an execution. It is commonly
          // used to represent an authenticated user, or request-specific caches.

          return resolveFn(source, args, contextValue, info);
        },
    );

    _defineProperty(
      this,
      'buildRootFieldCollector',
      (fragments, variableValues, getDeferValues) =>
        (runtimeType, operation) => {
          const fields = new Map();
          const patches = [];
          this.collectFieldsImpl(
            fragments,
            variableValues,
            getDeferValues,
            runtimeType,
            operation.selectionSet,
            fields,
            patches,
            new Set(),
          );
          return {
            fields,
            patches,
          };
        },
    );

    _defineProperty(
      this,
      'buildSubFieldCollector',
      (fragments, variableValues, getDeferValues) =>
        (0, _memoize2.memoize2)((returnType, fieldNodes) => {
          const subFieldNodes = new Map();
          const visitedFragmentNames = new Set();
          const subPatches = [];
          const subFieldsAndPatches = {
            fields: subFieldNodes,
            patches: subPatches,
          };

          for (const node of fieldNodes) {
            if (node.selectionSet) {
              this.collectFieldsImpl(
                fragments,
                variableValues,
                getDeferValues,
                returnType,
                node.selectionSet,
                subFieldNodes,
                subPatches,
                visitedFragmentNames,
              );
            }
          }

          return subFieldsAndPatches;
        }),
    );

    const { schema, executorSchema } = executorArgs; // Schema must be provided.

    schema || (0, _devAssert.devAssert)(false, 'Must provide schema.');
    this._schema = schema;
    this._executorSchema =
      executorSchema !== null && executorSchema !== void 0
        ? executorSchema
        : (0, _toExecutorSchema.toExecutorSchema)(schema);
  }
  /**
   * Implements the "Executing requests" section of the spec.
   *
   * If the client-provided arguments to this function do not result in a
   * compliant subscription, a GraphQL Response (ExecutionResult) with
   * descriptive errors and no data will be returned.
   */

  execute(args) {
    const exeContext = this.buildExecutionContext(args); // If a valid execution context cannot be created due to incorrect arguments,
    // a "Response" with only errors is returned.

    if (!('fragments' in exeContext)) {
      return {
        errors: exeContext,
      };
    }

    const { operation, forceQueryAlgorithm } = exeContext;

    if (forceQueryAlgorithm) {
      return this.executeQueryImpl(exeContext);
    }

    switch (operation.operation) {
      case 'query':
        return this.executeQueryImpl(exeContext);

      case 'mutation':
        return this.executeMutationImpl(exeContext);

      default:
        return this.executeSubscriptionImpl(exeContext);
    }
  }
  /**
   * Implements the "CreateSourceEventStream" algorithm described in the
   * GraphQL specification, resolving the subscription source event stream.
   *
   * Returns a Promise which resolves to either an AsyncIterable (if successful)
   * or an ExecutionResult (error). The promise will be rejected if the schema or
   * other arguments to this function are invalid, or if the resolved event stream
   * is not an async iterable.
   *
   * If the client-provided arguments to this function do not result in a
   * compliant subscription, a GraphQL Response (ExecutionResult) with
   * descriptive errors and no data will be returned.
   *
   * If the the source stream could not be created due to faulty subscription
   * resolver logic or underlying systems, the promise will resolve to a single
   * ExecutionResult containing `errors` and no `data`.
   *
   * If the operation succeeded, the promise resolves to the AsyncIterable for the
   * event stream returned by the resolver.
   *
   * A Source Event Stream represents a sequence of events, each of which triggers
   * a GraphQL execution for that event.
   *
   * This may be useful when hosting the stateful subscription service in a
   * different process or machine than the stateless GraphQL execution engine,
   * or otherwise separating these two steps. For more on this, see the
   * "Supporting Subscriptions at Scale" information in the GraphQL specification.
   */

  async createSourceEventStream(args) {
    const exeContext = this.buildExecutionContext(args); // If a valid execution context cannot be created due to incorrect arguments,
    // a "Response" with only errors is returned.

    if (!('fragments' in exeContext)) {
      return {
        errors: exeContext,
      };
    }

    return this.createSourceEventStreamImpl(exeContext);
  }
  /**
   * Implements the ExecuteQuery algorithm described in the GraphQL
   * specification. This algorithm is used to execute query operations
   * and to implement the ExecuteSubscriptionEvent algorithm.
   *
   * If errors are encountered while executing a GraphQL field, only that
   * field and its descendants will be omitted, and sibling fields will still
   * be executed. An execution which encounters errors will still result in a
   * resolved Promise.
   *
   * Errors from sub-fields of a NonNull type may propagate to the top level,
   * at which point we still log the error and null the parent field, which
   * in this case is the entire response.
   */

  executeQueryImpl(exeContext) {
    return this.executeOperationImpl(
      exeContext,
      this.executeFields.bind(this),
      this.buildResponse.bind(this),
    );
  }
  /**
   * Implements the ExecuteMutation algorithm described in the Graphql
   * specification.
   */

  executeMutationImpl(exeContext) {
    return this.executeOperationImpl(
      exeContext,
      this.executeFieldsSerially.bind(this),
      this.buildResponse.bind(this),
    );
  }
  /**
   * Implements the Execute algorithm described in the GraphQL specification
   * using the provided root fields executor and response builder.
   */

  executeOperationImpl(exeContext, rootFieldsExecutor, responseBuilder) {
    let data;

    try {
      const { rootValue, rootPayloadContext } = exeContext;
      const {
        rootType,
        fieldsAndPatches: { fields, patches },
      } = this.getRootContext(exeContext);
      const path = undefined;
      data = rootFieldsExecutor(
        exeContext,
        rootType,
        rootValue,
        path,
        fields,
        rootPayloadContext,
      );
      this.addPatches(
        exeContext,
        patches,
        rootType,
        rootValue,
        path,
        rootPayloadContext,
      );
    } catch (error) {
      exeContext.rootPayloadContext.errors.push(error);
      data = null;
    }

    if ((0, _isPromise.isPromise)(data)) {
      return data.then(
        (resolvedData) => responseBuilder(exeContext, resolvedData),
        (error) => {
          exeContext.rootPayloadContext.errors.push(error);
          return responseBuilder(exeContext, null);
        },
      );
    }

    return responseBuilder(exeContext, data);
  }
  /**
   * Given a completed execution context and data, build the `{ errors, data }`
   * response defined by the "Response" section of the GraphQL specification.
   */

  buildResponse(exeContext, data) {
    const rootPayloadContext = exeContext.rootPayloadContext;
    const errors = rootPayloadContext.errors;
    const initialResult =
      errors.length === 0
        ? {
            data,
          }
        : {
            errors,
            data,
          };

    if (this.hasNext(exeContext.state)) {
      const publisher = exeContext.publisher;
      publisher.emit(rootPayloadContext, { ...initialResult, hasNext: true });
      return publisher.subscribe();
    }

    return initialResult;
  }
  /**
   * Essential assertions before executing to provide developer feedback for
   * improper use of the GraphQL library.
   */

  assertValidExecutionArguments(document, rawVariableValues) {
    document || (0, _devAssert.devAssert)(false, 'Must provide document.'); // Variables, if provided, must be an object.

    rawVariableValues == null ||
      (0, _isObjectLike.isObjectLike)(rawVariableValues) ||
      (0, _devAssert.devAssert)(
        false,
        'Variables must be provided as an Object where each property is a variable value. Perhaps look to see if an unparsed JSON string was provided.',
      );
  }

  _splitDefinitions(document) {
    const operations = [];
    const fragments = Object.create(null);

    for (const definition of document.definitions) {
      switch (definition.kind) {
        case _graphql.Kind.OPERATION_DEFINITION:
          operations.push(definition);
          break;

        case _graphql.Kind.FRAGMENT_DEFINITION:
          fragments[definition.name.value] = definition;
          break;

        default: // ignore non-executable definitions
      }
    }

    return {
      operations,
      fragments,
    };
  }

  _selectOperation(operations, operationName) {
    let operation;

    for (const possibleOperation of operations) {
      var _possibleOperation$na;

      if (operationName == null) {
        if (operation !== undefined) {
          return [
            new _graphql.GraphQLError(
              'Must provide operation name if query contains multiple operations.',
            ),
          ];
        }

        operation = possibleOperation;
      } else if (
        ((_possibleOperation$na = possibleOperation.name) === null ||
        _possibleOperation$na === void 0
          ? void 0
          : _possibleOperation$na.value) === operationName
      ) {
        operation = possibleOperation;
      }
    }

    if (!operation) {
      if (operationName != null) {
        return [
          new _graphql.GraphQLError(
            `Unknown operation named "${operationName}".`,
          ),
        ];
      }

      return [new _graphql.GraphQLError('Must provide an operation.')];
    }

    return operation;
  }

  createPublisher(state) {
    return new _publisher.Publisher({
      payloadFromSource: (result, hasNext) => {
        const { payloadContext, data, path } = result;
        const { errors, label } = payloadContext;
        const value = {
          data,
          path: path ? (0, _Path.pathToArray)(path) : [],
          hasNext,
        };

        if (label != null) {
          value.label = label;
        }

        if (errors.length > 0) {
          value.errors = errors;
        }

        return value;
      },
      onReady: () => state.pendingPushes--,
      hasNext: () => this.hasNext(state),
      onStop: () =>
        Promise.all(
          Array.from(state.iterators.values()).map((iterator) => {
            var _iterator$return;

            return (_iterator$return = iterator.return) === null ||
              _iterator$return === void 0
              ? void 0
              : _iterator$return.call(iterator);
          }),
        ),
    });
  }
  /**
   * Constructs a ExecutionContext object from the arguments passed to
   * execute, which we will pass throughout the other execution methods.
   *
   * Returns an array of GraphQLErrors if a valid execution context
   * cannot be created.
   */

  buildExecutionContext(args) {
    var _operation$variableDe;

    const {
      document,
      rootValue,
      contextValue,
      variableValues: rawVariableValues,
      operationName,
      fieldResolver,
      typeResolver,
      subscribeFieldResolver,
      forceQueryAlgorithm,
      enableIncremental,
    } = args; // If arguments are missing or incorrectly typed, this is an internal
    // developer mistake which should throw an error.

    this.assertValidExecutionArguments(document, rawVariableValues);
    const { operations, fragments } = this.splitDefinitions(document);
    const operation = this.selectOperation(operations, operationName);

    if ('length' in operation) {
      return operation;
    } // See: 'https://github.com/graphql/graphql-js/issues/2203'

    const variableDefinitions =
      /* c8 ignore next */
      (_operation$variableDe = operation.variableDefinitions) !== null &&
      _operation$variableDe !== void 0
        ? _operation$variableDe
        : [];
    const coercedVariableValues = (0, _values.getVariableValues)(
      this._executorSchema,
      variableDefinitions,
      rawVariableValues !== null && rawVariableValues !== void 0
        ? rawVariableValues
        : {},
      {
        maxErrors: 50,
      },
    );

    if (coercedVariableValues.errors) {
      return coercedVariableValues.errors;
    }

    const enableIncrementalFlagValue =
      enableIncremental !== null && enableIncremental !== void 0
        ? enableIncremental
        : true;
    const defaultResolveFieldValueFn =
      fieldResolver !== null && fieldResolver !== void 0
        ? fieldResolver
        : defaultFieldResolver;
    const getDeferValues = enableIncrementalFlagValue
      ? this.getDeferValues.bind(this)
      : () => undefined;
    const coercedVariableValuesValues = coercedVariableValues.coerced;
    const state = {
      iterators: new Set(),
      pendingPushes: 0,
    };
    return {
      fragments,
      rootValue,
      contextValue,
      operation,
      variableValues: coercedVariableValues.coerced,
      fieldResolver: defaultResolveFieldValueFn,
      typeResolver:
        typeResolver !== null && typeResolver !== void 0
          ? typeResolver
          : defaultTypeResolver,
      forceQueryAlgorithm:
        forceQueryAlgorithm !== null && forceQueryAlgorithm !== void 0
          ? forceQueryAlgorithm
          : false,
      enableIncremental: enableIncrementalFlagValue,
      getArgumentValues: (0, _memoize2.memoize2)((def, node) =>
        (0, _values.getArgumentValues)(
          this._executorSchema,
          def,
          node,
          coercedVariableValuesValues,
        ),
      ),
      getDeferValues,
      getStreamValues: enableIncrementalFlagValue
        ? this.getStreamValues.bind(this)
        : () => undefined,
      rootFieldCollector: this.buildRootFieldCollector(
        fragments,
        coercedVariableValuesValues,
        getDeferValues,
      ),
      subFieldCollector: this.buildSubFieldCollector(
        fragments,
        coercedVariableValuesValues,
        getDeferValues,
      ),
      resolveField:
        operation.operation === 'subscription' && !forceQueryAlgorithm
          ? this.buildFieldResolver(
              'subscribe',
              subscribeFieldResolver !== null &&
                subscribeFieldResolver !== void 0
                ? subscribeFieldResolver
                : defaultFieldResolver,
            )
          : this.buildFieldResolver('resolve', defaultResolveFieldValueFn),
      rootPayloadContext: {
        errors: [],
      },
      state,
      publisher: this.createPublisher(state),
    };
  }
  /**
   * Constructs a perPayload ExecutionContext object from an initial
   * ExecutionObject and the payload value.
   */

  buildPerPayloadExecutionContext(exeContext, payload) {
    const state = {
      iterators: new Set(),
      pendingPushes: 0,
    };
    return {
      ...exeContext,
      rootValue: payload,
      forceQueryAlgorithm: true,
      resolveField: this.buildFieldResolver(
        'resolve',
        exeContext.fieldResolver,
      ),
      rootPayloadContext: {
        errors: [],
      },
      state,
      publisher: this.createPublisher(state),
    };
  }

  getRootContext(exeContext) {
    const { operation, rootFieldCollector } = exeContext;

    const rootType = this._executorSchema.getRootType(operation.operation);

    if (rootType == null) {
      throw new _graphql.GraphQLError(
        `Schema is not configured to execute ${operation.operation} operation.`,
        operation,
      );
    }

    const fieldsAndPatches = rootFieldCollector(rootType, operation);
    return {
      rootType,
      fieldsAndPatches,
    };
  }
  /**
   * Implements the "Executing selection sets" section of the spec
   * for fields that must be executed serially.
   */

  executeFieldsSerially(exeContext, parentType, sourceValue, path, fields) {
    const parentTypeName = parentType.name;
    return (0, _promiseReduce.promiseReduce)(
      fields.entries(),
      (results, [responseName, fieldNodes]) => {
        const fieldPath = (0, _Path.addPath)(
          path,
          responseName,
          parentTypeName,
        );
        const result = this.executeField(
          exeContext,
          parentType,
          sourceValue,
          fieldNodes,
          fieldPath,
          exeContext.rootPayloadContext,
        );

        if (result === undefined) {
          return results;
        }

        if ((0, _isPromise.isPromise)(result)) {
          return result.then((resolvedResult) => {
            results[responseName] = resolvedResult;
            return results;
          });
        }

        results[responseName] = result;
        return results;
      },
      Object.create(null),
    );
  }
  /**
   * Implements the "Executing selection sets" section of the spec
   * for fields that may be executed in parallel.
   */

  executeFields(
    exeContext,
    parentType,
    sourceValue,
    path,
    fields,
    payloadContext,
  ) {
    const results = Object.create(null);
    const promises = [];
    const parentTypeName = parentType.name;

    for (const [responseName, fieldNodes] of fields.entries()) {
      const fieldPath = (0, _Path.addPath)(path, responseName, parentTypeName);
      const result = this.executeField(
        exeContext,
        parentType,
        sourceValue,
        fieldNodes,
        fieldPath,
        payloadContext,
      );

      if (result !== undefined) {
        if ((0, _isPromise.isPromise)(result)) {
          // set key to undefined to preserve key order
          results[responseName] = undefined;
          const promise = result.then((resolved) => {
            results[responseName] = resolved;
          });
          promises.push(promise);
        } else {
          results[responseName] = result;
        }
      }
    } // If there are no promises, we can just return the object

    if (!promises.length) {
      return results;
    } // Otherwise, results will only eventually be a map from field name to the
    // result of resolving that field, which is possibly a promise. Return a
    // promise that will return this map after resolution is complete.

    return (0, _resolveAfterAll.resolveAfterAll)(results, promises);
  }
  /**
   * Implements the "Executing field" section of the spec
   * In particular, this function figures out the value that the field returns by
   * calling its resolve function, then calls completeValue to complete promises,
   * serialize scalars, or execute the sub-selection-set for objects.
   */

  executeField(
    exeContext,
    parentType,
    source,
    fieldNodes,
    path,
    payloadContext,
  ) {
    const fieldContext = this.getFieldContext(parentType, fieldNodes);

    if (!fieldContext) {
      return;
    }

    const returnType = fieldContext.returnType;
    const info = this.buildResolveInfo(exeContext, fieldContext, path); // Get the resolved field value, regardless of if its result is normal or abrupt (error).
    // Then, complete the field

    try {
      const result = exeContext.resolveField(
        exeContext,
        fieldContext,
        source,
        info,
      );
      let completed;
      const valueCompleter = this.getValueCompleter(returnType);

      if ((0, _isPromise.isPromise)(result)) {
        completed = result.then((resolved) =>
          valueCompleter(
            exeContext,
            fieldContext,
            info,
            path,
            resolved,
            payloadContext,
          ),
        );
      } else {
        completed = valueCompleter(
          exeContext,
          fieldContext,
          info,
          path,
          result,
          payloadContext,
        );
      }

      if ((0, _isPromise.isPromise)(completed)) {
        // Note: we don't rely on a `catch` method, but we do expect "thenable"
        // to take a second callback for the error case.
        return completed.then(undefined, (rawError) =>
          this.handleRawError(
            rawError,
            fieldNodes,
            path,
            returnType,
            payloadContext.errors,
          ),
        );
      }

      return completed;
    } catch (rawError) {
      return this.handleRawError(
        rawError,
        fieldNodes,
        path,
        returnType,
        payloadContext.errors,
      );
    }
  }

  buildResolveInfo(exeContext, fieldContext, path) {
    const { fieldName, fieldNodes, returnType, parentType } = fieldContext;
    const { _schema: schema, _executorSchema: executorSchema } = this;
    const { fragments, rootValue, operation, variableValues } = exeContext; // The resolve function's optional fourth argument is a collection of
    // information about the current execution state.

    return {
      fieldName,
      fieldNodes,
      returnType,
      parentType,
      path,
      schema,
      executorSchema,
      fragments,
      rootValue,
      operation,
      variableValues,
    };
  }

  toLocatedError(rawError, fieldNodes, path) {
    return (0, _graphql.locatedError)(
      (0, _toError.toError)(rawError),
      fieldNodes,
      (0, _Path.pathToArray)(path),
    );
  }

  handleRawError(rawError, fieldNodes, path, returnType, errors) {
    const error = this.toLocatedError(rawError, fieldNodes, path); // If the field type is non-nullable, then it is resolved without any
    // protection from errors, however it still properly locates the error.

    if (this._executorSchema.isNonNullType(returnType)) {
      throw error;
    } // Otherwise, error protection is applied, logging the error and resolving
    // a null value for this field if one is encountered.

    errors.push(error);
    return null;
  }

  buildNullableValueCompleter(valueCompleter) {
    return (exeContext, fieldContext, info, path, result, payloadContext) => {
      // If result is an Error, throw a located error.
      if (result instanceof Error) {
        throw result;
      } // If result value is null or undefined then return null.

      if (result == null) {
        return null;
      }

      return valueCompleter(
        exeContext,
        fieldContext,
        info,
        path,
        result,
        payloadContext,
      );
    };
  }
  /**
   * Implements the instructions for completeValue as defined in the
   * "Field entries" section of the spec.
   *
   * If the field type is Non-Null, then this recursively completes the value
   * for the inner type. It throws a field error if that completion returns null,
   * as per the "Nullability" section of the spec.
   *
   * If the field type is a List, then this recursively completes the value
   * for the inner type on each item in the list.
   *
   * If the field type is a Scalar or Enum, ensures the completed value is a legal
   * value of the type by calling the `serialize` method of GraphQL type
   * definition.
   *
   * If the field is an abstract type, determine the runtime type of the value
   * and then complete based on that type
   *
   * Otherwise, the field type expects a sub-selection set, and will complete the
   * value by executing all sub-selections.
   */

  _getValueCompleter(returnType) {
    if (this._executorSchema.isNonNullType(returnType)) {
      return (exeContext, fieldContext, info, path, result, payloadContext) => {
        // If field type is NonNull, complete for inner type, and throw field error
        // if result is null.
        const innerValueCompleter = this.getValueCompleter(returnType.ofType);
        const completed = innerValueCompleter(
          exeContext,
          fieldContext,
          info,
          path,
          result,
          payloadContext,
        );

        if (completed === null) {
          throw new Error(
            `Cannot return null for non-nullable field ${info.parentType.name}.${info.fieldName}.`,
          );
        }

        return completed;
      };
    }

    if (this._executorSchema.isListType(returnType)) {
      return this.buildNullableValueCompleter(
        (
          exeContext,
          fieldContext,
          info,
          path,
          result,
          payloadContext, // If field type is List, complete each item in the list with the inner type
        ) =>
          this.completeListValue(
            exeContext,
            returnType,
            fieldContext,
            info,
            path,
            result,
            payloadContext,
          ),
      );
    }

    if (this._executorSchema.isLeafType(returnType)) {
      return this.buildNullableValueCompleter(
        (
          _exeContext,
          _fieldContext,
          _info,
          _path,
          result,
          _payloadContext, // If field type is a leaf type, Scalar or Enum, serialize to a valid value,
        ) =>
          // returning null if serialization is not possible.
          this.completeLeafValue(returnType, result),
      );
    }

    if (this._executorSchema.isAbstractType(returnType)) {
      return this.buildNullableValueCompleter(
        (
          exeContext,
          fieldContext,
          info,
          path,
          result,
          payloadContext, // If field type is an abstract type, Interface or Union, determine the
        ) =>
          // runtime Object type and complete for that type.
          this.completeAbstractValue(
            exeContext,
            returnType,
            fieldContext,
            info,
            path,
            result,
            payloadContext,
          ),
      );
    }

    if (this._executorSchema.isObjectType(returnType)) {
      return this.buildNullableValueCompleter(
        (
          exeContext,
          fieldContext,
          info,
          path,
          result,
          payloadContext, // If field type is Object, execute and complete all sub-selections.
        ) =>
          this.completeObjectValue(
            exeContext,
            returnType,
            fieldContext,
            info,
            path,
            result,
            payloadContext,
          ),
      );
    }
    /* c8 ignore next 6 */
    // Not reachable. All possible output types have been considered

    false ||
      (0, _invariant.invariant)(
        false,
        'Cannot complete value of unexpected output type: ' +
          (0, _inspect.inspect)(returnType),
      );
  }
  /**
   * Complete a list value by completing each item in the list with the
   * inner type
   */

  completeListValue(
    exeContext,
    returnType,
    fieldContext,
    info,
    path,
    result,
    payloadContext,
  ) {
    const itemType = returnType.ofType;
    const valueCompleter = this.getValueCompleter(itemType); // This is specified as a simple map, however we're optimizing the path
    // where the list contains no Promises by avoiding creating another Promise.

    const completedResults = [];
    const promises = [];
    const stream = exeContext.getStreamValues(
      exeContext.variableValues,
      fieldContext,
    );

    if ((0, _isAsyncIterable.isAsyncIterable)(result)) {
      const iterator = result[Symbol.asyncIterator]();
      return this.completeAsyncIteratorValue(
        exeContext,
        itemType,
        fieldContext,
        info,
        valueCompleter,
        path,
        iterator,
        payloadContext,
        stream,
        completedResults,
        promises,
      );
    }

    if (!(0, _isIterableObject.isIterableObject)(result)) {
      throw new _graphql.GraphQLError(
        `Expected Iterable, but did not find one for field "${info.parentType.name}.${info.fieldName}".`,
      );
    }

    const iterator = result[Symbol.iterator]();
    this.completeIteratorValue(
      exeContext,
      itemType,
      fieldContext,
      info,
      valueCompleter,
      path,
      iterator,
      payloadContext,
      stream,
      completedResults,
      promises,
    );
    return promises.length
      ? (0, _resolveAfterAll.resolveAfterAll)(completedResults, promises)
      : completedResults;
  }
  /**
   * Returns an object containing the `@stream` arguments if a field should be
   * streamed based on the experimental flag, stream directive present and
   * not disabled by the "if" argument.
   */

  getStreamValues(variableValues, fieldContext) {
    // validation only allows equivalent streams on multiple fields, so it is
    // safe to only check the first fieldNode for the stream directive
    const stream = (0, _values.getDirectiveValues)(
      this._executorSchema,
      _directives.GraphQLStreamDirective,
      fieldContext.initialFieldNode,
      variableValues,
    );

    if (!stream) {
      return;
    }

    if (stream.if === false) {
      return;
    }

    typeof stream.initialCount === 'number' ||
      (0, _invariant.invariant)(false, 'initialCount must be a number');
    stream.initialCount >= 0 ||
      (0, _invariant.invariant)(
        false,
        'initialCount must be a positive integer',
      );
    return {
      initialCount: stream.initialCount,
      label: typeof stream.label === 'string' ? stream.label : undefined,
    };
  }
  /**
   * Complete an iterator value by completing each result.
   */

  completeIteratorValue(
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    iterator,
    payloadContext,
    stream,
    completedResults,
    promises,
  ) {
    if (stream) {
      this.completeIteratorValueWithStream(
        exeContext,
        itemType,
        fieldContext,
        info,
        valueCompleter,
        path,
        iterator,
        payloadContext,
        stream,
        completedResults,
        0,
        promises,
      );
    }

    this.completeIteratorValueWithoutStream(
      exeContext,
      itemType,
      fieldContext,
      info,
      valueCompleter,
      path,
      iterator,
      payloadContext,
      completedResults,
      0,
      promises,
    );
  }
  /**
   * Complete an iterator value by completing each result, possibly adding a new stream.
   *
   * Returns the next index or, if a stream was initiated, the last payload context.
   */

  completeIteratorValueWithStream(
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    iterator,
    payloadContext,
    stream,
    completedResults,
    _index,
    promises,
  ) {
    const initialCount = stream.initialCount;
    let index = _index; // eslint-disable-next-line no-constant-condition

    while (true) {
      if (index >= initialCount) {
        this.addIteratorValue(
          index,
          iterator,
          exeContext,
          itemType,
          fieldContext,
          info,
          valueCompleter,
          path,
          stream.label,
          payloadContext,
        );
        return;
      }

      const iteration = iterator.next();

      if (iteration.done) {
        return;
      }

      const itemPath = (0, _Path.addPath)(path, index, undefined);
      this.completeListItemValue(
        completedResults,
        index,
        promises,
        iteration.value,
        exeContext,
        itemType,
        valueCompleter,
        fieldContext,
        info,
        itemPath,
        payloadContext,
      );
      index++;
    }
  }
  /**
   * Complete an iterator value by completing each result.
   *
   * Returns the next index.
   */

  completeIteratorValueWithoutStream(
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    iterator,
    payloadContext,
    completedResults,
    _index,
    promises,
  ) {
    let index = _index; // eslint-disable-next-line no-constant-condition

    while (true) {
      const iteration = iterator.next();

      if (iteration.done) {
        return index;
      }

      const itemPath = (0, _Path.addPath)(path, index, undefined);
      this.completeListItemValue(
        completedResults,
        index,
        promises,
        iteration.value,
        exeContext,
        itemType,
        valueCompleter,
        fieldContext,
        info,
        itemPath,
        payloadContext,
      );
      index++;
    }
  }
  /**
   * Complete an async iterator value by completing each result.
   */

  async completeAsyncIteratorValue(
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    iterator,
    payloadContext,
    stream,
    completedResults,
    promises,
  ) {
    if (stream) {
      await this.completeAsyncIteratorValueWithStream(
        exeContext,
        itemType,
        fieldContext,
        info,
        valueCompleter,
        path,
        iterator,
        payloadContext,
        stream,
        completedResults,
        promises,
      );
    } else {
      await this.completeAsyncIteratorValueWithoutStream(
        exeContext,
        itemType,
        fieldContext,
        info,
        valueCompleter,
        path,
        iterator,
        payloadContext,
        completedResults,
        promises,
      );
    }

    return promises.length
      ? (0, _resolveAfterAll.resolveAfterAll)(completedResults, promises)
      : completedResults;
  }

  async completeAsyncIteratorValueWithStream(
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    iterator,
    payloadContext,
    stream,
    completedResults,
    promises,
  ) {
    const initialCount = stream.initialCount;
    let index = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (index >= initialCount) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.addAsyncIteratorValue(
            index,
            iterator,
            exeContext,
            itemType,
            fieldContext,
            info,
            valueCompleter,
            path,
            stream.label,
            payloadContext,
          );
          return;
        } // eslint-disable-next-line no-await-in-loop

        const iteration = await iterator.next();

        if (iteration.done) {
          break;
        }

        const itemPath = (0, _Path.addPath)(path, index, undefined);
        this.completeListItemValue(
          completedResults,
          index,
          promises,
          iteration.value,
          exeContext,
          itemType,
          valueCompleter,
          fieldContext,
          info,
          itemPath,
          payloadContext,
        );
        index++;
      }
    } catch (rawError) {
      const itemPath = (0, _Path.addPath)(path, index, undefined);
      completedResults.push(
        this.handleRawError(
          rawError,
          fieldContext.fieldNodes,
          itemPath,
          itemType,
          payloadContext.errors,
        ),
      );
    }
  }

  async completeAsyncIteratorValueWithoutStream(
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    iterator,
    payloadContext,
    completedResults,
    promises,
  ) {
    let index = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const iteration = await iterator.next();

        if (iteration.done) {
          break;
        }

        const itemPath = (0, _Path.addPath)(path, index, undefined);
        this.completeListItemValue(
          completedResults,
          index,
          promises,
          iteration.value,
          exeContext,
          itemType,
          valueCompleter,
          fieldContext,
          info,
          itemPath,
          payloadContext,
        );
        index++;
      }
    } catch (rawError) {
      const itemPath = (0, _Path.addPath)(path, index, undefined);
      completedResults.push(
        this.handleRawError(
          rawError,
          fieldContext.fieldNodes,
          itemPath,
          itemType,
          payloadContext.errors,
        ),
      );
    }
  }

  completeListItemValue(
    completedResults,
    index,
    promises,
    item,
    exeContext,
    itemType,
    valueCompleter,
    fieldContext,
    info,
    itemPath,
    payloadContext,
  ) {
    try {
      let completedItem;

      if ((0, _isPromise.isPromise)(item)) {
        completedItem = item.then((resolved) =>
          valueCompleter(
            exeContext,
            fieldContext,
            info,
            itemPath,
            resolved,
            payloadContext,
          ),
        );
      } else {
        completedItem = valueCompleter(
          exeContext,
          fieldContext,
          info,
          itemPath,
          item,
          payloadContext,
        );
      }

      completedResults[index] = completedItem;

      if (!(0, _isPromise.isPromise)(completedItem)) {
        return;
      } // Note: we don't rely on a `catch` method, but we do expect "thenable"
      // to take a second callback for the error case.

      const promise = completedItem
        .then(undefined, (rawError) =>
          this.handleRawError(
            rawError,
            fieldContext.fieldNodes,
            itemPath,
            itemType,
            payloadContext.errors,
          ),
        )
        .then((resolved) => {
          completedResults[index] = resolved;
        });
      promises.push(promise);
    } catch (rawError) {
      completedResults[index] = this.handleRawError(
        rawError,
        fieldContext.fieldNodes,
        itemPath,
        itemType,
        payloadContext.errors,
      );
    }
  }
  /**
   * Complete a Scalar or Enum by serializing to a valid value, returning
   * null if serialization is not possible.
   */

  completeLeafValue(returnType, result) {
    const serializedResult = returnType.serialize(result);

    if (serializedResult == null) {
      throw new Error(
        `Expected \`${(0, _inspect.inspect)(returnType)}.serialize(${(0,
        _inspect.inspect)(result)})\` to ` +
          `return non-nullable value, returned: ${(0, _inspect.inspect)(
            serializedResult,
          )}`,
      );
    }

    return serializedResult;
  }
  /**
   * Complete a value of an abstract type by determining the runtime object type
   * of that value, then complete the value for that type.
   */

  completeAbstractValue(
    exeContext,
    returnType,
    fieldContext,
    info,
    path,
    result,
    payloadContext,
  ) {
    var _returnType$resolveTy;

    const resolveTypeFn =
      (_returnType$resolveTy = returnType.resolveType) !== null &&
      _returnType$resolveTy !== void 0
        ? _returnType$resolveTy
        : exeContext.typeResolver;
    const contextValue = exeContext.contextValue;
    const runtimeType = resolveTypeFn(result, contextValue, info, returnType);

    if ((0, _isPromise.isPromise)(runtimeType)) {
      return runtimeType.then((resolvedRuntimeType) =>
        this.completeObjectValue(
          exeContext,
          this.ensureValidRuntimeType(
            resolvedRuntimeType,
            returnType,
            fieldContext,
            result,
          ),
          fieldContext,
          info,
          path,
          result,
          payloadContext,
        ),
      );
    }

    return this.completeObjectValue(
      exeContext,
      this.ensureValidRuntimeType(
        runtimeType,
        returnType,
        fieldContext,
        result,
      ),
      fieldContext,
      info,
      path,
      result,
      payloadContext,
    );
  }

  ensureValidRuntimeType(runtimeTypeOrName, returnType, fieldContext, result) {
    if (runtimeTypeOrName == null) {
      throw new _graphql.GraphQLError(
        `Abstract type "${returnType.name}" must resolve to an Object type at runtime for field "${fieldContext.parentType.name}.${fieldContext.fieldName}". Either the "${returnType.name}" type should provide a "resolveType" function or each possible type should provide an "isTypeOf" function.`,
        fieldContext.fieldNodes,
      );
    }

    const runtimeTypeName =
      typeof runtimeTypeOrName === 'object' &&
      this._executorSchema.isNamedType(runtimeTypeOrName)
        ? runtimeTypeOrName.name
        : runtimeTypeOrName;

    if (typeof runtimeTypeName !== 'string') {
      throw new _graphql.GraphQLError(
        `Abstract type "${returnType.name}" must resolve to an Object type at runtime for field "${fieldContext.parentType.name}.${fieldContext.fieldName}" with ` +
          `value ${(0, _inspect.inspect)(result)}, received "${(0,
          _inspect.inspect)(runtimeTypeName)}".`,
      );
    }

    const runtimeType = this._executorSchema.getNamedType(runtimeTypeName);

    if (runtimeType == null) {
      throw new _graphql.GraphQLError(
        `Abstract type "${returnType.name}" was resolved to a type "${runtimeTypeName}" that does not exist inside the schema.`,
        fieldContext.fieldNodes,
      );
    }

    if (!this._executorSchema.isObjectType(runtimeType)) {
      throw new _graphql.GraphQLError(
        `Abstract type "${returnType.name}" was resolved to a non-object type "${runtimeTypeName}".`,
        fieldContext.fieldNodes,
      );
    }

    if (!this._executorSchema.isSubType(returnType, runtimeType)) {
      throw new _graphql.GraphQLError(
        `Runtime Object type "${runtimeType.name}" is not a possible type for "${returnType.name}".`,
        fieldContext.fieldNodes,
      );
    }

    return runtimeType;
  }
  /**
   * Complete an Object value by executing all sub-selections.
   */

  completeObjectValue(
    exeContext,
    returnType,
    fieldContext,
    info,
    path,
    result,
    payloadContext,
  ) {
    // If there is an isTypeOf predicate function, call it with the
    // current result. If isTypeOf returns false, then raise an error rather
    // than continuing execution.
    if (returnType.isTypeOf) {
      const isTypeOf = returnType.isTypeOf(
        result,
        exeContext.contextValue,
        info,
      );

      if ((0, _isPromise.isPromise)(isTypeOf)) {
        return isTypeOf.then((resolvedIsTypeOf) => {
          if (!resolvedIsTypeOf) {
            throw this.invalidReturnTypeError(
              returnType,
              result,
              fieldContext.fieldNodes,
            );
          }

          return this.collectAndExecuteSubfields(
            exeContext,
            returnType,
            fieldContext,
            path,
            result,
            payloadContext,
          );
        });
      }

      if (!isTypeOf) {
        throw this.invalidReturnTypeError(
          returnType,
          result,
          fieldContext.fieldNodes,
        );
      }
    }

    return this.collectAndExecuteSubfields(
      exeContext,
      returnType,
      fieldContext,
      path,
      result,
      payloadContext,
    );
  }

  invalidReturnTypeError(returnType, result, fieldNodes) {
    return new _graphql.GraphQLError(
      `Expected value of type "${returnType.name}" but got: ${(0,
      _inspect.inspect)(result)}.`,
      fieldNodes,
    );
  }

  collectAndExecuteSubfields(
    exeContext,
    returnType,
    fieldContext,
    path,
    result,
    payloadContext,
  ) {
    const { subFieldCollector } = exeContext; // Collect sub-fields to execute to complete this value.

    const { fields: subFieldNodes, patches: subPatches } = subFieldCollector(
      returnType,
      fieldContext.fieldNodes,
    );
    const subFields = this.executeFields(
      exeContext,
      returnType,
      result,
      path,
      subFieldNodes,
      payloadContext,
    );
    this.addPatches(
      exeContext,
      subPatches,
      returnType,
      result,
      path,
      payloadContext,
    );
    return subFields;
  }
  /**
   * This method looks up the field on the given type definition.
   * It has special casing for the three introspection fields,
   * __schema, __type and __typename. __typename is special because
   * it can always be queried as a field, even in situations where no
   * other fields are allowed, like on a Union. __schema and __type
   * could get automatically added to the query type, but that would
   * require mutating type definitions, which would cause issues.
   *
   * Returns: the field definition and a class for constructing the info
   * argument for field resolvers.
   */

  _getFieldContext(parentType, fieldNodes) {
    const initialFieldNode = fieldNodes[0];
    const fieldName = initialFieldNode.name.value;
    let fieldDef;

    if (
      fieldName === _graphql.SchemaMetaFieldDef.name &&
      this._executorSchema.getRootType('query') === parentType
    ) {
      fieldDef = _graphql.SchemaMetaFieldDef;
    } else if (
      fieldName === _graphql.TypeMetaFieldDef.name &&
      this._executorSchema.getRootType('query') === parentType
    ) {
      fieldDef = _graphql.TypeMetaFieldDef;
    } else if (fieldName === _graphql.TypeNameMetaFieldDef.name) {
      fieldDef = _graphql.TypeNameMetaFieldDef;
    } else {
      fieldDef = parentType.getFields()[fieldName];
    }

    if (!fieldDef) {
      return;
    }

    return {
      fieldDef,
      initialFieldNode,
      fieldName: fieldDef.name,
      fieldNodes,
      returnType: fieldDef.type,
      parentType,
    };
  }
  /**
   * Implements the "Subscribe" algorithm described in the GraphQL specification.
   *
   * Returns a Promise which resolves to either an AsyncIterator (if successful)
   * or an ExecutionResult (error). The promise will be rejected if the schema or
   * other arguments to this function are invalid, or if the resolved event stream
   * is not an async iterable.
   *
   * If the client-provided arguments to this function do not result in a
   * compliant subscription, a GraphQL Response (ExecutionResult) with
   * descriptive errors and no data will be returned.
   *
   * If the source stream could not be created due to faulty subscription
   * resolver logic or underlying systems, the promise will resolve to a single
   * ExecutionResult containing `errors` and no `data`.
   *
   * If the operation succeeded, the promise resolves to an AsyncIterator, which
   * yields a stream of ExecutionResults representing the response stream.
   */

  async executeSubscriptionImpl(exeContext) {
    return this.executeOperationImpl(
      exeContext,
      this.executeRootSubscriptionFields.bind(this),
      this.buildSubscribeResponse.bind(this),
    );
  }
  /**
   * Implements the "Executing selection sets" section of the spec
   * for root subscription fields.
   */

  async executeRootSubscriptionFields(
    exeContext,
    parentType,
    sourceValue,
    path,
    fields,
    payloadContext,
  ) {
    // TODO: consider allowing multiple root subscription fields
    const [responseName, fieldNodes] = [...fields.entries()][0];
    const fieldPath = (0, _Path.addPath)(path, responseName, parentType.name);
    return this.executeRootSubscriptionField(
      exeContext,
      parentType,
      sourceValue,
      fieldNodes,
      fieldPath,
      payloadContext,
    );
  }

  buildCreateSourceEventStreamResponse(exeContext, eventStream) {
    const { rootPayloadContext } = exeContext;
    const errors = rootPayloadContext.errors;

    if (errors.length) {
      return {
        errors,
      };
    }

    if (!(0, _isAsyncIterable.isAsyncIterable)(eventStream)) {
      throw new Error(
        'Subscription field must return Async Iterable. ' +
          `Received: ${(0, _inspect.inspect)(eventStream)}.`,
      );
    }

    return eventStream;
  }

  buildSubscribeResponse(exeContext, _eventStream) {
    const eventStream = this.buildCreateSourceEventStreamResponse(
      exeContext,
      _eventStream,
    );

    if (!(0, _isAsyncIterable.isAsyncIterable)(eventStream)) {
      return eventStream;
    } // For each payload yielded from a subscription, map it over the normal
    // GraphQL `execute` function, with `payload` as the rootValue.
    // This implements the "MapSourceToResponseEvent" algorithm described in
    // the GraphQL specification. The `execute` function provides the
    // "ExecuteSubscriptionEvent" algorithm, as it is nearly identical to the
    // "ExecuteQuery" algorithm, for which `execute` is also used.

    const mapSourceToResponse = (payload) => {
      const perPayloadExecutionContext = this.buildPerPayloadExecutionContext(
        exeContext,
        payload,
      );
      return this.executeQueryImpl(perPayloadExecutionContext);
    }; // Map every source value to a ExecutionResult value as described above.

    return (0, _flattenAsyncIterable.flattenAsyncIterable)(
      (0, _mapAsyncIterable.mapAsyncIterable)(eventStream, mapSourceToResponse),
    );
  }

  async createSourceEventStreamImpl(exeContext) {
    return this.executeOperationImpl(
      exeContext,
      this.executeRootSubscriptionFields.bind(this),
      this.buildCreateSourceEventStreamResponse.bind(this),
    );
  }

  async executeRootSubscriptionField(
    exeContext,
    parentType,
    sourceValue,
    fieldNodes,
    fieldPath,
    payloadContext,
  ) {
    const fieldContext = this.getFieldContext(parentType, fieldNodes);

    if (!fieldContext) {
      const fieldName = fieldNodes[0].name.value;
      payloadContext.errors.push(
        new _graphql.GraphQLError(
          `The subscription field "${fieldName}" is not defined.`,
          fieldNodes,
        ),
      );
      return null;
    }

    const info = this.buildResolveInfo(exeContext, fieldContext, fieldPath);

    try {
      const eventStream = await exeContext.resolveField(
        exeContext,
        fieldContext,
        sourceValue,
        info,
      );

      if (eventStream instanceof Error) {
        throw eventStream;
      }

      return eventStream;
    } catch (rawError) {
      payloadContext.errors.push(
        this.toLocatedError(rawError, fieldNodes, fieldPath),
      );
      return null;
    }
  }

  addPatches(
    exeContext,
    patches,
    parentType,
    source,
    path,
    parentPayloadContext,
  ) {
    const { state, publisher } = exeContext;

    for (const patch of patches) {
      state.pendingPushes++;
      const { label, fields: patchFields } = patch;
      const payloadContext = {
        errors: [],
        label,
      };
      Promise.resolve(source)
        .then(() =>
          this.executeFields(
            exeContext,
            parentType,
            source,
            path,
            patchFields,
            payloadContext,
          ),
        )
        .then(
          (data) =>
            publisher.queue(
              payloadContext,
              {
                payloadContext,
                data,
                path,
              },
              parentPayloadContext,
            ),
          (error) => {
            // executeFields will never throw a raw error
            payloadContext.errors.push(error);
            publisher.queue(
              payloadContext,
              {
                payloadContext,
                data: null,
                path,
              },
              parentPayloadContext,
            );
          },
        );
    }
  }

  addIteratorValue(
    initialIndex,
    iterator,
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    label,
    parentPayloadContext,
  ) {
    const state = exeContext.state;
    let index = initialIndex;
    let prevPayloadContext = parentPayloadContext;
    let iteration = iterator.next();

    while (!iteration.done) {
      // avoid unsafe reference of variable from functions inside a loop
      // see https://eslint.org/docs/rules/no-loop-func
      const _prevPayloadContext = prevPayloadContext;
      const payloadContext = {
        errors: [],
        label,
      };
      state.pendingPushes++;
      const itemPath = (0, _Path.addPath)(path, index, undefined);
      this.addValue(
        iteration.value,
        exeContext,
        itemType,
        fieldContext,
        info,
        valueCompleter,
        itemPath,
        payloadContext,
        _prevPayloadContext,
      );
      index++;
      prevPayloadContext = payloadContext;
      iteration = iterator.next();
    }
  }

  async addAsyncIteratorValue(
    initialIndex,
    iterator,
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    path,
    label,
    parentPayloadContext,
  ) {
    const { state, publisher } = exeContext;
    state.iterators.add(iterator);
    let index = initialIndex;
    let prevPayloadContext = parentPayloadContext;

    try {
      let iteration = await iterator.next();

      while (!iteration.done) {
        // avoid unsafe reference of variable from functions inside a loop
        // see https://eslint.org/docs/rules/no-loop-func
        const _prevPayloadContext = prevPayloadContext;
        const payloadContext = {
          errors: [],
          label,
        };
        state.pendingPushes++;
        const itemPath = (0, _Path.addPath)(path, index, undefined);
        this.addValue(
          iteration.value,
          exeContext,
          itemType,
          fieldContext,
          info,
          valueCompleter,
          itemPath,
          payloadContext,
          _prevPayloadContext,
        );
        index++;
        prevPayloadContext = payloadContext; // eslint-disable-next-line no-await-in-loop

        iteration = await iterator.next();
      }
    } catch (rawError) {
      state.pendingPushes++;
      const itemPath = (0, _Path.addPath)(path, index, undefined);
      const currentPayloadContext = {
        errors: [
          this.toLocatedError(rawError, fieldContext.fieldNodes, itemPath),
        ],
        label,
      };
      publisher.queue(
        currentPayloadContext,
        {
          payloadContext: currentPayloadContext,
          data: null,
          path: itemPath,
        },
        prevPayloadContext,
      );
    }

    this.closeAsyncIterator(exeContext, iterator);
  }

  addValue(
    value,
    exeContext,
    itemType,
    fieldContext,
    info,
    valueCompleter,
    itemPath,
    payloadContext,
    prevPayloadContext,
  ) {
    const publisher = exeContext.publisher;
    Promise.resolve(value)
      .then((resolved) =>
        valueCompleter(
          exeContext,
          fieldContext,
          info,
          itemPath,
          resolved,
          payloadContext,
        ),
      ) // Note: we don't rely on a `catch` method, but we do expect "thenable"
      // to take a second callback for the error case.
      .then(undefined, (rawError) =>
        this.handleRawError(
          rawError,
          fieldContext.fieldNodes,
          itemPath,
          itemType,
          payloadContext.errors,
        ),
      )
      .then(
        (data) =>
          publisher.queue(
            payloadContext,
            {
              payloadContext,
              data,
              path: itemPath,
            },
            prevPayloadContext,
          ),
        (rawError) => {
          payloadContext.errors.push(
            this.toLocatedError(rawError, fieldContext.fieldNodes, itemPath),
          );
          publisher.queue(
            payloadContext,
            {
              payloadContext,
              data: null,
              path: itemPath,
            },
            prevPayloadContext,
          );
        },
      );
  }

  closeAsyncIterator(exeContext, iterator) {
    const { state, publisher } = exeContext;
    state.iterators.delete(iterator);

    if (!this.hasNext(exeContext.state)) {
      publisher.stop({
        hasNext: false,
      });
    }
  }

  hasNext(state) {
    return state.pendingPushes > 0 || state.iterators.size > 0;
  }
  /**
   * Given an operation, collects all of the root fields and returns them.
   *
   * CollectFields requires the "runtime type" of an object. For a field that
   * returns an Interface or Union type, the "runtime type" will be the actual
   * object type returned by that field.
   */

  collectFieldsImpl(
    fragments,
    variableValues,
    getDeferValues,
    runtimeType,
    selectionSet,
    fields,
    patches,
    visitedFragmentNames,
  ) {
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case _graphql.Kind.FIELD: {
          if (!this.shouldIncludeNode(variableValues, selection)) {
            continue;
          }

          const name = this.getFieldEntryKey(selection);
          const fieldList = fields.get(name);

          if (fieldList !== undefined) {
            fields.set(name, this.updateFieldList(fieldList, selection));
          } else {
            fields.set(name, this.createFieldList(selection));
          }

          break;
        }

        case _graphql.Kind.INLINE_FRAGMENT: {
          if (
            !this.shouldIncludeNode(variableValues, selection) ||
            !this.doesFragmentConditionMatch(selection, runtimeType)
          ) {
            continue;
          }

          const defer = getDeferValues(variableValues, selection);

          if (defer) {
            const patchFields = new Map();
            this.collectFieldsImpl(
              fragments,
              variableValues,
              getDeferValues,
              runtimeType,
              selection.selectionSet,
              patchFields,
              patches,
              visitedFragmentNames,
            );
            patches.push({
              label: defer.label,
              fields: patchFields,
            });
          } else {
            this.collectFieldsImpl(
              fragments,
              variableValues,
              getDeferValues,
              runtimeType,
              selection.selectionSet,
              fields,
              patches,
              visitedFragmentNames,
            );
          }

          break;
        }

        case _graphql.Kind.FRAGMENT_SPREAD: {
          const fragName = selection.name.value;

          if (!this.shouldIncludeNode(variableValues, selection)) {
            continue;
          }

          const defer = getDeferValues(variableValues, selection);

          if (visitedFragmentNames.has(fragName) && !defer) {
            continue;
          }

          const fragment = fragments[fragName];

          if (
            !fragment ||
            !this.doesFragmentConditionMatch(fragment, runtimeType)
          ) {
            continue;
          }

          visitedFragmentNames.add(fragName);

          if (defer) {
            const patchFields = new Map();
            this.collectFieldsImpl(
              fragments,
              variableValues,
              getDeferValues,
              runtimeType,
              fragment.selectionSet,
              patchFields,
              patches,
              visitedFragmentNames,
            );
            patches.push({
              label: defer.label,
              fields: patchFields,
            });
          } else {
            this.collectFieldsImpl(
              fragments,
              variableValues,
              getDeferValues,
              runtimeType,
              fragment.selectionSet,
              fields,
              patches,
              visitedFragmentNames,
            );
          }

          break;
        }
      }
    }
  }
  /**
   * Returns an object containing the `@defer` arguments if a field should be
   * deferred based on the experimental flag, defer directive present and
   * not disabled by the "if" argument.
   */

  getDeferValues(variableValues, node) {
    const defer = (0, _values.getDirectiveValues)(
      this._executorSchema,
      _directives.GraphQLDeferDirective,
      node,
      variableValues,
    );

    if (!defer) {
      return;
    }

    if (defer.if === false) {
      return;
    }

    return {
      label: typeof defer.label === 'string' ? defer.label : undefined,
    };
  }
  /**
   * Determines if a field should be included based on the `@include` and `@skip`
   * directives, where `@skip` has higher precedence than `@include`.
   */

  shouldIncludeNode(variableValues, node) {
    const skip = (0, _values.getDirectiveValues)(
      this._executorSchema,
      _graphql.GraphQLSkipDirective,
      node,
      variableValues,
    );

    if ((skip === null || skip === void 0 ? void 0 : skip.if) === true) {
      return false;
    }

    const include = (0, _values.getDirectiveValues)(
      this._executorSchema,
      _graphql.GraphQLIncludeDirective,
      node,
      variableValues,
    );

    if (
      (include === null || include === void 0 ? void 0 : include.if) === false
    ) {
      return false;
    }

    return true;
  }
  /**
   * Determines if a fragment is applicable to the given type.
   */

  doesFragmentConditionMatch(fragment, type) {
    const typeConditionNode = fragment.typeCondition;

    if (!typeConditionNode) {
      return true;
    }

    const conditionalType = this._executorSchema.getType(typeConditionNode);

    if (conditionalType === type) {
      return true;
    }

    if (
      conditionalType &&
      this._executorSchema.isAbstractType(conditionalType)
    ) {
      return this._executorSchema.isSubType(conditionalType, type);
    }

    return false;
  }
  /**
   * Implements the logic to compute the key of a given field's entry
   */

  getFieldEntryKey(node) {
    return node.alias ? node.alias.value : node.name.value;
  }
}
/**
 * If a resolve function is not given, then a default resolve behavior is used
 * which takes the property of the source object of the same name as the field
 * and returns it as the result, or if it's a function, returns the result
 * of calling that function while passing along args and context value.
 */

exports.Executor = Executor;

const defaultFieldResolver = function (source, args, contextValue, info) {
  // ensure source is a value for which property access is acceptable.
  if ((0, _isObjectLike.isObjectLike)(source) || typeof source === 'function') {
    const property = source[info.fieldName];

    if (typeof property === 'function') {
      return source[info.fieldName](args, contextValue, info);
    }

    return property;
  }
};
/**
 * If a resolveType function is not given, then a default resolve behavior is
 * used which attempts two strategies:
 *
 * First, See if the provided value has a `__typename` field defined, if so, use
 * that value as name of the resolved type.
 *
 * Otherwise, test each possible type for the abstract type by calling
 * isTypeOf for the object being coerced, returning the first type that matches.
 */

exports.defaultFieldResolver = defaultFieldResolver;

const defaultTypeResolver = function (value, contextValue, info, abstractType) {
  // First, look for `__typename`.
  if (
    (0, _isObjectLike.isObjectLike)(value) &&
    typeof value.__typename === 'string'
  ) {
    return value.__typename;
  } // Otherwise, test each possible type.

  const possibleTypes = info.executorSchema.getPossibleTypes(abstractType);
  const promisedIsTypeOfResults = [];

  for (let i = 0; i < possibleTypes.length; i++) {
    const type = possibleTypes[i];

    if (type.isTypeOf) {
      const isTypeOfResult = type.isTypeOf(value, contextValue, info);

      if ((0, _isPromise.isPromise)(isTypeOfResult)) {
        promisedIsTypeOfResults[i] = isTypeOfResult;
      } else if (isTypeOfResult) {
        return type.name;
      }
    }
  }

  if (promisedIsTypeOfResults.length) {
    return Promise.all(promisedIsTypeOfResults).then((isTypeOfResults) => {
      for (let i = 0; i < isTypeOfResults.length; i++) {
        if (isTypeOfResults[i]) {
          return possibleTypes[i].name;
        }
      }
    });
  }
};

exports.defaultTypeResolver = defaultTypeResolver;
