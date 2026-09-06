// Program B (ops). Also a separate Node process — run it with
// `npm run consumer:ops`. Same event bus, same broadcast: it sees every
// event billing sees too, independently.
import WebSocket from "ws";

const EVENTS_URL = process.env.EVENTS_URL || "ws://localhost:4000/events";

const socket = new WebSocket(EVENTS_URL);

socket.on("open", () => {
  console.log(`[ops] connected to ${EVENTS_URL}`);
});

socket.on("message", (raw) => {
  const event = JSON.parse(raw.toString());
  if (event.type !== "RIDE_STATUS_CHANGED") return;
  console.log(`[ops] ride ${event.rideId} is now in status ${event.status}`);
});

socket.on("close", () => console.log("[ops] disconnected"));
socket.on("error", (err) => console.error("[ops] error:", err.message));
