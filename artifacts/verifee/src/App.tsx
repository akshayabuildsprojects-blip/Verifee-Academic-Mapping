import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, useRoute, Router as WouterRouter, Link } from 'wouter';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowDown, ArrowUpRight, BookOpen, Check, ChevronRight, ExternalLink, FileText, GraduationCap, Landmark, LoaderCircle, RotateCcw, ScanText, ShieldAlert, Upload, X } from 'lucide-react';
import { extractAcademicTranscript, runAcademicContext, runInstitutionStatusCheck, type AcademicContext, type AcademicContextInput, type AcademicMappingInput, type AcademicMappingResult, type AcademicRecord, type InstitutionStatusInput } from '@workspace/api-client-react';
import { ExtractAcademicTranscriptResponse, RunAcademicContextResponse, RunInstitutionStatusCheckResponse, RunAcademicMappingBody, RunAcademicMappingResponse, type TranscriptLanguageDetection } from '@workspace/api-zod';
import { georgiaTechDataset } from '@workspace/georgia-tech-programs';
import { checkVerification, extractMockRecord, sampleCourses, sampleCredential, uploadSchema, type CredentialVerification } from '@/lib/mock-analysis';
import { runAcademicMappingWithProgress } from '@/lib/academic-mapping-stream';
import VerifeeReportView from '@/components/verifee-report-view';
import {
  buildVerifeeReportData,
  createGeneratedReportMetadata,
  type GeneratedReportIdentity,
  type GeneratedReportMetadata,
} from '@/lib/verifee-report';
import { downloadVerifeeReportPdf, downloadVerifeeSubmissionReceiptPdf } from '@/lib/verifee-report-pdf';
import {
  DemoDashboardPage,
  DemoLoginPage,
  DemoReportsPage,
  type DemoSavedReportSummary,
} from '@/components/demo-account-pages';
import {
  createSeededDemoReport,
  DEMO_REPORTS_KEY,
  DEMO_SESSION_KEY,
  isSameUpload,
  parseDemoSavedReports,
  sameReportScope,
  type DemoSavedReport,
  type DemoUploadFingerprint,
} from '@/lib/demo-reports';

type InstitutionStatusView = (typeof RunInstitutionStatusCheckResponse)['_output'];

const queryClient = new QueryClient();
const wizardSteps = ['Upload Credential', 'Verify & Review', 'Select Target', 'Academic Mapping', 'Verifee Report'];
const verifeeSessionKeys = [
  'verifee-file-name',
  'verifee-file-size',
  'verifee-file-format',
  'verifee-target',
  'verifee-program',
  'verifee-started',
  'verifee-verification-status',
  'verifee-verification-explanation',
  'verifee-verification-method',
  'verifee-analysis-mode',
  'verifee-extracted-record',
  'verifee-language-detection',
  'verifee-mapping-result',
  'verifee-academic-context',
  'verifee-institution-status',
  'verifee-visible-course-count',
  'verifee-generated-report',
];

function clearVerifeeSession() {
  verifeeSessionKeys.forEach((key) => sessionStorage.removeItem(key));
}

type DemoSession = { mode: 'DEMO'; displayName: string };

function readDemoSession(): DemoSession | null {
  try {
    const candidate: unknown = JSON.parse(sessionStorage.getItem(DEMO_SESSION_KEY) || 'null');
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const value = candidate as Record<string, unknown>;
    return value.mode === 'DEMO' && typeof value.displayName === 'string'
      ? { mode: 'DEMO', displayName: value.displayName }
      : null;
  } catch {
    return null;
  }
}

function readDemoSavedReports(): DemoSavedReport[] {
  return parseDemoSavedReports(sessionStorage.getItem(DEMO_REPORTS_KEY)) ?? [];
}

function beginDemoSession() {
  sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    mode: 'DEMO',
    displayName: 'Verifee Demo',
  } satisfies DemoSession));
  if (parseDemoSavedReports(sessionStorage.getItem(DEMO_REPORTS_KEY)) === null) {
    sessionStorage.setItem(DEMO_REPORTS_KEY, JSON.stringify([createSeededDemoReport()]));
  }
}

function endDemoSession() {
  clearVerifeeSession();
  sessionStorage.removeItem(DEMO_SESSION_KEY);
  sessionStorage.removeItem(DEMO_REPORTS_KEY);
}

function toDemoSavedReportSummary(report: DemoSavedReport): DemoSavedReportSummary {
  return {
    reportId: report.metadata.reportId,
    createdAt: report.metadata.createdAt,
    sourceInstitution: report.metadata.sourceInstitution,
    targetInstitution: report.metadata.targetInstitution,
    targetProgram: report.metadata.targetProgram,
    verificationStatus: report.metadata.verificationStatus,
    reportStatus: report.reportStatus,
    mappingSummary: report.metadata.mappingSummary,
  };
}
const programTypeLabels: Record<string, string> = {
  published_prerequisite_background: 'Published prerequisite / background expectations',
  recommended_expected_background: 'Recommended / expected preparation · holistic admissions',
  expected_quantitative_background: 'Expected quantitative background',
};
const importanceLabels: Record<string, string> = {
  expected: 'Expected',
  strongly_recommended: 'Strongly recommended',
  expected_background: 'Expected background',
};

function formatRequirementType(value: string) {
  return programTypeLabels[value] || value.replaceAll('_', ' ');
}
function formatImportance(value: string) {
  return importanceLabels[value] || value.replaceAll('_', ' ');
}
function getEvidenceTypes(requirement: unknown): string[] {
  if (!requirement || typeof requirement !== 'object') return [];
  const value = (requirement as { evidenceTypes?: unknown }).evidenceTypes;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatForFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.opencert')) return 'OpenCerts';
  if (lower.endsWith('.jsonld')) return 'European Digital Credential';
  return 'PDF transcript';
}

function isPdfFile(file: File) {
  return file.name.toLowerCase().endsWith('.pdf');
}

