import { config } from "../config/index.js";

// Stands in for "call the driver's phone / push notification and wait for
// a response". Picks a driver the ride hasn't already been rejected by,
// waits a short simulated delay, then randomly accepts (~50%) or rejects.

function pickDriver(rejectedDriverIds) {
  const candidates = config.drivers.filter(
    (d) => !rejectedDriverIds.includes(d.id)
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function offerRideToDriver(rejectedDriverIds) {
  const driver = pickDriver(rejectedDriverIds);
  if (!driver) return Promise.resolve({ driver: null, accepted: false });

  return new Promise((resolve) => {
    setTimeout(() => {
      const accepted = Math.random() < config.driverAcceptProbability;
      resolve({ driver, accepted });
    }, config.driverResponseDelayMs);
  });
}
