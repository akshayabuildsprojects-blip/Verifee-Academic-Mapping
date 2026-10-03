type ModelRequest = {
  input?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export const originalFetch = globalThis.fetch;
export const transcriptModelRequests: ModelRequest[] = [];

let queuedResponses: string[] = [];

process.env.AI_INTEGRATIONS_OPENAI_BASE_URL =
  "https://transcript-extraction-test.invalid/v1";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "transcript-extraction-test-key";

globalThis.fetch = (async (_input, init) => {
  if (typeof init?.body !== "string") {
    throw new Error("Expected the transcript model request to include a JSON body.");
  }

  const request = JSON.parse(init.body) as ModelRequest;
  transcriptModelRequests.push(request);
  const outputText = queuedResponses.shift();
  if (outputText === undefined) {
    throw new Error("No mock transcript model response was queued.");
  }

  const responseId = `transcript-response-${transcriptModelRequests.length}`;
  return new Response(
    JSON.stringify({
      id: responseId,
      object: "response",
      status: "completed",
      output_text: outputText,
      output: [
        {
          id: `${responseId}-message`,
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: outputText, annotations: [] }],
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}) as typeof fetch;

export function queueTranscriptModelResponses(outputs: unknown[]): void {
  queuedResponses = outputs.map((output) => JSON.stringify(output));
  transcriptModelRequests.length = 0;
}

export function restoreTranscriptModelFetch(): void {
  globalThis.fetch = originalFetch;
  queuedResponses = [];
}