function readAcademicRecord(): AcademicRecord | null {
  const serialized = sessionStorage.getItem('verifee-extracted-record');
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    const parsed = RunAcademicMappingBody.shape.record.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readStoredLanguageDetection(): TranscriptLanguageDetection | null {
  const serialized = sessionStorage.getItem('verifee-language-detection');
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    const parsed = ExtractAcademicTranscriptResponse.shape.languageDetection.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readLanguageDetectionFromError(cause: unknown): TranscriptLanguageDetection | null {
  if (!cause || typeof cause !== 'object' || !('data' in cause)) return null;
  const data = (cause as { data?: unknown }).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const candidate = (data as Record<string, unknown>).languageDetection;
  const parsed = ExtractAcademicTranscriptResponse.shape.languageDetection.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function readStoredMapping(programId: string): AcademicMappingResult | null {
  const serialized = sessionStorage.getItem('verifee-mapping-result');
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    const parsed = RunAcademicMappingResponse.safeParse(candidate);
    return parsed.success && parsed.data.programId === programId ? parsed.data : null;
  } catch {
    return null;
  }
}

function readStoredAcademicContext(): AcademicContext | null {
  const serialized = sessionStorage.getItem('verifee-academic-context');
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    const parsed = RunAcademicContextResponse.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readStoredInstitutionStatus(): InstitutionStatusView | null {
  const serialized = sessionStorage.getItem('verifee-institution-status');
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    const parsed = RunInstitutionStatusCheckResponse.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function createUnavailableInstitutionStatus(
  record: AcademicRecord,
  summary = 'The institution status service did not return a result. No institution status was inferred.',
): InstitutionStatusView {
  return {
    status: 'UNABLE_TO_CHECK',
    jurisdiction: record.institution.country?.trim() || null,
    sourceName: null,
    sourceUrl: null,
    checkedAt: new Date(),
    matchedName: null,
    registryStatus: null,
    summary,
    coverageLimits: 'This implementation checks Ghana through the GTEC public institution directory only. Other jurisdictions are not checked, and no comprehensive worldwide coverage is claimed.',
  };
}

function institutionStatusLabel(status: InstitutionStatusView['status']) {
  if (status === 'LISTED') return 'Listed in source';
  if (status === 'NOT_LISTED') return 'No exact match found';
  return 'Unable to check';
}

function formatInstitutionStatusTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function readStoredGeneratedReport(): GeneratedReportIdentity | null {
  const serialized = sessionStorage.getItem('verifee-generated-report');
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }
    const value = candidate as Record<string, unknown>;
    const generatedAt =
      typeof value.generatedAt === 'string' && !Number.isNaN(Date.parse(value.generatedAt))
        ? value.generatedAt
        : typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
          ? value.createdAt
          : null;
    if (
      typeof value.reportId !== 'string' ||
      !/^VF-[A-Z0-9-]{4,16}$/i.test(value.reportId) ||
      !generatedAt
    ) {
      return null;
    }
    return { reportId: value.reportId, generatedAt };
  } catch {
    return null;
  }
}

function createReportId() {
  const token = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `VF-${token.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

function createFallbackAcademicContext(record: AcademicRecord): AcademicContext {
  const transcriptField = (value: string | null | undefined) => value?.trim()
    ? { value: value.trim(), source: 'TRANSCRIPT' as const, sourceUrl: null }
    : { value: 'Not shown in transcript', source: 'UNAVAILABLE' as const, sourceUrl: null };
  const unavailableField = (label: 'transcript' | 'mapped') => ({
    value: label === 'transcript' ? 'Not shown in transcript' : 'Unable to determine',
    source: 'UNAVAILABLE' as const,
    sourceUrl: null,
  });
  const institution = transcriptField(record.institution.name);
  const country = record.institution.country?.trim()
    ? transcriptField(record.institution.country)
    : unavailableField('mapped');
  const broadField = unavailableField('mapped');
  const specificDiscipline = unavailableField('mapped');
  const program = transcriptField(record.credential.program);
  const fields = [institution, country, broadField, specificDiscipline, program];
  const availableCount = fields.filter(({ source }) => source !== 'UNAVAILABLE').length;

  return {
    status: availableCount === 0 ? 'UNAVAILABLE' : availableCount === fields.length ? 'MAPPED' : 'PARTIAL',
    institution,
    country,
    broadField,
    specificDiscipline,
    program,
  };
}

function academicContextSourceLabel(source: AcademicContext['institution']['source']) {
  if (source === 'TRANSCRIPT') return 'Source: Transcript';
  if (source === 'MAPPED') return 'Mapped by Verifee';
  return 'Not available';
}

function createSampleAcademicRecord(): AcademicRecord {
  return {
    institution: { name: sampleCredential.institution, country: sampleCredential.country },
    credential: {
      degree: sampleCredential.qualification,
      program: null,
      fieldOfStudy: sampleCredential.major,
      graduationDate: sampleCredential.graduationDate,
    },
    academicRecord: {
      creditSystem: "Local credits",
      cumulativeGPA: null,
      courses: sampleCourses.map((course) => ({
        code: course.code,
        title: course.title,
        credits: `${course.credits} ${course.unitsLabel}`,
        grade: course.grade,
        description: course.description ?? null,
      })),
    },
  };
}

function displayTranscriptValue(value: string | null | undefined) {
  return value?.trim() || 'Not shown in transcript';
}

function Header() {
  const [, setLocation] = useLocation();
  const demoSession = readDemoSession();
  return <header className="masthead">
    <Link href={demoSession ? '/dashboard' : '/'} className="brand" data-testid="link-brand"><span className="brand-mark"><BookOpen size={16} strokeWidth={2.1} /></span><span>verifee</span></Link>
    {demoSession ? <nav className="app-demo-navigation" aria-label="Demo navigation">
      <button type="button" onClick={() => { clearVerifeeSession(); setLocation('/start'); }} data-testid="button-navigation-new-mapping">New Mapping</button>
      <Link href="/my-reports" data-testid="link-navigation-my-reports">My Reports</Link>
      <span className="demo-badge">Demo Mode</span>
      <button type="button" onClick={() => { endDemoSession(); setLocation('/'); }} data-testid="button-navigation-log-out">Exit demo</button>
    </nav> : <div className="mast-meta"><span className="mast-dot" /> Preliminary academic interpretation <span className="demo-badge">Mapping demo</span></div>}
  </header>;
}
function Disclaimer() {
  return <div className="footnote">Verifee provides preliminary academic interpretation and mapping. It is not an official credential evaluation, admissions decision, or transfer-credit determination.</div>;
}
function Stepper({ current }: { current: number }) {
  return <nav className="wizard-stepper" aria-label="Credential analysis steps">
    {wizardSteps.map((step, index) => <div className={`wizard-step ${current === index + 1 ? 'current' : ''}`} key={step} aria-current={current === index + 1 ? 'step' : undefined}>
      <span className="wizard-marker">{index + 1}</span><span className="wizard-step-label">{step}</span>
    </div>)}
  </nav>;
}

function LanguageDetectionCard({
  detection,
  compact = false,
}: {
  detection: TranscriptLanguageDetection;
  compact?: boolean;
}) {
  const statusLabel = detection.status === 'ENGLISH_DETECTED'
    ? 'English detected'
    : detection.status === 'NO_ENGLISH'
      ? 'No readable English detected'
      : 'Language detection uncertain';
  const statusTone = detection.status === 'ENGLISH_DETECTED'
    ? 'good'
    : detection.status === 'UNCERTAIN'
      ? 'review'
      : 'gap';
  const confidenceLabel = `${detection.confidence[0]?.toUpperCase()}${detection.confidence.slice(1)} confidence`;
  const explanation = detection.status === 'ENGLISH_DETECTED'
    ? 'Readable English was found. Non-English words may have been omitted from the extracted record.'
    : detection.status === 'NO_ENGLISH'
      ? 'Academic extraction was not performed because readable English was not found.'
      : 'Academic extraction was not performed because the language check could not confidently identify readable English.';

  return <div
    className={`language-detection-card ${compact ? 'compact' : ''} ${detection.status.toLowerCase().replaceAll('_', '-')}`}
    data-testid={compact ? 'language-detection-upload' : 'language-detection-review'}
    role={compact ? 'status' : undefined}
    aria-live={compact ? 'polite' : undefined}
  >
    <div className="language-detection-heading">
      <strong>{statusLabel}</strong>
      <span className={`status-pill ${statusTone}`}>{confidenceLabel}</span>
    </div>
    <p>{explanation}</p>
    {detection.languages.length > 0
      ? <ul className="language-detection-list" aria-label="Detected languages and writing systems">
          {detection.languages.map(({ language, script }, index) => <li key={`${language}-${script}-${index}`}>
            <strong>{language}</strong><span>Script: {script}</span>
          </li>)}
        </ul>
      : <p className="language-detection-empty">No language labels could be identified.</p>}
  </div>;
}

function UploadStep() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [duplicateReportId, setDuplicateReportId] = useState<string | null>(null);
  const [continueWithDuplicate, setContinueWithDuplicate] = useState(false);
  const [languageDetection, setLanguageDetection] = useState<TranscriptLanguageDetection | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const savedFileName = sessionStorage.getItem('verifee-file-name');
  const hasSavedAnalysis = sessionStorage.getItem('verifee-started') === 'yes' && Boolean(savedFileName);
  const chooseFile = (candidate?: File) => {
    setError('');
    setLanguageDetection(null);
    setDuplicateReportId(null);
    setContinueWithDuplicate(false);
    if (!candidate) {
      setFile(null);
      return;
    }
    const validation = uploadSchema.safeParse({ file: candidate });
    if (!validation.success) { setFile(null); setError(validation.error.issues[0]?.message || 'Choose a supported credential file.'); return; }
    setFile(candidate);
    const duplicate = readDemoSavedReports().find((report) =>
      report.uploadFingerprint && isSameUpload(report.uploadFingerprint, {
        fileName: candidate.name,
        fileSize: candidate.size,
      }),
    );
    setDuplicateReportId(duplicate?.metadata.reportId ?? null);
  };
  const saveReviewState = (
    mode: 'extracted' | 'demo',
    verification: CredentialVerification,
    record?: AcademicRecord,
    detectedLanguages?: TranscriptLanguageDetection,
  ) => {
    if (!file) return;
    sessionStorage.setItem('verifee-file-name', file.name);
    sessionStorage.setItem('verifee-file-size', String(file.size));
    sessionStorage.setItem('verifee-file-format', formatForFileName(file.name));
    sessionStorage.setItem('verifee-analysis-mode', mode);
    sessionStorage.setItem('verifee-verification-status', verification.status);
    sessionStorage.setItem('verifee-verification-explanation', verification.explanation);
    sessionStorage.removeItem('verifee-verification-method');
    sessionStorage.removeItem('verifee-generated-report');
    if (record) sessionStorage.setItem('verifee-extracted-record', JSON.stringify(record));
    else sessionStorage.removeItem('verifee-extracted-record');
    if (detectedLanguages) {
      sessionStorage.setItem('verifee-language-detection', JSON.stringify(detectedLanguages));
    } else {
      sessionStorage.removeItem('verifee-language-detection');
    }
    sessionStorage.removeItem('verifee-mapping-result');
    sessionStorage.removeItem('verifee-academic-context');
    sessionStorage.removeItem('verifee-institution-status');
    sessionStorage.removeItem('verifee-visible-course-count');
    sessionStorage.removeItem('verifee-target');
    sessionStorage.removeItem('verifee-program');
    sessionStorage.setItem('verifee-started', 'yes');
    setLocation('/analysis');
  };
  const continueWithDemo = async () => {
    if (!file) return;
    if (duplicateReportId && !continueWithDuplicate) return;
    setBusy(true);
    setError('');
    setLanguageDetection(null);
    try {
      await extractMockRecord();
      const verification = await checkVerification();
      saveReviewState('demo', verification, createSampleAcademicRecord());
    } catch {
      setError('We could not prepare the sample credential record. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!file) { setError('Choose a credential file to continue.'); return; }
    if (duplicateReportId && !continueWithDuplicate) return;
    setBusy(true);
    setError('');
    setLanguageDetection(null);
    try {
      if (isPdfFile(file)) {
        const extraction = await extractAcademicTranscript(file);
        saveReviewState('extracted', {
          status: 'Verification unavailable',
          explanation: 'This PDF was read for academic interpretation only. No digital authenticity check was performed.',
        }, extraction.record, extraction.languageDetection);
      } else {
        await extractMockRecord();
        const verification = await checkVerification();
        saveReviewState('demo', verification, createSampleAcademicRecord());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not extract this transcript. Try again or use the demo sample.');
      setLanguageDetection(readLanguageDetectionFromError(cause));
    } finally {
      setBusy(false);
    }
  };
  return <div className="shell"><Header /><main className="page-wrap wizard-wrap">
    <Stepper current={1} />
    <section className="wizard-card">
      <div className="eyebrow">Step 1 of 5</div>
      <h1 className="wizard-title">Upload an academic credential</h1>
      <p className="wizard-intro">Upload a transcript PDF. Verifee checks its languages first, then extracts readable English text only; non-English words are omitted, including those written in Latin letters. If no readable English is found, extraction will not run. Detection can be uncertain for short words, names, and low-quality scans. Other accepted formats continue through the sample-data demo path.</p>
      <div className="format-grid" aria-label="Accepted credential formats">
        <div className="format-option"><span className="format-name">PDF</span><span>AI academic extraction for Step 2</span></div>
        <div className="format-option"><span className="format-name">OpenCerts <span className="format-ext">.opencert</span></span><span>Sample-data demo only; not verified</span></div>
        <div className="format-option"><span className="format-name">European Digital Credential <span className="format-ext">.jsonld</span></span><span>Sample-data demo only; not verified</span></div>
      </div>
      <div className={`dropzone wizard-dropzone ${drag ? 'drag' : ''}`} onDragOver={(event) => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); chooseFile(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} aria-label="Choose a credential file" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} data-testid="dropzone-credential">
        <div><span className="upload-icon"><Upload size={19} /></span><p className="drop-title">{file ? 'Credential selected' : 'Drop your credential here or'} {!file && <button className="browse" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>browse files</button>}</p><p className="drop-hint">{file ? `${formatForFileName(file.name)} · ${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'PDF, .opencert, or .jsonld · 20 MB maximum'}</p></div>
      </div>
      <input ref={inputRef} className="file-control" type="file" accept=".pdf,.opencert,.jsonld,application/pdf,application/ld+json" aria-label="Choose a credential file" data-testid="input-credential" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
       {file && <div className="file-chip" data-testid="text-selected-file"><div className="chip-file"><FileText size={17} color="#55766c" /><div><strong>{file.name}</strong><div className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB · {formatForFileName(file.name)}</div></div></div><button className="remove-file" aria-label="Remove selected file" data-testid="button-remove-file" onClick={() => { setFile(null); setError(''); setLanguageDetection(null); setDuplicateReportId(null); setContinueWithDuplicate(false); if (inputRef.current) inputRef.current.value = ''; }}><X size={16} /></button></div>}
       {duplicateReportId && <div className="demo-duplicate-upload" role="alert" data-testid="status-duplicate-upload"><div><strong>This file was used for a report saved in this demo session.</strong><p>Open that report, or continue with this file to create a new mapping.</p></div><div className="demo-duplicate-actions"><button className="secondary-btn" type="button" onClick={() => setLocation(`/saved-report/${encodeURIComponent(duplicateReportId)}`)} data-testid="button-view-duplicate-report">View Existing Report</button><button className="secondary-btn" type="button" onClick={() => setContinueWithDuplicate(true)} disabled={continueWithDuplicate} data-testid="button-continue-duplicate-upload">{continueWithDuplicate ? 'Continuing anyway' : 'Continue Anyway'}</button></div></div>}
      <p className="upload-note">PDF contents are sent to the configured AI service for academic extraction. The extracted record is kept in this browser session; mapping sends only that academic JSON, not the PDF. Reading a PDF does not verify that it is authentic. OpenCerts and JSON-LD are not verified in this version.</p>
      <div className="demo-disclosure"><strong>Current scope:</strong> PDF extraction and preliminary mapping use the academic details extracted from your transcript. If extraction fails, you can explicitly continue with the synthetic demo sample instead.</div>
       {error && <div className="error-message" role="alert" data-testid="status-upload-error">{error}</div>}
       {languageDetection && <LanguageDetectionCard detection={languageDetection} compact />}
       <button className="cta" type="button" onClick={() => void submit()} disabled={!file || busy || Boolean(duplicateReportId && !continueWithDuplicate)} data-testid="button-continue-upload"><span>{busy ? file && isPdfFile(file) ? 'Reading transcript…' : 'Preparing sample record…' : 'Continue to verify & review'}</span>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}</button>
      {file && isPdfFile(file) && error && <button className="secondary-btn" type="button" onClick={() => void continueWithDemo()} disabled={busy} data-testid="button-use-demo-fallback">Continue with demo sample instead</button>}
      {hasSavedAnalysis && !file && <button className="secondary-btn resume-analysis" type="button" onClick={() => setLocation('/analysis')} data-testid="button-resume-analysis"><ArrowRight size={14} /> Continue saved analysis · {savedFileName}</button>}
    </section>
    <Disclaimer />
  </main></div>;
}
function Landing() {
  return <div className="landing-shell" id="top">
    <header className="landing-header">
      <div className="landing-nav-wrap">
        <Link href="/" className="brand" data-testid="link-brand-home"><span className="brand-mark"><BookOpen size={16} strokeWidth={2.1} /></span><span>verifee</span></Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works" data-testid="link-how-it-works">How it works</a>
          <Link href="/login" className="nav-cta" data-testid="link-try-verifee-nav">Try Verifee <ArrowUpRight size={14} /></Link>
        </nav>
        <span className="demo-badge landing-demo-badge">Demo mode</span>
      </div>
    </header>
    <main>
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="hero-copy-block">
            <div className="landing-eyebrow"><span className="eyebrow-rule" /> Academic records, made legible</div>
            <h1>Understand academic credentials <em>across borders.</em></h1>
            <p className="landing-lede">Verifee interprets international academic records, verifies supported digital credential formats where possible, and maps prior coursework against target university requirements.</p>
            <div className="hero-actions">
              <Link href="/login" className="landing-primary" data-testid="link-try-verifee-hero">Try Verifee <ArrowRight size={16} /></Link>
              <a href="#how-it-works" className="landing-text-link" data-testid="link-see-how-it-works">See how it works <ArrowDown size={14} /></a>
            </div>
            <div className="hero-assurance"><span className="assurance-mark"><Check size={13} /></span> A clearer first look before formal review</div>
          </div>
          <div className="hero-document" aria-label="Illustrative academic record interpretation preview">
            <div className="document-topline"><span>RECORD OVERVIEW</span><span className="document-ref">VF—0248</span></div>
            <div className="document-rule" />
            <div className="document-institution"><span className="institution-seal"><Landmark size={19} /></span><div><span className="doc-label">ISSUING INSTITUTION</span><strong>University of Cape Coast</strong><small>Ghana · 4-year bachelor’s degree</small></div></div>
            <div className="document-field-grid"><div><span className="doc-label">QUALIFICATION</span><strong>BSc, Computer Science</strong></div><div><span className="doc-label">RECORD TYPE</span><strong>Academic transcript</strong></div></div>
            <div className="document-course-head"><span>COURSEWORK</span><span>INTERPRETATION</span></div>
            <div className="document-course"><span>Calculus II</span><span className="document-status"><i /> Identified</span></div>
            <div className="document-course"><span>Data Structures</span><span className="document-status"><i /> Identified</span></div>
            <div className="document-course"><span>Probability &amp; Statistics</span><span className="document-status"><i /> Identified</span></div>
            <div className="document-foot"><span><ScanText size={14} /> Academic interpretation</span><span>Preliminary</span></div>
            <div className="document-caption"><span className="caption-line" />A record, with context.</div>
          </div>
        </div>
        <div className="hero-bottomline"><span>FOR STUDENTS &amp; UNIVERSITY TEAMS</span><span>Clarity across education systems <span className="bottomline-dot">·</span> Careful by design</span></div>
      </section>
      <section className="landing-capabilities" id="how-it-works" aria-labelledby="capabilities-heading">
        <div className="section-intro">
          <div className="landing-eyebrow"><span className="eyebrow-rule" /> A thoughtful first pass</div>
          <h2 id="capabilities-heading">From records to <em>understanding.</em></h2>
          <p>Academic systems differ. The questions students and reviewers need answered are often the same.</p>
        </div>
        <div className="capability-list">
          <article className="capability-item">
            <div className="capability-index">01</div><div className="capability-icon"><ShieldAlert size={19} /></div>
            <div className="capability-copy"><h3>Verify where possible</h3><p>Check supported digital credentials such as OpenCerts and European Digital Credentials.</p></div><span className="capability-note">SUPPORTED FORMATS</span>
          </article>
          <article className="capability-item">
            <div className="capability-index">02</div><div className="capability-icon"><ScanText size={19} /></div>
            <div className="capability-copy"><h3>Interpret academic records</h3><p>Normalize degrees, courses, credits, grades, and education-system information.</p></div><span className="capability-note">RECORD CONTEXT</span>
          </article>
          <article className="capability-item">
            <div className="capability-index">03</div><div className="capability-icon"><GraduationCap size={20} /></div>
            <div className="capability-copy"><h3>Map academic preparation</h3><p>Compare prior coursework against a target graduate program and identify covered areas, partial matches, potential gaps, and insufficient evidence.</p></div><span className="capability-note">PROGRAM ALIGNMENT</span>
          </article>
        </div>
      </section>
      <section className="landing-positioning">
        <div className="positioning-label"><span className="positioning-emblem"><BookOpen size={17} /></span><span>THE ROLE OF VERIFEE</span></div>
        <div className="positioning-content"><h2>Built for preliminary academic review</h2><p>Verifee helps students and university teams understand academic preparation before formal credential evaluation or final admissions review.</p><div className="positioning-boundary"><span className="boundary-mark">i</span><span>Verifee does not replace official credential evaluators or university admissions decisions.</span></div></div>
        <div className="positioning-side-note">CONTEXT BEFORE<br />CONCLUSIONS</div>
      </section>
      <section className="landing-bottom-cta">
        <div><div className="landing-eyebrow"><span className="eyebrow-rule" /> Begin with a credential</div><h2>Make the next review<br /><em>more informed.</em></h2></div>
        <div className="bottom-cta-action"><p>Start with an academic record and a program in mind.</p><Link href="/login" className="landing-primary" data-testid="link-try-verifee-bottom">Try Verifee <ArrowRight size={16} /></Link></div>
      </section>
    </main>
    <footer className="landing-footer"><Link href="/" className="brand"><span className="brand-mark"><BookOpen size={15} /></span><span>verifee</span></Link><span>Preliminary academic interpretation, with care.</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Back to top <ArrowUpRight size={13} /></a></footer>
  </div>;
}
function Review() {
  const [, setLocation] = useLocation();
  const fileName = sessionStorage.getItem('verifee-file-name');
  const isExtracted = sessionStorage.getItem('verifee-analysis-mode') === 'extracted';
  const academicRecord = useMemo(() => readAcademicRecord(), []);
  const languageDetection = useMemo(() => readStoredLanguageDetection(), []);
  const extractedRecord = isExtracted ? academicRecord : null;
  const reviewRecord = academicRecord || createSampleAcademicRecord();
  const [visibleCourseCount, setVisibleCourseCount] = useState(() => {
    const saved = Number(sessionStorage.getItem('verifee-visible-course-count'));
    return Number.isInteger(saved) && saved >= 10 ? saved : 10;
  });
  useEffect(() => { if (!fileName || sessionStorage.getItem('verifee-started') !== 'yes') setLocation('/start'); }, [fileName, setLocation]);
  useEffect(() => { if (isExtracted && !extractedRecord) setLocation('/start'); }, [isExtracted, extractedRecord, setLocation]);
  const format = sessionStorage.getItem('verifee-file-format') || 'PDF transcript';
  const verificationStatus = (sessionStorage.getItem('verifee-verification-status') || 'Verification unavailable') as CredentialVerification['status'];
  const verificationExplanation = sessionStorage.getItem('verifee-verification-explanation') || 'No independent verification source is connected in this demonstration.';
  const credentialFields: [string, string][] = [
    ['Institution', displayTranscriptValue(reviewRecord.institution.name)],
    ['Country', displayTranscriptValue(reviewRecord.institution.country)],
    ['Degree / qualification', displayTranscriptValue(reviewRecord.credential.degree)],
    ['Program', displayTranscriptValue(reviewRecord.credential.program)],
    ['Field of study', displayTranscriptValue(reviewRecord.credential.fieldOfStudy)],
    ['Graduation date', displayTranscriptValue(reviewRecord.credential.graduationDate)],
    ['Credit / unit system', displayTranscriptValue(reviewRecord.academicRecord.creditSystem)],
    ['Cumulative GPA', displayTranscriptValue(reviewRecord.academicRecord.cumulativeGPA)],
  ];
  const courseRows = reviewRecord.academicRecord.courses;
  const courseCount = courseRows.length;
  const visibleCourseRows = courseRows.slice(0, visibleCourseCount);
  const showMoreCourses = () => {
    const nextCount = Math.min(visibleCourseCount + 10, courseCount);
    setVisibleCourseCount(nextCount);
    sessionStorage.setItem('verifee-visible-course-count', String(nextCount));
  };
  return <div className="shell"><Header /><main className="page-wrap wizard-wrap">
    <Stepper current={2} />
    <section className="wizard-card">
      <div className="eyebrow">Step 2 of 5</div>
      <h1 className="wizard-title">Verify &amp; review</h1>
      <p className="wizard-intro">Review the academic details before choosing a target. Reading a transcript does not establish that it is authentic.</p>
      <div className="review-disclosure"><AlertCircle size={17} /><span>{isExtracted
        ? <><strong>Academic details extracted from the PDF.</strong> “{fileName || 'Selected credential'}” was processed for this review and was not stored by Verifee. No authenticity check was performed.</>
        : <><strong>Sample record shown for demonstration.</strong> “{fileName || 'Selected credential'}” was not parsed or saved. No authenticity check was performed.</>}</span></div>
      <section className="review-section" aria-labelledby="format-heading">
        <div className="section-title"><h2 id="format-heading">Credential format</h2><span className="small-label">Selected file</span></div>
        <div className="format-summary"><span className="format-summary-type">{format}</span><span className="format-summary-name">{fileName || 'Selected credential'}</span></div>
      </section>
      <section className="review-section" aria-labelledby="verification-heading">
        <div className="section-title"><h2 id="verification-heading">Verification status</h2></div>
        <div className="verification-review"><ShieldAlert size={18} /><div><span className="status-pill" data-testid="status-verification">{verificationStatus}</span><p>{verificationExplanation}</p></div></div>
      </section>
      <section className="review-section" aria-labelledby="interpretation-status-heading">
        <div className="section-title"><h2 id="interpretation-status-heading">Academic interpretation</h2></div>
        <div className="verification-review"><Check size={18} /><div><span className="status-pill" data-testid="status-academic-interpretation">{isExtracted ? 'Available' : 'Sample only'}</span><p>{isExtracted ? 'The values below were extracted from the PDF. Missing or unreadable details are shown as not present in the transcript.' : 'The values below are sample data and were not extracted from the selected file.'}</p></div></div>
      </section>
      {isExtracted && languageDetection && <section className="review-section" aria-labelledby="language-detection-heading">
        <div className="section-title"><h2 id="language-detection-heading">Language detection</h2></div>
        <LanguageDetectionCard detection={languageDetection} />
      </section>}
      <section className="review-section" aria-labelledby="credential-heading">
        <div className="section-title"><h2 id="credential-heading">Credential details</h2><span className="small-label">{isExtracted ? 'Extracted from PDF' : 'Sample record'}</span></div>
        <div className="credential-grid">{credentialFields.map(([label, value]) => <div key={label}><span className="data-label">{label}</span><span className="data-value">{value}</span></div>)}</div>
      </section>
      <section className="review-section" aria-labelledby="courses-heading">
        <div className="section-title"><h2 id="courses-heading">Courses detected</h2><span className="small-label">{courseCount} {isExtracted ? 'extracted' : 'in sample record'}</span></div>
        {courseRows.length > 0
          ? <><div style={{overflowX:'auto'}}><table className="course-table"><thead><tr><th>Code</th><th>Course title</th><th>Credits / units</th><th>Grade</th><th>Description / outcomes</th></tr></thead><tbody>{visibleCourseRows.map((course, index) => <tr key={`${course.code || 'course'}-${index}`}><td className="course-code">{course.code || '—'}</td><td>{course.title || (isExtracted ? 'Not shown in transcript' : '—')}</td><td>{course.credits || '—'}</td><td>{course.grade || '—'}</td><td>{course.description || '—'}</td></tr>)}</tbody></table></div><div className="course-pagination"><span>Showing {Math.min(visibleCourseCount, courseCount)} of {courseCount} courses</span>{visibleCourseCount < courseCount && <button className="secondary-btn" type="button" onClick={showMoreCourses} data-testid="button-show-more-courses">Show next 10 courses</button>}</div></>
          : <p className="form-note">No course rows were readable in this transcript. Review the other extracted fields before proceeding.</p>}
      </section>
      <div className="wizard-actions"><button className="secondary-btn" type="button" onClick={() => setLocation('/start')}><ArrowLeft size={14} /> Back to upload</button><button className="cta wizard-next" type="button" onClick={() => setLocation('/target')} data-testid="button-continue-target"><span>Continue to target selection</span><ArrowRight size={16} /></button></div>
    </section>
    <Disclaimer />
  </main></div>;
}
function TargetSelection() {
  const [, setLocation] = useLocation();
  const isExtracted = sessionStorage.getItem('verifee-analysis-mode') === 'extracted';
  const [programId, setProgramId] = useState(() => {
    const saved = sessionStorage.getItem('verifee-program');
    return georgiaTechDataset.programs.some((item) => item.id === saved) ? saved! : georgiaTechDataset.programs[0].id;
  });
  const program = georgiaTechDataset.programs.find((item) => item.id === programId) || georgiaTechDataset.programs[0];
  useEffect(() => { if (sessionStorage.getItem('verifee-started') !== 'yes') setLocation('/start'); }, [setLocation]);
  const changeProgram = (value: string) => {
    setProgramId(value);
    sessionStorage.setItem('verifee-program', value);
    if (value !== programId) sessionStorage.removeItem('verifee-generated-report');
    if (sessionStorage.getItem('verifee-mapping-result')) {
      const saved = readStoredMapping(value);
      if (!saved) sessionStorage.removeItem('verifee-mapping-result');
    }
  };
  const continueToMapping = () => {
    sessionStorage.setItem('verifee-program', program.id);
    setLocation('/report');
  };
  return <div className="shell"><Header /><main className="page-wrap wizard-wrap">
    <Stepper current={3} />
    <section className="wizard-card target-card">
      <div className="eyebrow">Step 3 of 5</div>
      <h1 className="wizard-title">Choose what you want to compare against</h1>
        <p className="wizard-intro">{isExtracted ? 'Choose the Georgia Tech program to compare with the complete extracted academic record. The mapping request uses the extracted JSON, not the PDF file.' : 'Choose the Georgia Tech program to compare with the synthetic sample academic record.'}</p>
      <div className="target-form">
        <div className="target-field"><span className="field-label">Institution</span><div className="institution-value"><span className="institution-mark">GT</span><span>{georgiaTechDataset.institution.name}</span></div></div>
        <div className="target-field"><label className="field-label" htmlFor="target-program">Target program</label><select id="target-program" className="target-select" value={program.id} onChange={(event) => changeProgram(event.target.value)} data-testid="select-program">{georgiaTechDataset.programs.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
      </div>
      <div className="program-summary">
        <div className="program-meta"><span>{program.school}</span><span>{formatRequirementType(program.requirementType)}</span></div>
        <p>{program.description}</p>
      </div>
      <section className="program-requirements" aria-labelledby="stored-requirements-heading">
        <div className="section-title"><h2 id="stored-requirements-heading">Stored background requirements</h2><span className="small-label">{program.requirements.length} criteria</span></div>
        <div className="program-requirement-list">{program.requirements.map((requirement) => {
          const evidenceTypes = getEvidenceTypes(requirement);
          return <article className="program-requirement" key={requirement.id}>
            <div className="program-requirement-head"><h3>{requirement.name}</h3><span className="importance-pill">{formatImportance(requirement.importance)}</span></div>
            <p className="program-requirement-meta">{requirement.category.replaceAll('_', ' ')}</p>
            <p className="program-requirement-concepts"><strong>Matching concepts:</strong> {requirement.matchingConcepts.join(', ')}</p>
            {evidenceTypes.length > 0 && <p className="program-requirement-concepts"><strong>Evidence types:</strong> {evidenceTypes.map((item) => item.replaceAll('_', ' ')).join(', ')}</p>}
          </article>;
        })}</div>
      </section>
        <p className="form-note">Program requirements, importance, and matching concepts come only from the stored Georgia Tech definition; not every criterion is a mandatory admissions prerequisite. The mapping will use all course rows in the reviewed academic record.</p>
      <div className="wizard-actions"><button className="secondary-btn" type="button" onClick={() => setLocation('/analysis')}><ArrowLeft size={14} /> Back to review</button><button className="cta wizard-next" type="button" onClick={continueToMapping} data-testid="button-generate-mapping"><span>Generate preliminary mapping</span><ArrowRight size={16} /></button></div>
    </section>
    <Disclaimer />
  </main></div>;
}
const mappingStatusLabels: Record<AcademicMappingResult['requirements'][number]['status'], string> = {
  COVERED: 'Covered',
  PARTIALLY_COVERED: 'Partially covered',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  POTENTIAL_GAP: 'Potential gap',
};

function Status({ status }: { status: AcademicMappingResult['requirements'][number]['status'] }) {
  const cls = status === 'COVERED' ? 'good' : status === 'POTENTIAL_GAP' ? 'gap' : 'review';
  return <span className={`status-pill ${cls}`} data-testid={`status-mapping-${status.toLowerCase().replaceAll('_', '-')}`}>{mappingStatusLabels[status]}</span>;
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function SourceLinks({ sources }: { sources: AcademicMappingResult['courseEvidence'][number]['sources'] }) {
  if (sources.length === 0) return null;
  return <ul className="mapping-sources">{sources.map((source) => <li key={source.url}>
    <a href={source.url} target="_blank" rel="noreferrer" data-testid="link-official-course-source">
      <ExternalLink size={12} /> {source.title || sourceHost(source.url)}
    </a>
  </li>)}</ul>;
}

type RequirementMapping = AcademicMappingResult['requirements'][number];
type CourseEvidence = AcademicMappingResult['courseEvidence'][number];

const confidenceExplanations: Record<RequirementMapping['confidence'], string> = {
  HIGH: 'Based on detailed, directly relevant evidence.',
  MEDIUM: 'The evidence is clear but incomplete.',
  LOW: 'The available details are sparse or unavailable.',
};

function RequirementCard({
  match,
  courseEvidenceByIndex,
  expanded,
  onToggle,
}: {
  match: RequirementMapping;
  courseEvidenceByIndex: ReadonlyMap<number, CourseEvidence>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const triggerId = `mapping-trigger-${match.requirementId}`;
  const contentId = `mapping-content-${match.requirementId}`;

  return <article className="mapping-card" data-testid={`mapping-${match.requirementId}`}>
    <button
      className="mapping-card-trigger"
      id={triggerId}
      type="button"
      aria-expanded={expanded}
      aria-controls={contentId}
      onClick={onToggle}
      data-testid={`toggle-mapping-${match.requirementId}`}
    >
      <span className="mapping-card-heading">
        <span className="mapping-course">{match.requirementName}</span>
        <span className="mapping-desc">{match.category.replaceAll('_', ' ')} · {formatImportance(match.importance)}</span>
      </span>
      <span className="mapping-card-badges">
        <Status status={match.status} />
        <span className={`confidence-pill ${match.confidence.toLowerCase()}`}>{match.confidence} confidence</span>
        <ChevronRight className="mapping-card-chevron" size={16} style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} aria-hidden="true" />
      </span>
    </button>
    <div
      className="mapping-card-content"
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      hidden={!expanded}
    >
      <section className="mapping-detail-section">
        <h3 className="mapping-detail-title">Relevant prior coursework</h3>
        {match.candidateCourses.length > 0
          ? <div className="candidate-course-list">{match.candidateCourses.map((candidate) => {
            const evidence = courseEvidenceByIndex.get(candidate.courseIndex);
            return <div className="candidate-course" key={`${match.requirementId}-${candidate.courseIndex}`}>
              <div className="candidate-course-head">
                <strong>{candidate.code || 'Course code not shown'}{candidate.title ? ` · ${candidate.title}` : ''}</strong>
                <span className={`relevance-pill ${candidate.relevance === 'LIKELY_RELEVANT' ? 'likely' : 'possible'}`}>{candidate.relevance === 'LIKELY_RELEVANT' ? 'Likely relevant' : 'Possibly relevant'}</span>
              </div>
              {evidence?.transcriptDescription && <p><strong>Transcript description:</strong> {evidence.transcriptDescription}</p>}
              {candidate.evidence.length > 0 && <ul>{candidate.evidence.map((item, index) => <li key={`${candidate.courseIndex}-fact-${index}`}>{item}</li>)}</ul>}
              {!evidence?.transcriptDescription && candidate.evidence.length === 0 && <p>No detailed course description or official course findings were available.</p>}
              {evidence && <span className="research-status">{evidence.researchStatus.replaceAll('_', ' ').toLowerCase()}</span>}
            </div>;
          })}</div>
          : <p className="mapping-detail-copy">No course was shortlisted for this stored requirement.</p>}
      </section>
      <section className="mapping-detail-section">
        <h3 className="mapping-detail-title">Evidence found</h3>
        {match.evidence.length > 0
          ? <ul className="mapping-detail-copy">{match.evidence.map((item, index) => <li key={`${match.requirementId}-evidence-${index}`}>{item}</li>)}</ul>
          : <p className="mapping-detail-copy">No additional requirement-level evidence was recorded.</p>}
        <p className="stored-concepts"><strong>Stored matching concepts:</strong> {match.matchingConcepts.join(', ')}</p>
      </section>
      <section className="mapping-detail-section">
        <h3 className="mapping-detail-title">Reasoning</h3>
        <p className="mapping-detail-copy">{match.rationale}</p>
      </section>
      <section className="mapping-detail-section">
        <h3 className="mapping-detail-title">Confidence explanation</h3>
        <p className="mapping-detail-copy">{confidenceExplanations[match.confidence]} This is a preliminary assessment.</p>
      </section>
      <section className="mapping-detail-section">
        <h3 className="mapping-detail-title">Official source links</h3>
        {match.sources.length > 0
          ? <SourceLinks sources={match.sources} />
          : <p className="mapping-detail-copy">No official course source links were used for this requirement.</p>}
      </section>
    </div>
  </article>;
}

function Report() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState('ALL');
  const [expanded, setExpanded] = useState(true);
  const fileName = sessionStorage.getItem('verifee-file-name') || 'Selected credential';
  const isExtracted = sessionStorage.getItem('verifee-analysis-mode') === 'extracted';
  const started = sessionStorage.getItem('verifee-started') === 'yes';
  const academicRecord = useMemo(
    () => readAcademicRecord() ?? (isExtracted ? null : createSampleAcademicRecord()),
    [isExtracted],
  );
  const verificationStatus = (sessionStorage.getItem('verifee-verification-status') || 'Verification unavailable') as CredentialVerification['status'];
  const verificationExplanation = sessionStorage.getItem('verifee-verification-explanation') || 'No independent verification source is connected in this demonstration.';
  const savedProgramId = sessionStorage.getItem('verifee-program');
  const program = georgiaTechDataset.programs.find((item) => item.id === savedProgramId) || georgiaTechDataset.programs[0];
  const [mapping, setMapping] = useState<AcademicMappingResult | null>(() => readStoredMapping(program.id));
  const [academicContext, setAcademicContext] = useState<AcademicContext | null>(() => readStoredAcademicContext());
  const [contextLoading, setContextLoading] = useState(() => !readStoredAcademicContext());
  const [contextFailure, setContextFailure] = useState(false);
  const [institutionStatus, setInstitutionStatus] = useState<InstitutionStatusView | null>(() => readStoredInstitutionStatus());
  const [institutionStatusLoading, setInstitutionStatusLoading] = useState(() => !readStoredInstitutionStatus());
  const [mappingStage, setMappingStage] = useState<'context' | 'requirements' | 'complete'>(() => readStoredAcademicContext() ? 'requirements' : 'context');
  const [loading, setLoading] = useState(() => !readStoredMapping(program.id));
  const [mappingError, setMappingError] = useState('');
  const [progressRequirements, setProgressRequirements] = useState<RequirementMapping[]>([]);
  const [progressCourseEvidence, setProgressCourseEvidence] = useState<CourseEvidence[]>([]);
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(null);
  const currentMapping = mapping?.programId === program.id ? mapping : null;

  const requestInstitutionStatus = async (cancelled: () => boolean = () => false) => {
    if (!academicRecord) return;
    setInstitutionStatusLoading(true);
    let resolvedStatus: InstitutionStatusView;
    try {
      const input: InstitutionStatusInput = {
        institutionName: academicRecord.institution.name,
        jurisdiction: academicRecord.institution.country,
      };
      const candidate = await runInstitutionStatusCheck(input);
      const parsed = RunInstitutionStatusCheckResponse.safeParse(candidate);
      if (!parsed.success) throw new Error('The institution status response was invalid.');
      resolvedStatus = parsed.data;
    } catch {
      resolvedStatus = createUnavailableInstitutionStatus(academicRecord);
    }

    if (cancelled()) return;
    sessionStorage.setItem('verifee-institution-status', JSON.stringify(resolvedStatus));
    setInstitutionStatus(resolvedStatus);
    setInstitutionStatusLoading(false);
  };

  useEffect(() => {
    if (!started || !sessionStorage.getItem('verifee-file-name') || !academicRecord) setLocation('/start');
  }, [academicRecord, started, setLocation]);

  useEffect(() => {
    if (!started || !academicRecord) return;
    let cancelled = false;
    const cachedStatus = readStoredInstitutionStatus();
    if (cachedStatus) {
      setInstitutionStatus(cachedStatus);
      setInstitutionStatusLoading(false);
    } else {
      setInstitutionStatus(null);
      void requestInstitutionStatus(() => cancelled);
    }
    return () => { cancelled = true; };
  }, [academicRecord, started]);

  const ensureAcademicContext = async (cancelled: () => boolean = () => false): Promise<AcademicContext> => {
    const cachedContext = readStoredAcademicContext();
    if (cachedContext) {
      if (!cancelled()) {
        flushSync(() => {
          setAcademicContext(cachedContext);
          setContextLoading(false);
          setContextFailure(false);
          setMappingStage('requirements');
        });
      }
      return cachedContext;
    }

    if (!academicRecord) throw new Error('An academic record is required before mapping context.');
    setContextLoading(true);
    setContextFailure(false);
    setMappingStage('context');
    let resolvedContext: AcademicContext;
    let failed = false;

    try {
      const input: AcademicContextInput = {
        institution: academicRecord.institution,
        credential: academicRecord.credential,
      };
      const candidate = await runAcademicContext(input);
      const parsed = RunAcademicContextResponse.safeParse(candidate);
      if (!parsed.success) throw new Error('The academic context response was invalid.');
      resolvedContext = parsed.data;
      if (!cancelled()) {
        sessionStorage.setItem('verifee-academic-context', JSON.stringify(resolvedContext));
      }
    } catch {
      resolvedContext = createFallbackAcademicContext(academicRecord);
      failed = true;
    }

    if (!cancelled()) {
      flushSync(() => {
        setAcademicContext(resolvedContext);
        setContextLoading(false);
        setContextFailure(failed);
        setMappingStage('requirements');
      });
    }
    return resolvedContext;
  };

  const requestMapping = async (cancelled: () => boolean = () => false) => {
    if (!academicRecord) return;
    setLoading(true);
    setMappingError('');
    setProgressRequirements([]);
    setProgressCourseEvidence([]);
    setExpandedRequirementId(null);
    setMappingStage(academicContext ? 'requirements' : 'context');
    try {
      await ensureAcademicContext(cancelled);
      if (cancelled()) return;
      const request: AcademicMappingInput = {
        programId: program.id as AcademicMappingInput['programId'],
        record: academicRecord,
      };
      const result = await runAcademicMappingWithProgress(request, (snapshot) => {
        if (cancelled()) return;
        flushSync(() => {
          setProgressRequirements(snapshot.requirements);
          setProgressCourseEvidence(snapshot.courseEvidence);
        });
      });
      const parsed = RunAcademicMappingResponse.safeParse(result);
      if (!parsed.success || parsed.data.programId !== program.id) {
        throw new Error('The mapping response did not match the selected program.');
      }
      if (cancelled()) return;
      sessionStorage.setItem('verifee-mapping-result', JSON.stringify(parsed.data));
      setMapping(parsed.data);
      setMappingStage('complete');
    } catch {
      if (!cancelled()) {
        setMappingError('The preliminary mapping could not be completed. Your academic record is still saved in this browser session; retry without uploading the PDF again.');
      }
    } finally {
      if (!cancelled()) setLoading(false);
    }
  };

  useEffect(() => {
    if (!started || !academicRecord) return;
    let cancelled = false;
    const cached = readStoredMapping(program.id);
    if (cached) {
      setMapping(cached);
      setMappingError('');
      setProgressRequirements([]);
      setProgressCourseEvidence([]);
      setExpandedRequirementId(null);
      setLoading(false);
      setMappingStage('complete');
      const cachedContext = readStoredAcademicContext();
      if (cachedContext) {
        setAcademicContext(cachedContext);
        setContextLoading(false);
        setContextFailure(false);
      } else {
        void ensureAcademicContext(() => cancelled);
      }
    } else {
      setMapping(null);
      void requestMapping(() => cancelled);
    }
    return () => { cancelled = true; };
  }, [academicRecord, program.id, started]);

  const retryMapping = () => {
    sessionStorage.removeItem('verifee-mapping-result');
    sessionStorage.removeItem('verifee-generated-report');
    void requestMapping();
  };

  const reset = () => {
    clearVerifeeSession();
    setLocation('/start');
  };

  const showPartialMapping = loading || (Boolean(mappingError) && progressRequirements.length > 0);
  const requirements = showPartialMapping
    ? progressRequirements
    : currentMapping?.requirements ?? [];
  const visibleRequirements = requirements.filter((item) => filter === 'ALL' || item.status === filter);
  const courseEvidence = showPartialMapping
    ? progressCourseEvidence
    : currentMapping?.courseEvidence ?? [];
  const courseEvidenceByIndex = new Map(courseEvidence.map((item) => [item.courseIndex, item]));
  const counts = {
    covered: requirements.filter((item) => item.status === 'COVERED').length,
    partial: requirements.filter((item) => item.status === 'PARTIALLY_COVERED').length,
    potentialGap: requirements.filter((item) => item.status === 'POTENTIAL_GAP').length,
    insufficient: requirements.filter((item) => item.status === 'INSUFFICIENT_EVIDENCE').length,
  };
  const demoRecord = academicRecord?.institution.name?.trim().toLowerCase() === 'verifee demo university';
  const sourceSummary = demoRecord
    ? 'The synthetic demo record uses embedded course descriptions; web research is skipped for this institution.'
    : currentMapping?.courseEvidence.length === 0
      ? 'No courses were shortlisted, so course-source research was not started.'
    : currentMapping?.officialUniversityDomain
      ? `Course research was restricted to university-controlled pages on ${currentMapping.officialUniversityDomain}.`
      : 'An official issuing-institution domain could not be confirmed. Available transcript descriptions are used without third-party course sources.';

  const statusFilters = [
    { value: 'ALL', label: 'All requirements' },
    { value: 'COVERED', label: 'Covered' },
    { value: 'PARTIALLY_COVERED', label: 'Partially covered' },
    { value: 'POTENTIAL_GAP', label: 'Potential gap' },
    { value: 'INSUFFICIENT_EVIDENCE', label: 'Insufficient evidence' },
  ];
  const allRequirementsCompleted = program.requirements.length > 0 && requirements.length === program.requirements.length;
  const showMappingProgress = loading || Boolean(currentMapping) || Boolean(mappingError);
  const progressPercent = program.requirements.length > 0
    ? Math.min(100, Math.round((requirements.length / program.requirements.length) * 100))
    : 0;

  return <div className="shell"><Header /><main className="page-wrap report-page">
    <Stepper current={4} />
    <div className="report-top">
      <div>
        <div className="eyebrow">Step 4 of 5 · Academic mapping</div>
        <h1 className="report-title">Academic mapping</h1>
        <p className="report-lede">Course-by-course evidence compared with the stored {program.shortName} background requirements.</p>
      </div>
      <div className="report-actions">
        <button className="secondary-btn" type="button" onClick={() => setLocation('/target')}><ArrowLeft size={14} /> Change target</button>
        <button className="secondary-btn" type="button" onClick={reset} data-testid="button-new-analysis"><RotateCcw size={14} /> New analysis</button>
      </div>
    </div>
    <section className="report-verification" data-testid="card-verification">
      <div className="report-verification-top"><p className="verify-heading"><ShieldAlert size={16} color="#8a764d" /> Overall credential verification</p><span className="status-pill" data-testid="status-verification">{verificationStatus}</span></div>
      <p className="verify-copy">{verificationExplanation} Verification is separate from academic interpretation and course mapping.</p>
    </section>
    <section
      className="report-verification institution-status-card"
      aria-live="polite"
      aria-busy={institutionStatusLoading}
      data-testid="card-institution-status"
    >
      <div className="report-verification-top">
        <p className="verify-heading"><Landmark size={16} color="#55766c" /> Institution status check</p>
        <span className="status-pill review" data-testid="status-institution-registry">
          {institutionStatusLoading ? 'Checking registry…' : institutionStatus ? institutionStatusLabel(institutionStatus.status) : 'Unable to check'}
        </span>
      </div>
      {institutionStatus ? <>
        <p className="verify-copy">{institutionStatus.summary}</p>
        <dl className="institution-status-details">
          <div>
            <dt>Jurisdiction</dt>
            <dd>{institutionStatus.jurisdiction || 'Not stated in the transcript'}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {institutionStatus.sourceName
                ? institutionStatus.sourceUrl
                  ? <a href={institutionStatus.sourceUrl} target="_blank" rel="noreferrer noopener" data-testid="institution-status-source-link">{institutionStatus.sourceName} <ExternalLink size={12} /></a>
                  : institutionStatus.sourceName
                : 'No supported registry source was checked for this jurisdiction.'}
            </dd>
          </div>
          {institutionStatus.matchedName && <div>
            <dt>Registry entry</dt>
            <dd>{institutionStatus.matchedName}</dd>
          </div>}
          {institutionStatus.registryStatus && <div>
            <dt>Registry status</dt>
            <dd>{institutionStatus.registryStatus}</dd>
          </div>}
          <div>
            <dt>Checked</dt>
            <dd>{formatInstitutionStatusTime(institutionStatus.checkedAt)}</dd>
          </div>
        </dl>
        <p className="institution-status-coverage"><strong>Coverage limits:</strong> {institutionStatus.coverageLimits}</p>
        <p className="academic-context-disclaimer">This source-scoped listing check is separate from credential authenticity, academic mapping, and admissions decisions.</p>
        {institutionStatus.status === 'UNABLE_TO_CHECK' && <button
          className="institution-status-retry"
          type="button"
          onClick={() => void requestInstitutionStatus()}
          disabled={institutionStatusLoading}
          data-testid="button-retry-institution-status"
        >Retry status check</button>}
      </> : <div className="academic-context-loading" role="status" data-testid="status-institution-check-loading">
        <LoaderCircle size={15} className="animate-spin" /> Checking the supported institution registry…
      </div>}
    </section>
    <div className="preliminary" data-testid="notice-preliminary"><AlertCircle size={16} /><span>
      <strong>{isExtracted ? 'Preliminary mapping of extracted academic details.' : 'Preliminary mapping of the synthetic demo record.'}</strong>{' '}
      {isExtracted
        ? `“${fileName}” was used only for extraction. This mapping request contains the extracted academic JSON, not the PDF.`
        : `“${fileName}” was not parsed; this mapping uses only the separately labeled synthetic sample record.`}
    </span></div>
    <div className="report-grid">
      <div className="report-main">
        <section className="panel section-card academic-context-card" aria-live="polite" aria-busy={contextLoading} data-testid="card-academic-context">
          <div className="section-title">
            <div>
              <h2>Mapped Academic Context</h2>
              <p className="form-note mapping-section-note">Transcript facts and contextual mappings are labeled separately.</p>
            </div>
            <span className="small-label">{contextLoading ? 'Contextualizing' : contextFailure ? 'Context unavailable' : 'Preliminary context'}</span>
          </div>
          {academicContext ? <div className="academic-context-grid">
            {[
              { label: 'Institution', field: academicContext.institution },
              { label: 'Country / education system', field: academicContext.country },
              { label: 'Broad field', field: academicContext.broadField },
              { label: 'Specific discipline', field: academicContext.specificDiscipline },
              { label: 'Program', field: academicContext.program },
            ].map(({ label, field }) => <div className="academic-context-item" key={label}>
              <span className="data-label">{label}</span>
              <span className="data-value">{field.value}</span>
              <span className="academic-context-source">
                {academicContextSourceLabel(field.source)}
                {field.sourceUrl && <a href={field.sourceUrl} target="_blank" rel="noreferrer noopener" className="academic-context-link">View institution source <ExternalLink size={11} /></a>}
              </span>
            </div>)}
            <div className="academic-context-item">
              <span className="data-label">Target</span>
              <span className="data-value">{program.school} — {program.shortName}</span>
              <span className="academic-context-source">Selected in Step 3</span>
            </div>
          </div> : <div className="academic-context-loading" role="status" data-testid="status-academic-context-loading">
            <LoaderCircle size={15} className="animate-spin" /> Contextualizing academic record…
          </div>}
          {contextFailure && <p className="academic-context-note" role="status">Contextualization was unavailable. Requirement mapping still uses the original extracted academic JSON.</p>}
          {!contextFailure && academicContext && academicContext.status !== 'MAPPED' && <p className="academic-context-note">Some fields could not be confidently mapped from the available transcript or official institution source.</p>}
          <p className="academic-context-disclaimer">This context is informational only and does not verify credential authenticity.</p>
        </section>

        <section className="panel section-card" aria-live="polite">
          <div className="section-title">
            <div><h2>Program requirement mapping</h2><p className="form-note mapping-section-note">The selected program’s stored requirements are compared with extracted courses and available evidence.</p></div>
            <button className="remove-file" type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse program mappings' : 'Expand program mappings'} data-testid="button-toggle-mappings"><ChevronRight size={18} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} /></button>
          </div>
          {expanded && <>
            <details className="source-details"><summary>Stored program source</summary><p>{program.source.title}</p><span>Last checked: {program.source.lastChecked}</span></details>
            {showMappingProgress && <div
              className="mapping-loading"
              role="status"
              data-testid={loading ? 'status-mapping-loading' : allRequirementsCompleted && !mappingError ? 'status-mapping-complete' : 'status-mapping-progress'}
            >
              {mappingError
                ? <AlertCircle size={18} />
                : allRequirementsCompleted
                  ? <Check size={18} />
                  : <LoaderCircle size={18} className="animate-spin" />}
              <div>
                <strong>{mappingError ? 'Mapping did not finish' : allRequirementsCompleted ? 'Academic mapping complete' : mappingStage === 'context' ? 'Mapping academic record…' : 'Mapping academic requirements…'}</strong>
                {loading && mappingStage === 'context' && !mappingError
                  ? <div className="mapping-context-stage" data-testid="mapping-stage-context">
                    <strong>Stage 1 of 2 · Contextualizing academic record</strong>
                    <p>Requirement evaluation starts after academic context has been mapped.</p>
                  </div>
                  : <>
                    <div className="mapping-progress-count" data-testid="mapping-progress-count">
                      <strong>{requirements.length} of {program.requirements.length} requirements mapped</strong>
                      <span>{mappingError ? 'Mapping stopped' : allRequirementsCompleted ? 'All requirements completed' : 'Stage 2 of 2 · Evaluating target requirements'}</span>
                    </div>
                    <div className="mapping-progress-meter">
                      <div
                        className="mapping-progress-bar"
                        role="progressbar"
                        aria-label="Requirements mapped"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPercent}
                        aria-valuetext={`${requirements.length} of ${program.requirements.length} requirements mapped, ${progressPercent}%`}
                        data-testid="mapping-progress-bar"
                      >
                        <span className="mapping-progress-fill" style={{ width: `${progressPercent}%` }} />
                      </div>
                      <span className="mapping-progress-percent">{progressPercent}%</span>
                    </div>
                    <p>{mappingError
                      ? 'Your academic record is saved. Retry without uploading the PDF again.'
                      : allRequirementsCompleted
                        ? 'All stored requirements have been compared. Review the result cards below.'
                        : 'Shortlisting courses, checking official course sources where available, and comparing each stored requirement.'}</p>
                  </>}
              </div>
            </div>}
            {mappingError && <div className="mapping-error" role="alert" data-testid="status-mapping-error"><div><strong>Mapping did not finish</strong><p>{mappingError}</p></div><button className="secondary-btn" type="button" onClick={retryMapping} disabled={loading} data-testid="button-retry-mapping"><RotateCcw size={14} /> Retry mapping</button></div>}
            {currentMapping && !showPartialMapping && <>
              <p className="source-claim">{sourceSummary}</p>
              {currentMapping.retryable && !mappingError && <div className="mapping-error mapping-partial-error" role="status" data-testid="status-partial-mapping">
                <div><strong>Some mapping steps were incomplete</strong><p>Results for other requirements are still shown. Retry using the saved academic record; no re-upload is needed.</p></div>
                <button className="secondary-btn" type="button" onClick={retryMapping} disabled={loading} data-testid="button-retry-partial-mapping"><RotateCcw size={14} /> Retry mapping</button>
              </div>}
            </>}
            {(requirements.length > 0 || (currentMapping && !loading && !showPartialMapping)) && <>
              {showPartialMapping && requirements.length > 0 && requirements.length < program.requirements.length && <p className="mapping-progress-note">Completed requirement results are shown below while the remaining requirements continue processing.</p>}
              <div className="mapping-filter" role="group" aria-label="Filter requirement results">{statusFilters.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className="secondary-btn" style={{ padding: '7px 10px', fontSize: 10, background: filter === item.value ? '#eaf1ed' : '#fff', borderColor: filter === item.value ? '#a9c1b6' : undefined }} data-testid={`filter-${item.label.toLowerCase().replaceAll(' ', '-')}`}>{item.label}</button>)}</div>
              <div className="mapping-card-list">{visibleRequirements.map((match) => <RequirementCard
                key={match.requirementId}
                match={match}
                courseEvidenceByIndex={courseEvidenceByIndex}
                expanded={expandedRequirementId === match.requirementId}
                onToggle={() => setExpandedRequirementId((current) => current === match.requirementId ? null : match.requirementId)}
              />)}{visibleRequirements.length === 0 && <p className="form-note">No requirements have this result.</p>}</div>
            </>}
          </>}
        </section>
      </div>
      <aside className="report-side">
        <section className="panel section-card">
          <p className="report-aside-title">Mapping overview</p>
          <div className="summary-number">{requirements.length}</div>
          <div className="summary-caption">{showPartialMapping ? `of ${program.requirements.length} requirements mapped` : `Stored ${program.shortName} criteria reviewed`}</div>
          {currentMapping && !showPartialMapping && <div className="result-counts">
            <div><strong>{counts.covered}</strong><span>Covered</span></div>
             <div><strong>{counts.partial}</strong><span>Partially Covered</span></div>
             <div><strong>{counts.potentialGap}</strong><span>Potential Gaps</span></div>
             <div><strong>{counts.insufficient}</strong><span>Insufficient Evidence</span></div>
          </div>}
        </section>
        <section className="panel section-card"><p className="report-aside-title">Selected target program</p><p className="mapping-course">{program.name}</p><span className="data-label">{program.school}</span><p className="form-note"><strong>Requirement type:</strong> {formatRequirementType(program.requirementType)}</p><p className="form-note">{program.description}</p></section>
        <section className="panel section-card"><p className="report-aside-title">Items requiring review</p><ul className="review-list"><li><span className="review-dot" />Confirm detailed course coverage with official catalog pages, syllabi, or learning outcomes.</li><li><span className="review-dot" />Confirm grading scale, credit units, and instructional hours with the issuing institution.</li><li><span className="review-dot" />Verify the credential independently; no verification was performed here.</li><li><span className="review-dot" />These preliminary mappings are not admissions, approval, equivalency, or transfer-credit decisions.</li></ul></section>
      </aside>
    </div>
    {currentMapping && !loading && !mappingError && allRequirementsCompleted && !currentMapping.retryable && !contextLoading && !institutionStatusLoading && <div className="report-finalize-cta" data-testid="card-generate-verifee-report">
      <div>
        <span className="small-label">Analysis complete</span>
        <p>Continue to a downloadable report built from these completed results.</p>
      </div>
      <button className="cta" type="button" onClick={() => setLocation('/final-report')} data-testid="button-open-verifee-report">
        <span>Generate Verifee Report</span><ArrowRight size={16} />
      </button>
    </div>}
    <div className="report-disclaimer">Verifee provides preliminary academic interpretation and mapping. It is not an official admissions decision, credential equivalency, or transfer-credit determination.</div>
  </main></div>;
}

