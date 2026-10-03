import { Router, type IRouter, type RequestHandler } from "express";
import {
  RunInstitutionStatusCheckBody,
  RunInstitutionStatusCheckResponse,
} from "@workspace/api-zod";
import {
  checkInstitutionStatus,
  unableToCheckInstitutionStatus,
} from "../lib/institution-status";

const router: IRouter = Router();
const maxRequestsPerWindow = 8;
const rateLimitWindowMs = 15 * 60 * 1000;
const statusRequests = new Map<string, { count: number; resetAt: number }>();

const statusRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";

  if (statusRequests.size > 1000) {
    for (const [key, entry] of statusRequests) {
      if (entry.resetAt <= now) statusRequests.delete(key);
    }
  }

  let entry = statusRequests.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    statusRequests.set(clientKey, entry);
  }

  if (entry.count >= maxRequestsPerWindow) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({
      error: "Too many institution status requests. Please try again later.",
    });
    return;
  }

  entry.count += 1;
  next();
};

router.post(
  "/institution-status/check",
  statusRateLimit,
  async (req, res): Promise<void> => {
    const parsed = RunInstitutionStatusCheckBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issueCount: parsed.error.issues.length }, "Invalid institution status request.");
      res.status(400).json({ error: "The institution status request is invalid." });
      return;
    }

    try {
      const result = await checkInstitutionStatus(parsed.data);
      res.json(RunInstitutionStatusCheckResponse.parse(result));
    } catch (error) {
      req.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "Institution status check failed unexpectedly.",
      );
      res.json(
        RunInstitutionStatusCheckResponse.parse(
          unableToCheckInstitutionStatus(
            parsed.data,
            "The institution status service could not complete this check. No status was inferred.",
          ),
        ),
      );
    }
  },
);

export default router;