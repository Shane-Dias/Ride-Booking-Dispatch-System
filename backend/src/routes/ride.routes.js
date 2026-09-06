import { Router } from "express";
import { postRide, getRideById, getAllRides } from "../controllers/ride.controller.js";

export const rideRouter = Router();

rideRouter.post("/", postRide);
rideRouter.get("/", getAllRides);
rideRouter.get("/:id", getRideById);
