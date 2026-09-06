import { nanoid } from "nanoid";
import { rideStore } from "../store/ride.store.js";
import { createRide, RideStatus } from "../models/ride.model.js";
import { publishEvent } from "../events/event.bus.js";
import { rideQueue } from "./dispatch.worker.js";

// Task 1: POST /rides — book a ride and return a rideId immediately.
// The actual driver-matching happens asynchronously via the queue/worker.
export function bookRide({ pickup, drop, riderName } = {}) {
  const ride = createRide({ id: nanoid(10), pickup, drop, riderName });
  rideStore.save(ride);

  publishEvent({
    type: "RIDE_STATUS_CHANGED",
    rideId: ride.id,
    status: ride.status
  });

  // Don't process it right away — hand it to the queue and return.
  rideQueue.push(ride.id);

  return ride;
}

export function getRide(id) {
  return rideStore.findById(id);
}

export function listRides() {
  return rideStore.findAll();
}

// Called only by the dispatch worker. Centralized here so every status
// change — no matter which code path triggers it — goes through the same
// "save + publish" step and can never be forgotten in one branch.
export function setRideStatus(rideId, status, patch = {}) {
  const ride = rideStore.findById(rideId);
  if (!ride) return null;

  Object.assign(ride, patch, { status });
  rideStore.save(ride);

  publishEvent({
    type: "RIDE_STATUS_CHANGED",
    rideId: ride.id,
    status: ride.status
  });

  return ride;
}

export { RideStatus };
