// A minimal in-memory FIFO queue with a bounded-concurrency consumer.
//
// This plays the role that SQS/RabbitMQ/BullMQ would play in a production
// version of this system: the HTTP handler only *enqueues* work and returns
// immediately; a separate consumer loop drains the queue on its own pace.

export function createQueue() {
  const items = [];
  const waiters = [];

  function push(item) {
    items.push(item);
    const waiter = waiters.shift();
    if (waiter) waiter(items.shift());
  }

  function pop() {
    if (items.length > 0) {
      return Promise.resolve(items.shift());
    }
    return new Promise((resolve) => waiters.push(resolve));
  }

  function size() {
    return items.length;
  }

  return { push, pop, size };
}
