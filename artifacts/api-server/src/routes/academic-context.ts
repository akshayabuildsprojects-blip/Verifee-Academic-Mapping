import { Router, type IRouter, type RequestHandler } from "express";
import {
  RunAcademicContextBody,
  RunAcademicContextResponse,
} from "@workspace/api-zod";
import { contextualizeAcademicRecord } from "../lib/academic-context";

const router: IRouter = Router();
const maxRequestsPerWindow = 8;
const rateLimitWindowMs = 15 * 60 * 1000;
const contextRequests = new Map<string, { count: number; resetAt: number }>();

const contextRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";

  if (contextRequests.size > 1000) {
    for (const [key, entry] of contextRequests) {
      if (entry.resetAt <= now) contextRequests.delete(key);
    }
  }

  let entry = contextRequests.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    contextRequests.set(clientKey, entry);
  }

  if (entry.count >= maxRequestsPerWindow) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({
      error: "Too many academic context requests. Please try again later.",
    });
    return;
  }

  entry.count += 1;
  next();
};

router.post(
  "/academic-context/run",
  contextRateLimit,
  async (req, res): Promise<void> => {
    const parsed = RunAcademicContextBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issueCount: parsed.error.issues.length }, "Invalid academic context request.");
      res.status(400).json({ error: "The academic context request is invalid." });
      return;
    }

    try {
      const context = await contextualizeAcademicRecord(parsed.data);
      res.json(RunAcademicContextResponse.parse(context));
    } catch (error) {
      req.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "Academic context service failed.",
      );
      res.status(503).json({
        error: "The academic context could not be mapped. Requirement mapping can still use the extracted transcript data.",
      });
    }
  },
);

export default router;