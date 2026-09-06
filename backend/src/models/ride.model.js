// Plain JS "model". No ORM/DB — see README for why an in-memory store was
// chosen for this task. This factory is the single place that defines the
// shape of a ride, so swapping in Mongoose later only means changing
// store/ride.store.js, not every file that touches a ride.

export const RideStatus = Object.freeze({
  REQUESTED: "REQUESTED",
  ASSIGNED: "ASSIGNED",
  NO_DRIVER_FOUND: "NO_DRIVER_FOUND"
});

export function createRide({ id, pickup, drop, riderName }) {
  const now = new Date().toISOString();
  return {
    id,
    riderName: riderName || "anonymous-rider",
    pickup: pickup || null,
    drop: drop || null,
    status: RideStatus.REQUESTED,
    driverId: null,
    rejectedDriverIds: [],
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
}