function FinalReport() {
  const [, setLocation] = useLocation();
  const started = sessionStorage.getItem('verifee-started') === 'yes';
  const reportData = useMemo(() => {
    const fileName = sessionStorage.getItem('verifee-file-name');
    const record = readAcademicRecord();
    const programId = sessionStorage.getItem('verifee-program');
    const program = georgiaTechDataset.programs.find((item) => item.id === programId);
    if (!started || !fileName || !record || !program) return null;

    const mapping = readStoredMapping(program.id);
    if (
      !mapping ||
      mapping.retryable ||
      mapping.requirements.length !== program.requirements.length
    ) {
      return null;
    }

    const context = readStoredAcademicContext() ?? createFallbackAcademicContext(record);
    const checkedInstitutionStatus = readStoredInstitutionStatus()
      ?? createUnavailableInstitutionStatus(
        record,
        'The institution status check was not stored in this session. No institution status was inferred.',
      );
    return buildVerifeeReportData({
      record,
      context,
      mapping,
      program,
      targetInstitution: georgiaTechDataset.institution.name,
      verificationStatus:
        sessionStorage.getItem('verifee-verification-status') || 'Verification unavailable',
      verificationExplanation:
        sessionStorage.getItem('verifee-verification-explanation') ||
        'No independent credential verification was performed.',
      verificationMethod: sessionStorage.getItem('verifee-verification-method'),
      fileFormat: sessionStorage.getItem('verifee-file-format') || 'PDF transcript',
      institutionStatus: {
        ...checkedInstitutionStatus,
        checkedAt: checkedInstitutionStatus.checkedAt.toISOString(),
      },
    });
  }, [started]);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReportMetadata | null>(() => {
    const identity = readStoredGeneratedReport();
    return identity && reportData
      ? createGeneratedReportMetadata(reportData, identity)
      : null;
  });
  const [savedReports, setSavedReports] = useState<DemoSavedReport[]>(readDemoSavedReports);
  const [saveConflict, setSaveConflict] = useState<DemoSavedReport | null>(null);
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    if (!reportData) setLocation(started ? '/report' : '/start');
  }, [reportData, setLocation, started]);
  useEffect(() => {
    if (generatedReport) {
      sessionStorage.setItem('verifee-generated-report', JSON.stringify(generatedReport));
    }
  }, [generatedReport]);

  if (!reportData) return null;

  const generateReport = () => {
    const identity = readStoredGeneratedReport() ?? {
      reportId: createReportId(),
      generatedAt: new Date().toISOString(),
    };
    const metadata = createGeneratedReportMetadata(reportData, identity);
    setGeneratedReport(metadata);
  };

  const startNewAnalysis = () => {
    clearVerifeeSession();
    setLocation('/start');
  };

  const downloadReport = () => {
    if (!generatedReport) return;
    downloadVerifeeReportPdf(reportData, generatedReport);
  };

  const downloadSubmissionReceipt = () => {
    if (!generatedReport) return;
    downloadVerifeeSubmissionReceiptPdf(generatedReport);
  };

  const saveToMyReports = (continueAnyway = false) => {
    if (!reportData || !generatedReport) return;
    const alreadySaved = savedReports.some(
      (item) => item.metadata.reportId === generatedReport.reportId,
    );
    if (alreadySaved) {
      setSaveNotice('This report is already saved in My Reports for this browser session.');
      setSaveConflict(null);
      return;
    }

    const duplicate = savedReports.find((item) => sameReportScope(item.data, reportData));
    if (duplicate && !continueAnyway) {
      setSaveConflict(duplicate);
      setSaveNotice('');
      return;
    }

    const fileName = sessionStorage.getItem('verifee-file-name');
    const fileSize = Number(sessionStorage.getItem('verifee-file-size'));
    const uploadFingerprint: DemoUploadFingerprint | undefined =
      fileName && Number.isFinite(fileSize) && fileSize >= 0
        ? { fileName, fileSize }
        : undefined;
    const savedReport: DemoSavedReport = {
      metadata: generatedReport,
      data: reportData,
      reportStatus: 'Ready',
      ...(uploadFingerprint ? { uploadFingerprint } : {}),
    };
    const nextReports = [...savedReports, savedReport];
    sessionStorage.setItem(DEMO_REPORTS_KEY, JSON.stringify(nextReports));
    setSavedReports(nextReports);
    setSaveConflict(null);
    setSaveNotice('Report saved to My Reports in this browser session.');
  };

  return <div className="shell">
    <Header />
    <div className="page-wrap wizard-wrap final-report-stepper">
      <Stepper current={5} />
    </div>
    {(saveConflict || saveNotice) && <section className="demo-save-feedback page-wrap" aria-live="polite" data-testid="status-save-to-reports">
      {saveConflict ? <>
        <div role="alert">
          <strong>A report already exists for this academic program and target.</strong>
          <p>Open the saved report, or continue anyway to save another copy.</p>
        </div>
        <div className="demo-save-feedback-actions">
          <button className="secondary-btn" type="button" onClick={() => setLocation(`/saved-report/${saveConflict.metadata.reportId}`)} data-testid="button-view-existing-report">View Existing Report</button>
          <button className="secondary-btn" type="button" onClick={() => saveToMyReports(true)} data-testid="button-save-duplicate-anyway">Continue Anyway</button>
        </div>
      </> : <>
        <p>{saveNotice}</p>
        <button className="secondary-btn" type="button" onClick={() => setLocation('/my-reports')} data-testid="button-go-to-my-reports">View My Reports</button>
      </>}
    </section>}
    <VerifeeReportView
      data={reportData}
      generatedReport={generatedReport}
      onGenerate={generateReport}
      onDownload={downloadReport}
      onDownloadReceipt={downloadSubmissionReceipt}
      onBackToMapping={() => setLocation('/report')}
      onStartNewAnalysis={startNewAnalysis}
      onSaveToMyReports={() => saveToMyReports()}
      isSavedToMyReports={Boolean(generatedReport && savedReports.some(
        (item) => item.metadata.reportId === generatedReport.reportId,
      ))}
    />
  </div>;
}

