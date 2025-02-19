import { expect } from 'chai';
import { describe, it } from 'mocha';

import { expectPromise } from '../../__testUtils__/expectPromise';

import {
  Repeater,
  RepeaterOverflowError,
  DroppingBuffer,
  FixedBuffer,
  MAX_QUEUE_LENGTH,
  SlidingBuffer,
} from '../repeater';

function fn() {
  const callArgs: Array<Array<unknown>> = [];
  const mock = (...args: Array<unknown>) => {
    callArgs.push(args);
  };
  mock.callArgs = callArgs;
  return mock;
}

function expectMock(mock: ReturnType<typeof fn>) {
  return {
    toHaveBeenCalledTimes(i: number) {
      expect(mock.callArgs.length).to.equal(i);
    },
    toHaveBeenCalledWith(...values: Array<unknown>) {
      expect(
        mock.callArgs.some((args) => {
          for (const [index, value] of values.entries()) {
            if (args[index] !== value) {
              return false;
            }
          }
          return true;
        }),
      ).to.equal(true);
    },
  };
}

function spyOn<T extends string>(
  object: { [key in T]: Function },
  methodName: T,
) {
  const originalFn = object[methodName].bind(object);
  let count = 0;
  object[methodName] = (...args: Array<unknown>) => {
    count++;
    return originalFn(...args);
  };
  return {
    count,
  };
}

function expectSpy(spy: ReturnType<typeof spyOn>) {
  return {
    toHaveBeenCalledTimes(i: number) {
      return spy.count === i;
    },
  };
}

function delayPromise<T>(
  wait: number,
  value?: T,
  error?: Error,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    setTimeout(() => {
      if (error == null) {
        resolve(value);
      } else {
        reject(error);
      }
    }, wait);
  });
}

