import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

const detectedLanguages = {
  status: "ENGLISH_DETECTED",
  confidence: "medium",
  languages: [
    { language: "English", script: "Latin" },
    { language: "Spanish", script: "Latin" },
  ],
} as const;

const institutionStatus = {
  status: "LISTED",
  statusLabel: "Listed",
  institutionName: "Example University",
  institutionNameSource: "TRANSCRIPT",
  jurisdiction: "United States",
  jurisdictionSource: "TRANSCRIPT",
  sourceName: "Example institution registry",
  sourceUrl: "https://registry.example.edu/institutions/example-university",
  checkedAt: "2026-01-12T15:00:00.000Z",
  matchedName: "Example University",
  registryStatus: "Active",
  summary: "A matching institution record appears in the example directory.",
  coverageLimits: "Test fixture coverage is limited to the example directory.",
} as const;

async function openReport(
  page: Page,
  options: {
    record?: typeof academicRecord;
    status?: Record<string, unknown>;
  } = {},
) {
  const record = options.record ?? academicRecord;
  const status = options.status ?? institutionStatus;
  await page.addInitScript(({ record, languageDetection, institutionStatus }) => {
    if (sessionStorage.getItem("verifee-started") !== "yes") {
      sessionStorage.setItem("verifee-file-name", "sample-transcript.pdf");
      sessionStorage.setItem("verifee-file-size", "7");
      sessionStorage.setItem("verifee-file-format", "PDF transcript");
      sessionStorage.setItem("verifee-analysis-mode", "extracted");
      sessionStorage.setItem("verifee-verification-status", "Not verified");
      sessionStorage.setItem(
        "verifee-verification-explanation",
        "No independent verification was performed.",
      );
      sessionStorage.setItem("verifee-extracted-record", JSON.stringify(record));
      sessionStorage.setItem(
        "verifee-language-detection",
        JSON.stringify(languageDetection),
      );
      sessionStorage.setItem(
        "verifee-institution-status",
        JSON.stringify(institutionStatus),
      );
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
  }, {
    record,
    languageDetection: detectedLanguages,
    institutionStatus: status,
  });
  await page.goto("/report");
  await page.getByRole("heading", { name: "Academic mapping" }).waitFor();
  await page.waitForFunction(
    () => window.__verifeeMappingTest?.streams.length === 1,
  );
}

async function openReview(page: Page) {
  await page.addInitScript(({ record, languageDetection }) => {
    sessionStorage.setItem("verifee-file-name", "sample-transcript.pdf");
    sessionStorage.setItem("verifee-file-format", "PDF transcript");
    sessionStorage.setItem("verifee-analysis-mode", "extracted");
    sessionStorage.setItem("verifee-verification-status", "Not verified");
    sessionStorage.setItem(
      "verifee-verification-explanation",
      "No independent verification was performed.",
    );
    sessionStorage.setItem("verifee-extracted-record", JSON.stringify(record));
    sessionStorage.setItem(
      "verifee-language-detection",
      JSON.stringify(languageDetection),
    );
    sessionStorage.setItem("verifee-started", "yes");
  }, { record: academicRecord, languageDetection: detectedLanguages });
  await page.goto("/analysis");
  await page.getByRole("heading", { name: "Verify & review" }).waitFor();
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "verifee-demo-session",
      JSON.stringify({ mode: "DEMO", displayName: "Verifee Demo" }),
    );
  });
});

