import type {
  AcademicContext,
  AcademicMappingResult,
  AcademicRecord,
} from '@workspace/api-client-react';
import type { GeorgiaTechProgram } from '@workspace/georgia-tech-programs';

export type ReportRequirementStatus =
  AcademicMappingResult['requirements'][number]['status'];

export interface VerifeeReportSource {
  title: string | null;
  url: string;
}

export interface VerifeeReportContextField {
  value: string;
  source: 'TRANSCRIPT' | 'MAPPED' | 'UNAVAILABLE';
  sourceUrl: string | null;
}

export interface VerifeeReportInstitutionStatus {
  status: 'LISTED' | 'NOT_LISTED' | 'UNABLE_TO_CHECK';
  jurisdiction: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  checkedAt: string;
  matchedName: string | null;
  registryStatus: string | null;
  summary: string;
  coverageLimits: string;
}

export interface VerifeeReportCourse {
  courseIndex: number;
  code: string | null;
  title: string | null;
  credits: string | null;
  grade: string | null;
  relevance: string;
  transcriptDescription: string | null;
  researchStatus: string | null;
  evidence: string[];
  sources: VerifeeReportSource[];
}

export interface VerifeeReportRequirement {
  requirementId: string;
  name: string;
  category: string;
  importance: string;
  status: ReportRequirementStatus;
  confidence: AcademicMappingResult['requirements'][number]['confidence'];
  matchingConcepts: string[];
  courses: VerifeeReportCourse[];
  evidence: string[];
  rationale: string;
  sources: VerifeeReportSource[];
}

export interface VerifeeReportData {
  issuingInstitution: string;
  countryEducationSystem: VerifeeReportContextField;
  broadAcademicField: VerifeeReportContextField;
  specificDiscipline: VerifeeReportContextField;
  sourceProgram: VerifeeReportContextField;
  targetInstitution: string;
  targetProgram: {
    name: string;
    shortName: string;
    school: string;
  };
  credentialVerification: {
    status: string;
    method: string | null;
    explanation: string;
  };
  institutionStatus: VerifeeReportInstitutionStatus;
  academicInterpretation: 'Completed';
  requirementsAnalyzed: number;
  counts: {
    covered: number;
    partiallyCovered: number;
    potentialGap: number;
    insufficientEvidence: number;
  };
  requirements: VerifeeReportRequirement[];
  itemsRequiringReview: string[];
}

export interface GeneratedReportMetadata {
  reportId: string;
  generatedAt: string;
  createdAt: string;
  sourceInstitution: string;
  targetInstitution: string;
  targetProgram: string;
  verificationStatus: string;
  mappingSummary: {
    requirementsAnalyzed: number;
    covered: number;
    partiallyCovered: number;
    potentialGap: number;
    insufficientEvidence: number;
  };
  mappingResults: VerifeeReportRequirement[];
  institutionStatus: VerifeeReportInstitutionStatus;
  paymentStatus: 'DEMO_FREE';
  deliveryStatus: 'NOT_SENT';
}

export type GeneratedReportIdentity = Pick<
  GeneratedReportMetadata,
  'reportId' | 'generatedAt'
>;

const verificationUnavailableForPdf =
  'The academic record was interpreted from an uploaded PDF. Verifee did not independently authenticate the issuing institution or document provenance.';

