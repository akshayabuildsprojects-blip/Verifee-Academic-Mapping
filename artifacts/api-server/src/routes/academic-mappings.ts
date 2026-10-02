import { Router, type IRouter, type RequestHandler, type Response } from "express";
import {
  RunAcademicMappingBody,
  RunAcademicMappingResponse,
} from "@workspace/api-zod";
import { mapAcademicRecord } from "../lib/academic-mapper";

const router: IRouter = Router();
const maxRequestsPerWindow = 8;
const rateLimitWindowMs = 15 * 60 * 1000;
const mappingRequests = new Map<string, { count: number; resetAt: number }>();

const mappingRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";

  if (mappingRequests.size > 1000) {
    for (const [key, entry] of mappingRequests) {
      if (entry.resetAt <= now) mappingRequests.delete(key);
    }
  }

  let entry = mappingRequests.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    mappingRequests.set(clientKey, entry);
  }

  if (entry.count >= maxRequestsPerWindow) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({
      error: "Too many academic mapping requests. Please try again later.",
    });
    return;
  }

  entry.count += 1;
  next();
};

function sendMappingEvent(
  res: Response,
  event: "progress" | "complete" | "error",
  data: unknown,
): void {
  if (res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.post(
  "/academic-mappings/run/stream",
  mappingRateLimit,
  async (req, res): Promise<void> => {
    const parsed = RunAcademicMappingBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issueCount: parsed.error.issues.length }, "Invalid academic mapping request.");
      res.status(400).json({
        error: "The academic record or selected Georgia Tech program is invalid.",
      });
      return;
    }

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    try {
      const result = await mapAcademicRecord(parsed.data, {
        onProgress: (snapshot) => {
          sendMappingEvent(res, "progress", RunAcademicMappingResponse.parse(snapshot));
        },
      });
      sendMappingEvent(res, "complete", RunAcademicMappingResponse.parse(result));
    } catch (error) {
      req.log.error(
        {
          errorName: error instanceof Error ? error.name : "unknown",
          errorStatus: error && typeof error === "object" && "status" in error
            ? (error as { status?: unknown }).status
            : undefined,
        },
        "Academic mapping service failed.",
      );
      sendMappingEvent(res, "error", {
        error: "We could not complete the preliminary mapping. Your extracted record is preserved; retry without re-uploading the PDF.",
      });
    } finally {
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  },
);

router.post(
  "/academic-mappings/run",
  mappingRateLimit,
  async (req, res): Promise<void> => {
    const parsed = RunAcademicMappingBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issueCount: parsed.error.issues.length }, "Invalid academic mapping request.");
      res.status(400).json({
        error: "The academic record or selected Georgia Tech program is invalid.",
      });
      return;
    }

    try {
      const result = await mapAcademicRecord(parsed.data);
      res.json(RunAcademicMappingResponse.parse(result));
    } catch (error) {
      req.log.error(
        {
          errorName: error instanceof Error ? error.name : "unknown",
          errorStatus: error && typeof error === "object" && "status" in error
            ? (error as { status?: unknown }).status
            : undefined,
        },
        "Academic mapping service failed.",
      );
      res.status(503).json({
        error: "We could not complete the preliminary mapping. Your extracted record is preserved; retry without re-uploading the PDF.",
      });
    }
  },
);

export default router;