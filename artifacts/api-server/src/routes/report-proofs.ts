import { Router, type IRouter, type Request, type Response } from "express";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { and, eq, gt, lte, or } from "drizzle-orm";
import { db, reportProofsTable } from "@workspace/db";
import { hashReportPayload as reportHash } from "../lib/report-proof-canonical";
import {
  CreateReportProofBody,
  CreateReportProofResponse,
  VerifyReportProofParams,
  VerifyReportProofResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const rpcUrl = "https://api.devnet.solana.com";
const retentionMs = 90 * 24 * 60 * 60 * 1000;
const maxAnchors = 6;
const rateWindowMs = 15 * 60 * 1000;
const requests = new Map<string, { count: number; resetAt: number }>();

function responseFor(row: typeof reportProofsTable.$inferSelect) {
  return CreateReportProofResponse.parse({
    reportId: row.reportId,
    reportHash: row.reportHash,
    status: row.proofStatus,
    signature: row.solanaSignature,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
}

function getIssuerKeypair(): Keypair {
  const raw = process.env.VERIFEE_ISSUER_SECRET_KEY;
  if (!raw) throw new Error("Issuer signer is not configured.");
  const parsed: unknown = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error("Issuer signer secret is invalid.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

function assertDevnet(): void {
  if (
    process.env.SOLANA_NETWORK !== "devnet" ||
    (process.env.SOLANA_RPC_URL ?? rpcUrl) !== rpcUrl
  ) {
    throw new Error("Verifee report proofs are restricted to Solana devnet.");
  }
}

function rateLimit(req: Request, res: Response): boolean {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let item = requests.get(key);
  if (!item || item.resetAt <= now) {
    item = { count: 0, resetAt: now + rateWindowMs };
    requests.set(key, item);
  }
  if (item.count >= maxAnchors) {
    res.setHeader("Retry-After", String(Math.ceil((item.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many report anchoring requests. Please try again later." });
    return false;
  }
  item.count += 1;
  return true;
}

router.post("/report-proofs", async (req, res): Promise<void> => {
  if (!rateLimit(req, res)) return;
  const parsed = CreateReportProofBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid report ID and report payload are required." });
    return;
  }
  const { reportId, payload } = parsed.data;
  const hash = reportHash(payload);
  const now = new Date();

  try {
    let [row] = await db.select().from(reportProofsTable).where(eq(reportProofsTable.reportId, reportId)).limit(1);
    if (row && row.reportHash !== hash) {
      res.status(409).json({ error: "This report ID is already linked to different report data." });
      return;
    }
    if (row?.expiresAt.getTime() <= now.getTime()) {
      res.status(410).json({ error: "This report proof payload has expired." });
      return;
    }
    if (row?.proofStatus === "anchored" && row.solanaSignature) {
      res.json(responseFor(row));
      return;
    }
    if (!row) {
      const issuedAt = now;
      const inserted = await db.insert(reportProofsTable).values({
        reportId,
        reportPayload: payload,
        reportHash: hash,
        proofStatus: "pending",
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + retentionMs),
      }).onConflictDoNothing().returning();
      row = inserted[0] ?? (await db.select().from(reportProofsTable).where(eq(reportProofsTable.reportId, reportId)).limit(1))[0];
      if (!row || row.reportHash !== hash) {
        res.status(409).json({ error: "This report ID is already linked to different report data." });
        return;
      }
    }

    const staleClaimBefore = new Date(now.getTime() - 2 * 60 * 1000);
    const [claimed] = await db.update(reportProofsTable)
      .set({ proofStatus: "anchoring", updatedAt: new Date() })
      .where(and(
        eq(reportProofsTable.reportId, reportId),
        gt(reportProofsTable.expiresAt, now),
        or(
          eq(reportProofsTable.proofStatus, "pending"),
          eq(reportProofsTable.proofStatus, "failed"),
          and(
            eq(reportProofsTable.proofStatus, "anchoring"),
            lte(reportProofsTable.updatedAt, staleClaimBefore),
          ),
        ),
      ))
      .returning();
    if (!claimed) {
      const [latest] = await db.select().from(reportProofsTable)
        .where(eq(reportProofsTable.reportId, reportId)).limit(1);
      if (latest) {
        res.json(responseFor(latest));
        return;
      }
      res.status(503).json({ error: "Report proof anchoring is temporarily unavailable." });
      return;
    }
    row = claimed;

    assertDevnet();
    const keypair = getIssuerKeypair();
    const memo = JSON.stringify({
      app: "verifee",
      type: "report_proof",
      report_id: reportId,
      report_hash: hash,
      issued_at: row.issuedAt.toISOString(),
      status: "active",
      version: "v1",
    });
    const transaction = new Transaction().add(new TransactionInstruction({
      keys: [],
      programId: memoProgram,
      data: Buffer.from(memo, "utf8"),
    }));
    const connection = new Connection(rpcUrl, "confirmed");
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: "confirmed" });
    [row] = await db.update(reportProofsTable)
      .set({ solanaSignature: signature, proofStatus: "anchored", updatedAt: new Date() })
      .where(eq(reportProofsTable.reportId, reportId))
      .returning();
    res.json(responseFor(row));
  } catch (error) {
    await db.update(reportProofsTable)
      .set({ proofStatus: "failed", updatedAt: new Date() })
      .where(and(eq(reportProofsTable.reportId, reportId), gt(reportProofsTable.expiresAt, now)))
      .catch(() => undefined);
    req.log.error({ reportId, message: error instanceof Error ? error.message : "unknown" }, "Could not anchor report proof on Solana devnet.");
    res.status(503).json({ error: "Solana devnet anchoring is temporarily unavailable. Retry the proof shortly." });
  }
});

router.get("/report-proofs/:reportId/verify", async (req, res): Promise<void> => {
  const params = VerifyReportProofParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid report ID is required." });
    return;
  }
  const [row] = await db.select().from(reportProofsTable)
    .where(eq(reportProofsTable.reportId, params.data.reportId)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Report proof not found." });
    return;
  }
  const base = {
    reportId: row.reportId,
    reportHash: row.reportHash,
    currentReportHash: row.reportPayload ? reportHash(row.reportPayload) : null,
    signature: row.solanaSignature,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
  if (row.expiresAt.getTime() <= Date.now() || !row.reportPayload) {
    if (row.reportPayload) {
      await db.update(reportProofsTable).set({ reportPayload: null, proofStatus: "expired", updatedAt: new Date() })
        .where(eq(reportProofsTable.reportId, row.reportId));
    }
    res.json(VerifyReportProofResponse.parse({
      ...base, currentReportHash: null, status: "payload_expired",
      checks: { hashMatches: null, reportIdMatches: null, appMatches: null, statusActive: null },
    }));
    return;
  }
  if (!row.solanaSignature) {
    res.json(VerifyReportProofResponse.parse({
      ...base, status: "proof_not_found",
      checks: { hashMatches: null, reportIdMatches: null, appMatches: null, statusActive: null },
    }));
    return;
  }

  try {
    assertDevnet();
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [row.solanaSignature, { commitment: "confirmed", encoding: "json", maxSupportedTransactionVersion: 0 }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!rpcResponse.ok) throw new Error(`Solana RPC returned ${rpcResponse.status}.`);
    const rpcResult = await rpcResponse.json() as {
      error?: unknown;
      result?: { transaction?: { message?: { accountKeys?: string[]; instructions?: Array<{ programIdIndex: number; data: string }> } } } | null;
    };
    if (rpcResult.error) throw new Error("Solana RPC returned an error.");
    if (!rpcResult.result) {
      res.json(VerifyReportProofResponse.parse({
        ...base, status: "proof_not_found",
        checks: { hashMatches: null, reportIdMatches: null, appMatches: null, statusActive: null },
      }));
      return;
    }
    const message = rpcResult.result.transaction?.message;
    const memoInstruction = message?.instructions?.find((instruction) =>
      message.accountKeys?.[instruction.programIdIndex] === memoProgram.toBase58());
    let memo: Record<string, unknown> | null = null;
    if (memoInstruction) {
      try {
        const decoded = JSON.parse(Buffer.from(bs58.decode(memoInstruction.data)).toString("utf8"));
        if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) memo = decoded;
      } catch { /* An unreadable memo fails the integrity checks below. */ }
    }
    const checks = {
      hashMatches: base.currentReportHash === row.reportHash && memo?.report_hash === row.reportHash,
      reportIdMatches: memo?.report_id === row.reportId,
      appMatches: memo?.app === "verifee",
      statusActive: memo?.status === "active",
    };
    const valid = Object.values(checks).every(Boolean);
    res.json(VerifyReportProofResponse.parse({ ...base, status: valid ? "valid" : "invalid", checks }));
  } catch (error) {
    req.log.warn({ reportId: row.reportId, message: error instanceof Error ? error.message : "unknown" }, "Report proof verification is unavailable.");
    res.json(VerifyReportProofResponse.parse({
      ...base, status: "verification_unavailable",
      checks: { hashMatches: null, reportIdMatches: null, appMatches: null, statusActive: null },
    }));
  }
});

export default router;
