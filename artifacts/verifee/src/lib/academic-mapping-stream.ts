import type { AcademicMappingInput, AcademicMappingResult } from "@workspace/api-client-react";
import { RunAcademicMappingResponse } from "@workspace/api-zod";

function errorMessageFromBody(body: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const message = (parsed as { error?: unknown }).error;
      if (typeof message === "string") return message;
    }
  } catch {
    // Keep the HTTP status as the fallback for non-JSON error responses.
  }
  return `The mapping request failed with status ${status}.`;
}

export async function runAcademicMappingWithProgress(
  input: AcademicMappingInput,
  onProgress: (snapshot: AcademicMappingResult) => void,
  signal?: AbortSignal,
): Promise<AcademicMappingResult> {
  const response = await fetch("/api/academic-mappings/run/stream", {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    throw new Error(errorMessageFromBody(await response.text(), response.status));
  }

  if (!response.body) {
    throw new Error("The mapping progress stream was unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  let completedResult: AcademicMappingResult | null = null;

  const dispatchEvent = () => {
    if (dataLines.length === 0) {
      eventName = "";
      return;
    }

    const payload: unknown = JSON.parse(dataLines.join("\n"));
    if (eventName === "error") {
      const message = payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: unknown }).error
        : null;
      throw new Error(typeof message === "string" ? message : "The mapping could not be completed.");
    }

    if (eventName === "progress" || eventName === "complete") {
      const parsed = RunAcademicMappingResponse.safeParse(payload);
      if (!parsed.success) {
        throw new Error("The mapping progress response was invalid.");
      }
      if (eventName === "progress") onProgress(parsed.data);
      else completedResult = parsed.data;
    }

    eventName = "";
    dataLines = [];
  };

  const consumeLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, "");
    if (line === "") {
      dispatchEvent();
      return;
    }
    if (line.startsWith(":")) return;

    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        consumeLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    if (buffer.length > 0) consumeLine(buffer);
    dispatchEvent();
  } finally {
    reader.releaseLock();
  }

  if (!completedResult) {
    throw new Error("The mapping stream ended before the final result arrived.");
  }
  return completedResult;
}