import { useEffect, useState, type ReactNode } from "react";
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

export default function ReportProofPanel({ reportId, payload, buildPdfBase64, extraActions }: {
  reportId: string;
  payload: object;
  buildPdfBase64(): string;
  extraActions?: ReactNode;
}) {
  const [proof, setProof] = useState<ProofStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState<"proof" | "send" | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setProof(null);
    setProofFailed(false);
    setSendFailed(false);
    setError("");
    void fetch(`/api/report-proofs/${encodeURIComponent(reportId)}/status`)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Could not load report proof status.");
        return await response.json() as ProofStatus;
      })
      .then((value) => {
        if (!active || !value) return;
        setProof(value);
        setProofFailed(value.proofStatus === "failed");
        setSendFailed(value.proofStatus === "anchored" && !value.sentAt);
      })
      .catch(() => { /* A report without a proof remains unsent; no proof is created on page load. */ });
    return () => { active = false; };
  }, [reportId]);

  const sendAnchoredReport = async (
    anchoredProof: ProofStatus,
    frozenPayload: Record<string, unknown>,
    frozenPdfBase64: string,
  ) => {
    const currentHash = await sha256(canonicalJson(frozenPayload));
    if (currentHash !== anchoredProof.reportHash) {
      throw new Error("This report has changed since its proof was created. Restore the anchored report before retrying.");
    }
    setBusyPhase("send");
    const sendResponse = await fetch(`/api/report-proofs/${encodeURIComponent(reportId)}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportHash: anchoredProof.reportHash, pdfBase64: frozenPdfBase64 }),
    });
    if (!sendResponse.ok) {
      const body = await sendResponse.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || "Proof created, send failed. Please retry sending the report.");
    }
    const sent = await sendResponse.json() as { sentAt: string };
    setProof({ ...anchoredProof, sentAt: sent.sentAt });
    setProofFailed(false);
    setSendFailed(false);
    setError("");
  };

  const createProofAndSend = async () => {
    setBusy(true);
    setError("");
    setProofFailed(false);
    setSendFailed(false);
    setBusyPhase("proof");
    let phase: "proof" | "send" = "proof";
    try {
      const frozenPayload = JSON.parse(canonicalJson(payload)) as Record<string, unknown>;
      const frozenPdfBase64 = buildPdfBase64();
      const reportHash = await sha256(canonicalJson(frozenPayload));
      const anchorResponse = await fetch("/api/report-proofs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, payload: frozenPayload }),
      });
      if (!anchorResponse.ok) {
        const body = await anchorResponse.json().catch(() => ({})) as { error?: string; issuerPublicKey?: string };
        const funding = body.issuerPublicKey ? ` Issuer public key to fund: ${body.issuerPublicKey}` : "";
        throw new Error(`Proof failed. Cryptographic proof could not be created. Please retry.${funding}`);
      }
      const anchored = await anchorResponse.json() as { reportHash: string; status: string; signature: string | null; issuedAt: string };
      if (anchored.reportHash !== reportHash || anchored.status !== "anchored" || !anchored.signature) {
        throw new Error("Proof failed. Cryptographic proof could not be created. Please retry.");
      }
      const anchoredProof: ProofStatus = {
        reportId, reportHash, proofStatus: "anchored", signature: anchored.signature,
        proofTimestamp: anchored.issuedAt, sentAt: null,
      };
      setProof(anchoredProof);
      phase = "send";
      await sendAnchoredReport(anchoredProof, frozenPayload, frozenPdfBase64);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The report could not be sent. Please retry.";
      setError(message);
      if (phase === "proof") {
        setProof(null);
        setProofFailed(true);
        setSendFailed(false);
      } else {
        setProofFailed(false);
        setSendFailed(true);
      }
    } finally {
      setBusy(false);
      setBusyPhase(null);
    }
  };

  const retrySend = async () => {
    if (!proof || proof.proofStatus !== "anchored") return;
    setBusy(true);
    setError("");
    setBusyPhase("send");
    try {
      const frozenPayload = JSON.parse(canonicalJson(payload)) as Record<string, unknown>;
      const frozenPdfBase64 = buildPdfBase64();
      await sendAnchoredReport(proof, frozenPayload, frozenPdfBase64);
    } catch (reason) {
      setSendFailed(true);
      setError(reason instanceof Error ? reason.message : "Proof created, send failed. Please retry sending the report.");
    } finally {
      setBusy(false);
      setBusyPhase(null);
    }
  };

  const sent = Boolean(proof?.sentAt);
  const anchored = proof?.proofStatus === "anchored";
  const statusLabel = sent
    ? "Anchored"
    : anchored || sendFailed
      ? "Proof created, send failed"
      : proofFailed || proof?.proofStatus === "failed"
        ? "Proof failed"
        : "Not created yet";

  return (
    <section className="report-proof-panel" aria-labelledby="report-proof-title" data-testid="report-proof-panel">
      <div className="report-proof-heading">
        <h2 id="report-proof-title">Report Integrity Proof</h2>
        <span data-testid="report-proof-status" className={`report-proof-status ${sent ? "is-anchored" : proofFailed || sendFailed ? "is-error" : ""}`} role="status">
          Proof status: {statusLabel}
        </span>
      </div>
      {!sent && !proofFailed && !anchored && (
        <p className="report-proof-helper">Verifee will create a cryptographic proof for this exact report when you send it to the institution.</p>
      )}
      {sent && proof && (
        <dl className="report-proof-details" data-testid="report-proof-details">
          <div><dt>Sent status</dt><dd data-testid="report-sent-status">Sent</dd></div>
          <div><dt>Report ID</dt><dd>{proof.reportId}</dd></div>
          <div><dt>Report hash</dt><dd className="report-proof-hash">{proof.reportHash}</dd></div>
          <div><dt>Solana transaction signature</dt><dd className="report-proof-signature">{proof.signature}</dd></div>
          <div><dt>Proof timestamp</dt><dd>{new Date(proof.proofTimestamp).toLocaleString()}</dd></div>
        </dl>
      )}
      {error && <p className="report-proof-error" role="alert">{error}</p>}
      <div className="report-proof-actions">
        {!sent && !anchored && (
          <button data-testid="button-send-to-institution" type="button" className="v-report-button v-report-button-primary" disabled={busy} onClick={() => void createProofAndSend()}>
            {busy ? busyPhase === "send" ? "Sending…" : "Creating proof…" : proofFailed ? "Retry Proof Creation" : "Create Proof & Send"}
          </button>
        )}
        {!sent && anchored && (
          <button data-testid="button-retry-send" type="button" className="v-report-button v-report-button-primary" disabled={busy} onClick={() => void retrySend()}>
            {busy ? "Sending…" : "Retry Send"}
          </button>
        )}
        {extraActions}
        {sent && <Link className="v-report-button v-report-button-secondary" href={`/verify/${encodeURIComponent(reportId)}`}>Verify Report</Link>}
      </div>
    </section>
  );
}
