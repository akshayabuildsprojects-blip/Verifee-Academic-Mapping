import { expect, test, type Page } from "@playwright/test";

const programId = "ms-analytics";
const requirementIds = [
  "msa-calculus",
  "msa-probability-statistics",
  "msa-linear-algebra",
  "msa-programming",
] as const;

type MappingResult = {
  programId: string;
  programName: string;
  institutionName: string | null;
  officialUniversityDomain: string | null;
  retryable: boolean;
  courseEvidence: {
    courseIndex: number;
    code: string | null;
    title: string | null;
    transcriptDescription: string | null;
    researchStatus:
      | "OFFICIAL_SOURCES_FOUND"
      | "TRANSCRIPT_DESCRIPTION_ONLY"
      | "NO_AUTHORITATIVE_SOURCE"
      | "DEMO_DESCRIPTION";
    findings: string[];
    sources: { title: string | null; url: string }[];
  }[];
  requirements: {
    requirementId: string;
    requirementName: string;
    category: string;
    importance: string;
    matchingConcepts: string[];
    status:
      | "COVERED"
      | "PARTIALLY_COVERED"
      | "INSUFFICIENT_EVIDENCE"
      | "POTENTIAL_GAP";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    candidateCourses: {
      courseIndex: number;
      code: string | null;
      title: string | null;
      relevance: "LIKELY_RELEVANT" | "POSSIBLY_RELEVANT";
      evidence: string[];
      sources: { title: string | null; url: string }[];
    }[];
    evidence: string[];
    rationale: string;
    sources: { title: string | null; url: string }[];
  }[];
};

type StreamController = {
  send: (event: string, payload: unknown) => void;
  close: () => void;
};

declare global {
  interface Window {
    __verifeeMappingTest?: {
      requests: { url: string; body: unknown }[];
      streams: StreamController[];
    };
  }
}

const academicRecord = {
  institution: { name: "Example University", country: "United States" },
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
      {
        code: "STAT 201",
        title: "Probability and Statistics",
        credits: "3",
        grade: "A-",
        description: "Probability distributions and statistical inference.",
      },
      {
        code: "MATH 220",
        title: "Linear Algebra",
        credits: "3",
        grade: "B+",
        description: "Matrices, vectors, and linear systems.",
      },
      {
        code: "CS 150",
        title: "Programming Fundamentals",
        credits: "4",
        grade: "A",
        description: "Programming with Python and algorithmic thinking.",
      },
    ],
  },
};

const result: MappingResult = {
  programId,
  programName: "Master of Science in Analytics",
  institutionName: "Example University",
  officialUniversityDomain: "example.edu",
  retryable: false,
  courseEvidence: [
    {
      courseIndex: 0,
      code: "MATH 101",
      title: "Calculus I",
      transcriptDescription: "Limits, differentiation, and integration.",
      researchStatus: "OFFICIAL_SOURCES_FOUND",
      findings: ["The catalog lists differential and integral calculus."],
      sources: [
        {
          title: "Example University course catalog: Calculus I",
          url: "https://catalog.example.edu/courses/math-101",
        },
      ],
    },
    {
      courseIndex: 1,
      code: "STAT 201",
      title: "Probability and Statistics",
      transcriptDescription:
        "Probability distributions and statistical inference.",
      researchStatus: "TRANSCRIPT_DESCRIPTION_ONLY",
      findings: [],
      sources: [],
    },
    {
      courseIndex: 2,
      code: "MATH 220",
      title: "Linear Algebra",
      transcriptDescription: "Matrices, vectors, and linear systems.",
      researchStatus: "TRANSCRIPT_DESCRIPTION_ONLY",
      findings: [],
      sources: [],
    },
    {
      courseIndex: 3,
      code: "CS 150",
      title: "Programming Fundamentals",
      transcriptDescription: "Programming with Python and algorithms.",
      researchStatus: "TRANSCRIPT_DESCRIPTION_ONLY",
      findings: [],
      sources: [],
    },
  ],
  requirements: [
    {
      requirementId: requirementIds[0],
      requirementName: "Calculus",
      category: "mathematics",
      importance: "expected",
      matchingConcepts: ["calculus", "differentiation", "integration"],
      status: "COVERED",
      confidence: "HIGH",
      candidateCourses: [
        {
          courseIndex: 0,
          code: "MATH 101",
          title: "Calculus I",
          relevance: "LIKELY_RELEVANT",
          evidence: ["The transcript records differentiation and integration."],
          sources: [],
        },
      ],
      evidence: ["A completed calculus course is listed on the transcript."],
      rationale:
        "The listed calculus coursework directly covers the stored concepts.",
      sources: [
        {
          title: "Example University course catalog: Calculus I",
          url: "https://catalog.example.edu/courses/math-101",
        },
      ],
    },
    {
      requirementId: requirementIds[1],
      requirementName: "Probability / Statistics",
      category: "mathematics",
      importance: "expected",
      matchingConcepts: ["probability", "statistics", "statistical inference"],
      status: "PARTIALLY_COVERED",
      confidence: "MEDIUM",
      candidateCourses: [
        {
          courseIndex: 1,
          code: "STAT 201",
          title: "Probability and Statistics",
          relevance: "LIKELY_RELEVANT",
          evidence: ["The transcript description names probability distributions."],
          sources: [],
        },
      ],
      evidence: ["The transcript description includes statistical inference."],
      rationale:
        "The transcript supports the main concepts, but does not show course depth.",
      sources: [],
    },
    {
      requirementId: requirementIds[2],
      requirementName: "Basic Linear Algebra",
      category: "mathematics",
      importance: "expected",
      matchingConcepts: ["linear algebra", "matrices", "vectors"],
      status: "COVERED",
      confidence: "HIGH",
      candidateCourses: [
        {
          courseIndex: 2,
          code: "MATH 220",
          title: "Linear Algebra",
          relevance: "LIKELY_RELEVANT",
          evidence: ["The description includes matrices and vectors."],
          sources: [],
        },
      ],
      evidence: ["A linear algebra course is listed."],
      rationale: "The course title and description match the stored concepts.",
      sources: [],
    },
    {
      requirementId: requirementIds[3],
      requirementName: "High-Level Programming",
      category: "computing",
      importance: "expected",
      matchingConcepts: ["programming", "Python", "algorithms"],
      status: "COVERED",
      confidence: "HIGH",
      candidateCourses: [
        {
          courseIndex: 3,
          code: "CS 150",
          title: "Programming Fundamentals",
          relevance: "LIKELY_RELEVANT",
          evidence: ["The course uses Python and introduces algorithms."],
          sources: [],
        },
      ],
      evidence: ["The transcript includes introductory programming coursework."],
      rationale:
        "The described Python course covers programming and algorithmic thinking.",
      sources: [],
    },
  ],
};

