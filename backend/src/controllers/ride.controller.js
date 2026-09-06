import { bookRide, getRide, listRides } from "../services/ride.service.js";

export function postRide(req, res) {
  const { pickup, drop, riderName } = req.body || {};
  const ride = bookRide({ pickup, drop, riderName });
  // Return the rideId immediately — matching happens asynchronously.
  res.status(201).json({ rideId: ride.id, status: ride.status });
}

export function getRideById(req, res) {
  const ride = getRide(req.params.id);
  if (!ride) return res.status(404).json({ error: "ride not found" });
  res.json(ride);
}

export function getAllRides(req, res) {
  res.json(listRides());
}