describe('Repeater', () => {
  it('push', async () => {
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
  });

  it('async push', async () => {
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4); /* c8 ignore start */
    }); /* c8 ignore stop */
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
  });

  it('push promises', async () => {
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(3));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(4));
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
  });

  it('async push promises', async () => {
    const r = new Repeater(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.resolve(3));
      await push(Promise.resolve(4)); /* c8 ignore start */
    }); /* c8 ignore stop */
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
  });

  it('push delayed promises', async () => {
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(5, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(10, 4));
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
  });

  it('async push delayed promises', async () => {
    const r = new Repeater(async (push) => {
      await push(delayPromise(5, 1));
      await push(Promise.resolve(2));
      await push(3);
      await push(delayPromise(10, 4)); /* c8 ignore start */
    }); /* c8 ignore stop */
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
  });

  it('push rejection', async () => {
    const error = new Error('push rejection');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(4));
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push rejection', async () => {
    const error = new Error('async push rejection');
    const r = new Repeater(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.reject(error));
      await push(Promise.resolve(4));
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push rejection immediately', async () => {
    const error = new Error('push rejection immediately');
    const r = new Repeater((push) => push(Promise.reject(error)));
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push delayed rejection', async () => {
    const error = new Error('push delayed rejection');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(5, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(1, null, error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push delayed rejection', async () => {
    const error = new Error('async push delayed rejection');
    const r = new Repeater(async (push) => {
      await push(delayPromise(5, 1));
      await push(Promise.resolve(2));
      await push(delayPromise(1, null, error));
      await push(4);
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push delayed rejection with buffer', async () => {
    const error = new Error('push delayed rejection with buffer');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(5, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(1, null, error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      return -1;
    }, new FixedBuffer(100));

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push delayed rejection with buffer', async () => {
    const error = new Error('async push delayed rejection with buffer');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(5, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(1, null, error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      return -1;
    }, new FixedBuffer(100));

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push multiple rejections', async () => {
    const error1 = new Error('push multiple rejections 1');
    const error2 = new Error('push multiple rejections 2');
    const error3 = new Error('push multiple rejections 3');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error3));
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('stop', async () => {
    const r = new Repeater((_, stop) => {
      stop();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('stop with error', async () => {
    const error = new Error('stop with error');
    const r = new Repeater(async (_push, stop) => {
      stop(error);
      return -1;
    });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push then stop', async () => {
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push and stop', async () => {
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push and stop with error', async () => {
    const error = new Error('push and stop with error');
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop(error);
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push and stop with error', async () => {
    const error = new Error('async push and stop with error');
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop(error);
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push promise and stop', async () => {
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(3));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push delayed promise and stop', async () => {
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(10, 3));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push rejection and stop', async () => {
    const error = new Error('push rejection and stop');
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop();
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('push delayed rejection and stop', async () => {
    const error = new Error('push delayed rejection and stop');
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(50, null, error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop();
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push rejection and stop with error', async () => {
    const error1 = new Error('async push rejection and stop with error 1');
    const error2 = new Error('async push rejection and stop with error 2');
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(Promise.reject(error1));
      await push(4);
      stop(error2);
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('async push delayed promises and stop with pending next', async () => {
    const r = new Repeater(async (push, stop) => {
      await push(delayPromise(50, 1));
      await push(delayPromise(50, 2));
      stop();
      return -1;
    });
    const result1 = r.next();
    const result2 = r.next();
    const result3 = r.next();
    expect(await result1).to.deep.equal({ value: 1, done: false });
    expect(await result2).to.deep.equal({ value: 2, done: false });
    expect(await result3).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('awaiting stop promise', async () => {
    const mock = fn();
    const r = new Repeater(async (push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      setTimeout(() => stop());
      await stop;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      mock();
    });
    expect(await r.next()).to.deep.equal({ done: false, value: 1 });
    expect(await r.next()).to.deep.equal({ done: false, value: 2 });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(1);
  });

  it('throw error in executor', async () => {
    const error = new Error('throw error in executor');
    const r = new Repeater(() => {
      throw error;
    });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error in executor after push', async () => {
    const error = new Error('throw error in executor after push');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      throw error;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error in executor after async push', async () => {
    const error = new Error('throw error in executor after async push');
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      throw error;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error in executor after push and stop', async () => {
    const error = new Error('throw error in executor after push and stop');
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      stop();
      throw error;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error in executor after async push and stop', async () => {
    const error = new Error(
      'throw error in executor after async push and stop',
    );
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop();
      throw error;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error after stop with error', async () => {
    const error1 = new Error('throw error after stop with error 1');
    const error2 = new Error('throw error after stop with error 2');
    const r = new Repeater((_push, stop) => {
      stop(error1);
      throw error2;
    });
    await expectPromise(r.next()).toRejectWith(error2);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error after stop with error and delay', async () => {
    const error1 = new Error('throw error after stop with error and delay 1');
    const error2 = new Error('throw error after stop with error and delay 2');
    const r = new Repeater(async (_, stop) => {
      stop(error1);
      await delayPromise(10);
      throw error2;
    });
    await expectPromise(r.next()).toRejectWith(error2);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error after pushing rejection', async () => {
    const error1 = new Error('throw error after pushing rejection 1');
    const error2 = new Error('throw error after pushing rejection 2');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      throw error2;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error2);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error after async pushing rejection', async () => {
    const error1 = new Error('throw error after async pushing rejection 1');
    const error2 = new Error('throw error after async pushing rejection 2');
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(Promise.reject(error1));
      await push(4);
      throw error2;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error2);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw error after stopping with error and pushing rejection', async () => {
    const error1 = new Error(
      'throw error after stopping with error and pushing rejection 1',
    );
    const error2 = new Error(
      'throw error after stopping with error and pushing rejection 2',
    );
    const error3 = new Error(
      'throw error after stopping with error and pushing rejection 3',
    );
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      stop(error2);
      throw error3;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error3);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return rejection from executor', async () => {
    const error = new Error('return rejection from executor');
    const r = new Repeater(() => Promise.reject(error));
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return rejection from executor after async pushes', async () => {
    const error = new Error(
      'return rejection from executor after async pushes',
    );
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      return Promise.reject(error);
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    await expectPromise(r.next()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('ignored repeater', () => {
    const mock = fn();
    // eslint-disable-next-line no-new
    new Repeater(() => mock());
    expectMock(mock).toHaveBeenCalledTimes(0);
  });

  it('pushes await next', async () => {
    const mock = fn();
    const r = new Repeater(async (push) => {
      for (let i = 0; i < 100; i++) {
        // eslint-disable-next-line no-await-in-loop
        mock(await push(i)); /* c8 ignore start */
      }
    }); /* c8 ignore stop */
    expect(await r.next()).to.deep.equal({ value: 0, done: false });
    expectMock(mock).toHaveBeenCalledTimes(0);
    for (let i = 1; i < 50; i++) {
      expectMock(mock).toHaveBeenCalledTimes(i - 1);
      // eslint-disable-next-line no-await-in-loop
      expect(await r.next(i)).to.deep.equal({
        value: i,
        done: false,
      });
      expectMock(mock).toHaveBeenCalledWith(i);
      expectMock(mock).toHaveBeenCalledTimes(i);
    }

    expect(await r.next()).to.deep.equal({ value: 50, done: false });
    expectMock(mock).toHaveBeenCalledTimes(50);
    await delayPromise(1);
    expectMock(mock).toHaveBeenCalledTimes(50);
  });

  it('next then push avoids buffer', async () => {
    const buffer: FixedBuffer = new FixedBuffer(100);
    const add = spyOn(buffer, 'add');
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => {
      push = push1;
    }, buffer);
    const next1 = r.next();
    const next2 = r.next();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    push(1);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    push(2);
    expect(await next1).to.deep.equal({ value: 1, done: false });
    expect(await next2).to.deep.equal({ value: 2, done: false });
    expect(buffer.empty).to.equal(true);
    expectSpy(add).toHaveBeenCalledTimes(0);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    push(3);
    expect(buffer.empty).to.equal(false);
    expectSpy(add).toHaveBeenCalledTimes(1);
  });

  it('pushes resolve to value passed to next', async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-1);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-2);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-3);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-4);
    const push1 = push(1);
    const push2 = push(2);
    const push3 = push(3);
    const push4 = push(4);
    expect(await push1).to.deep.equal(-2);
    expect(await push2).to.deep.equal(-3);
    expect(await push3).to.deep.equal(-4);
    expect(await Promise.race([push4, delayPromise(100, -1000)])).to.deep.equal(
      -1000,
    );
  });

  it('pushes resolve to value passed to next alternating', async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-1);
    const push1 = push(1);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-2);
    const push2 = push(2);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-3);
    const push3 = push(3);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-4);
    const push4 = push(4);
    expect(await push1).to.deep.equal(-2);
    expect(await push2).to.deep.equal(-3);
    expect(await push3).to.deep.equal(-4);
    expect(await Promise.race([push4, delayPromise(100, -1000)])).to.deep.equal(
      -1000,
    );
  });

  it('pushes resolve to value passed to next irregular', async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-1);
    const push1 = push(1);
    const push2 = push(2);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-2);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-3);
    const push3 = push(3);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-4);
    const push4 = push(4);
    expect(await push1).to.deep.equal(-2);
    expect(await push2).to.deep.equal(-3);
    expect(await push3).to.deep.equal(-4);
    expect(await Promise.race([push4, delayPromise(1, -1000)])).to.deep.equal(
      -1000,
    );
  });

  it('pushes resolve to value passed to next pushes first', async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-1);
    const push1 = push(1);
    const push2 = push(2);
    const push3 = push(3);
    const push4 = push(4);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-2);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-3);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    r.next(-4);
    expect(await push1).to.deep.equal(-2);
    expect(await push2).to.deep.equal(-3);
    expect(await push3).to.deep.equal(-4);
    expect(await Promise.race([push4, delayPromise(1, -1000)])).to.deep.equal(
      -1000,
    );
  });

  it('pushes resolve to undefined with buffer', async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => {
      push = push1;
    }, new FixedBuffer(3));
    const next1 = r.next(-1);
    const push1 = push(1);
    const push2 = push(2);
    const push3 = push(3);
    const push4 = push(4);
    const push5 = push(5);
    expect(await next1).to.deep.equal({ value: 1, done: false });
    expect(await r.next(-2)).to.deep.equal({ value: 2, done: false });
    expect(await push1).to.deep.equal(-2);
    expect(await r.next(-3)).to.deep.equal({ value: 3, done: false });
    expect(await r.next(-4)).to.deep.equal({ value: 4, done: false });
    expect(await r.next(-5)).to.deep.equal({ value: 5, done: false });
    expect(await push2).to.equal(undefined);
    expect(await push3).to.equal(undefined);
    expect(await push4).to.equal(undefined);
    expect(await push5).to.equal(-3);
    const push6 = push(6);
    const push7 = push(7);
    const push8 = push(8);
    const push9 = push(9);
    expect(await r.next(-6)).to.deep.equal({ value: 6, done: false });
    expect(await r.next(-7)).to.deep.equal({ value: 7, done: false });
    expect(await r.next(-8)).to.deep.equal({ value: 8, done: false });
    expect(await r.next(-9)).to.deep.equal({ value: 9, done: false });
    expect(await push6).to.equal(undefined);
    expect(await push7).to.equal(undefined);
    expect(await push8).to.equal(undefined);
    expect(await push9).to.equal(-7);
  });

  it('push throws when push queue is full', async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => {
      push = push1;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(null);
    });
    expect(await r.next()).to.deep.equal({
      value: null,
      done: false,
    });

    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(i);
    }

    expect(() => push(-1)).to.throw(RepeaterOverflowError);
    expect(() => push(-2)).to.throw(RepeaterOverflowError);
  });

  it('push throws when buffer and push queue are full', async () => {
    const bufferLength = 1000;
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => {
      push = push1;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(null);
    }, new FixedBuffer(bufferLength));
    expect(await r.next()).to.deep.equal({
      value: null,
      done: false,
    });

    for (let i = 0; i < bufferLength; i++) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(i);
    }

    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(i);
    }

    expect(() => push(-1)).to.throw(RepeaterOverflowError);
    expect(() => push(-2)).to.throw(RepeaterOverflowError);
  });

  it('next throws when pull queue is full', () => {
    const r = new Repeater(() => undefined, new FixedBuffer(3));
    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      r.next();
    }

    expect(() => r.next()).to.throw(RepeaterOverflowError);
    expect(() => r.next()).to.throw(RepeaterOverflowError);
  });

  it('dropping buffer', async () => {
    const r = new Repeater((push, stop) => {
      for (let i = 0; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }
      stop();
    }, new DroppingBuffer(3));
    expect(await r.next()).to.deep.equal({ value: 0, done: false });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('sliding buffer', async () => {
    const r = new Repeater((push, stop) => {
      for (let i = 0; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }
      stop();
    }, new SlidingBuffer(3));
    expect(await r.next()).to.deep.equal({ value: 97, done: false });
    expect(await r.next()).to.deep.equal({ value: 98, done: false });
    expect(await r.next()).to.deep.equal({ value: 99, done: false });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('break in for await', async () => {
    const r = new Repeater<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = spyOn(r, 'return');
    const result: Array<number> = [];
    for await (const num of r) {
      result.push(num);
      if (num === 3) {
        break;
      }
    }
    expect(result).to.deep.equal([1, 2, 3]);
    expectSpy(spy).toHaveBeenCalledTimes(1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw in for await', async () => {
    const error = new Error('throw in for await');
    const r = new Repeater<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = spyOn(r, 'return');
    const result: Array<number> = [];
    await expectPromise(
      (async () => {
        for await (const num of r) {
          result.push(num);
          if (num === 3) {
            throw error;
          } /* c8 ignore start */
        }
      })() /* c8 ignore stop */,
    ).toRejectWith(error);
    expect(result).to.deep.equal([1, 2, 3]);
    expectSpy(spy).toHaveBeenCalledTimes(1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method', async () => {
    const r = new Repeater<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      return -1;
    });
    const result: Array<number> = [];
    for await (const num of r) {
      result.push(num);
      if (num === 3) {
        expect(await r.return()).to.deep.equal({
          done: true,
          value: undefined,
        });
      }
    }
    expect(result).to.deep.equal([1, 2, 3]);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method before execution', async () => {
    const mock = fn();
    const r = new Repeater<unknown, unknown>(() => mock());
    expect(await r.return(-1)).to.deep.equal({
      value: -1,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(0);
  });

  it('return method with buffer', async () => {
    const r = new Repeater((push) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }
      return -1;
    }, new FixedBuffer(100));
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.return()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with buffer after stop', async () => {
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }
      stop();
      return -1;
    }, new FixedBuffer(100));
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.return()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with buffer after stop with error', async () => {
    const error = new Error('return method with buffer after stop with error');
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }
      stop(error);
      return -1;
    }, new FixedBuffer(100));
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.return()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with throw in executor', async () => {
    const error = new Error('return method with throw in executor');
    const r = new Repeater(async (push) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line no-await-in-loop
        await push(i);
      }

      throw error;
    }, new FixedBuffer(100));
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.return()).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with argument', async () => {
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await stop;
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    expect(await r.return(-2)).to.deep.equal({
      value: -2,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.return()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.return(-3)).to.deep.equal({
      value: -3,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with promise argument', async () => {
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await stop;
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.return(Promise.resolve(-2))).to.deep.equal({
      value: -2,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.return()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.return(Promise.resolve(-3))).to.deep.equal({
      value: -3,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with argument and pending next', async () => {
    const r = new Repeater(() => -1);
    const next = r.next();
    const returned = r.return(-2);
    expect(await next).to.deep.equal({ value: -1, done: true });
    expect(await returned).to.deep.equal({ value: -2, done: true });
  });

  it('return method with pushed rejection', async () => {
    const error = new Error('return method with pushed rejection');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error));
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.return(-2)).to.deep.equal({
      value: -2,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('return method with async pushed rejection', async () => {
    const error = new Error('return method with async pushed rejection');
    const r = new Repeater(async (push) => {
      await push(1);
      await push(Promise.reject(error));
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.return(-2)).to.deep.equal({
      value: -2,
      done: true,
    });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method', async () => {
    const error = new Error('throw method');
    const mock = fn();
    const r = new Repeater(async (push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(2);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      await stop;
      mock();
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.throw(error)).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(1);
  });

  it('throw method before execution', async () => {
    const error = new Error('throw method before execution');
    const mock = fn();
    const r = new Repeater(() => mock());
    await expectPromise(r.throw(error)).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(0);
  });

  it('throw method caught in async function', async () => {
    const error = new Error('throw method caught in async function');
    const errors: Array<Error> = [];
    const r = new Repeater(async (push, stop) => {
      for (let i = 0; i < 8; i++) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await push(i);
        } catch (err) {
          errors.push(err);
        }
      }

      stop();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 0, done: false });
    expect(await r.throw(error)).to.deep.equal({
      value: 1,
      done: false,
    });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.throw(error)).to.deep.equal({
      value: 3,
      done: false,
    });
    expect(await r.next()).to.deep.equal({ value: 4, done: false });
    expect(await r.throw(error)).to.deep.equal({
      value: 5,
      done: false,
    });
    expect(await r.next()).to.deep.equal({ value: 6, done: false });
    expect(await r.throw(error)).to.deep.equal({
      value: 7,
      done: false,
    });
    expect(await r.next()).to.deep.equal({ value: -1, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(errors).to.deep.equal(Array(4).fill(error));
  });

  it('throw method with Promise.prototype.catch', async () => {
    const error = new Error('throw method with Promise.prototype.catch');
    const mock = fn();
    const r = new Repeater((push) => {
      push(1).catch(mock);
      push(2).catch(mock);
      push(3).catch(mock);
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.throw(error)).to.deep.equal({
      value: 2,
      done: false,
    });
    expect(await r.throw(error)).to.deep.equal({
      value: 3,
      done: false,
    });
    expectMock(mock).toHaveBeenCalledTimes(2);
  });

  it('throw method with buffer after stop', async () => {
    const error = new Error('throw method with buffer after stop');
    const mock = fn();
    const r = new Repeater((push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i).catch(mock);
      }
      stop();
      return -1;
    }, new FixedBuffer(100));
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.throw(error)).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(0);
  });

  it('throw method after stop with error', async () => {
    const error1 = new Error('throw method after stop with error 1');
    const error2 = new Error('throw method after stop with error 2');
    const r = new Repeater((push, stop) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }
      stop(error1);
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.throw(error2)).toRejectWith(error1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method with throw in executor', async () => {
    const error1 = new Error('throw method with throw in executor 1');
    const error2 = new Error('throw method with throw in executor 2');
    const r = new Repeater((push) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }

      throw error1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.throw(error2)).toRejectWith(error1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method with pending next', async () => {
    const error = new Error('throw method with pending next');
    const mock = fn();
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        push(i);
      }

      await stop;
      mock();
      return -1;
    });
    const next1 = r.next(-1);
    const next2 = r.next(-2);
    const next3 = r.next(-3);
    const next4 = r.next(-4);
    const thrown = r.throw(error);
    expect(await next1).to.deep.equal({ value: 1, done: false });
    expect(await next2).to.deep.equal({ value: 2, done: false });
    expect(await next3).to.deep.equal({ value: 3, done: false });
    expect(await next4).to.deep.equal({ value: 4, done: false });
    await expectPromise(thrown).toRejectWith(error);
    expectMock(mock).toHaveBeenCalledTimes(1);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method before stop', async () => {
    const error = new Error('throw method before stop');
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      stop();
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    await expectPromise(r.throw(error)).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method before async stop', async () => {
    const error = new Error('throw method before async stop');
    const r = new Repeater(async (push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      await stop;
      return -1;
    });

    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    await expectPromise(r.throw(error)).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method before return method', async () => {
    const error = new Error('throw method before return method');
    const mock = fn();
    const r = new Repeater(async (push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(1);
      await stop;
      mock();
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    const thrown = r.throw(error);
    const returned = r.return(-2);
    await expectPromise(thrown).toRejectWith(error);
    expect(await returned).to.deep.equal({ value: -2, done: true });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(1);
  });

  it('throw method after return method', async () => {
    const error = new Error('throw method after return method');
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      return -1;
    });
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    const returned = r.return(-2);
    const thrown = r.throw(error);
    expect(await returned).to.deep.equal({ value: -2, done: true });
    await expectPromise(thrown).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('throw method with buffer', async () => {
    const error = new Error('throw method with buffer');
    const mock = fn();
    const r = new Repeater((push) => {
      for (let i = 1; i < 100; i++) {
        push(i).catch(mock);
      }
      return -1;
    }, new FixedBuffer(100));
    expect(await r.next()).to.deep.equal({ value: 1, done: false });
    expect(await r.next()).to.deep.equal({ value: 2, done: false });
    expect(await r.next()).to.deep.equal({ value: 3, done: false });
    await expectPromise(r.throw(error)).toRejectWith(error);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expectMock(mock).toHaveBeenCalledTimes(0);
  });

  it('results settle in order', async () => {
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(10, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      stop();
      return -1;
    });
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.next();
    const r4 = r.next();
    const r5 = r.next();
    await Promise.all([
      expectPromise(Promise.race([r5, r4, r3, r2, r1])).toResolveAs({
        value: 1,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3, r2, r1])).toResolveAs({
        value: 1,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3, r2])).toResolveAs({
        value: 2,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3])).toResolveAs({
        value: 3,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4])).toResolveAs({
        value: -1,
        done: true,
      }),
      expectPromise(r5).toResolveAs({ done: true, value: undefined }),
    ]);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('results settle in order with buffer', async () => {
    const r = new Repeater((push, stop) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(10, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.resolve(2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(3);
      stop();
      return -1;
    }, new FixedBuffer(100));
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.next();
    const r4 = r.next();
    const r5 = r.next();
    await Promise.all([
      expectPromise(Promise.race([r5, r4, r3, r2, r1])).toResolveAs({
        value: 1,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3, r2])).toResolveAs({
        value: 2,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3])).toResolveAs({
        value: 3,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4])).toResolveAs({
        value: -1,
        done: true,
      }),
      expectPromise(r5).toResolveAs({ done: true, value: undefined }),
    ]);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('results settle in order with rejection', async () => {
    const error = new Error('results settle in order with rejection');
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(100, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(10, 2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      return 5;
    });
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.next();
    const r4 = r.next();
    const r5 = r.next();
    await Promise.all([
      expectPromise(Promise.race([r5, r4, r3, r2, r1])).toResolveAs({
        value: 1,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3, r2])).toResolveAs({
        value: 2,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3])).toRejectWith(error),
      expectPromise(Promise.race([r5, r4])).toResolveAs({
        value: undefined,
        done: true,
      }),
      expectPromise(r5).toResolveAs({ value: undefined, done: true }),
    ]);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('results settle in order with return method and rejection', async () => {
    const error = new Error(
      'results settle in order with return method and rejection',
    );
    const r = new Repeater((push) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(100, 1));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(delayPromise(10, 2));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(Promise.reject(error));
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      push(4);
      return 5;
    });
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.return(-1);
    const r4 = r.next();
    const r5 = r.return(-2);
    await Promise.all([
      expectPromise(Promise.race([r5, r4, r3, r2, r1])).toResolveAs({
        value: 1,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3, r2])).toResolveAs({
        value: 2,
        done: false,
      }),
      expectPromise(Promise.race([r5, r4, r3])).toResolveAs({
        value: -1,
        done: true,
      }),
      expectPromise(Promise.race([r5, r4])).toResolveAs({
        value: undefined,
        done: true,
      }),
      expectPromise(r5).toResolveAs({ value: -2, done: true }),
    ]);
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
    expect(await r.next()).to.deep.equal({ done: true, value: undefined });
  });

  it('WeakMap errors', () => {
    const r = new Repeater(() => undefined);
    const nextFn = r.next;
    const boundNextFn = r.next.bind(r);
    const returnFn = r.return;
    const boundReturnFn = r.return.bind(r);
    const throwFn = r.throw;
    const boundThrowFn = r.throw.bind(r);
    expect(() => nextFn()).to.throw('WeakMap error');
    expect(() => boundNextFn()).not.to.throw();
    expect(() => returnFn()).to.throw('WeakMap error');
    expect(() => boundReturnFn()).not.to.throw();
    expect(() => throwFn(1)).to.throw('WeakMap error');
    expect(() => boundThrowFn(1)).not.to.throw();
  });
});