test("resets scroll between wizard steps but not within a step", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await openReview(page);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByTestId("button-continue-target").click();
  await expect(page).toHaveURL(/\/target$/);
  await expect(page.getByRole("heading", { name: "Choose what you want to compare against" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.evaluate(() => window.scrollTo(0, 240));
  const targetScrollBeforeChange = await page.evaluate(() => window.scrollY);
  expect(targetScrollBeforeChange).toBeGreaterThan(0);
  const programSelect = page.getByTestId("select-program");
  const initialProgram = await programSelect.inputValue();
  await programSelect.selectOption({ index: 1 });
  await expect(programSelect).not.toHaveValue(initialProgram);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Back to review" }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(page.getByRole("heading", { name: "Verify & review" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("shows institution and jurisdiction provenance with the exact Scottish source", async ({ page }) => {
  const record = {
    ...academicRecord,
    institution: {
      ...academicRecord.institution,
      name: "University of Strathclyde, Glasgow",
      country: "Glasgow",
    },
  };
  const status = {
    ...institutionStatus,
    statusLabel: "Recognised",
    institutionName: "University of Strathclyde",
    institutionNameSource: "RESOLVED_BY_VERIFEE",
    jurisdiction: "Scotland, United Kingdom",
    jurisdictionSource: "RESOLVED_BY_VERIFEE",
    sourceName: "Scottish Government — Recognised bodies",
    sourceUrl: "https://www.gov.scot/policies/universities",
    matchedName: "University of Strathclyde",
    registryStatus: "Recognised body with degree-awarding powers",
    summary: "The Scottish Government recognises the University of Strathclyde as a degree-awarding body.",
    coverageLimits: "This check searches the Scottish Government's recognised-bodies list only.",
  };
  await openReport(page, { record, status });

  const card = page.getByTestId("card-institution-status");
  await expect(page.getByTestId("status-institution-registry")).toHaveText("Recognised");
  await expect(card).toContainText("University of Strathclyde");
  await expect(card).toContainText("Institution source");
  await expect(card).toContainText("Resolved by Verifee");
  await expect(card).toContainText("Scotland, United Kingdom");
  await expect(card).toContainText("Jurisdiction source");
  await expect(card).toContainText("Resolved by Verifee");
  await expect(card.getByTestId("institution-status-source-link")).toHaveAttribute(
    "href",
    "https://www.gov.scot/policies/universities",
  );
  await expect(card).toContainText("Coverage limits:");
});

test("shows detected languages and scripts in transcript review", async ({ page }) => {
  await openReview(page);

  const summary = page.getByTestId("language-detection-review");
  await expect(page.getByRole("heading", { name: "Language detection" })).toBeVisible();
  await expect(summary).toContainText("English detected");
  await expect(summary).toContainText("Medium confidence");
  await expect(summary).toContainText("English");
  await expect(summary).toContainText("Spanish");
  await expect(summary).toContainText("Script: Latin");
  await expect(summary).not.toContainText("Northbridge University");

  const savedState = await page.evaluate(() => ({
    record: JSON.parse(sessionStorage.getItem("verifee-extracted-record") ?? "null"),
    detection: JSON.parse(sessionStorage.getItem("verifee-language-detection") ?? "null"),
  }));
  expect(savedState.record).toEqual(academicRecord);
  expect(savedState.detection).toEqual(detectedLanguages);
});

test("shows an uncertain language result when transcript extraction is blocked", async ({
  page,
}) => {
  await page.route("**/api/academic-transcripts/extract", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "We could not confidently identify readable English, so academic extraction was not performed. Upload a clearer scan.",
        languageDetection: {
          status: "UNCERTAIN",
          confidence: "low",
          languages: [{ language: "Unknown", script: "Latin" }],
        },
      }),
    });
  });

  await page.goto("/start");
  await page.getByTestId("input-credential").setInputFiles({
    name: "uncertain-scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n"),
  });
  await page.getByTestId("button-continue-upload").click();

  const summary = page.getByTestId("language-detection-upload");
  await expect(page.getByTestId("status-upload-error")).toContainText(
    "could not confidently identify readable English",
  );
  await expect(summary).toContainText("Language detection uncertain");
  await expect(summary).toContainText("Low confidence");
  await expect(summary).toContainText("Unknown");
  await expect(summary).toContainText("Script: Latin");
  await expect(summary).toContainText("Academic extraction was not performed");
  await expect(summary).not.toContainText("Northbridge University");
  expect(
    await page.evaluate(() => sessionStorage.getItem("verifee-language-detection")),
  ).toBeNull();
});