function uniqueSources(sources: VerifeeReportSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function contextField(field: AcademicContext['institution']): VerifeeReportContextField {
  return {
    value: field.value.trim() || 'Not available',
    source: field.source,
    sourceUrl: field.sourceUrl,
  };
}

function displayVerification(
  status: string,
  explanation: string,
  method: string | null,
  fileFormat: string,
) {
  const normalizedStatus = status.trim().toLowerCase();
  const verified =
    normalizedStatus === 'digitally verified' || normalizedStatus === 'verified';

  if (verified) {
    return {
      status: 'Verified',
      method: method?.trim() || null,
      explanation: explanation.trim(),
    };
  }

  if (fileFormat === 'PDF transcript') {
    return {
      status: 'Unavailable',
      method: null,
      explanation: verificationUnavailableForPdf,
    };
  }

  const displayStatus = normalizedStatus.includes('fail')
    ? 'Failed'
    : normalizedStatus.includes('recommended')
      ? 'External verification recommended'
      : 'Unavailable';

  return {
    status: displayStatus,
    method: null,
    explanation: explanation.trim() || 'No independent credential verification was performed.',
  };
}

function createReviewItems(
  record: AcademicRecord,
  requirements: VerifeeReportRequirement[],
  fields: VerifeeReportContextField[],
  verificationStatus: string,
  institutionStatus: VerifeeReportInstitutionStatus,
) {
  const items: string[] = [];

  if (verificationStatus !== 'Verified') {
    items.push(
      'Credential provenance has not been independently authenticated; confirm it with the issuing institution.',
    );
  }

  if (institutionStatus.status === 'NOT_LISTED') {
    items.push(
      'No exact institution-name match was found in the checked directory. Confirm the name and jurisdiction if needed; this is not a conclusion about recognition or legitimacy.',
    );
  } else if (institutionStatus.status === 'UNABLE_TO_CHECK') {
    items.push(
      'Institution status could not be checked within the source coverage shown in this report; no institution status was inferred.',
    );
  }

  const partialRequirements = requirements
    .filter((item) => item.status === 'PARTIALLY_COVERED')
    .map((item) => item.name);
  if (partialRequirements.length > 0) {
    items.push(
      `Additional syllabus or course-description evidence may help confirm partial coverage for: ${partialRequirements.join(', ')}.`,
    );
  }

  const potentialGapRequirements = requirements
    .filter((item) => item.status === 'POTENTIAL_GAP')
    .map((item) => item.name);
  if (potentialGapRequirements.length > 0) {
    items.push(
      `Review potential gaps identified for: ${potentialGapRequirements.join(', ')}.`,
    );
  }

  const insufficientRequirements = requirements
    .filter((item) => item.status === 'INSUFFICIENT_EVIDENCE')
    .map((item) => item.name);
  if (insufficientRequirements.length > 0) {
    items.push(
      `Additional evidence is needed to assess: ${insufficientRequirements.join(', ')}.`,
    );
  }

  const unavailableFields = fields
    .filter((field) => field.source === 'UNAVAILABLE')
    .map((field) => field.value);
  if (unavailableFields.length > 0) {
    items.push(
      'Confirm unavailable academic context details with the issuing institution or another authoritative source.',
    );
  }

  const hasRelevantCourses = requirements.some((item) => item.courses.length > 0);
  const hasCourseWithoutOfficialSource = requirements.some((item) =>
    item.courses.some((course) => course.sources.length === 0),
  );
  if (hasRelevantCourses && hasCourseWithoutOfficialSource) {
    items.push(
      'Some coursework did not have an official course source; review syllabi or university catalog pages for course depth.',
    );
  }

  const courses = record.academicRecord.courses;
  if (courses.some((course) => Boolean(course.grade?.trim()))) {
    items.push(
      'Confirm the transcript grading scale with the issuing institution; a grading scale was not included in the extracted record.',
    );
  }
  if (
    !record.academicRecord.creditSystem?.trim() ||
    courses.some((course) => !course.credits?.trim())
  ) {
    items.push(
      'Confirm the meaning of the reported credit units with the issuing institution.',
    );
  }

  return [...new Set(items)];
}

export function buildVerifeeReportData(input: {
  record: AcademicRecord;
  context: AcademicContext;
  mapping: AcademicMappingResult;
  program: GeorgiaTechProgram;
  targetInstitution: string;
  verificationStatus: string;
  verificationExplanation: string;
  verificationMethod?: string | null;
  fileFormat: string;
  institutionStatus: VerifeeReportInstitutionStatus;
}): VerifeeReportData {
  const courseEvidenceByIndex = new Map(
    input.mapping.courseEvidence.map((evidence) => [evidence.courseIndex, evidence]),
  );

  const requirements: VerifeeReportRequirement[] = input.mapping.requirements.map(
    (requirement) => {
      const courses = requirement.candidateCourses.map((candidate) => {
        const recordCourse = input.record.academicRecord.courses[candidate.courseIndex];
        const evidence = courseEvidenceByIndex.get(candidate.courseIndex);
        return {
          courseIndex: candidate.courseIndex,
          code: candidate.code ?? recordCourse?.code ?? null,
          title: candidate.title ?? recordCourse?.title ?? null,
          credits: recordCourse?.credits ?? null,
          grade: recordCourse?.grade ?? null,
          relevance:
            candidate.relevance === 'LIKELY_RELEVANT'
              ? 'Likely relevant'
              : 'Possibly relevant',
          transcriptDescription:
            evidence?.transcriptDescription ?? recordCourse?.description ?? null,
          researchStatus: evidence?.researchStatus ?? null,
          evidence: [...candidate.evidence, ...(evidence?.findings ?? [])].filter(
            (item, index, list) => list.indexOf(item) === index,
          ),
          sources: uniqueSources([
            ...candidate.sources,
            ...(evidence?.sources ?? []),
          ]),
        };
      });

      const sources = uniqueSources([
        ...requirement.sources,
        ...courses.flatMap((course) => course.sources),
      ]);

      return {
        requirementId: requirement.requirementId,
        name: requirement.requirementName,
        category: requirement.category,
        importance: requirement.importance,
        status: requirement.status,
        confidence: requirement.confidence,
        matchingConcepts: requirement.matchingConcepts,
        courses,
        evidence: requirement.evidence,
        rationale: requirement.rationale,
        sources,
      };
    },
  );

  const countryEducationSystem = contextField(input.context.country);
  const broadAcademicField = contextField(input.context.broadField);
  const specificDiscipline = contextField(input.context.specificDiscipline);
  const sourceProgram = contextField(input.context.program);
  const institution = contextField(input.context.institution);
  const credentialVerification = displayVerification(
    input.verificationStatus,
    input.verificationExplanation,
    input.verificationMethod ?? null,
    input.fileFormat,
  );

  const contextFields = [
    countryEducationSystem,
    broadAcademicField,
    specificDiscipline,
    sourceProgram,
  ];

  return {
    issuingInstitution:
      input.record.institution.name?.trim() ||
      (institution.source !== 'UNAVAILABLE' ? institution.value : 'Not shown in transcript'),
    countryEducationSystem,
    broadAcademicField,
    specificDiscipline,
    sourceProgram,
    targetInstitution: input.targetInstitution,
    targetProgram: {
      name: input.program.name,
      shortName: input.program.shortName,
      school: input.program.school,
    },
    credentialVerification,
    institutionStatus: input.institutionStatus,
    academicInterpretation: 'Completed',
    requirementsAnalyzed: requirements.length,
    counts: {
      covered: requirements.filter((item) => item.status === 'COVERED').length,
      partiallyCovered: requirements.filter(
        (item) => item.status === 'PARTIALLY_COVERED',
      ).length,
      potentialGap: requirements.filter((item) => item.status === 'POTENTIAL_GAP')
        .length,
      insufficientEvidence: requirements.filter(
        (item) => item.status === 'INSUFFICIENT_EVIDENCE',
      ).length,
    },
    requirements,
    itemsRequiringReview: createReviewItems(
      input.record,
      requirements,
      [institution, ...contextFields],
      credentialVerification.status,
      input.institutionStatus,
    ),
  };
}

export function createGeneratedReportMetadata(
  data: VerifeeReportData,
  identity: GeneratedReportIdentity,
): GeneratedReportMetadata {
  return {
    ...identity,
    createdAt: identity.generatedAt,
    sourceInstitution: data.issuingInstitution,
    targetInstitution: data.targetInstitution,
    targetProgram: data.targetProgram.name,
    verificationStatus: data.credentialVerification.status,
    mappingSummary: {
      requirementsAnalyzed: data.requirementsAnalyzed,
      ...data.counts,
    },
    mappingResults: data.requirements,
    institutionStatus: data.institutionStatus,
    paymentStatus: 'DEMO_FREE',
    deliveryStatus: 'NOT_SENT',
  };
}

export const VERIFEE_REPORT_DISCLAIMER =
  'Verifee provides preliminary academic interpretation and mapping. This report is not an official admissions decision, credential-equivalency evaluation, or transfer-credit determination. Final academic and admissions decisions remain with the receiving institution.';