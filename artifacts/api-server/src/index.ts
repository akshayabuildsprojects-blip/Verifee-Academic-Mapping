import app from "./app";
import { logger } from "./lib/logger";
import { db, reportProofsTable } from "@workspace/db";
import { and, isNotNull, lte } from "drizzle-orm";

async function expireReportPayloads(): Promise<void> {
  await db.update(reportProofsTable)
    .set({ reportPayload: null, proofStatus: "expired", updatedAt: new Date() })
    .where(and(lte(reportProofsTable.expiresAt, new Date()), isNotNull(reportProofsTable.reportPayload)));
}

const payloadExpiryTimer = setInterval(() => {
  void expireReportPayloads().catch((err: unknown) => logger.error({ err }, "Could not expire report proof payloads."));
}, 60 * 60 * 1000);
payloadExpiryTimer.unref();
void expireReportPayloads().catch((err: unknown) => logger.error({ err }, "Could not expire report proof payloads."));

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
