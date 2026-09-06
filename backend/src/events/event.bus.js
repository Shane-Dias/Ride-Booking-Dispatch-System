import { WebSocketServer } from "ws";

// Event bus for Task 2.
//
// Requirement: "both programs must see every event" — i.e. fan-out /
// broadcast semantics, not a work queue where consumers steal messages
// from each other. A plain queue (SQS-style) would hand each message to
// only ONE consumer, which is exactly what we must avoid.
//
// Implementation: a WebSocket server that every connected client receives
// every published message from. This gives us real pub/sub, with the
// billing and ops consumers running as genuinely separate OS processes
// (Task 2 asks for "two separate small programs"), without pulling in an
// external broker like Redis/Kafka for a 1-day task.
//
// Trade-off, stated plainly: if a consumer is offline when an event is
// published, it misses that event (no replay log). That's an acceptable
// simplification here — see README — but would be the first thing to fix
// with a real broker in production.

let wss = null;
const buffer = []; // last N events, replayed to a client on connect for convenience
const BUFFER_SIZE = 50;

export function startEventBus(server) {
  wss = new WebSocketServer({ server, path: "/events" });

  wss.on("connection", (socket) => {
    // Replay a little history so a consumer started slightly late still
    // has recent context. Does not solve the "must be online" trade-off
    // above for events published while fully disconnected.
    for (const evt of buffer) {
      socket.send(JSON.stringify(evt));
    }
  });

  return wss;
}

export function publishEvent(event) {
  const payload = { ...event, publishedAt: new Date().toISOString() };

  buffer.push(payload);
  if (buffer.length > BUFFER_SIZE) buffer.shift();

  if (!wss) return;
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}