test("explains when no readable English is detected", async ({ page }) => {
  await page.route("**/api/academic-transcripts/extract", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "No readable English text was found in the PDF; extraction was not performed. Upload a transcript with readable English text.",
        languageDetection: {
          status: "NO_ENGLISH",
          confidence: "high",
          languages: [{ language: "Spanish", script: "Latin" }],
        },
      }),
    });
  });

  await page.goto("/start");
  await page.getByTestId("input-credential").setInputFiles({
    name: "spanish-transcript.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n"),
  });
  await page.getByTestId("button-continue-upload").click();

  const summary = page.getByTestId("language-detection-upload");
  await expect(page.getByTestId("status-upload-error")).toContainText(
    "No readable English text was found",
  );
  await expect(summary).toContainText("No readable English detected");
  await expect(summary).toContainText("High confidence");
  await expect(summary).toContainText("Spanish");
  await expect(summary).toContainText("Script: Latin");
  await expect(summary).toContainText(
    "Academic extraction was not performed because readable English was not found.",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("verifee-language-detection")),
  ).toBeNull();
});

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
  const firstRequirementToggle = page.getByTestId(
    `toggle-mapping-${requirementIds[0]}`,
  );
  await expect(firstRequirementToggle).toHaveAttribute("aria-expanded", "false");
  await firstRequirementToggle.click();
  await expect(firstRequirementToggle).toHaveAttribute("aria-expanded", "true");

  const secondSnapshot: MappingResult = {
    ...result,
    requirements: result.requirements.slice(0, 2),
    courseEvidence: result.courseEvidence.slice(0, 2),
  };
  await sendStreamEvent(page, 0, "progress", secondSnapshot);

  await expect(page.getByText("2 of 4 requirements mapped")).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[1]}`)).toBeVisible();
  const secondRequirementToggle = page.getByTestId(
    `toggle-mapping-${requirementIds[1]}`,
  );
  if (await firstRequirementToggle.getAttribute("aria-expanded") !== "true") {
    await firstRequirementToggle.click();
  }
  await expect(firstRequirementToggle).toHaveAttribute("aria-expanded", "true");
  if (await secondRequirementToggle.getAttribute("aria-expanded") !== "true") {
    await secondRequirementToggle.click();
  }
  await expect(firstRequirementToggle).toHaveAttribute("aria-expanded", "false");
  await expect(secondRequirementToggle).toHaveAttribute("aria-expanded", "true");

  await sendStreamEvent(page, 0, "complete", result);
  await page.evaluate(() => {
    window.__verifeeMappingTest?.streams[0]?.close();
  });
  await expect(page.getByTestId("status-mapping-loading")).toHaveCount(0);
  await expect(page.locator(".summary-number")).toHaveText("4");
  const firstCard = page.getByTestId(`mapping-${requirementIds[0]}`);
  const firstToggle = firstCard.getByRole("button");
  if (await firstToggle.getAttribute("aria-expanded") !== "true") {
    await firstToggle.click();
  }
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    secondRequirementToggle,
  ).toHaveAttribute("aria-expanded", "false");

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
  const persistedToggle = page.getByTestId(
    `toggle-mapping-${requirementIds[0]}`,
  );
  await expect(persistedToggle).toHaveAttribute("aria-expanded", "false");
  await persistedToggle.click();
  await expect(persistedToggle).toHaveAttribute("aria-expanded", "true");
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

test("keeps completed requirement results visible after a stream failure and retries from the saved record", async ({
  page,
}) => {
  await openReport(page);

  const firstSnapshot: MappingResult = {
    ...result,
    requirements: result.requirements.slice(0, 1),
    courseEvidence: result.courseEvidence.slice(0, 1),
  };
  await sendStreamEvent(page, 0, "progress", firstSnapshot);

  await expect(page.getByText("1 of 4 requirements mapped")).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[0]}`)).toBeVisible();

  await sendStreamEvent(page, 0, "error", {
    error: "The mapping service is temporarily unavailable.",
  });
  await page.evaluate(() => {
    window.__verifeeMappingTest?.streams[0]?.close();
  });

  await expect(page.getByTestId("status-mapping-error")).toBeVisible();
  await expect(page.getByTestId("button-retry-mapping")).toBeEnabled();
  await expect(page.getByText("1 of 4 requirements mapped")).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[0]}`)).toBeVisible();
  await expect(page.getByTestId(`mapping-${requirementIds[1]}`)).toHaveCount(0);
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
});

test("shows the report preview immediately and keeps its downloads, save choices, and identity", async ({
  page,
}) => {
  await openReport(page);
  await sendStreamEvent(page, 0, "complete", result);
  await page.evaluate(() => {
    window.__verifeeMappingTest?.streams[0]?.close();
  });

  await expect(page.getByTestId("button-open-verifee-report")).toBeVisible();
  const storedMappingBefore = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("verifee-mapping-result") ?? "null"),
  );
  await page.getByTestId("button-open-verifee-report").click();
  await expect(page).toHaveURL(/\/final-report$/);
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  await expect(page.getByText("Your preliminary academic mapping report is ready to review or download.")).toBeVisible();
  await expect(page.getByTestId("button-generate-report")).toHaveCount(0);
  await expect(page.getByTestId("button-save-to-my-reports")).toBeVisible();
  await expect(page.getByTestId("button-download-submission-receipt")).toBeVisible();
  await expect(page.getByTestId("button-download-report")).toBeVisible();
  await expect(page.getByText("$0.00")).toBeVisible();
  await expect(page.getByText("Free in Demo Mode")).toBeVisible();
  await expect(page.getByText("Report pricing is disabled during the Verifee demo. No payment information is required.")).toBeVisible();
  await expect(page.getByText("Preliminary Academic Mapping Report").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example University", exact: true })).toBeVisible();
  await expect(page.getByText("Academic Interpretation · Completed")).toBeVisible();
  await expect(page.getByTestId(`report-requirement-${requirementIds[0]}`)).toContainText("Calculus");
  await expect(page.getByTestId(`report-requirement-${requirementIds[0]}`)).toContainText("Covered");
  await expect(page.getByRole("heading", { name: "Institution status check" })).toBeVisible();
  await expect(page.getByText("Listed in source")).toBeVisible();
  await expect(page.getByRole("link", { name: "Example institution registry" })).toHaveAttribute(
    "href",
    institutionStatus.sourceUrl,
  );
  await expect(page.getByText(/Test fixture coverage is limited/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Example University course catalog: Calculus I" }).first(),
  ).toHaveAttribute("href", "https://catalog.example.edu/courses/math-101");
  await expect(page.getByRole("heading", { name: "Items requiring review" })).toBeVisible();
  await expect(page.getByText(/Confirm the transcript grading scale/)).toBeVisible();

  const firstReportIdentity = await page.evaluate(() => {
    const value = JSON.parse(
      sessionStorage.getItem("verifee-generated-report") ?? "null",
    ) as { reportId?: string; generatedAt?: string } | null;
    return {
      reportId: value?.reportId ?? "",
      generatedAt: value?.generatedAt ?? "",
    };
  });
  expect(firstReportIdentity.reportId).toMatch(/^VF-/);
  expect(Date.parse(firstReportIdentity.generatedAt)).not.toBeNaN();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("button-download-report").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdf = await readFile(downloadPath!);
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const pdfContents = pdf.toString("latin1");
  expect(pdfContents).toContain("Preliminary Academic");
  expect(pdfContents).toContain("Final academic and admissions decisions");
  expect(pdfContents).toContain("https://catalog.example.edu/courses/math-101");
  expect(pdfContents).toContain("Institution status check");
  expect(pdfContents).toContain("Example institution registry");
  expect(pdfContents).toContain("Test fixture coverage is limited");
  expect(pdfContents).toContain("/Annots");

  const [receiptDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("button-download-submission-receipt").click(),
  ]);
  expect(receiptDownload.suggestedFilename()).toMatch(/^Verifee_Submission_Receipt_VF-.*\.pdf$/);
  const receiptPath = await receiptDownload.path();
  expect(receiptPath).not.toBeNull();
  const receiptPdf = await readFile(receiptPath!);
  expect(receiptPdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const receiptContents = receiptPdf.toString("latin1");
  expect(receiptContents).toContain("Student report generated");
  expect(receiptContents).toContain("Ready for submission");
  expect(receiptContents).toContain("Not sent");
  expect(receiptContents).toContain(
    "This receipt confirms that the listed Verifee report was generated.",
  );
  expect(receiptContents).toContain(
    "It does not confirm receipt or acceptance by the target",
  );
  expect(receiptContents).toContain("(institution.) Tj");

  await page.getByTestId("button-save-to-my-reports").click();
  await expect(page.getByTestId("status-save-to-reports")).toContainText(
    "Report saved to My Reports",
  );
  const firstSavedReportId = await page.evaluate(() => {
    const reports = JSON.parse(
      sessionStorage.getItem("verifee-demo-saved-reports") ?? "[]",
    ) as { metadata: { reportId: string } }[];
    return reports[0]?.metadata.reportId ?? "";
  });
  expect(firstSavedReportId).toMatch(/^VF-/);
  expect(firstSavedReportId).toBe(firstReportIdentity.reportId);
  expect(
    await page.evaluate(() => {
      const reports = JSON.parse(
        sessionStorage.getItem("verifee-demo-saved-reports") ?? "[]",
      ) as { metadata: { paymentStatus: string; deliveryStatus: string } }[];
      return reports[0]?.metadata;
    }),
  ).toMatchObject({ paymentStatus: "DEMO_FREE", deliveryStatus: "NOT_SENT" });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  await expect(page.getByTestId("button-generate-report")).toHaveCount(0);
  await expect(page.getByText(`Report ${firstReportIdentity.reportId}`)).toBeVisible();
  const restoredIdentity = await page.evaluate(() => {
    const value = JSON.parse(
      sessionStorage.getItem("verifee-generated-report") ?? "null",
    ) as { reportId?: string; generatedAt?: string } | null;
    return {
      reportId: value?.reportId ?? "",
      generatedAt: value?.generatedAt ?? "",
    };
  });
  expect(restoredIdentity).toEqual(firstReportIdentity);

  await page.getByTestId("button-back-to-mapping").click();
  await expect(page).toHaveURL(/\/report$/);
  await page.getByTestId("button-open-verifee-report").click();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  await expect(page.getByText(`Report ${firstReportIdentity.reportId}`)).toBeVisible();
  const reopenedIdentity = await page.evaluate(() => {
    const value = JSON.parse(
      sessionStorage.getItem("verifee-generated-report") ?? "null",
    ) as { reportId?: string; generatedAt?: string } | null;
    return {
      reportId: value?.reportId ?? "",
      generatedAt: value?.generatedAt ?? "",
    };
  });
  expect(reopenedIdentity).toEqual(firstReportIdentity);

  // Simulate a fresh report identity for the same program/target so duplicate-save choices remain covered.
  await page.evaluate(() => sessionStorage.removeItem("verifee-generated-report"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  const duplicateReportIdentity = await page.evaluate(() => {
    const value = JSON.parse(
      sessionStorage.getItem("verifee-generated-report") ?? "null",
    ) as { reportId?: string; generatedAt?: string } | null;
    return {
      reportId: value?.reportId ?? "",
      generatedAt: value?.generatedAt ?? "",
    };
  });
  expect(duplicateReportIdentity.reportId).toMatch(/^VF-/);
  expect(duplicateReportIdentity.reportId).not.toBe(firstReportIdentity.reportId);
  await page.getByTestId("button-save-to-my-reports").click();
  await expect(page.getByTestId("button-view-existing-report")).toBeVisible();
  await page.getByTestId("button-save-duplicate-anyway").click();
  await expect(page.getByTestId("status-save-to-reports")).toContainText(
    "Report saved to My Reports",
  );

  expect(
    await page.evaluate(() => window.__verifeeMappingTest?.requests.length),
  ).toBe(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("verifee-mapping-result") ?? "null"),
    ),
  ).toEqual(storedMappingBefore);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("verifee-generated-report") ?? "null"),
    ),
  ).toMatchObject({
    reportId: duplicateReportIdentity.reportId,
    generatedAt: duplicateReportIdentity.generatedAt,
    createdAt: expect.any(String),
    sourceInstitution: "Example University",
    targetInstitution: "Georgia Institute of Technology",
    targetProgram: "Master of Science in Analytics",
    verificationStatus: "Unavailable",
    mappingSummary: { requirementsAnalyzed: 4 },
    mappingResults: expect.arrayContaining([
      expect.objectContaining({ requirementId: requirementIds[0], status: "COVERED" }),
    ]),
    institutionStatus: { status: "LISTED", matchedName: "Example University" },
    paymentStatus: "DEMO_FREE",
    deliveryStatus: "NOT_SENT",
  });
  expect(
    await page.evaluate(() => sessionStorage.getItem("verifee-extracted-record")),
  ).not.toBeNull();

  const generatedReportId = await page.evaluate(() => {
    const value = JSON.parse(
      sessionStorage.getItem("verifee-generated-report") ?? "null",
    ) as { reportId?: string } | null;
    return value?.reportId ?? "";
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  await expect(page.getByText(`Report ${generatedReportId}`)).toBeVisible();
  expect(
    await page.evaluate(() => window.__verifeeMappingTest?.requests.length),
  ).toBe(0);

  await page.getByTestId("button-back-to-mapping").click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByTestId("button-open-verifee-report")).toBeVisible();
  expect(
    await page.evaluate(() => window.__verifeeMappingTest?.requests.length),
  ).toBe(0);

  await page.getByTestId("button-open-verifee-report").click();
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
  await page.getByTestId("button-start-new-analysis").click();
  await expect(page).toHaveURL(/\/start$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("verifee-generated-report")),
  ).toBeNull();
  expect(
    await page.evaluate(() => sessionStorage.getItem("verifee-mapping-result")),
  ).toBeNull();
  expect(
    await page.evaluate(() => sessionStorage.getItem("verifee-extracted-record")),
  ).toBeNull();

  await page.getByTestId("input-credential").setInputFiles({
    name: "sample-transcript.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(7),
  });
  await expect(page.getByTestId("status-duplicate-upload")).toContainText(
    "This file was used for a report saved in this demo session",
  );
  await page.getByTestId("button-view-duplicate-report").click();
  await expect(page).toHaveURL(new RegExp(`/saved-report/${firstSavedReportId}$`));
  await expect(page.getByRole("heading", { name: "Report preview" })).toBeVisible();
});