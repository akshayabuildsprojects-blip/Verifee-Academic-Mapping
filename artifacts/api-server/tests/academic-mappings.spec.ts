import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { test } from "node:test";
import { RunAcademicMappingResponse } from "@workspace/api-zod";
import {
  originalFetch,
  mappingModelRequestCount,
  resetMappingModelRequestCount,
  resetStageCCompletionOrder,
  restoreFetch,
  stageCCompletionOrder,
} from "./mock-openai";
import academicMappingsRouter from "../src/routes/academic-mappings";

const mappingRequest = {
  programId: "ms-analytics",
  record: {
    institution: { name: "Verifee Demo University", country: "United States" },
    credential: {
      degree: "Bachelor of Science",
      program: "Applied Mathematics",
      fieldOfStudy: "Mathematics",
      graduationDate: "2025-05",
    },
    academicRecord: {
      creditSystem: "Semester credits",
      cumulativeGPA: "3.8",
      courses: [
        {
          code: "MATH 101",
          title: "Calculus I",
          credits: "3",
          grade: "A",
          description: "Limits, differentiation, and integration.",
        },
      ],
    },
  },
};

type MappingEvent = {
  event: "progress" | "complete" | "error";
  data: unknown;
};

function parseServerSentEvents(text: string): MappingEvent[] {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const [eventLine, ...dataLines] = block.split("\n");
      if (!eventLine?.startsWith("event: ") || !dataLines[0]?.startsWith("data: ")) {
        throw new Error(`Invalid server-sent event block: ${block}`);
      }
      return {
        event: eventLine.slice("event: ".length) as MappingEvent["event"],
        data: JSON.parse(dataLines.map((line) => line.slice("data: ".length)).join("\n")),
      };
    });
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The API test server did not bind to a TCP port."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/api`);
    });
  });
}

test("invalid mapping requests return JSON 400 responses without starting mapping", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { warn: () => undefined } as typeof req.log;
    next();
  });
  app.use("/api", academicMappingsRouter);
  const server = createServer(app);
  const baseUrl = await listen(server);
  const invalidRequests = [
    {
      name: "invalid program ID",
      body: { ...mappingRequest, programId: "not-a-program" },
    },
    {
      name: "incomplete academic record",
      body: {
        ...mappingRequest,
        record: {
          ...mappingRequest.record,
          academicRecord: { creditSystem: "Semester credits" },
        },
      },
    },
  ];

  resetMappingModelRequestCount();

  try {
    for (const route of ["/academic-mappings/run/stream", "/academic-mappings/run"]) {
      for (const invalidRequest of invalidRequests) {
        const response = await originalFetch(`${baseUrl}${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalidRequest.body),
        });

        assert.equal(
          response.status,
          400,
          `${route} should reject an ${invalidRequest.name}`,
        );
        assert.match(
          response.headers.get("content-type") ?? "",
          /application\/json/,
          `${route} should return a JSON validation error`,
        );
        assert.doesNotMatch(
          response.headers.get("content-type") ?? "",
          /text\/event-stream/,
          `${route} should not open an event stream for invalid input`,
        );
        assert.deepEqual(await response.json(), {
          error: "The academic record or selected Georgia Tech program is invalid.",
        });
      }
    }

    assert.equal(mappingModelRequestCount, 0, "invalid requests must not start model work");
  } finally {
    restoreFetch();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("stream progress follows completed mappings and preserves both final response contracts", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", academicMappingsRouter);
  const server = createServer(app);
  const baseUrl = await listen(server);

  try {
    resetStageCCompletionOrder();
    const streamResponse = await originalFetch(
      `${baseUrl}/academic-mappings/run/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mappingRequest),
      },
    );
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/);

    const events = parseServerSentEvents(await streamResponse.text());
    const progressEvents = events.filter((event) => event.event === "progress");
    const completeEvents = events.filter((event) => event.event === "complete");
    assert.deepEqual(events.map(({ event }) => event), [
      "progress",
      "progress",
      "progress",
      "progress",
      "complete",
    ]);
    assert.equal(progressEvents.length, stageCCompletionOrder.length);

    const progressSnapshots = progressEvents.map(({ data }) =>
      RunAcademicMappingResponse.parse(data),
    );
    progressSnapshots.forEach((snapshot, index) => {
      const completedIds = stageCCompletionOrder.slice(0, index + 1);
      assert.deepEqual(
        snapshot.requirements.map(({ requirementId }) => requirementId),
        completedIds,
      );
      assert.deepEqual(
        snapshot.requirements.map(({ rationale }) => rationale),
        completedIds.map((id) => `completed:${id}`),
      );
    });
    assert.notDeepEqual(stageCCompletionOrder, [
      "msa-calculus",
      "msa-probability-statistics",
      "msa-linear-algebra",
      "msa-programming",
    ]);

    assert.equal(completeEvents.length, 1);
    const streamedResult = RunAcademicMappingResponse.parse(completeEvents[0].data);
    assert.equal(streamedResult.requirements.length, 4);
    assert.deepEqual(streamedResult.requirements.map(({ requirementId }) => requirementId), [
      "msa-calculus",
      "msa-probability-statistics",
      "msa-linear-algebra",
      "msa-programming",
    ]);

    resetStageCCompletionOrder();
    const legacyResponse = await originalFetch(`${baseUrl}/academic-mappings/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mappingRequest),
    });
    assert.equal(legacyResponse.status, 200);
    assert.match(legacyResponse.headers.get("content-type") ?? "", /application\/json/);
    const legacyResult = RunAcademicMappingResponse.parse(await legacyResponse.json());
    assert.deepEqual(legacyResult, streamedResult);
    assert.equal(stageCCompletionOrder.length, 4);
  } finally {
    restoreFetch();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});