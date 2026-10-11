import { useEffect, useState } from "react";
import { Link } from "wouter";
import "./report-proof-panel.css";

type ProofStatus = {
  reportId: string;
  reportHash: string;
  proofStatus: "pending" | "anchoring" | "anchored" | "failed" | "expired";
  signature: string | null;
  proofTimestamp: string;
  sentAt: string | null;
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
  const [proof, setProof] = useState<ProofStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/report-proofs/${encodeURIComponent(reportId)}/status`)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Could not load report proof status.");
        return await response.json() as ProofStatus;
      })
      .then((value) => { if (active && value) setProof(value); })
      .catch(() => { /* A report without a proof remains unsent; no proof is created on page load. */ });
    return () => { active = false; };
  }, [reportId]);

  const createProofAndSend = async () => {
    setBusy(true);
    setError("");
    try {
      const frozenPayload = JSON.parse(canonicalJson(payload)) as Record<string, unknown>;
      const reportHash = await sha256(canonicalJson(frozenPayload));
      const anchorResponse = await fetch("/api/report-proofs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, payload: frozenPayload }),
      });
      if (!anchorResponse.ok) {
        const body = await anchorResponse.json().catch(() => ({})) as { error?: string; issuerPublicKey?: string };
        const funding = body.issuerPublicKey ? ` Issuer public key to fund: ${body.issuerPublicKey}` : "";
        throw new Error(`Cryptographic proof could not be created. Please retry before sending.${funding}`);
      }
      const anchored = await anchorResponse.json() as { reportHash: string; status: string; signature: string | null; issuedAt: string };
      if (anchored.reportHash !== reportHash || anchored.status !== "anchored" || !anchored.signature) {
        throw new Error("Cryptographic proof could not be created. Please retry before sending.");
      }
      const anchoredProof: ProofStatus = {
        reportId, reportHash, proofStatus: "anchored", signature: anchored.signature,
        proofTimestamp: anchored.issuedAt, sentAt: null,
      };
      setProof(anchoredProof);
      const sendResponse = await fetch(`/api/report-proofs/${encodeURIComponent(reportId)}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportHash }),
      });
      if (!sendResponse.ok) throw new Error("Proof is anchored, but the report could not be marked ready for institution sharing. Please retry.");
      const sent = await sendResponse.json() as { sentAt: string };
      setProof({ ...anchoredProof, sentAt: sent.sentAt });
      setConfirmOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cryptographic proof could not be created. Please retry before sending.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="report-proof-panel" aria-labelledby="report-proof-title" data-testid="report-proof-panel">
      <div className="report-proof-heading">
        <div><span className="v-report-label">Solana devnet</span><h2 id="report-proof-title">Report integrity proof</h2></div>
        <span data-testid="report-proof-status" className={`report-proof-status ${proof?.proofStatus === "anchored" ? "is-anchored" : ""}`} role="status">
          Proof status: {proof?.proofStatus === "anchored" ? "Anchored" : proof?.proofStatus === "failed" ? "Failed" : "Not created"}
        </span>
      </div>
      <dl className="report-proof-details">
        <div><dt>Report ID</dt><dd>{reportId}</dd></div>
        <div><dt>Report hash</dt><dd className="report-proof-hash">{proof?.reportHash ?? "Created when you send the report"}</dd></div>
        <div><dt>Solana transaction signature</dt><dd className="report-proof-signature">{proof?.signature ?? "Not available yet"}</dd></div>
        <div><dt>Proof timestamp</dt><dd>{proof?.proofTimestamp ? new Date(proof.proofTimestamp).toLocaleString() : "Not created"}</dd></div>
        <div><dt>Sent status</dt><dd data-testid="report-sent-status">{proof?.sentAt ? "Ready for institution sharing" : "Not sent"}</dd></div>
      </dl>
      {error && <p className="report-proof-error" role="alert">{error}</p>}
      <div className="report-proof-actions">
        {proof?.sentAt
          ? <button type="button" className="v-report-button v-report-button-primary" disabled>Ready for institution sharing</button>
          : <button data-testid="button-send-to-institution" type="button" className="v-report-button v-report-button-primary" onClick={() => setConfirmOpen(true)}>Send to Institution</button>}
        {proof?.proofStatus === "anchored" && <Link className="v-report-button v-report-button-secondary" href={`/verify/${encodeURIComponent(reportId)}`}>Verify Report</Link>}
      </div>
      <p className="report-proof-retention">Report details are retained for 90 days to support verification.</p>
      {confirmOpen && (
        <div className="report-proof-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmOpen(false); }}>
          <section className="report-proof-modal" role="dialog" aria-modal="true" aria-labelledby="report-proof-confirm-title" aria-describedby="report-proof-confirm-text">
            <h2 id="report-proof-confirm-title">Send report to institution?</h2>
            <p id="report-proof-confirm-text">Verifee will create a cryptographic proof for this exact report before sending it. After proof creation, changes to this report will create a mismatch.</p>
            <div className="report-proof-modal-actions">
              <button type="button" className="v-report-button v-report-button-secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="v-report-button v-report-button-primary" disabled={busy} onClick={() => void createProofAndSend()}>{busy ? "Creating proof…" : "Create proof & send"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