async function openReport(page: Page) {
  await page.addInitScript((record) => {
    if (sessionStorage.getItem("verifee-started") !== "yes") {
      sessionStorage.setItem("verifee-file-name", "sample-transcript.pdf");
      sessionStorage.setItem("verifee-file-format", "PDF transcript");
      sessionStorage.setItem("verifee-analysis-mode", "extracted");
      sessionStorage.setItem("verifee-verification-status", "Not verified");
      sessionStorage.setItem(
        "verifee-verification-explanation",
        "No independent verification was performed.",
      );
      sessionStorage.setItem("verifee-extracted-record", JSON.stringify(record));
      sessionStorage.setItem("verifee-program", "ms-analytics");
      sessionStorage.setItem("verifee-started", "yes");
    }

    const state = { requests: [] as { url: string; body: unknown }[], streams: [] as StreamController[] };
    window.__verifeeMappingTest = state;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (!url.endsWith("/api/academic-mappings/run/stream")) {
        return originalFetch(input, init);
      }

      let parsedBody: unknown = null;
      try {
        parsedBody = JSON.parse(String(init?.body ?? "{}"));
      } catch {
        parsedBody = null;
      }
      state.requests.push({ url, body: parsedBody });

      let streamController:
        | ReadableStreamDefaultController<Uint8Array>
        | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      });
      state.streams.push({
        send(event, payload) {
          if (!streamController) throw new Error("Mapping stream is not ready.");
          const text = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
          streamController.enqueue(new TextEncoder().encode(text));
        },
        close() {
          streamController?.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };
  }, academicRecord);
  await page.goto("/report");
  await page.getByRole("heading", { name: "Academic mapping" }).waitFor();
  await page.waitForFunction(
    () => window.__verifeeMappingTest?.streams.length === 1,
  );
}

async function sendStreamEvent(
  page: Page,
  streamIndex: number,
  event: string,
  payload: unknown,
) {
  await page.evaluate(
    ({ index, eventName, data }) => {
      const stream = window.__verifeeMappingTest?.streams[index];
      if (!stream) throw new Error(`Mapping stream ${index} is not available.`);
      stream.send(eventName, data);
    },
    { index: streamIndex, eventName: event, data: payload },
  );
}

