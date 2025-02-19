import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  GraphQLBoolean,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  parse,
  specifiedDirectives,
} from 'graphql';

import { expectJSON } from '../../__testUtils__/expectJSON';
import { expectPromise } from '../../__testUtils__/expectPromise';
import { resolveOnNextTick } from '../../__testUtils__/resolveOnNextTick';
import { handlePre15 } from '../../__testUtils__/handlePre15';

import { invariant } from '../../jsutils/invariant';
import { isAsyncIterable } from '../../jsutils/isAsyncIterable';

import {
  GraphQLDeferDirective,
  GraphQLStreamDirective,
} from '../../type/directives';

import { execute, executeSync } from '../execute';
import { Executor } from '../executor';

import { SimplePubSub } from './simplePubSub';

interface Email {
  from: string;
  subject: string;
  message: string;
  unread: boolean;
}

const EmailType = new GraphQLObjectType({
  name: 'Email',
  fields: {
    from: { type: GraphQLString },
    subject: { type: GraphQLString },
    message: { type: GraphQLString },
    unread: { type: GraphQLBoolean },
  },
});

const InboxType = new GraphQLObjectType({
  name: 'Inbox',
  fields: {
    total: {
      type: GraphQLInt,
      resolve: (inbox) => inbox.emails.length,
    },
    unread: {
      type: GraphQLInt,
      resolve: (inbox) =>
        inbox.emails.filter((email: any) => email.unread).length,
    },
    emails: { type: new GraphQLList(EmailType) },
  },
});

const QueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    inbox: { type: InboxType },
  },
});

const EmailEventType = new GraphQLObjectType({
  name: 'EmailEvent',
  fields: {
    email: { type: EmailType },
    inbox: { type: InboxType },
  },
});

const emailSchema = new GraphQLSchema({
  query: QueryType,
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      importantEmail: {
        type: EmailEventType,
        args: {
          priority: { type: GraphQLInt },
        },
      },
    },
  }),
  directives: [
    ...specifiedDirectives,
    GraphQLDeferDirective,
    GraphQLStreamDirective,
  ],
});

function createSubscription(
  pubsub: SimplePubSub<Email>,
  variableValues?: { readonly [variable: string]: unknown },
) {
  const document = parse(`
    subscription ($priority: Int = 0, $shouldDefer: Boolean = false) {
      importantEmail(priority: $priority) {
        email {
          from
          subject
        }
        ... @defer(if: $shouldDefer) {
          inbox {
            unread
            total
          }
        }
      }
    }
  `);

  const emails = [
    {
      from: 'joe@graphql.org',
      subject: 'Hello',
      message: 'Hello World',
      unread: false,
    },
  ];

  const data: any = {
    inbox: { emails },
    // FIXME: we shouldn't use mapAsyncIterable here since it makes tests way more complex
    importantEmail: pubsub.getSubscriber((newEmail) => {
      emails.push(newEmail);

      return {
        importantEmail: {
          email: newEmail,
          inbox: data.inbox,
        },
      };
    }),
  };

  return execute({
    schema: emailSchema,
    document,
    rootValue: data,
    variableValues,
  });
}

const DummyQueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    dummy: { type: GraphQLString },
  },
});

