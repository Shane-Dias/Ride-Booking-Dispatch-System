import http from "http";
import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { startEventBus } from "./events/event.bus.js";
import { startDispatchWorker } from "./services/dispatch.worker.js";
import { logger } from "./utils/logger.js";

const app = createApp();
const server = http.createServer(app);

startEventBus(server);     // ws://localhost:PORT/events
startDispatchWorker();     // background ride-assignment loop

server.listen(config.port, () => {
  logger.info(`API listening on http://localhost:${config.port}`);
  logger.info(`Event bus listening on ws://localhost:${config.port}/events`);
});
