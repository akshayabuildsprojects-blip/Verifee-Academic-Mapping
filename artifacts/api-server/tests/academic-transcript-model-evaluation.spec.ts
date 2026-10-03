import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { makeSyntheticPdf } from "./synthetic-transcript-pdf";

const modelEvaluationEnabled = process.env.RUN_TRANSCRIPT_MODEL_EVAL === "1";
const printedCourseDescription =
  "This synthetic course fits calibration curves to standards at 265, 280, and 310 nanometers.";
const hiddenCourseDescription =
  "Description: Hidden synthetic fact.";

test("synthetic PDFs expose invisible text only through their text layer", () => {
  const pdf = makeSyntheticPdf(
    [
      "Academic transcript",
      "Course code: SYN 401",
      "Course title: Synthetic Instrumentation",
      "Credits: 3",
      "Grade: A",
      `Description: ${printedCourseDescription}`,
    ],
    { invisibleLines: [hiddenCourseDescription] },
  );
  const embeddedText = execFileSync(
    "pdftotext",
    ["-layout", "-enc", "UTF-8", "-", "-"],
    { input: pdf, encoding: "utf8" },
  );
  const hiddenLineHex = [...hiddenCourseDescription]
    .map((character) =>
      (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0"),
    )
    .join("");
  const pdfContent = pdf.toString("ascii");
  const invisibleTextMode = pdfContent.indexOf("3 Tr");
  const normalizedEmbeddedText = embeddedText.replace(/\s+/g, " ").trim();

  assert.match(embeddedText, /Course code: SYN 401/);
  assert.ok(normalizedEmbeddedText.includes(printedCourseDescription));
  assert.ok(
    normalizedEmbeddedText.includes(hiddenCourseDescription),
    JSON.stringify(normalizedEmbeddedText),
  );
  assert.notEqual(invisibleTextMode, -1);
  assert.ok(
    pdfContent.indexOf(`<${hiddenLineHex}> Tj`, invisibleTextMode) >
      invisibleTextMode,
  );
});

test(
  "configured model preserves complete and partial descriptions and leaves missing descriptions null",
  {
    skip: modelEvaluationEnabled
      ? false
      : "Set RUN_TRANSCRIPT_MODEL_EVAL=1 to run the live synthetic-PDF evaluation.",
  },
  async () => {
    const originalFetch = globalThis.fetch;
    let preflightRequests = 0;
    let extractionRequests = 0;
    globalThis.fetch = (async (input, init) => {
      if (typeof init?.body === "string") {
        const request = JSON.parse(init.body) as {
          text?: { format?: { name?: string } };
        };
        if (request.text?.format?.name === "transcript_language_preflight") {
          preflightRequests += 1;
        } else if (request.text?.format?.name === "academic_record") {
          extractionRequests += 1;
        }
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const { extractAcademicTranscript, TranscriptExtractionError } =
        await import("../src/lib/academic-transcript-extractor");
      const mixedLanguagePdf = makeSyntheticPdf([
        "Academic transcript",
        "Institution: Verifee Demo University",
        "Degree: Bachelor of Science",
        "Program: Applied Mathematics",
        "GPA: 3.8",
        "Course code: MATH 240",
        "Course title: Applied Matemáticas Methods",
        "Credits: 3.5",
        "Grade: A-",
        "Description: Study of matrices. Observaciones: cálculo avanzado.",
        "Course code: CS 101",
        "Course title: Linear Algebra 线性代数",
        "Credits: 4",
        "Grade: B+",
        "Description: Study of vectors. 课程说明：高级计算.",
      ]);

      const extracted = await extractAcademicTranscript(mixedLanguagePdf);
      assert.equal(preflightRequests, 1);
      assert.equal(extractionRequests, 1);
      assert.equal(extracted.languageDetection.status, "ENGLISH_DETECTED");

      const record = extracted.record;
      assert.equal(record.institution.name, "Verifee Demo University");
      assert.equal(record.credential.degree, "Bachelor of Science");
      assert.equal(record.academicRecord.cumulativeGPA, "3.8");
      assert.deepEqual(
        record.academicRecord.courses.map((course) => ({
          code: course.code,
          title: course.title,
          credits: course.credits,
          grade: course.grade,
          description: course.description,
        })),
        [
          {
            code: "MATH 240",
            title: "Applied Methods",
            credits: "3.5",
            grade: "A-",
            description: "Study of matrices.",
          },
          {
            code: "CS 101",
            title: "Linear Algebra",
            credits: "4",
            grade: "B+",
            description: "Study of vectors.",
          },
        ],
      );
      assert.doesNotMatch(
        JSON.stringify(record),
        /Matemáticas|Observaciones|cálculo|线性代数|课程说明|高级计算/,
      );

      preflightRequests = 0;
      extractionRequests = 0;
      const printedDescription = printedCourseDescription;
      const descriptionPdf = makeSyntheticPdf([
        "Academic transcript",
        "Institution: Verifee Synthetic University",
        "Degree: Bachelor of Science",
        "Program: Chemistry",
        "Course code: CHEM 491",
        "Course title: Spectroscopy Laboratory",
        "Credits: 3",
        "Grade: A",
        `Description: ${printedDescription}`,
        "Course code: CHEM 492",
        "Course title: High-Temperature Sensor Calibration",
        "Credits: 4",
        "Grade: B+",
        "Description: The experiment compared resistance changes under",
      ]);
      const describedRecord = await extractAcademicTranscript(descriptionPdf);
      assert.equal(preflightRequests, 1);
      assert.equal(extractionRequests, 1);
      assert.equal(describedRecord.record.academicRecord.courses.length, 2);
      assert.equal(
        describedRecord.record.academicRecord.courses.find(
          (course) => course.code === "CHEM 491",
        )?.description,
        printedDescription,
      );
      assert.equal(
        describedRecord.record.academicRecord.courses.find(
          (course) => course.code === "CHEM 492",
        )?.description,
        "The experiment compared resistance changes under",
      );

      preflightRequests = 0;
      extractionRequests = 0;
      const noDescriptionPdf = makeSyntheticPdf([
        "Academic transcript",
        "Institution: Verifee Synthetic University",
        "Degree: Bachelor of Science",
        "Program: Chemistry",
        "Course code: CHEM 493",
        "Course title: Advanced Instrumental Analysis",
        "Credits: 4",
        "Grade: B+",
      ]);
      const noDescriptionRecord = await extractAcademicTranscript(noDescriptionPdf);
      assert.equal(preflightRequests, 1);
      assert.equal(extractionRequests, 1);
      assert.equal(noDescriptionRecord.record.academicRecord.courses.length, 1);
      assert.equal(
        noDescriptionRecord.record.academicRecord.courses.find(
          (course) => course.code === "CHEM 493",
        )?.description,
        null,
      );

      preflightRequests = 0;
      extractionRequests = 0;
      const hiddenDescriptionPdf = makeSyntheticPdf(
        [
          "Academic transcript",
          "Institution: Verifee Synthetic University",
          "Degree: Bachelor of Science",
          "Program: Chemistry",
          "Course code: CHEM 494",
          "Course title: Advanced Instrumental Analysis",
          "Credits: 4",
          "Grade: B+",
        ],
        { invisibleLines: [hiddenCourseDescription] },
      );
      const hiddenDescriptionRecord =
        await extractAcademicTranscript(hiddenDescriptionPdf);
      assert.equal(preflightRequests, 1);
      assert.equal(extractionRequests, 1);
      assert.equal(hiddenDescriptionRecord.record.academicRecord.courses.length, 1);
      assert.equal(
        hiddenDescriptionRecord.record.academicRecord.courses.find(
          (course) => course.code === "CHEM 494",
        )?.description,
        null,
      );

      preflightRequests = 0;
      extractionRequests = 0;
      const noEnglishPdf = makeSyntheticPdf([
        "Certificado académico",
        "Nombre del curso: Matemáticas avanzadas",
        "Créditos: 3",
        "Calificación: A-",
      ]);
      await assert.rejects(
        extractAcademicTranscript(noEnglishPdf),
        (error: unknown) =>
          error instanceof TranscriptExtractionError &&
          error.code === "no-english",
      );
      assert.equal(preflightRequests, 1);
      assert.equal(extractionRequests, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
