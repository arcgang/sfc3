import { Router } from "express";
import { handleDeviceConnection } from "./devicesController.js";

export const devicesRouter = Router();

devicesRouter.put("/connections", handleDeviceConnection);
