// Program A (billing). A genuinely separate Node process — run it with
// `npm run consumer:billing` in its own terminal, independent of the ops
// consumer and the API server. It connects to the event bus as a plain
// WebSocket client, so it receives EVERY event broadcast (not a subset).
import WebSocket from "ws";

const EVENTS_URL = process.env.EVENTS_URL || "ws://localhost:4000/events";

const socket = new WebSocket(EVENTS_URL);

socket.on("open", () => {
  console.log(`[billing] connected to ${EVENTS_URL}`);
});

socket.on("message", (raw) => {
  const event = JSON.parse(raw.toString());
  if (event.type !== "RIDE_STATUS_CHANGED") return;

  // Billing only cares about rides that actually got a driver.
  if (event.status === "ASSIGNED") {
    console.log(`[billing] charging rider for ride ${event.rideId}`);
  }
});

socket.on("close", () => console.log("[billing] disconnected"));
socket.on("error", (err) => console.error("[billing] error:", err.message));
