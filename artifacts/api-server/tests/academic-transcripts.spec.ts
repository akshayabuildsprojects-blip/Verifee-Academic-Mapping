import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { test } from "node:test";
import {
  originalFetch,
  queueTranscriptModelResponses,
  restoreTranscriptModelFetch,
  transcriptModelRequests,
} from "./mock-transcript-openai";
import { makeSyntheticPdf } from "./synthetic-transcript-pdf";
import academicTranscriptsRouter from "../src/routes/academic-transcripts";

function languageReport(
  hasReadableEnglish: boolean,
  languages: { language: string; script: string }[],
  confidence: "high" | "medium" | "low" = "high",
) {
  return { hasReadableEnglish, confidence, languages };
}

function academicRecord(
  course: {
    code: string | null;
    title: string | null;
    credits: string | null;
    grade: string | null;
    description: string | null;
  },
) {
  return {
    institution: { name: "Northbridge University", country: "United States" },
    credential: {
      degree: "Bachelor of Science",
      program: "Applied Mathematics",
      fieldOfStudy: "Mathematics",
      graduationDate: "2025-05",
    },
    academicRecord: {
      creditSystem: "Semester credits",
      cumulativeGPA: "3.8",
      courses: [course],
    },
  };
}

function getModelPrompt(request: (typeof transcriptModelRequests)[number]): string {
  const input = request.input?.[0];
  return (
    input?.content?.find((content) => content.type === "input_text")?.text ?? ""
  );
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The transcript test server did not bind to a TCP port."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/api`);
    });
  });
}

