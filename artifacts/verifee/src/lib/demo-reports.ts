import { georgiaTechDataset } from '@workspace/georgia-tech-programs';
import {
  createGeneratedReportMetadata,
  type GeneratedReportMetadata,
  type VerifeeReportData,
  type VerifeeReportRequirement,
} from '@/lib/verifee-report';

export const DEMO_SESSION_KEY = 'verifee-demo-session';
export const DEMO_REPORTS_KEY = 'verifee-demo-saved-reports';
export const DEMO_UPLOADS_KEY = 'verifee-demo-tracked-uploads';

export interface DemoUploadFingerprint {
  fileName: string;
  fileSize: number;
}

export interface DemoSavedReport {
  metadata: GeneratedReportMetadata;
  data: VerifeeReportData;
  reportStatus: 'Ready';
  uploadFingerprint?: DemoUploadFingerprint;
}

function field(value: string): VerifeeReportData['sourceProgram'] {
  return { value, source: 'UNAVAILABLE', sourceUrl: null };
}

function buildDemoRequirements(): VerifeeReportRequirement[] {
  const program = georgiaTechDataset.programs.find((item) => item.id === 'ms-analytics');
  if (!program) throw new Error('The Georgia Tech MS Analytics demo target is unavailable.');

  const fixture = [
    {
      status: 'COVERED' as const,
      confidence: 'MEDIUM' as const,
      course: {
        courseIndex: 0,
        code: 'MATH-2101',
        title: 'Calculus for Data Science',
        credits: '3 local credits',
        grade: 'A-',
        relevance: 'Likely relevant',
        transcriptDescription: 'Differential and integral calculus with applications.',
        researchStatus: 'DEMO_DESCRIPTION',
        evidence: ['Fictional course description included for demonstration.'],
        sources: [],
      },
      rationale: 'The fictional course description indicates both differential and integral calculus.',
    },
    {
      status: 'PARTIALLY_COVERED' as const,
      confidence: 'MEDIUM' as const,
      course: {
        courseIndex: 1,
        code: 'STAT-2201',
        title: 'Probability and Statistics',
        credits: '3 local credits',
        grade: 'B+',
        relevance: 'Likely relevant',
        transcriptDescription: 'Introductory probability, descriptive statistics, and distributions.',
        researchStatus: 'DEMO_DESCRIPTION',
        evidence: ['Fictional course description included for demonstration.'],
        sources: [],
      },
      rationale: 'The fictional description indicates probability and introductory statistics; depth in statistical inference is not established.',
    },
    {
      status: 'COVERED' as const,
      confidence: 'MEDIUM' as const,
      course: {
        courseIndex: 2,
        code: 'MATH-2304',
        title: 'Linear Algebra',
        credits: '3 local credits',
        grade: 'A',
        relevance: 'Likely relevant',
        transcriptDescription: 'Vectors, matrices, systems of equations, and eigenvalues.',
        researchStatus: 'DEMO_DESCRIPTION',
        evidence: ['Fictional course description included for demonstration.'],
        sources: [],
      },
      rationale: 'The fictional course description indicates basic linear algebra topics.',
    },
    {
      status: 'INSUFFICIENT_EVIDENCE' as const,
      confidence: 'LOW' as const,
      course: null,
      rationale: 'The fictional sample does not provide enough programming coursework evidence to assess this area.',
    },
  ];

  return program.requirements.map((requirement, index) => {
    const sample = fixture[index];
    return {
      requirementId: requirement.id,
      name: requirement.name,
      category: requirement.category,
      importance: requirement.importance,
      status: sample.status,
      confidence: sample.confidence,
      matchingConcepts: requirement.matchingConcepts,
      courses: sample.course ? [sample.course] : [],
      evidence: sample.course?.evidence ?? [],
      rationale: sample.rationale,
      sources: [],
    };
  });
}