describe('RepeaterBuffer', () => {
  it('FixedBuffer', () => {
    expect(() => new FixedBuffer(-1)).to.throw();
    const buffer = new FixedBuffer(2);
    expect([buffer.empty, buffer.full]).to.deep.equal([true, false]);
    buffer.add(1);
    expect([buffer.empty, buffer.full]).to.deep.equal([false, false]);
    buffer.add(2);
    expect([buffer.empty, buffer.full]).to.deep.equal([false, true]);
    expect(() => buffer.add(3)).to.throw();
    expect(buffer.remove()).to.deep.equal(1);
    expect([buffer.empty, buffer.full]).to.deep.equal([false, false]);
    expect(buffer.remove()).to.deep.equal(2);
    expect([buffer.empty, buffer.full]).to.deep.equal([true, false]);
    expect(() => buffer.remove()).to.throw();
  });

  it('SlidingBuffer', () => {
    expect(() => new SlidingBuffer(-1)).to.throw();
    const buffer = new SlidingBuffer(2);
    expect([buffer.empty, buffer.full]).to.deep.equal([true, false]);
    buffer.add(1);
    buffer.add(2);
    buffer.add(3);
    buffer.add(4);
    buffer.add(5);
    expect([buffer.empty, buffer.full]).to.deep.equal([false, false]);
    expect(buffer.remove()).to.equal(4);
    expect(buffer.remove()).to.equal(5);
    expect([buffer.empty, buffer.full]).to.deep.equal([true, false]);
    expect(() => buffer.remove()).to.throw();
  });

  it('DroppingBuffer', () => {
    expect(() => new DroppingBuffer(-1)).to.throw();
    const buffer = new DroppingBuffer(2);
    expect([buffer.empty, buffer.full]).to.deep.equal([true, false]);
    buffer.add(1);
    buffer.add(2);
    buffer.add(3);
    buffer.add(4);
    buffer.add(5);
    expect([buffer.empty, buffer.full]).to.deep.equal([false, false]);
    expect(buffer.remove()).to.equal(1);
    expect(buffer.remove()).to.equal(2);
    expect([buffer.empty, buffer.full]).to.deep.equal([true, false]);
    expect(() => buffer.remove()).to.throw();
  });
});
