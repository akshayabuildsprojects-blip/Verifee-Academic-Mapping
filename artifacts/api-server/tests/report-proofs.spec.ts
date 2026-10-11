import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, hashReportPayload } from "../src/lib/report-proof-canonical";
import { AgentMailSendError, sendAgentMailReportEmail } from "../src/lib/report-email-agentmail";

test("canonical JSON sorts object keys recursively and preserves array order", () => {
  const left = { z: 1, nested: { b: "é", a: true }, list: [2, 1] };
  const right = { list: [2, 1], nested: { a: true, b: "é" }, z: 1 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(hashReportPayload(left), hashReportPayload(right));
  assert.notEqual(hashReportPayload(left), hashReportPayload({ ...right, list: [1, 2] }));
});

test("canonical JSON rejects non-JSON values", () => {
  assert.throws(() => canonicalJson({ bad: Number.NaN }));
});

test("AgentMail report send uses the selected inbox, fixed GT recipient, attachment, and stable idempotency key", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ message_id: "synthetic-message-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const input = {
    apiKey: "test-only-api-key",
    inboxId: "akshaya-1346@agentmail.to",
    reportId: "VF-SYNTHETIC",
    reportHash: "a".repeat(64),
    signature: "synthetic-solana-signature",
    pdfBase64: Buffer.from("%PDF-synthetic").toString("base64"),
  };

  const result = await sendAgentMailReportEmail(input, fetcher);
  assert.equal(result.messageId, "synthetic-message-id");
  assert.equal(calls[0].url, "https://api.agentmail.to/v0/inboxes/akshaya-1346%40agentmail.to/messages/send");
  assert.equal((calls[0].init.headers as Record<string, string>)["Idempotency-Key"], "verifee-report-VF-SYNTHETIC");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer test-only-api-key");
  const payload = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(payload.to, ["akumar3134@gatech.edu"]);
  assert.equal(payload.attachments[0].content, input.pdfBase64);
  assert.equal(payload.attachments[0].content_type, "application/pdf");
});

test("AgentMail rejection is surfaced as a provider failure", async () => {
  const fetcher: typeof fetch = async () => new Response("rejected", { status: 403 });
  await assert.rejects(
    sendAgentMailReportEmail({
      apiKey: "test-only-api-key",
      inboxId: "akshaya-1346@agentmail.to",
      reportId: "VF-SYNTHETIC",
      reportHash: "a".repeat(64),
      signature: "synthetic-solana-signature",
      pdfBase64: "JVBERg==",
    }, fetcher),
    (error) => error instanceof AgentMailSendError && error.statusCode === 403,
  );
});
