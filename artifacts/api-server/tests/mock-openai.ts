type OpenAIRequestBody = {
  input?: string;
};

export const stageCCompletionOrder: string[] = [];
export let mappingModelRequestCount = 0;
export let stageCFailureAttemptCount = 0;

let failingStageCRequirementId: string | null = null;
let finalStageCAttemptStarted = Promise.resolve();
let signalFinalStageCAttemptStarted: () => void = () => undefined;
let finalStageCAttemptGate = Promise.resolve();
let releaseFinalStageCAttemptGate: () => void = () => undefined;

const originalFetch = globalThis.fetch;
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://academic-mapping-test.invalid/v1";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "academic-mapping-test-key";

const mockFetch = (async (_input, init) => {
  mappingModelRequestCount += 1;
  if (typeof init?.body !== "string") {
    throw new Error("Expected the mapping request to include a JSON body.");
  }

  const request = JSON.parse(init.body) as OpenAIRequestBody;
  const input = request.input ?? "";
  const requirementMatch = input.match(/Stored requirement:\s*(\{[^\n]+\})/);
  if (!requirementMatch) {
    throw new Error("Could not identify the stored requirement in the model request.");
  }

  const requirement = JSON.parse(requirementMatch[1]) as { id: string };
  let outputText: string;

  if (input.startsWith("Stage A")) {
    outputText = JSON.stringify({
      candidates: [{ courseIndex: 0, relevance: "LIKELY_RELEVANT" }],
    });
  } else if (input.startsWith("Stage C")) {
    if (requirement.id === failingStageCRequirementId) {
      stageCFailureAttemptCount += 1;
      if (stageCFailureAttemptCount === 4) {
        signalFinalStageCAttemptStarted();
        await finalStageCAttemptGate;
      }
      return new Response(JSON.stringify({ error: "Simulated requirement analysis failure." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const delayMsByRequirement: Record<string, number> = {
      "msa-calculus": 250,
      "msa-probability-statistics": 10,
      "msa-linear-algebra": 40,
      "msa-programming": 10,
    };
    await new Promise((resolve) =>
      setTimeout(resolve, delayMsByRequirement[requirement.id] ?? 0),
    );
    stageCCompletionOrder.push(requirement.id);
    outputText = JSON.stringify({
      status: "COVERED",
      confidence: "HIGH",
      evidence: [`completed:${requirement.id}`],
      rationale: `completed:${requirement.id}`,
    });
  } else {
    throw new Error("Unexpected model request in the academic mapping test.");
  }

  return new Response(
    JSON.stringify({
      id: `response-${requirement.id}`,
      object: "response",
      status: "completed",
      output_text: outputText,
      output: [
        {
          id: `message-${requirement.id}`,
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: outputText, annotations: [] },
          ],
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}) as typeof fetch;
globalThis.fetch = mockFetch;

export function resetStageCCompletionOrder(): void {
  stageCCompletionOrder.length = 0;
}

export function resetMappingModelRequestCount(): void {
  mappingModelRequestCount = 0;
}

export function configureStageCFailure(requirementId: string): void {
  failingStageCRequirementId = requirementId;
  stageCFailureAttemptCount = 0;
  finalStageCAttemptStarted = new Promise((resolve) => {
    signalFinalStageCAttemptStarted = resolve;
  });
  finalStageCAttemptGate = new Promise((resolve) => {
    releaseFinalStageCAttemptGate = resolve;
  });
}

export function waitForFinalStageCAttempt(): Promise<void> {
  return finalStageCAttemptStarted;
}

export function releaseFinalStageCAttempt(): void {
  releaseFinalStageCAttemptGate();
}

export function resetStageCFailure(): void {
  releaseFinalStageCAttempt();
  failingStageCRequirementId = null;
  stageCFailureAttemptCount = 0;
  signalFinalStageCAttemptStarted = () => undefined;
  releaseFinalStageCAttemptGate = () => undefined;
  finalStageCAttemptStarted = Promise.resolve();
  finalStageCAttemptGate = Promise.resolve();
}

export { originalFetch };

export function installMockFetch(): void {
  globalThis.fetch = mockFetch;
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}