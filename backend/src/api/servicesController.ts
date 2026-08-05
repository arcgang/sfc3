import { Router, type Request, type Response } from "express";
import { getDatabase } from "../db/connection.js";
import { PartnerServiceRepository } from "../repositories/PartnerServiceRepository.js";

export const servicesRouter = Router();

const repo = new PartnerServiceRepository(getDatabase());

servicesRouter.get("/", (_req: Request, res: Response): void => {
  const services = repo.findAll();

  res.status(200).json({
    meta: {
      correlationId: (res.locals["correlationId"] as string) ?? "",
      timestamp: new Date().toISOString(),
    },
    data: {
      services,
    },
  });
});
