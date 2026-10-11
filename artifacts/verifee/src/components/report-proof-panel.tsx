import { useEffect, useState } from "react";
import { Link } from "wouter";
import "./report-proof-panel.css";

type AnchorResult = {
  reportId: string;
  reportHash: string;
  status: "pending" | "anchoring" | "anchored" | "failed" | "expired";
  signature: string | null;
  issuedAt: string;
  expiresAt: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("Report data is not valid JSON.");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function ReportProofPanel({ reportId, payload }: { reportId: string; payload: object }) {
  const [proof, setProof] = useState<AnchorResult | null>(null);
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const json = canonicalJson(payload);
        const localHash = await sha256(json);
        if (active) setHash(localHash);
        const response = await fetch("/api/report-proofs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reportId, payload }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string; issuerPublicKey?: string };
          const message = body.issuerPublicKey
            ? `${body.error ?? "The issuer wallet needs devnet SOL."} Fund this public key: ${body.issuerPublicKey}`
            : body.error ?? "The report proof could not be anchored yet.";
          throw new Error(message);
        }
        const result = await response.json() as AnchorResult;
        if (active) {
          setProof(result);
          setError("");
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "The report proof is unavailable.");
      }
    })();
    return () => { active = false; };
  }, [reportId, payload, retry]);

  const status = proof?.status === "anchored"
    ? "Anchored on Solana devnet"
    : proof?.status === "expired"
      ? "Verification data expired"
      : error
        ? "Anchoring unavailable"
        : "Anchoring on Solana devnet…";

  return (
    <section className="report-proof-panel" aria-labelledby="report-proof-title" data-testid="report-proof-panel">
      <div className="report-proof-heading">
        <div>
          <span className="v-report-label">Solana devnet</span>
          <h2 id="report-proof-title">Report integrity proof</h2>
        </div>
        <span className={`report-proof-status ${proof?.status === "anchored" ? "is-anchored" : error ? "is-error" : ""}`} role="status">
          {status}
        </span>
      </div>
      <dl className="report-proof-details">
        <div><dt>Report ID</dt><dd>{reportId}</dd></div>
        <div><dt>Report hash (SHA-256)</dt><dd className="report-proof-hash">{hash || "Calculating…"}</dd></div>
        <div>
          <dt>Solana transaction signature</dt>
          <dd className="report-proof-signature">
            {proof?.signature
              ? <a href={`https://explorer.solana.com/tx/${encodeURIComponent(proof.signature)}?cluster=devnet`} target="_blank" rel="noreferrer">{proof.signature}</a>
              : "Not available yet"}
          </dd>
        </div>
      </dl>
      {error && <p className="report-proof-error" role="alert">{error}</p>}
      <div className="report-proof-actions">
        {error && <button type="button" className="v-report-button v-report-button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry anchoring</button>}
        <Link className="v-report-button v-report-button-primary" href={`/verify/${encodeURIComponent(reportId)}`}>Verify Report</Link>
      </div>
      <p className="report-proof-retention">Report details are retained for 90 days to support verification.</p>
    </section>
  );
}