/* eslint-disable @typescript-eslint/require-await */
// Check all error cases when initializing the subscription.
describe('Subscription Initialization Phase', () => {
  it('accepts multiple subscription fields defined in schema', async () => {
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: { type: GraphQLString },
          bar: { type: GraphQLString },
        },
      }),
    });

    async function* fooGenerator() {
      yield { foo: 'FooValue' };
    }

    const subscription = await execute({
      schema,
      document: parse('subscription { foo }'),
      rootValue: { foo: fooGenerator },
    });
    invariant(isAsyncIterable(subscription));

    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: { data: { foo: 'FooValue' } },
    });

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('accepts type definition with sync subscribe function', async () => {
    async function* fooGenerator() {
      yield { foo: 'FooValue' };
    }

    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: {
            type: GraphQLString,
            subscribe: fooGenerator,
          },
        },
      }),
    });

    const subscription = await execute({
      schema,
      document: parse('subscription { foo }'),
    });
    invariant(isAsyncIterable(subscription));

    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: { data: { foo: 'FooValue' } },
    });

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('accepts type definition with async subscribe function', async () => {
    async function* fooGenerator() {
      yield { foo: 'FooValue' };
    }

    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: {
            type: GraphQLString,
            async subscribe() {
              await resolveOnNextTick();
              return fooGenerator();
            },
          },
        },
      }),
    });

    const subscription = await execute({
      schema,
      document: parse('subscription { foo }'),
    });
    invariant(isAsyncIterable(subscription));

    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: { data: { foo: 'FooValue' } },
    });

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('uses a custom default subscribeFieldResolver', async () => {
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: { type: GraphQLString },
        },
      }),
    });

    async function* fooGenerator() {
      yield { foo: 'FooValue' };
    }

    const subscription = await execute({
      schema,
      document: parse('subscription { foo }'),
      rootValue: { customFoo: fooGenerator },
      subscribeFieldResolver: (root) => root.customFoo(),
    });
    invariant(isAsyncIterable(subscription));

    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: { data: { foo: 'FooValue' } },
    });

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('should only resolve the first field of invalid multi-field', async () => {
    async function* fooGenerator() {
      yield { foo: 'FooValue' };
    }

    let didResolveFoo = false;
    let didResolveBar = false;

    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: {
            type: GraphQLString,
            subscribe() {
              didResolveFoo = true;
              return fooGenerator();
            },
          },
          bar: {
            type: GraphQLString,
            /* c8 ignore next 3 */
            subscribe() {
              didResolveBar = true;
            },
          },
        },
      }),
    });

    const subscription = await execute({
      schema,
      document: parse('subscription { foo bar }'),
    });
    invariant(isAsyncIterable(subscription));

    expect(didResolveFoo).to.equal(true);
    expect(didResolveBar).to.equal(false);

    expect(await subscription.next()).to.have.property('done', false);

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('throws an error if some of required arguments are missing', async () => {
    const document = parse('subscription { foo }');
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: { type: GraphQLString },
        },
      }),
    });

    // @ts-expect-error (schema must not be null)
    expect(() => executeSync({ schema: null, document })).to.throw(
      'Must provide schema.',
    );

    // @ts-expect-error
    expect(() => executeSync({ document })).to.throw('Must provide schema.');

    // @ts-expect-error (document must not be null)
    expect(() => executeSync({ schema, document: null })).to.throw(
      'Must provide document.',
    );

    // @ts-expect-error
    expect(() => executeSync({ schema })).to.throw('Must provide document.');
  });

  it('resolves to an error if schema does not support subscriptions', async () => {
    const schema = new GraphQLSchema({ query: DummyQueryType });
    const document = parse('subscription { unknownField }');

    const result = await execute({ schema, document });
    expectJSON(result).toDeepEqual({
      errors: [
        {
          message:
            'Schema is not configured to execute subscription operation.',
          locations: [{ line: 1, column: 1 }],
        },
      ],
    });
  });

  it('resolves to an error for unknown subscription field', async () => {
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: { type: GraphQLString },
        },
      }),
    });
    const document = parse('subscription { unknownField }');

    const result = await execute({ schema, document });
    expectJSON(result).toDeepEqual({
      errors: [
        {
          message: 'The subscription field "unknownField" is not defined.',
          locations: [{ line: 1, column: 16 }],
        },
      ],
    });
  });

  it('should pass through unexpected errors thrown in execute', async () => {
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: { type: GraphQLString },
        },
      }),
    });

    // @ts-expect-error
    expect(() => executeSync({ schema, document: {} })).to.throw();
  });

  it('throws an error if subscribe does not return an iterator', async () => {
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: {
            type: GraphQLString,
            subscribe: () => 'test',
          },
        },
      }),
    });

    const document = parse('subscription { foo }');

    // @ts-expect-error
    await expectPromise(execute({ schema, document })).toRejectWithMessage(
      'Subscription field must return Async Iterable. Received: "test".',
    );
  });

  it('resolves to an error for subscription resolver errors', async () => {
    async function subscribeWithFn(subscribeFn: () => unknown) {
      const schema = new GraphQLSchema({
        query: DummyQueryType,
        subscription: new GraphQLObjectType({
          name: 'Subscription',
          fields: {
            foo: { type: GraphQLString, subscribe: subscribeFn },
          },
        }),
      });
      const document = parse('subscription { foo }');
      const result = await execute({ schema, document });

      expectJSON(
        await new Executor({ schema }).createSourceEventStream({ document }),
      ).toDeepEqual(result);
      return result;
    }

    const expectedResult = {
      errors: [
        {
          message: 'test error',
          locations: [{ line: 1, column: 16 }],
          path: ['foo'],
        },
      ],
    };

    expectJSON(
      // Returning an error
      await subscribeWithFn(() => new Error('test error')),
    ).toDeepEqual(expectedResult);

    expectJSON(
      // Throwing an error
      await subscribeWithFn(() => {
        throw new Error('test error');
      }),
    ).toDeepEqual(expectedResult);

    expectJSON(
      // Resolving to an error
      await subscribeWithFn(() => Promise.resolve(new Error('test error'))),
    ).toDeepEqual(expectedResult);

    expectJSON(
      // Rejecting with an error
      await subscribeWithFn(() => Promise.reject(new Error('test error'))),
    ).toDeepEqual(expectedResult);
  });

  it('resolves to an error if variables were wrong type', async () => {
    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          foo: {
            type: GraphQLString,
            args: { arg: { type: GraphQLInt } },
          },
        },
      }),
    });

    const variableValues = { arg: 'meow' };
    const document = parse(`
      subscription ($arg: Int) {
        foo(arg: $arg)
      }
    `);

    // If we receive variables that cannot be coerced correctly, execute() will
    // resolve to an ExecutionResult that contains an informative error description.
    const expectedResult = {
      errors: [
        {
          message:
            'Variable "$arg" got invalid value "meow"; ' +
            handlePre15('', 'Expected type "Int". ') +
            'Int cannot represent non-integer value: "meow"',
          locations: [{ line: 2, column: 21 }],
        },
      ],
    };

    expectJSON(await execute({ schema, document, variableValues })).toDeepEqual(
      expectedResult,
    );

    expectJSON(
      await new Executor({ schema }).createSourceEventStream({
        document,
        variableValues,
      }),
    ).toDeepEqual(expectedResult);
  });
});

