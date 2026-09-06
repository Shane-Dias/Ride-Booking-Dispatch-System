import { createQueue } from "../queue/queue.js";
import { config } from "../config/index.js";
import { offerRideToDriver } from "./driver.simulator.js";
import { rideStore } from "../store/ride.store.js";
import { setRideStatus, RideStatus } from "./ride.service.js";
import { logger } from "../utils/logger.js";

// Task 1's "separate worker": rides are enqueued by the HTTP handler and
// drained here, independently, by ID so each ride's dispatch attempts
// don't block any other ride's.
export const rideQueue = createQueue();

async function dispatchOneRide(rideId) {
  const ride = rideStore.findById(rideId);
  if (!ride) return; // defensive: shouldn't happen, but never crash the worker loop

  while (ride.attempts < config.maxDriverAttempts) {
    const { driver, accepted } = await offerRideToDriver(ride.rejectedDriverIds);

    if (!driver) break; // ran out of distinct drivers to try

    ride.attempts += 1;

    if (accepted) {
      setRideStatus(ride.id, RideStatus.ASSIGNED, { driverId: driver.id });
      logger.info(`Ride ${ride.id} ASSIGNED to ${driver.id} (attempt ${ride.attempts})`);
      return;
    }

    ride.rejectedDriverIds.push(driver.id);
    logger.info(`Ride ${ride.id} rejected by ${driver.id} (attempt ${ride.attempts})`);
  }

  setRideStatus(ride.id, RideStatus.NO_DRIVER_FOUND);
  logger.info(`Ride ${ride.id} -> NO_DRIVER_FOUND after ${ride.attempts} attempts`);
}

// A small worker pool rather than one-at-a-time processing, so the 100-ride
// load test in Task 3 completes in a reasonable time on a single process.
export function startDispatchWorker() {
  for (let i = 0; i < config.dispatchConcurrency; i++) {
    runWorkerLoop(i);
  }
  logger.info(`Dispatch worker started with concurrency=${config.dispatchConcurrency}`);
}

async function runWorkerLoop(workerIndex) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rideId = await rideQueue.pop();
    try {
      await dispatchOneRide(rideId);
    } catch (err) {
      logger.error(`Worker ${workerIndex} failed on ride ${rideId}: ${err.message}`);
    }
  }
}
