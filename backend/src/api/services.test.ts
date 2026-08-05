import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Request, type Response } from "express";
import supertest from "supertest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { correlationIdMiddleware } from "../middleware/correlationId.js";
import { errorHandler } from "../middleware/errorHandler.js";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

async function buildApp() {
  process.env.DB_PATH = ":memory:";
  vi.resetModules();

  const { migrate } = await import("../db/migrate.js");
  migrate(MIGRATIONS_DIR);

  const { servicesRouter } = await import("./servicesController.js");

  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/api/v1/services", servicesRouter);
  app.use(errorHandler);
  return app;
}

describe("GET /api/v1/services", () => {
  afterEach(() => {
    delete process.env.DB_PATH;
  });

  describe("precondition: partner_services table exists with seeded data", () => {
    it("the partner_services table exists after migration", async () => {
      process.env.DB_PATH = ":memory:";
      vi.resetModules();
      const { migrate } = await import("../db/migrate.js");
      migrate(MIGRATIONS_DIR);
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      const row = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='partner_services'",
        )
        .get() as { name: string } | undefined;
      expect(row?.name).toBe("partner_services");
      delete process.env.DB_PATH;
    });

    it("the partner_services table has at least 8 seeded rows after migration", async () => {
      process.env.DB_PATH = ":memory:";
      vi.resetModules();
      const { migrate } = await import("../db/migrate.js");
      migrate(MIGRATIONS_DIR);
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      const row = db
        .prepare("SELECT COUNT(*) as cnt FROM partner_services")
        .get() as { cnt: number };
      expect(row.cnt).toBe(8);
      delete process.env.DB_PATH;
    });

    it("the partner_services table has a premium_required column with integer values 0 or 1", async () => {
      process.env.DB_PATH = ":memory:";
      vi.resetModules();
      const { migrate } = await import("../db/migrate.js");
      migrate(MIGRATIONS_DIR);
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      const row = db
        .prepare("SELECT premium_required FROM partner_services WHERE id = 'ps-nutri'")
        .get() as { premium_required: number } | undefined;
      expect(row?.premium_required).toBe(1);
      delete process.env.DB_PATH;
    });

    it("the partner_services table has a category column with non-empty string values", async () => {
      process.env.DB_PATH = ":memory:";
      vi.resetModules();
      const { migrate } = await import("../db/migrate.js");
      migrate(MIGRATIONS_DIR);
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      const row = db
        .prepare("SELECT category FROM partner_services WHERE id = 'ps-fitpro'")
        .get() as { category: string } | undefined;
      expect(row?.category).toBe("Fitness");
      delete process.env.DB_PATH;
    });

    it("the partner_services table has a short_description column with non-empty string values", async () => {
      process.env.DB_PATH = ":memory:";
      vi.resetModules();
      const { migrate } = await import("../db/migrate.js");
      migrate(MIGRATIONS_DIR);
      const { getDatabase } = await import("../db/connection.js");
      const db = getDatabase();
      const row = db
        .prepare("SELECT short_description FROM partner_services WHERE id = 'ps-fitpro'")
        .get() as { short_description: string } | undefined;
      expect(typeof row?.short_description).toBe("string");
      expect((row?.short_description ?? "").length).toBeGreaterThan(0);
      delete process.env.DB_PATH;
    });
  });

  describe("response shape", () => {
    it("returns HTTP 200", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      expect(res.status).toBe(200);
    });

    it("returns an array of exactly 8 service objects", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const body = res.body as { data: { services: unknown[] } };
      expect(body.data.services).toHaveLength(8);
    });

    it("each service has an id field", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const services = (res.body as { data: { services: { id: unknown }[] } })
        .data.services;
      for (const svc of services) {
        expect(typeof svc.id).toBe("string");
        expect((svc.id as string).length).toBeGreaterThan(0);
      }
    });

    it("each service has a name field", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const services = (res.body as { data: { services: { name: unknown }[] } })
        .data.services;
      for (const svc of services) {
        expect(typeof svc.name).toBe("string");
        expect((svc.name as string).length).toBeGreaterThan(0);
      }
    });

    it("each service has a category field", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const services = (
        res.body as { data: { services: { category: unknown }[] } }
      ).data.services;
      for (const svc of services) {
        expect(typeof svc.category).toBe("string");
        expect((svc.category as string).length).toBeGreaterThan(0);
      }
    });

    it("each service has a short_description field", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const services = (
        res.body as {
          data: { services: { short_description: unknown }[] };
        }
      ).data.services;
      for (const svc of services) {
        expect(typeof svc.short_description).toBe("string");
        expect((svc.short_description as string).length).toBeGreaterThan(0);
      }
    });

    it("each service has a premium_required field that is a boolean", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const services = (
        res.body as {
          data: { services: { premium_required: unknown }[] };
        }
      ).data.services;
      for (const svc of services) {
        expect(typeof svc.premium_required).toBe("boolean");
      }
    });

    it("response body has meta.correlationId as a UUID", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const body = res.body as { meta: { correlationId: string } };
      expect(body.meta.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("response body has meta.timestamp as ISO 8601 UTC", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const body = res.body as { meta: { timestamp: string } };
      expect(new Date(body.meta.timestamp).toISOString()).toBe(
        body.meta.timestamp,
      );
    });
  });

  describe("seeded service names", () => {
    it("FitPro Training is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("FitPro Training");
    });

    it("NutriGuide is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("NutriGuide");
    });

    it("MindfulMe is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("MindfulMe");
    });

    it("SleepWell Program is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("SleepWell Program");
    });

    it("Strength Builder is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("Strength Builder");
    });

    it("RunCoach is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("RunCoach");
    });

    it("Wellness Coaching is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("Wellness Coaching");
    });

    it("Stress Relief is present", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const names = (
        res.body as { data: { services: { name: string }[] } }
      ).data.services.map((s) => s.name);
      expect(names).toContain("Stress Relief");
    });
  });

  describe("seeded service categories", () => {
    it("FitPro Training has category Fitness", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "FitPro Training");
      expect(svc?.category).toBe("Fitness");
    });

    it("NutriGuide has category Nutrition", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "NutriGuide");
      expect(svc?.category).toBe("Nutrition");
    });

    it("MindfulMe has category Mental Health", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "MindfulMe");
      expect(svc?.category).toBe("Mental Health");
    });

    it("SleepWell Program has category Sleep", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "SleepWell Program");
      expect(svc?.category).toBe("Sleep");
    });

    it("Strength Builder has category Fitness", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "Strength Builder");
      expect(svc?.category).toBe("Fitness");
    });

    it("RunCoach has category Fitness", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "RunCoach");
      expect(svc?.category).toBe("Fitness");
    });

    it("Wellness Coaching has category Nutrition", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "Wellness Coaching");
      expect(svc?.category).toBe("Nutrition");
    });

    it("Stress Relief has category Mental Health", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; category: string }[] } }
      ).data.services.find((s) => s.name === "Stress Relief");
      expect(svc?.category).toBe("Mental Health");
    });
  });

  describe("premium_required badges", () => {
    it("NutriGuide has premium_required = true", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "NutriGuide");
      expect(svc?.premium_required).toBe(true);
    });

    it("SleepWell Program has premium_required = true", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "SleepWell Program");
      expect(svc?.premium_required).toBe(true);
    });

    it("RunCoach has premium_required = true", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "RunCoach");
      expect(svc?.premium_required).toBe(true);
    });

    it("Stress Relief has premium_required = true", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "Stress Relief");
      expect(svc?.premium_required).toBe(true);
    });

    it("FitPro Training has premium_required = false", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "FitPro Training");
      expect(svc?.premium_required).toBe(false);
    });

    it("MindfulMe has premium_required = false", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "MindfulMe");
      expect(svc?.premium_required).toBe(false);
    });

    it("Strength Builder has premium_required = false", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "Strength Builder");
      expect(svc?.premium_required).toBe(false);
    });

    it("Wellness Coaching has premium_required = false", async () => {
      const app = await buildApp();
      const res = await supertest(app).get("/api/v1/services");
      const svc = (
        res.body as { data: { services: { name: string; premium_required: boolean }[] } }
      ).data.services.find((s) => s.name === "Wellness Coaching");
      expect(svc?.premium_required).toBe(false);
    });
  });
});
