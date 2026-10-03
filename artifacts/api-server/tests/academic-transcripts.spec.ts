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
import academicTranscriptsRouter from "../src/routes/academic-transcripts";

function makeSyntheticPdf(lines: string[]): Buffer {
  const codePoints = [
    ...new Set(
      [...lines.join("")].map((character) => character.codePointAt(0) ?? 0),
    ),
  ].filter((codePoint) => codePoint <= 0xffff);
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${codePoints.length} beginbfchar`,
    ...codePoints.map(
      (codePoint) =>
        `<${codePoint.toString(16).padStart(4, "0")}> <${codePoint.toString(16).padStart(4, "0")}>`,
    ),
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 750 Td",
    ...lines.flatMap((line, index) => [
      ...(index === 0 ? [] : ["0 -18 Td"]),
      `<${[...line]
        .map((character) =>
          (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0"),
        )
        .join("")}> Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 >>",
    `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`,
    "<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const crossReferenceOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

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
    const englishRecord = (await englishResponse.json()) as ReturnType<
      typeof academicRecord
    >;
    assert.equal(englishRecord.academicRecord.courses[0]?.grade, "A-");
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
    const latinMixedRecord = (await latinMixedResponse.json()) as ReturnType<
      typeof academicRecord
    >;
    assert.doesNotMatch(
      JSON.stringify(latinMixedRecord),
      /Observaciones|Matemáticas|aprobó/,
    );
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
    const nonLatinRecord = (await nonLatinMixedResponse.json()) as ReturnType<
      typeof academicRecord
    >;
    assert.doesNotMatch(JSON.stringify(nonLatinRecord), /课程名称|线性代数/);
    assert.equal(nonLatinRecord.academicRecord.courses[0]?.grade, "A-");
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
    const unreadableRecord = (await unreadableResponse.json()) as ReturnType<
      typeof academicRecord
    >;
    assert.equal(unreadableRecord.academicRecord.courses[0]?.title, null);
    assert.equal(unreadableRecord.academicRecord.courses[0]?.description, null);

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
    };
    assert.match(spanishOnlyError.error, /No readable English text was found/);
    assert.match(spanishOnlyError.error, /extraction was not performed/);
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
    };
    assert.match(ambiguousError.error, /could not confidently identify readable English/i);
    assert.match(ambiguousError.error, /Upload a clearer scan/);
    assert.equal(transcriptModelRequests.length, 1);
  } finally {
    restoreTranscriptModelFetch();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});