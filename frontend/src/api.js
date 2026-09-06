// Thin fetch wrapper. Vite's dev proxy (see vite.config.js) forwards
// /rides to the backend, so this works unchanged in dev; in a real deploy
// set VITE_API_URL to the backend's address instead.
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function bookRide({ riderName, pickup, drop }) {
  const res = await fetch(`${BASE_URL}/rides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ riderName, pickup, drop })
  });
  if (!res.ok) throw new Error("Could not book the ride");
  return res.json();
}

export async function fetchRides() {
  const res = await fetch(`${BASE_URL}/rides`);
  if (!res.ok) throw new Error("Could not load rides");
  return res.json();
}