export function createDemoReportData(): VerifeeReportData {
  const program = georgiaTechDataset.programs.find((item) => item.id === 'ms-analytics');
  if (!program) throw new Error('The Georgia Tech MS Analytics demo target is unavailable.');
  const requirements = buildDemoRequirements();
  const counts = {
    covered: requirements.filter((item) => item.status === 'COVERED').length,
    partiallyCovered: requirements.filter((item) => item.status === 'PARTIALLY_COVERED').length,
    potentialGap: requirements.filter((item) => item.status === 'POTENTIAL_GAP').length,
    insufficientEvidence: requirements.filter((item) => item.status === 'INSUFFICIENT_EVIDENCE').length,
  };

  return {
    issuingInstitution: 'Nanyang Technological University',
    countryEducationSystem: field('Singapore'),
    broadAcademicField: field('Quantitative sciences'),
    specificDiscipline: field('Data science'),
    sourceProgram: field('Fictional Bachelor of Science in Data Science'),
    targetInstitution: georgiaTechDataset.institution.name,
    targetProgram: {
      name: program.name,
      shortName: program.shortName,
      school: program.school,
    },
    credentialVerification: {
      status: 'Unavailable',
      method: null,
      explanation: 'This fictional sample does not represent a real credential and was not independently verified.',
    },
    institutionStatus: {
      status: 'UNABLE_TO_CHECK',
      jurisdiction: 'Singapore',
      sourceName: null,
      sourceUrl: null,
      checkedAt: '2026-09-20T12:00:00.000Z',
      matchedName: null,
      registryStatus: null,
      summary: 'No institution status is inferred for this fictional demo report.',
      coverageLimits: 'This sample does not check an institution directory or make claims about recognition or accreditation.',
    },
    academicInterpretation: 'Completed',
    requirementsAnalyzed: requirements.length,
    counts,
    requirements,
    itemsRequiringReview: [
      'This report uses fictional coursework for demonstration and does not represent a real student transcript.',
      'Credential provenance and institution status were not independently checked.',
      'Confirm the meaning of the reported local credit units and grading scale with the issuing institution.',
    ],
  };
}

export function createSeededDemoReport(): DemoSavedReport {
  const data = createDemoReportData();
  const metadata = createGeneratedReportMetadata(data, {
    reportId: 'VF-DEMO-001',
    generatedAt: '2026-09-20T12:00:00.000Z',
  });
  return { metadata, data, reportStatus: 'Ready' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseDemoSavedReports(serialized: string | null): DemoSavedReport[] | null {
  if (serialized === null) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (!Array.isArray(candidate)) return null;
    return candidate.filter((item): item is DemoSavedReport => {
      if (!isRecord(item) || !isRecord(item.metadata) || !isRecord(item.data)) return false;
      if (
        typeof item.metadata.reportId !== 'string' ||
        typeof item.metadata.createdAt !== 'string' ||
        typeof item.metadata.sourceInstitution !== 'string' ||
        typeof item.metadata.targetInstitution !== 'string' ||
        typeof item.metadata.targetProgram !== 'string' ||
        !Array.isArray(item.data.requirements) ||
        typeof item.data.issuingInstitution !== 'string' ||
        !isRecord(item.data.targetProgram)
      ) return false;
      return item.reportStatus === 'Ready';
    });
  } catch {
    return null;
  }
}

export function sameReportScope(left: VerifeeReportData, right: VerifeeReportData) {
  const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const academicScope = (data: VerifeeReportData) =>
    normalized(`${data.sourceProgram.value} ${data.specificDiscipline.value}`);

  return (
    normalized(left.issuingInstitution) === normalized(right.issuingInstitution) &&
    academicScope(left) === academicScope(right) &&
    normalized(left.targetInstitution) === normalized(right.targetInstitution) &&
    normalized(left.targetProgram.name) === normalized(right.targetProgram.name)
  );
}

export function isSameUpload(left: DemoUploadFingerprint, right: DemoUploadFingerprint) {
  return left.fileSize === right.fileSize &&
    left.fileName.trim().toLocaleLowerCase() === right.fileName.trim().toLocaleLowerCase();
}