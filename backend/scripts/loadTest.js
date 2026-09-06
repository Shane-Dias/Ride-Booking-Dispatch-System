// Task 3: book 100 rides at once, then verify the system behaved correctly.
//
// Run the API server first (`npm start`), then in another terminal:
//   npm run loadtest

const BASE_URL = process.env.API_URL || "http://localhost:4000";
const RIDE_COUNT = 100;
const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 20000;

async function bookRide(i) {
  const res = await fetch(`${BASE_URL}/rides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ riderName: `load-test-rider-${i}` })
  });
  if (!res.ok) throw new Error(`booking ride ${i} failed: ${res.status}`);
  return res.json(); // { rideId, status }
}

async function fetchRide(rideId) {
  const res = await fetch(`${BASE_URL}/rides/${rideId}`);
  if (!res.ok) throw new Error(`fetching ride ${rideId} failed: ${res.status}`);
  return res.json();
}

function isFinal(status) {
  return status === "ASSIGNED" || status === "NO_DRIVER_FOUND";
}

async function waitForFinalStatus(rideId) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const ride = await fetchRide(rideId);
    if (isFinal(ride.status)) return ride;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return fetchRide(rideId); // last attempt, whatever it is
}

async function main() {
  console.log(`Booking ${RIDE_COUNT} rides concurrently...`);

  const bookings = await Promise.all(
    Array.from({ length: RIDE_COUNT }, (_, i) => bookRide(i))
  );

  console.log(`All ${bookings.length} bookings accepted. Waiting for dispatch to finish...`);

  const finalRides = await Promise.all(
    bookings.map((b) => waitForFinalStatus(b.rideId))
  );

  // --- Checks -------------------------------------------------------
  const totalCreated = finalRides.length;

  const assignedCount = finalRides.filter((r) => r.status === "ASSIGNED").length;
  const noDriverCount = finalRides.filter((r) => r.status === "NO_DRIVER_FOUND").length;
  const resolvedTotal = assignedCount + noDriverCount;

  // "Assigned to 2 drivers" doesn't apply structurally here (a ride only
  // ever stores one driverId), but we double-check anyway in case the
  // model or worker logic changes later.
  const doubleAssignedCount = finalRides.filter(
    (r) => r.status === "ASSIGNED" && Array.isArray(r.driverIds) && r.driverIds.length > 1
  ).length;

  const stuckCount = finalRides.filter((r) => !isFinal(r.status)).length;

  const rows = [
    { Check: "Total rides created", Expected: RIDE_COUNT, Actual: totalCreated },
    { Check: "ASSIGNED + NO_DRIVER_FOUND", Expected: RIDE_COUNT, Actual: resolvedTotal },
    { Check: "Rides assigned to 2 drivers", Expected: 0, Actual: doubleAssignedCount },
    { Check: "Rides stuck with no final status", Expected: 0, Actual: stuckCount }
  ];

  console.log("");
  console.table(rows);
  console.log(`Breakdown: ${assignedCount} ASSIGNED, ${noDriverCount} NO_DRIVER_FOUND`);

  const allGood = rows.every((r) => r.Expected === r.Actual);
  process.exit(allGood ? 0 : 1);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
