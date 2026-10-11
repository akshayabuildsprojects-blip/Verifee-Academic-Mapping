const agentMailApiBase = "https://api.agentmail.to/v0";
const institutionRecipient = "akumar3134@gatech.edu";

export interface AgentMailReportEmailInput {
  apiKey: string;
  inboxId: string;
  reportId: string;
  reportHash: string;
  signature: string;
  pdfBase64: string;
}

export class AgentMailSendError extends Error {
  constructor(readonly statusCode: number) {
    super(`AgentMail rejected the report email with status ${statusCode}.`);
    this.name = "AgentMailSendError";
  }
}

export async function sendAgentMailReportEmail(
  input: AgentMailReportEmailInput,
  fetcher: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  const response = await fetcher(
    `${agentMailApiBase}/inboxes/${encodeURIComponent(input.inboxId)}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "Idempotency-Key": `verifee-report-${input.reportId}`,
      },
      body: JSON.stringify({
        to: [institutionRecipient],
        subject: `Verifee report ${input.reportId}`,
        text: `A preliminary Verifee academic mapping report is attached.\n\nReport ID: ${input.reportId}\nReport hash: ${input.reportHash}\nSolana transaction: ${input.signature}\n\nUse the Verify Report page in Verifee to check this report's proof.`,
        attachments: [{
          filename: `Verifee_Report_${input.reportId}.pdf`,
          content: input.pdfBase64,
          content_type: "application/pdf",
        }],
      }),
    },
  );

  if (!response.ok) throw new AgentMailSendError(response.status);

  const result = await response.json() as { message_id?: unknown };
  if (typeof result.message_id !== "string" || result.message_id.length === 0) {
    throw new Error("AgentMail returned an invalid send response.");
  }
  return { messageId: result.message_id };
}