async function submitPdf(baseUrl: string, pdf: Buffer) {
  return originalFetch(`${baseUrl}/academic-transcripts/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: pdf,
  });
}

test("transcript extraction gates on English and requests English-only fields", async () => {
  const app = express();
  app.use("/api", academicTranscriptsRouter);
  const server = createServer(app);
  const baseUrl = await listen(server);

  try {
    const englishPdf = makeSyntheticPdf([
      "Academic transcript",
      "Institution: Northbridge University",
      "Program: Applied Mathematics",
      "Course code: MATH 240",
      "Course title: Linear Algebra",
      "Credits: 3",
      "Grade: A-",
    ]);
    queueTranscriptModelResponses([
      languageReport(true, [{ language: "English", script: "Latin" }]),
      academicRecord({
        code: "MATH 240",
        title: "Linear Algebra",
        credits: "3",
        grade: "A-",
        description: "Matrices and vectors.",
      }),
    ]);
    const englishResponse = await submitPdf(baseUrl, englishPdf);
    assert.equal(englishResponse.status, 200);
    const englishResult = (await englishResponse.json()) as {
      record: ReturnType<typeof academicRecord>;
      languageDetection: {
        status: string;
        confidence: string;
        languages: { language: string; script: string }[];
      };
    };
    assert.equal(englishResult.record.academicRecord.courses[0]?.grade, "A-");
    assert.deepEqual(englishResult.languageDetection, {
      status: "ENGLISH_DETECTED",
      confidence: "high",
      languages: [{ language: "English", script: "Latin" }],
    });
    assert.doesNotMatch(
      JSON.stringify(englishResult.languageDetection),
      /Academic transcript|Northbridge University|Linear Algebra/,
    );
    assert.equal(transcriptModelRequests.length, 2);
    assert.match(getModelPrompt(transcriptModelRequests[0]), /writing systems/i);
    assert.match(getModelPrompt(transcriptModelRequests[1]), /English-language words only/i);
    assert.match(getModelPrompt(transcriptModelRequests[1]), /Grade: A-/);

    const latinMixedPdf = makeSyntheticPdf([
      "Academic transcript",
      "Course title: Applied Statistics",
      "Observaciones: El estudiante aprobó Matemáticas avanzadas",
      "Credits: 3",
      "Grade: A-",
    ]);
    queueTranscriptModelResponses([
      languageReport(true, [
        { language: "English", script: "Latin" },
        { language: "Spanish", script: "Latin" },
      ]),
      academicRecord({
        code: "STAT 210",
        title: "Applied Statistics",
        credits: "3",
        grade: "A-",
        description: "Statistical inference.",
      }),
    ]);
    const latinMixedResponse = await submitPdf(baseUrl, latinMixedPdf);
    assert.equal(latinMixedResponse.status, 200);
    const latinMixedResult = (await latinMixedResponse.json()) as {
      record: ReturnType<typeof academicRecord>;
      languageDetection: {
        status: string;
        confidence: string;
        languages: { language: string; script: string }[];
      };
    };
    assert.doesNotMatch(
      JSON.stringify(latinMixedResult.record),
      /Observaciones|Matemáticas|aprobó/,
    );
    assert.deepEqual(latinMixedResult.languageDetection, {
      status: "ENGLISH_DETECTED",
      confidence: "high",
      languages: [
        { language: "English", script: "Latin" },
        { language: "Spanish", script: "Latin" },
      ],
    });
    assert.match(getModelPrompt(transcriptModelRequests[0]), /Matemáticas/);
    assert.match(getModelPrompt(transcriptModelRequests[1]), /Latin letters/);

    const nonLatinMixedPdf = makeSyntheticPdf([
      "Academic transcript",
      "Course title: Linear Algebra",
      "课程名称：线性代数",
      "Course code: MATH 240",
      "Grade: A-",
    ]);
    queueTranscriptModelResponses([
      languageReport(true, [
        { language: "English", script: "Latin" },
        { language: "Chinese", script: "Han" },
      ]),
      academicRecord({
        code: "MATH 240",
        title: "Linear Algebra",
        credits: "3",
        grade: "A-",
        description: null,
      }),
    ]);
    const nonLatinMixedResponse = await submitPdf(baseUrl, nonLatinMixedPdf);
    assert.equal(nonLatinMixedResponse.status, 200);
    const nonLatinResult = (await nonLatinMixedResponse.json()) as {
      record: ReturnType<typeof academicRecord>;
      languageDetection: {
        status: string;
        confidence: string;
        languages: { language: string; script: string }[];
      };
    };
    assert.doesNotMatch(JSON.stringify(nonLatinResult.record), /课程名称|线性代数/);
    assert.equal(nonLatinResult.record.academicRecord.courses[0]?.grade, "A-");
    assert.deepEqual(nonLatinResult.languageDetection.languages, [
      { language: "English", script: "Latin" },
      { language: "Chinese", script: "Han" },
    ]);
    assert.match(getModelPrompt(transcriptModelRequests[1]), /non-English words/i);

    const unreadableFieldPdf = makeSyntheticPdf([
      "Academic transcript",
      "Course code: MATH 240",
      "Course title: [illegible]",
      "Credits: 3",
      "Grade: A-",
    ]);
    queueTranscriptModelResponses([
      languageReport(true, [{ language: "English", script: "Latin" }]),
      academicRecord({
        code: "MATH 240",
        title: null,
        credits: "3",
        grade: "A-",
        description: null,
      }),
    ]);
    const unreadableResponse = await submitPdf(baseUrl, unreadableFieldPdf);
    assert.equal(unreadableResponse.status, 200);
    const unreadableResult = (await unreadableResponse.json()) as {
      record: ReturnType<typeof academicRecord>;
    };
    assert.equal(unreadableResult.record.academicRecord.courses[0]?.title, null);
    assert.equal(unreadableResult.record.academicRecord.courses[0]?.description, null);

    const spanishOnlyPdf = makeSyntheticPdf([
      "Certificado académico",
      "Nombre del curso: Matemáticas avanzadas",
      "Créditos: 3",
      "Calificación: A-",
    ]);
    queueTranscriptModelResponses([
      languageReport(false, [{ language: "Spanish", script: "Latin" }]),
    ]);
    const spanishOnlyResponse = await submitPdf(baseUrl, spanishOnlyPdf);
    assert.equal(spanishOnlyResponse.status, 422);
    const spanishOnlyError = (await spanishOnlyResponse.json()) as {
      error: string;
      languageDetection: {
        status: string;
        confidence: string;
        languages: { language: string; script: string }[];
      };
    };
    assert.match(spanishOnlyError.error, /No readable English text was found/);
    assert.match(spanishOnlyError.error, /extraction was not performed/);
    assert.deepEqual(spanishOnlyError.languageDetection, {
      status: "NO_ENGLISH",
      confidence: "high",
      languages: [{ language: "Spanish", script: "Latin" }],
    });
    assert.equal(transcriptModelRequests.length, 1);
    assert.match(getModelPrompt(transcriptModelRequests[0]), /writing systems/i);

    const ambiguousPdf = makeSyntheticPdf(["A", "AB-1"]);
    queueTranscriptModelResponses([
      languageReport(
        false,
        [{ language: "Unknown", script: "Latin" }],
        "low",
      ),
    ]);
    const ambiguousResponse = await submitPdf(baseUrl, ambiguousPdf);
    assert.equal(ambiguousResponse.status, 422);
    const ambiguousError = (await ambiguousResponse.json()) as {
      error: string;
      languageDetection: {
        status: string;
        confidence: string;
        languages: { language: string; script: string }[];
      };
    };
    assert.match(ambiguousError.error, /could not confidently identify readable English/i);
    assert.match(ambiguousError.error, /Upload a clearer scan/);
    assert.deepEqual(ambiguousError.languageDetection, {
      status: "UNCERTAIN",
      confidence: "low",
      languages: [{ language: "Unknown", script: "Latin" }],
    });
    assert.equal(transcriptModelRequests.length, 1);
  } finally {
    restoreTranscriptModelFetch();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});