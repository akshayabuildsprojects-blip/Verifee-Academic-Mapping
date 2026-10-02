import express, { Router, type IRouter, type RequestHandler } from "express";
import { ExtractAcademicTranscriptResponse } from "@workspace/api-zod";
import {
  extractAcademicTranscript,
  TranscriptExtractionError,
} from "../lib/academic-transcript-extractor";

const router: IRouter = Router();
const maxRequestsPerWindow = 8;
const rateLimitWindowMs = 15 * 60 * 1000;
const extractionRequests = new Map<string, { count: number; resetAt: number }>();

const extractionRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";

  if (extractionRequests.size > 1000) {
    for (const [key, entry] of extractionRequests) {
      if (entry.resetAt <= now) extractionRequests.delete(key);
    }
  }

  let entry = extractionRequests.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    extractionRequests.set(clientKey, entry);
  }

  if (entry.count >= maxRequestsPerWindow) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many transcript extraction requests. Please try again later." });
    return;
  }

  entry.count += 1;
  next();
};

router.post(
  "/academic-transcripts/extract",
  extractionRateLimit,
  express.raw({ type: "application/pdf", limit: "20mb" }),
  async (req, res): Promise<void> => {
    const contentType = req.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/pdf") {
      res.status(415).json({ error: "Upload a PDF transcript to extract academic information." });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "The PDF upload was empty or invalid." });
      return;
    }

    if (req.body.length < 5 || req.body.subarray(0, 5).toString("ascii") !== "%PDF-") {
      res.status(400).json({ error: "The uploaded file is not a readable PDF." });
      return;
    }

    try {
      const record = await extractAcademicTranscript(req.body);
      res.json(ExtractAcademicTranscriptResponse.parse(record));
    } catch (error) {
      if (error instanceof TranscriptExtractionError) {
        if (error.code === "not-a-transcript") {
          res.status(422).json({ error: "We could not identify readable academic transcript details in this PDF." });
          return;
        }
        req.log.warn("Transcript extraction returned an invalid structured response.");
        res.status(502).json({ error: "We could not safely validate the extracted transcript details." });
        return;
      }

      req.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "Transcript extraction provider failed.",
      );
      res.status(503).json({ error: "Transcript extraction is temporarily unavailable. Please try again." });
    }
  },
);

export default router;