function RequireDemoSession({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const active = Boolean(readDemoSession());
  useEffect(() => {
    if (!active) setLocation('/login');
  }, [active, setLocation]);
  return active ? <>{children}</> : null;
}

function DemoLoginRoute() {
  const [, setLocation] = useLocation();
  const active = Boolean(readDemoSession());
  useEffect(() => {
    if (active) setLocation('/dashboard');
  }, [active, setLocation]);
  return active ? null : <DemoLoginPage onEnterDemo={() => {
    beginDemoSession();
    setLocation('/dashboard');
  }} />;
}

function DemoDashboardRoute() {
  const [, setLocation] = useLocation();
  const session = readDemoSession();
  const reports = readDemoSavedReports();
  const startNewMapping = () => {
    clearVerifeeSession();
    setLocation('/start');
  };
  return <RequireDemoSession>
    <DemoDashboardPage
      displayName={session?.displayName || 'Verifee Demo'}
      reportCount={reports.length}
      onNewMapping={startNewMapping}
      onMyReports={() => setLocation('/my-reports')}
      onLogOut={() => { endDemoSession(); setLocation('/'); }}
    />
  </RequireDemoSession>;
}

function DemoReportsRoute() {
  const [, setLocation] = useLocation();
  const session = readDemoSession();
  const reports = readDemoSavedReports().map(toDemoSavedReportSummary);
  const startNewMapping = () => {
    clearVerifeeSession();
    setLocation('/start');
  };
  return <RequireDemoSession>
    <DemoReportsPage
      displayName={session?.displayName || 'Verifee Demo'}
      reports={reports}
      onNewMapping={startNewMapping}
      onDashboard={() => setLocation('/dashboard')}
      onOpenReport={(reportId) => setLocation(`/saved-report/${reportId}`)}
      onLogOut={() => { endDemoSession(); setLocation('/'); }}
    />
  </RequireDemoSession>;
}

function ProtectedUploadStep() {
  return <RequireDemoSession><UploadStep /></RequireDemoSession>;
}

function ProtectedReview() {
  return <RequireDemoSession><Review /></RequireDemoSession>;
}

function ProtectedTargetSelection() {
  return <RequireDemoSession><TargetSelection /></RequireDemoSession>;
}

function ProtectedReport() {
  return <RequireDemoSession><Report /></RequireDemoSession>;
}

function ProtectedFinalReport() {
  return <RequireDemoSession><FinalReport /></RequireDemoSession>;
}

function SavedReportRoute() {
  const [, params] = useRoute<{ reportId: string }>('/saved-report/:reportId');
  const [, setLocation] = useLocation();
  const report = readDemoSavedReports().find((item) => item.metadata.reportId === params?.reportId);

  useEffect(() => {
    if (!report) setLocation('/my-reports');
  }, [report, setLocation]);

  if (!report) return <RequireDemoSession>{null}</RequireDemoSession>;
  return <RequireDemoSession>
    <div className="shell">
      <Header />
      <div className="page-wrap saved-report-toolbar">
        <button className="secondary-btn" type="button" onClick={() => setLocation('/my-reports')} data-testid="button-back-to-my-reports">
          <ArrowLeft size={14} /> Back to My Reports
        </button>
        <span className="demo-badge">Ready · {report.metadata.reportId}</span>
      </div>
      <VerifeeReportView
        data={report.data}
        generatedReport={report.metadata}
        onGenerate={() => undefined}
        onDownload={() => downloadVerifeeReportPdf(report.data, report.metadata)}
        onDownloadReceipt={() => downloadVerifeeSubmissionReceiptPdf(report.metadata)}
        onBackToMapping={() => setLocation('/my-reports')}
        onStartNewAnalysis={() => { clearVerifeeSession(); setLocation('/start'); }}
      />
    </div>
  </RequireDemoSession>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Landing} />
    <Route path="/login" component={DemoLoginRoute} />
    <Route path="/dashboard" component={DemoDashboardRoute} />
    <Route path="/my-reports" component={DemoReportsRoute} />
    <Route path="/saved-report/:reportId" component={SavedReportRoute} />
    <Route path="/start" component={ProtectedUploadStep} />
    <Route path="/analysis" component={ProtectedReview} />
    <Route path="/target" component={ProtectedTargetSelection} />
    <Route path="/report" component={ProtectedReport} />
    <Route path="/final-report" component={ProtectedFinalReport} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;