test("shows each completed requirement live, keeps evidence accessible, and persists the final report", async ({
  page,
}) => {
  await openReport(page);

  await expect(page.getByText("0 of 4 requirements mapped")).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[0]}`)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__verifeeMappingTest?.requests[0]?.body),
    )
    .toEqual({ programId, record: academicRecord });

  const firstSnapshot: MappingResult = {
    ...result,
    requirements: result.requirements.slice(0, 1),
    courseEvidence: result.courseEvidence.slice(0, 1),
  };
  await sendStreamEvent(page, 0, "progress", firstSnapshot);

  await expect(page.getByText("1 of 4 requirements mapped")).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[0]}`)).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[1]}`)).toHaveCount(0);
  await expect(
    page.getByTestId(`toggle-mapping-${requirementIds[0]}`),
  ).toHaveAttribute("aria-expanded", "true");

  const secondSnapshot: MappingResult = {
    ...result,
    requirements: result.requirements.slice(0, 2),
    courseEvidence: result.courseEvidence.slice(0, 2),
  };
  await sendStreamEvent(page, 0, "progress", secondSnapshot);

  await expect(page.getByText("2 of 4 requirements mapped")).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[1]}`)).toBeVisible();
  await expect(
    page.getByTestId(`toggle-mapping-${requirementIds[0]}`),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByTestId(`toggle-mapping-${requirementIds[1]}`),
  ).toHaveAttribute("aria-expanded", "true");

  await sendStreamEvent(page, 0, "complete", result);
  await page.evaluate(() => {
    window.__verifeeMappingTest?.streams[0]?.close();
  });
  await expect(page.getByTestId("status-mapping-loading")).toHaveCount(0);
  await expect(page.locator(".summary-number")).toHaveText("4");
  await expect(
    page.getByTestId(`toggle-mapping-${requirementIds[0]}`),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByTestId(`toggle-mapping-${requirementIds[1]}`),
  ).toHaveAttribute("aria-expanded", "false");

  const firstCard = page.getByTestId(`mapping-${requirementIds[0]}`);
  const firstToggle = firstCard.getByRole("button");
  const firstContent = firstCard.getByRole("region");
  await expect(firstContent).toContainText("Relevant prior coursework");
  await expect(firstContent).toContainText("MATH 101 · Calculus I");
  await expect(firstContent).toContainText(
    "Transcript description: Limits, differentiation, and integration.",
  );
  await expect(firstContent).toContainText(
    "The transcript records differentiation and integration.",
  );
  await expect(firstContent).toContainText("Evidence found");
  await expect(firstContent).toContainText(
    "A completed calculus course is listed on the transcript.",
  );
  await expect(firstContent).toContainText("Reasoning");
  await expect(firstContent).toContainText(
    "The listed calculus coursework directly covers the stored concepts.",
  );
  await expect(firstContent).toContainText("Confidence explanation");
  await expect(firstContent).toContainText(
    "Based on detailed, directly relevant evidence.",
  );
  const officialSource = firstContent.getByRole("link", {
    name: "Example University course catalog: Calculus I",
  });
  await expect(officialSource).toHaveAttribute(
    "href",
    "https://catalog.example.edu/courses/math-101",
  );

  await firstToggle.focus();
  await page.keyboard.press("Space");
  await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");

  const storedResult = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("verifee-mapping-result") ?? "null"),
  );
  expect(storedResult).toEqual(result);

  await page.reload();
  await expect(page.getByTestId(`mapping-${requirementIds[0]}`)).toBeVisible();
  await expect(page.getByTestId("status-mapping-loading")).toHaveCount(0);
  await expect(
    page.getByTestId(`toggle-mapping-${requirementIds[0]}`),
  ).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() =>
      page.evaluate(() => window.__verifeeMappingTest?.requests.length),
    )
    .toBe(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("verifee-mapping-result") ?? "null"),
    ),
  ).toEqual(result);
});

test("keeps the saved academic record available for retry after a stream failure", async ({
  page,
}) => {
  await openReport(page);

  await sendStreamEvent(page, 0, "error", {
    error: "The mapping service is temporarily unavailable.",
  });
  await page.evaluate(() => {
    window.__verifeeMappingTest?.streams[0]?.close();
  });

  await expect(page.getByTestId("status-mapping-error")).toBeVisible();
  await expect(page.getByTestId("button-retry-mapping")).toBeEnabled();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("verifee-extracted-record") ?? "null"),
    ),
  ).toEqual(academicRecord);

  await page.getByTestId("button-retry-mapping").click();
  await page.waitForFunction(
    () => window.__verifeeMappingTest?.streams.length === 2,
  );
  await expect(page.getByTestId("status-mapping-error")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__verifeeMappingTest?.requests[1]?.body),
    )
    .toEqual({ programId, record: academicRecord });

  await sendStreamEvent(page, 1, "complete", result);
  await page.evaluate(() => {
    window.__verifeeMappingTest?.streams[1]?.close();
  });
  await expect(page.getByTestId("status-mapping-loading")).toHaveCount(0);
  await expect(page.getByTestId(`mapping-${requirementIds[0]}`)).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("verifee-extracted-record") ?? "null"),
    ),
  ).toEqual(academicRecord);
});