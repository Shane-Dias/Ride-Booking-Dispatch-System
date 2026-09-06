// Centralized config so nothing is hardcoded across the codebase.
export const config = {
  port: process.env.PORT || 4000,

  // Dispatch behaviour
  maxDriverAttempts: 3,        // reject this many times -> NO_DRIVER_FOUND
  driverAcceptProbability: 0.5, // ~50% accept, matches the task spec
  driverResponseDelayMs: 150,   // simulated network/thinking delay per offer

  // How many rides the dispatch worker processes in parallel.
  // Keeps a single-process in-memory design responsive under the 100-ride load test
  // without needing a real message broker.
  dispatchConcurrency: 10,

  // Fake driver pool. Ten is enough per the task spec.
  drivers: Array.from({ length: 10 }, (_, i) => ({
    id: `driver-${i + 1}`,
    name: `Driver ${i + 1}`
  }))
};
