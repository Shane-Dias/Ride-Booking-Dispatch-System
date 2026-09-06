import express from "express";
import cors from "cors";
import { rideRouter } from "./routes/ride.routes.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ ok: true }));
  app.use("/rides", rideRouter);

  return app;
}
