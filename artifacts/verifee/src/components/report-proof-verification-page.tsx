import { useEffect, useState } from "react";
import "./report-proof-verification-page.css";

type Verification = {
  reportId: string;
  reportHash: string;
  currentReportHash: string | null;
  signature: string | null;
  issuedAt: string;
  expiresAt: string;
  status: "valid" | "invalid" | "proof_not_found" | "verification_unavailable" | "payload_expired";
  checks: {
    hashMatches: boolean | null;
    reportIdMatches: boolean | null;
    appMatches: boolean | null;
    statusActive: boolean | null;
  };
};

const statusCopy: Record<Verification["status"], { label: string; detail: string }> = {
  valid: { label: "Valid", detail: "The report payload matches the active proof recorded on Solana devnet." },
  invalid: { label: "Invalid", detail: "The report data or memo fields do not match the anchored proof." },
  proof_not_found: { label: "Proof not found", detail: "The Solana transaction could not be found on devnet." },
  verification_unavailable: { label: "Verification unavailable", detail: "The devnet network could not be reached. Try again later." },
  payload_expired: { label: "Report data expired", detail: "The report data passed its 90-day retention period; the on-chain memo remains on devnet." },
};

function Check({ label, value }: { label: string; value: boolean | null }) {
  return <li><span>{label}</span><strong>{value === null ? "Not checked" : value ? "Pass" : "Fail"}</strong></li>;
}

export default function ReportProofVerificationPage({ reportId }: { reportId: string }) {
  const [result, setResult] = useState<Verification | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch(`/api/report-proofs/${encodeURIComponent(reportId)}/verify`)
      .then(async (response) => {
        if (response.status === 404) {
          if (active) setMissing(true);
          return null;
        }
        if (!response.ok) throw new Error("Verification service could not load this report.");
        return await response.json() as Verification;
      })
      .then((value) => { if (active && value) { setResult(value); setMissing(false); setError(""); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Verification is unavailable."); });
    return () => { active = false; };
  }, [reportId, retry]);

  const state = result ? statusCopy[result.status] : null;
  return (
    <main className="page-wrap report-proof-verify" data-testid="report-proof-verification">
      <a className="secondary-btn report-proof-back" href="/">Back to Verifee</a>
      <span className="v-report-label">SOLANA DEVNET</span>
      <h1>Verify a Verifee report</h1>
      <p className="report-proof-verify-intro">This check compares the retained report data with the signed Memo Program transaction.</p>
      {missing ? <div className="report-proof-result is-error" role="status"><strong>Report not found</strong><p>No report proof exists for this ID.</p></div>
        : error ? <div className="report-proof-result is-error" role="alert"><strong>Verification unavailable</strong><p>{error}</p><button className="v-report-button v-report-button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry verification</button></div>
        : !result ? <div className="report-proof-result" role="status">Checking report proof…</div>
          : <>
            <div className={`report-proof-result ${result.status === "valid" ? "is-valid" : result.status === "invalid" ? "is-error" : ""}`} role="status">
              <strong>{state?.label}</strong><p>{state?.detail}</p>
            </div>
            <dl className="report-proof-verify-details">
              <div><dt>Report ID</dt><dd>{result.reportId}</dd></div>
              <div><dt>Anchored report hash</dt><dd>{result.reportHash}</dd></div>
              <div><dt>Current report hash</dt><dd>{result.currentReportHash ?? "Unavailable"}</dd></div>
              <div><dt>Solana transaction signature</dt><dd>{result.signature ?? "Not found"}</dd></div>
              <div><dt>Issued at</dt><dd>{new Date(result.issuedAt).toLocaleString()}</dd></div>
              <div><dt>Payload retained until</dt><dd>{new Date(result.expiresAt).toLocaleString()}</dd></div>
            </dl>
            <section className="report-proof-checks" aria-label="Verification checks">
              <h2>Verification checks</h2>
              <ul>
                <Check label="Report hash matches" value={result.checks.hashMatches} />
                <Check label="Report ID matches memo" value={result.checks.reportIdMatches} />
                <Check label="App is Verifee" value={result.checks.appMatches} />
                <Check label="Memo status is active" value={result.checks.statusActive} />
              </ul>
            </section>
          </>}
      <p className="report-proof-retention">Verifee issuer wallet signs and submits proofs. Students and institutions do not need wallets.</p>
    </main>
  );
}
