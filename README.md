# 🚖 Ride Booking & Dispatch System

A backend ride-booking system that demonstrates **asynchronous job dispatch**, **real-time event broadcasting**, and **concurrent worker processing**

> Built with **Node.js + Express** on the backend and **React + Vite** on the frontend.

---

## 📌 Table of Contents

- [Features](#-features)
- [Project Architecture](#-project-architecture)
- [How the Backend Works](#-how-the-backend-works)
  - [Ride Lifecycle](#ride-lifecycle)
  - [Dispatch Pipeline](#dispatch-pipeline)
  - [Event Bus (WebSocket Pub/Sub)](#event-bus-websocket-pubsub)
  - [Why No Database?](#why-no-database)
- [Project Structure](#-project-structure)
- [Backend File Reference](#-backend-file-reference)
- [Frontend Overview](#-frontend-overview)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Running the Backend](#running-the-backend)
  - [Running the Frontend](#running-the-frontend)
  - [Running the Event Consumers](#running-the-event-consumers)
  - [Running the Load Test](#running-the-load-test)
- [API Reference](#-api-reference)
- [Design Decisions & Trade-offs](#-design-decisions--trade-offs)

---

## ✨ Features

- **Instant ride booking** — `POST /rides` returns a `rideId` immediately; driver matching happens in the background
- **Async dispatch worker** — a concurrent worker pool (10 parallel workers) drains the ride queue and attempts driver matching
- **Simulated driver pool** — 10 virtual drivers, each with a ~50% acceptance probability and a 150ms simulated response delay
- **Real-time event bus** — a WebSocket server broadcasts every ride status change to all connected clients (fan-out / pub-sub semantics)
- **Separate event consumers** — a Billing consumer and an Ops consumer run as independent OS processes and subscribe to the event bus
- **Load test script** — concurrently books 100 rides and verifies every ride reaches a final status (`ASSIGNED` or `NO_DRIVER_FOUND`)
- **Live frontend** — a React dashboard polls the API every 1.5 seconds and displays ride status in real time

---

## 🏗 Project Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│                                                                     │
│   React + Vite (port 5173)                                          │
│   ┌──────────────┐   ┌───────────────┐                             │
│   │  RideForm    │   │  RideList     │  ← polls GET /rides every   │
│   │  (booking)   │   │  (live table) │    1.5s via fetch()          │
│   └──────┬───────┘   └───────────────┘                             │
│          │ POST /rides                                              │
└──────────┼──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND  (Node.js / Express, port 4000)          │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  HTTP Layer                                                 │    │
│  │  POST /rides  →  ride.controller  →  ride.service           │    │
│  │  GET  /rides  →  ride.controller  →  rideStore              │    │
│  │  GET  /rides/:id                                            │    │
│  │  GET  /health                                               │    │
│  └─────────────────────────┬──────────────────────────────────┘    │
│                             │ rideQueue.push(rideId)                │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  In-Memory FIFO Queue  (queue.js)                            │  │
│  │  Decouples HTTP handler from dispatch logic.                  │  │
│  │  HTTP returns instantly; queue drains on its own pace.       │  │
│  └─────────────────────────┬────────────────────────────────────┘  │
│                             │ rideQueue.pop()  (10 concurrent)      │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Dispatch Worker Pool  (dispatch.worker.js)                  │  │
│  │                                                              │  │
│  │  Worker 1  ──►  offerRideToDriver()  ──►  accept / reject    │  │
│  │  Worker 2  ──►  offerRideToDriver()  ──►  accept / reject    │  │
│  │  ...  (10 workers total, each an independent async loop)     │  │
│  │                                                              │  │
│  │  Per-ride logic:                                             │  │
│  │    1. Pick a random driver not already rejected              │  │
│  │    2. Wait 150ms (simulated network delay)                   │  │
│  │    3. ~50% chance driver accepts                             │  │
│  │    4. Retry up to 3 times; on failure → NO_DRIVER_FOUND      │  │
│  └─────────────────────────┬────────────────────────────────────┘  │
│                             │ setRideStatus() → publishEvent()      │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Event Bus  (event.bus.js)                                   │  │
│  │  WebSocket server at ws://localhost:4000/events              │  │
│  │  Every status change is broadcast to ALL connected clients   │  │
│  │  (fan-out / pub-sub, not a work queue)                       │  │
│  └─────────┬──────────────────────┬─────────────────────────────┘  │
│            │                      │                                  │
└────────────┼──────────────────────┼──────────────────────────────────┘
             │                      │
             ▼                      ▼
  ┌──────────────────┐   ┌────────────────────┐
  │ billing.consumer │   │  ops.consumer      │
  │  (separate node  │   │  (separate node    │
  │   process)       │   │   process)         │
  │                  │   │                    │
  │ Charges rider on │   │ Logs every ride    │
  │ ASSIGNED status  │   │ status transition  │
  └──────────────────┘   └────────────────────┘
```

---

## ⚙️ How the Backend Works

### Ride Lifecycle

Every ride passes through three states:

| Status | Meaning |
|---|---|
| `REQUESTED` | Ride has been created; dispatch is pending |
| `ASSIGNED` | A driver accepted the ride |
| `NO_DRIVER_FOUND` | All 3 dispatch attempts were rejected |

```
POST /rides
    │
    ▼
[ REQUESTED ]  ──► queue ──► dispatch worker
                                    │
                    ┌───────────────┴───────────────┐
                    ▼ (driver accepts)               ▼ (3 rejections)
              [ ASSIGNED ]               [ NO_DRIVER_FOUND ]
```

Every status transition calls `publishEvent()`, which immediately broadcasts a `RIDE_STATUS_CHANGED` event to all WebSocket subscribers.

---

### Dispatch Pipeline

The dispatch pipeline is intentionally designed to keep the HTTP handler fast and non-blocking:

1. **HTTP handler** (`ride.controller.js`) calls `bookRide()` from the service layer.
2. `bookRide()` creates the ride, saves it to the in-memory store, publishes a `REQUESTED` event, pushes the `rideId` onto the queue, and **returns immediately** with a `201` response.
3. The **queue** (`queue.js`) is a promise-based FIFO. If no worker is waiting, the ID is buffered; when a worker calls `pop()`, it either gets an item immediately or suspends until one arrives.
4. **10 worker loops** run in parallel (`startDispatchWorker()`). Each loop continuously calls `rideQueue.pop()` and then `dispatchOneRide()`.
5. `dispatchOneRide()` retries up to `maxDriverAttempts` (3) times:
   - Picks a random driver not yet rejected for this ride.
   - Waits `driverResponseDelayMs` (150ms) to simulate a real push notification.
   - Accepts (~50%) or rejects probabilistically.
   - On acceptance: calls `setRideStatus(ASSIGNED, { driverId })`.
   - On exhaustion: calls `setRideStatus(NO_DRIVER_FOUND)`.
6. `setRideStatus()` mutates the ride in the store and calls `publishEvent()` so every WebSocket subscriber is notified instantly.

---

### Event Bus (WebSocket Pub/Sub)

The event bus is a WebSocket server mounted at `ws://localhost:4000/events`.

**Why WebSocket fan-out instead of a work queue?**

> The system requires that *both* the billing and ops programs see *every* event. A traditional work queue (SQS / BullMQ style) hands each message to exactly **one** consumer — which would mean only one consumer sees each event, violating the requirement. The WebSocket broadcast model gives true pub/sub: every connected client receives every message.

**Buffer replay:** The last 50 events are buffered in memory. When a new consumer connects, the buffer is replayed to it so a consumer started slightly late still has recent context.

**Trade-off acknowledged:** If a consumer is offline when an event fires, it will miss that event (no persistent replay log). In production, a message broker like Kafka or Redis Streams would solve this.

---

### Why No Database?

The in-memory store (`ride.store.js`) was an intentional architectural choice:

- **Speed** — no I/O overhead; perfect for high-throughput tests (100 concurrent rides)
- **Simplicity** — no Docker, no connection setup, no migrations
- **Repository pattern** — every module talks to rides through the `rideStore` interface, not a raw Map. Swapping in a real database (e.g., MongoDB with Mongoose) only requires changing `ride.store.js` — no other file changes needed.

---

## 📁 Project Structure

```
ride-booking-system/
├── backend/
│   ├── consumers/
│   │   ├── billing.consumer.js    # Separate process: charges rider on ASSIGNED
│   │   └── ops.consumer.js        # Separate process: logs all status changes
│   ├── scripts/
│   │   └── loadTest.js            # Books 100 rides concurrently + validates results
│   ├── src/
│   │   ├── app.js                 # Express app factory (routes, middleware)
│   │   ├── server.js              # Entry point: HTTP server + event bus + dispatch worker
│   │   ├── config/
│   │   │   └── index.js           # Centralized config (port, driver pool, timing params)
│   │   ├── controllers/
│   │   │   └── ride.controller.js # HTTP handlers: parse request, call service, send response
│   │   ├── events/
│   │   │   └── event.bus.js       # WebSocket pub/sub server (fan-out broadcast)
│   │   ├── models/
│   │   │   └── ride.model.js      # Ride factory + RideStatus enum
│   │   ├── queue/
│   │   │   └── queue.js           # In-memory async FIFO queue (promise-based)
│   │   ├── routes/
│   │   │   └── ride.routes.js     # Express route definitions for /rides
│   │   ├── services/
│   │   │   ├── dispatch.worker.js # Worker pool: drains queue and assigns drivers
│   │   │   ├── driver.simulator.js# Simulates driver accept/reject with delay
│   │   │   └── ride.service.js    # Business logic: bookRide, setRideStatus, publishEvent
│   │   ├── store/
│   │   │   └── ride.store.js      # In-memory repository (Map-backed, swap-safe)
│   │   └── utils/
│   │       └── logger.js          # Timestamped console logger (info / error)
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx                # Root component: polling loop + layout
    │   ├── api.js                 # Fetch wrappers for bookRide and fetchRides
    │   ├── index.css              # Global styles
    │   ├── main.jsx               # React DOM entry point
    │   └── components/
    │       ├── RideForm.jsx       # Booking form (rider name, pickup, drop)
    │       └── RideList.jsx       # Live ride table with status badges
    ├── vite.config.js             # Vite config + dev proxy (/rides → :4000)
    └── package.json
```

---

## 🗂 Backend File Reference

> Detailed description of every file containing core backend logic.

---

### `src/server.js`
**Entry point for the entire backend.**

Creates the Express app, wraps it in a Node.js `http.Server`, then starts two long-running background systems: the WebSocket event bus (attached to the same HTTP server at `/events`) and the dispatch worker pool. Finally, it binds the server to the configured port. This file is the only place that wires all three subsystems together.

---

### `src/app.js`
**Express application factory.**

Configures CORS, JSON body parsing, and mounts the two route groups: `GET /health` (liveness probe) and all ride routes under `/rides`. Exported as a factory function (`createApp`) so the same app can be reused in tests without starting a real server.

---

### `src/config/index.js`
**Centralized runtime configuration.**

Single source of truth for all tuneable parameters:
- `port` — server port (default `4000`, override with `PORT` env var)
- `maxDriverAttempts` — max number of times dispatch tries to find a driver per ride (default `3`)
- `driverAcceptProbability` — probability a driver accepts an offer (default `0.5`)
- `driverResponseDelayMs` — simulated delay between offer and response (default `150ms`)
- `dispatchConcurrency` — number of parallel worker loops (default `10`)
- `drivers` — static pool of 10 virtual driver objects

Nothing is hardcoded anywhere else; all tuneable values come from here.

---

### `src/controllers/ride.controller.js`
**HTTP request handlers (thin layer).**

Contains three handlers wired to Express routes:
- `postRide` — extracts `{ pickup, drop, riderName }` from the request body, calls `bookRide()`, and responds `201` with `{ rideId, status }` immediately (before dispatch even starts)
- `getRideById` — looks up a ride by `:id`, returns `404` if not found
- `getAllRides` — returns all rides sorted by creation time

Controllers contain no business logic — they only parse input, delegate to the service layer, and format the HTTP response.

---

### `src/routes/ride.routes.js`
**Express route definitions.**

Maps HTTP verbs and paths to controller functions:
- `POST /rides` → `postRide`
- `GET  /rides` → `getAllRides`
- `GET  /rides/:id` → `getRideById`

Kept in a separate file so the routing table is readable at a glance and the app factory stays clean.

---

### `src/models/ride.model.js`
**Ride data shape and status enum.**

Defines two exports:
- `RideStatus` — a frozen enum: `REQUESTED | ASSIGNED | NO_DRIVER_FOUND`
- `createRide({ id, pickup, drop, riderName })` — a factory function that returns a plain JS object with all ride fields defaulted (status starts as `REQUESTED`, `driverId` starts as `null`, `attempts` starts at `0`, etc.)

This is the single source of truth for the shape of a ride. No ORM, no schema validation library — just a plain object factory that makes the shape explicit and testable.

---

### `src/store/ride.store.js`
**In-memory repository (Repository Pattern).**

A `Map`-backed singleton that exposes a clean interface: `save(ride)`, `findById(id)`, `findAll()`, `clear()`, `count()`. Every other module interacts with rides through this interface — never through the raw `Map` directly. This means replacing it with a real database (MongoDB, PostgreSQL, etc.) only requires changing this one file.

`findAll()` returns rides sorted by `createdAt` ascending, so the frontend always sees a stable ordering.

---

### `src/services/ride.service.js`
**Core business logic — the heart of the system.**

Three key exports:
- `bookRide({ pickup, drop, riderName })` — creates a ride (via the model factory), saves it to the store, publishes a `RIDE_STATUS_CHANGED` event with `status: REQUESTED`, pushes the `rideId` onto the dispatch queue, and returns the ride. The HTTP handler calls this and gets a response before any driver is contacted.
- `getRide(id)` / `listRides()` — thin read wrappers over the store.
- `setRideStatus(rideId, status, patch)` — **the only place a ride's status may change**. It applies a patch to the ride (e.g., `{ driverId }` on assignment), saves it, and calls `publishEvent()` so no status change can ever happen silently. The dispatch worker calls this to finalize assignment or failure.

---

### `src/services/dispatch.worker.js`
**Async worker pool — processes rides from the queue.**

Two responsibilities:

1. **`startDispatchWorker()`** — spawns `config.dispatchConcurrency` (10) independent `async` loops. Each loop calls `rideQueue.pop()` in an infinite loop, blocking (via Promise suspension) when the queue is empty and resuming as soon as a new ride ID arrives.

2. **`dispatchOneRide(rideId)`** — the per-ride dispatch state machine:
   - Loads the ride from the store.
   - Loops up to `maxDriverAttempts` times:
     - Calls `offerRideToDriver(rejectedDriverIds)` and `await`s the result.
     - If the driver accepts → calls `setRideStatus(ASSIGNED, { driverId })` and returns.
     - If the driver rejects → records the rejection and tries again.
   - If all attempts fail → calls `setRideStatus(NO_DRIVER_FOUND)`.

The 10 workers process up to 10 rides in parallel, which is why the 100-ride load test finishes in a reasonable wall-clock time on a single Node.js process.

---

### `src/services/driver.simulator.js`
**Simulates driver offer and response.**

Stands in for a real push-notification / phone-call round-trip:
- `pickDriver(rejectedDriverIds)` — randomly selects a driver from the pool that hasn't already rejected this ride.
- `offerRideToDriver(rejectedDriverIds)` — wraps `pickDriver` in a `setTimeout` of `driverResponseDelayMs`, then resolves with `{ driver, accepted }` where `accepted` is a coin-flip against `driverAcceptProbability`.

All behaviour is controlled by `config/index.js` so it can be tuned without touching this file.

---

### `src/events/event.bus.js`
**WebSocket pub/sub event bus.**

Attaches a `ws.WebSocketServer` to the existing HTTP server at path `/events`. Every connected client receives every published message (fan-out, not work-queue semantics).

- `startEventBus(server)` — initializes the WSS and sets up a connection handler that replays the last 50 events to any client that connects late.
- `publishEvent(event)` — stamps the payload with `publishedAt`, pushes it into the buffer (capped at 50), and immediately sends it to every `OPEN` client socket.

The buffer provides a lightweight "catch-up" mechanism for consumers started slightly late, without requiring a persistent broker.

---

### `src/queue/queue.js`
**Promise-based in-memory FIFO queue.**

A small but critical piece of infrastructure. Plays the role that SQS, RabbitMQ, or BullMQ would play in a production system: the HTTP handler calls `push(rideId)` and returns; the worker calls `pop()` (which returns a Promise) and processes at its own pace.

- If items are already waiting when `pop()` is called, the Promise resolves immediately.
- If the queue is empty, `pop()` suspends the calling worker by storing its resolve function in a `waiters` array — with zero CPU polling. When `push()` is called, it checks for a waiting resolver and delivers directly to it, bypassing the buffer entirely.

---

### `src/utils/logger.js`
**Minimal timestamped console logger.**

Exports a `logger` object with `info` and `error` methods. Each message is prefixed with an ISO timestamp for easy log correlation. Lightweight by design — no external logging libraries needed for a single-process system.

---

### `consumers/billing.consumer.js`
**Standalone billing microservice (separate Node.js process).**

Connects to the event bus as a plain WebSocket client. Listens for `RIDE_STATUS_CHANGED` events and, when the status is `ASSIGNED`, logs a "charging rider" action. Runs as a completely independent OS process (`npm run consumer:billing`), demonstrating that downstream consumers are fully decoupled from the API server and from each other.

---

### `consumers/ops.consumer.js`
**Standalone operations monitoring service (separate Node.js process).**

Also connects to the same event bus WebSocket. Unlike the billing consumer, it logs **every** `RIDE_STATUS_CHANGED` event regardless of status — useful for ops dashboards and audit trails. Both consumers receive identical broadcasts from the event bus (pub/sub fan-out).

---

### `scripts/loadTest.js`
**Concurrent load test and correctness validator.**

Books `100` rides concurrently using `Promise.all`, then polls each ride every 200ms (up to 20s timeout) until it reaches a final status. Prints a validation table checking:
- All 100 rides were created
- `ASSIGNED + NO_DRIVER_FOUND == 100` (no rides stuck in `REQUESTED`)
- No ride is double-assigned
- No ride is stuck without a final status

Exits with code `0` on success, `1` on failure — suitable for use in CI pipelines.

---

## 🖥 Frontend Overview

The frontend is a React + Vite single-page app.

| File | Purpose |
|---|---|
| `src/App.jsx` | Root component. Polls `GET /rides` every 1.5s, passes data down to children. |
| `src/api.js` | Thin `fetch` wrappers: `bookRide()` and `fetchRides()`. Base URL is configurable via `VITE_API_URL`. |
| `src/components/RideForm.jsx` | Controlled form for booking a ride. Shows "Booking…" state and error feedback. On success triggers parent refresh. |
| `src/components/RideList.jsx` | Renders a table of all rides with colored status badges. Newest rides appear at the top. |
| `vite.config.js` | Proxies `/rides` and `/health` to `http://localhost:4000` during development, so no CORS issues arise. |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher (`node --version`)
- **npm** v9 or higher (`npm --version`)

---

### Running the Backend

```bash
cd backend
npm install
npm run dev        # starts with --watch (auto-restarts on file change)
# OR
npm start          # production start (no watch)
```

The API will be available at `http://localhost:4000`.

---

### Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

### Running the Event Consumers

Open **two additional terminals** alongside the API server:

```bash
# Terminal 2 — Billing consumer
cd backend
npm run consumer:billing

# Terminal 3 — Ops consumer
cd backend
npm run consumer:ops
```

Both consumers will connect to `ws://localhost:4000/events` and start printing events as rides are booked.

---

### Running the Load Test

With the API server running, open a new terminal:

```bash
cd backend
npm run loadtest
```

Expected output:

```
Booking 100 rides concurrently...
All 100 bookings accepted. Waiting for dispatch to finish...

┌──────────────────────────────────────┬──────────┬────────┐
│ Check                                │ Expected │ Actual │
├──────────────────────────────────────┼──────────┼────────┤
│ Total rides created                  │ 100      │ 100    │
│ ASSIGNED + NO_DRIVER_FOUND           │ 100      │ 100    │
│ Rides assigned to 2 drivers          │ 0        │ 0      │
│ Rides stuck with no final status     │ 0        │ 0      │
└──────────────────────────────────────┴──────────┴────────┘
Breakdown: 67 ASSIGNED, 33 NO_DRIVER_FOUND
```

---

## 📡 API Reference

**Base URL:** `http://localhost:4000`

| Method | Endpoint | Description | Request Body |
|---|---|---|---|
| `GET` | `/health` | Liveness check | — |
| `POST` | `/rides` | Book a new ride | `{ riderName, pickup, drop }` |
| `GET` | `/rides` | List all rides | — |
| `GET` | `/rides/:id` | Get a single ride by ID | — |

**WebSocket:** `ws://localhost:4000/events`

Every status change emits:

```json
{
  "type": "RIDE_STATUS_CHANGED",
  "rideId": "abc123xyz0",
  "status": "ASSIGNED",
  "publishedAt": "2026-09-06T08:07:12.345Z"
}
```

---

## 🧠 Design Decisions & Trade-offs

| Decision | Rationale |
|---|---|
| **In-memory store** | No external DB needed; clean repository pattern makes it swappable. Data does not survive restarts — acceptable for a demo system. |
| **WebSocket fan-out over work queue** | Both consumers must see every event. A traditional queue (SQS-style) delivers each message to only one consumer, violating this requirement. |
| **Promise-based queue over `setInterval` polling** | Workers sleep with zero CPU usage when idle; they wake instantly when a new ride arrives. No polling loop anywhere in the dispatch path. |
| **10 concurrent workers** | Allows the 100-ride load test to complete in seconds instead of minutes, without the complexity of threads or child processes. |
| **50-event replay buffer** | Consumers started slightly late still receive recent events without needing a persistent broker. |
| **Simulated driver delay (150ms)** | Represents a real-world push notification round-trip. Without it, dispatch would complete synchronously before the HTTP response is even sent. |

---

## 📄 License

MIT — feel free to use, modify, and distribute.