// Once a subscription returns a valid AsyncIterator, it can still yield errors.
describe('Subscription Publish Phase', () => {
  it('produces a payload for multiple subscribe in same subscription', async () => {
    const pubsub = new SimplePubSub<Email>();

    const subscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(subscription));

    const secondSubscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(secondSubscription));

    const payload1 = subscription.next();
    const payload2 = secondSubscription.next();

    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    const expectedPayload = {
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright',
            },
            inbox: {
              unread: 1,
              total: 2,
            },
          },
        },
      },
    };

    expect(await payload1).to.deep.equal(expectedPayload);
    expect(await payload2).to.deep.equal(expectedPayload);
  });

  it('produces a payload per subscription event', async () => {
    const pubsub = new SimplePubSub<Email>();
    const subscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(subscription));

    // Wait for the next subscription payload.
    const payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    // The previously waited on payload now has a value.
    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright',
            },
            inbox: {
              unread: 1,
              total: 2,
            },
          },
        },
      },
    });

    // Another new email arrives, before subscription.next() is called.
    expect(
      pubsub.emit({
        from: 'hyo@graphql.org',
        subject: 'Tools',
        message: 'I <3 making things',
        unread: true,
      }),
    ).to.equal(true);

    // The next waited on payload will have a value.
    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'hyo@graphql.org',
              subject: 'Tools',
            },
            inbox: {
              unread: 2,
              total: 3,
            },
          },
        },
      },
    });

    // The client decides to disconnect.
    expect(await subscription.return()).to.deep.equal({
      done: true,
      value: undefined,
    });

    // Which may result in disconnecting upstream services as well.
    expect(
      pubsub.emit({
        from: 'adam@graphql.org',
        subject: 'Important',
        message: 'Read me please',
        unread: true,
      }),
    ).to.equal(false); // No more listeners.

    // Awaiting a subscription after closing it results in completed results.
    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('produces additional payloads for subscriptions with @defer', async () => {
    const pubsub = new SimplePubSub<Email>();
    const subscription = await createSubscription(pubsub, {
      shouldDefer: true,
    });
    invariant(isAsyncIterable(subscription));
    // Wait for the next subscription payload.
    const payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    // The previously waited on payload now has a value.
    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright',
            },
          },
        },
        hasNext: true,
      },
    });

    // Wait for the next payload from @defer
    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: {
          inbox: {
            unread: 1,
            total: 2,
          },
        },
        path: ['importantEmail'],
        hasNext: false,
      },
    });

    // Another new email arrives, after all incrementally delivered payloads are received.
    expect(
      pubsub.emit({
        from: 'hyo@graphql.org',
        subject: 'Tools',
        message: 'I <3 making things',
        unread: true,
      }),
    ).to.equal(true);

    // The next waited on payload will have a value.
    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'hyo@graphql.org',
              subject: 'Tools',
            },
          },
        },
        hasNext: true,
      },
    });

    // Another new email arrives, before the incrementally delivered payloads from the last email was received.
    expect(
      pubsub.emit({
        from: 'adam@graphql.org',
        subject: 'Important',
        message: 'Read me please',
        unread: true,
      }),
    ).to.equal(true);

    // Deferred payload from previous event is received.
    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: {
          inbox: {
            unread: 2,
            total: 3,
          },
        },
        path: ['importantEmail'],
        hasNext: false,
      },
    });

    // Next payload from last event
    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'adam@graphql.org',
              subject: 'Important',
            },
          },
        },
        hasNext: true,
      },
    });

    // The client disconnects before the deferred payload is consumed.
    expect(await subscription.return()).to.deep.equal({
      done: true,
      value: undefined,
    });

    // Awaiting a subscription after closing it results in completed results.
    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('produces a payload when there are multiple events', async () => {
    const pubsub = new SimplePubSub<Email>();
    const subscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(subscription));

    let payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright',
            },
            inbox: {
              unread: 1,
              total: 2,
            },
          },
        },
      },
    });

    payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright 2',
        message: 'Tests are good 2',
        unread: true,
      }),
    ).to.equal(true);

    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright 2',
            },
            inbox: {
              unread: 2,
              total: 3,
            },
          },
        },
      },
    });
  });

  it('should not trigger when subscription is already done', async () => {
    const pubsub = new SimplePubSub<Email>();
    const subscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(subscription));

    let payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright',
            },
            inbox: {
              unread: 1,
              total: 2,
            },
          },
        },
      },
    });

    payload = subscription.next();
    await subscription.return();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright 2',
        message: 'Tests are good 2',
        unread: true,
      }),
    ).to.equal(false);

    expect(await payload).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('should not trigger when subscription is thrown', async () => {
    const pubsub = new SimplePubSub<Email>();
    const subscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(subscription));

    let payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Alright',
            },
            inbox: {
              unread: 1,
              total: 2,
            },
          },
        },
      },
    });

    // Throw error
    // See: https://github.com/repeaterjs/repeater/issues/72#issuecomment-963426268
    const error = new Error('should not trigger when subscription is thrown');
    const caughtError = subscription.throw(error).catch((e) => e);
    payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Alright 2',
        message: 'Tests are good 2',
        unread: true,
      }),
    ).to.equal(true);

    expect(await caughtError).to.equal(error);

    expect(await payload).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('event order is correct for multiple publishes', async () => {
    const pubsub = new SimplePubSub<Email>();
    const subscription = await createSubscription(pubsub);
    invariant(isAsyncIterable(subscription));

    let payload = subscription.next();

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Message',
        message: 'Tests are good',
        unread: true,
      }),
    ).to.equal(true);

    // A new email arrives!
    expect(
      pubsub.emit({
        from: 'yuzhi@graphql.org',
        subject: 'Message 2',
        message: 'Tests are good 2',
        unread: true,
      }),
    ).to.equal(true);

    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Message',
            },
            inbox: {
              unread: 2,
              total: 3,
            },
          },
        },
      },
    });

    payload = subscription.next();

    expect(await payload).to.deep.equal({
      done: false,
      value: {
        data: {
          importantEmail: {
            email: {
              from: 'yuzhi@graphql.org',
              subject: 'Message 2',
            },
            inbox: {
              unread: 2,
              total: 3,
            },
          },
        },
      },
    });
  });

  it('should handle error during execution of source event', async () => {
    async function* generateMessages() {
      yield 'Hello';
      yield 'Goodbye';
      yield 'Bonjour';
    }

    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          newMessage: {
            type: GraphQLString,
            subscribe: generateMessages,
            resolve(message) {
              if (message === 'Goodbye') {
                throw new Error('Never leave.');
              }
              return message;
            },
          },
        },
      }),
    });

    const document = parse('subscription { newMessage }');
    const subscription = await execute({ schema, document });
    invariant(isAsyncIterable(subscription));

    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: { newMessage: 'Hello' },
      },
    });

    // An error in execution is presented as such.
    expectJSON(await subscription.next()).toDeepEqual({
      done: false,
      value: {
        data: { newMessage: null },
        errors: [
          {
            message: 'Never leave.',
            locations: [{ line: 1, column: 16 }],
            path: ['newMessage'],
          },
        ],
      },
    });

    // However that does not close the response event stream.
    // Subsequent events are still executed.
    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: { newMessage: 'Bonjour' },
      },
    });

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });

  it('should pass through error thrown in source event stream', async () => {
    const error = new Error('test error');

    async function* generateMessages() {
      yield 'Hello';
      throw error;
    }

    const schema = new GraphQLSchema({
      query: DummyQueryType,
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          newMessage: {
            type: GraphQLString,
            resolve: (message) => message,
            subscribe: generateMessages,
          },
        },
      }),
    });

    const document = parse('subscription { newMessage }');
    const subscription = await execute({ schema, document });
    invariant(isAsyncIterable(subscription));

    expect(await subscription.next()).to.deep.equal({
      done: false,
      value: {
        data: { newMessage: 'Hello' },
      },
    });

    await expectPromise(subscription.next()).toRejectWith(error);

    expect(await subscription.next()).to.deep.equal({
      done: true,
      value: undefined,
    });
  });
});
