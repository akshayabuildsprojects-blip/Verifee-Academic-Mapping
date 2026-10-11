import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const reportProofsTable = pgTable("report_proofs", {
  reportId: text("report_id").primaryKey(),
  reportPayload: jsonb("report_payload").$type<Record<string, unknown>>(),
  reportHash: text("report_hash").notNull(),
  solanaSignature: text("solana_signature"),
  proofStatus: text("proof_status").notNull().default("pending"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportProof = typeof reportProofsTable.$inferSelect;
