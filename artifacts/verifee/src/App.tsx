import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowDown, ArrowUpRight, BookOpen, Check, ChevronRight, ExternalLink, FileText, GraduationCap, Landmark, LoaderCircle, RotateCcw, ScanText, ShieldAlert, Upload, X } from 'lucide-react';
import { extractAcademicTranscript, type AcademicMappingInput, type AcademicMappingResult, type AcademicRecord } from '@workspace/api-client-react';
import { ExtractAcademicTranscriptResponse, RunAcademicMappingResponse } from '@workspace/api-zod';
import { georgiaTechDataset } from '@workspace/georgia-tech-programs';
import { checkVerification, extractMockRecord, sampleCourses, sampleCredential, uploadSchema, type CredentialVerification } from '@/lib/mock-analysis';
import { runAcademicMappingWithProgress } from '@/lib/academic-mapping-stream';

const queryClient = new QueryClient();
const wizardSteps = ['Upload Credential', 'Verify & Review', 'Select Target', 'Academic Mapping'];
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
    const parsed = ExtractAcademicTranscriptResponse.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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
  return <header className="masthead">
    <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><BookOpen size={16} strokeWidth={2.1} /></span><span>verifee</span></Link>
    <div className="mast-meta"><span className="mast-dot" /> Preliminary academic interpretation <span className="demo-badge">Mapping demo</span></div>
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
function UploadStep() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const savedFileName = sessionStorage.getItem('verifee-file-name');
  const hasSavedAnalysis = sessionStorage.getItem('verifee-started') === 'yes' && Boolean(savedFileName);
  const chooseFile = (candidate?: File) => {
    setError('');
    if (!candidate) return;
    const validation = uploadSchema.safeParse({ file: candidate });
    if (!validation.success) { setFile(null); setError(validation.error.issues[0]?.message || 'Choose a supported credential file.'); return; }
    setFile(candidate);
  };
  const saveReviewState = (mode: 'extracted' | 'demo', verification: CredentialVerification, record?: AcademicRecord) => {
    if (!file) return;
    sessionStorage.setItem('verifee-file-name', file.name);
    sessionStorage.setItem('verifee-file-format', formatForFileName(file.name));
    sessionStorage.setItem('verifee-analysis-mode', mode);
    sessionStorage.setItem('verifee-verification-status', verification.status);
    sessionStorage.setItem('verifee-verification-explanation', verification.explanation);
    if (record) sessionStorage.setItem('verifee-extracted-record', JSON.stringify(record));
    else sessionStorage.removeItem('verifee-extracted-record');
    sessionStorage.removeItem('verifee-mapping-result');
    sessionStorage.removeItem('verifee-visible-course-count');
    sessionStorage.removeItem('verifee-target');
    sessionStorage.removeItem('verifee-program');
    sessionStorage.setItem('verifee-started', 'yes');
    setLocation('/analysis');
  };
  const continueWithDemo = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
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
    setBusy(true);
    setError('');
    try {
      if (isPdfFile(file)) {
        const record = await extractAcademicTranscript(file);
        saveReviewState('extracted', {
          status: 'Digital verification unavailable',
          explanation: 'This PDF was read for academic interpretation only. No digital authenticity check was performed.',
        }, record);
      } else {
        await extractMockRecord();
        const verification = await checkVerification();
        saveReviewState('demo', verification, createSampleAcademicRecord());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not extract this transcript. Try again or use the demo sample.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="shell"><Header /><main className="page-wrap wizard-wrap">
    <Stepper current={1} />
    <section className="wizard-card">
      <div className="eyebrow">Step 1 of 4</div>
      <h1 className="wizard-title">Upload an academic credential</h1>
      <p className="wizard-intro">Upload an English-language transcript PDF to extract its academic details for review and preliminary mapping. Other accepted formats continue through the sample-data demo path.</p>
      <div className="format-grid" aria-label="Accepted credential formats">
        <div className="format-option"><span className="format-name">PDF</span><span>AI academic extraction for Step 2</span></div>
        <div className="format-option"><span className="format-name">OpenCerts <span className="format-ext">.opencert</span></span><span>Sample-data demo only; not verified</span></div>
        <div className="format-option"><span className="format-name">European Digital Credential <span className="format-ext">.jsonld</span></span><span>Sample-data demo only; not verified</span></div>
      </div>
      <div className={`dropzone wizard-dropzone ${drag ? 'drag' : ''}`} onDragOver={(event) => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); chooseFile(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} aria-label="Choose a credential file" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} data-testid="dropzone-credential">
        <div><span className="upload-icon"><Upload size={19} /></span><p className="drop-title">{file ? 'Credential selected' : 'Drop your credential here or'} {!file && <button className="browse" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>browse files</button>}</p><p className="drop-hint">{file ? `${formatForFileName(file.name)} · ${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'PDF, .opencert, or .jsonld · 20 MB maximum'}</p></div>
      </div>
      <input ref={inputRef} className="file-control" type="file" accept=".pdf,.opencert,.jsonld,application/pdf,application/ld+json" aria-label="Choose a credential file" data-testid="input-credential" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
      {file && <div className="file-chip" data-testid="text-selected-file"><div className="chip-file"><FileText size={17} color="#55766c" /><div><strong>{file.name}</strong><div className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB · {formatForFileName(file.name)}</div></div></div><button className="remove-file" aria-label="Remove selected file" data-testid="button-remove-file" onClick={() => { setFile(null); setError(''); if (inputRef.current) inputRef.current.value = ''; }}><X size={16} /></button></div>}
      <p className="upload-note">PDF contents are sent to the configured AI service for academic extraction. The extracted record is kept in this browser session; mapping sends only that academic JSON, not the PDF. Reading a PDF does not verify that it is authentic. OpenCerts and JSON-LD are not verified in this version.</p>
      <div className="demo-disclosure"><strong>Current scope:</strong> PDF extraction and preliminary mapping use the academic details extracted from your transcript. If extraction fails, you can explicitly continue with the synthetic demo sample instead.</div>
      {error && <div className="error-message" role="alert" data-testid="status-upload-error">{error}</div>}
      <button className="cta" type="button" onClick={() => void submit()} disabled={!file || busy} data-testid="button-continue-upload"><span>{busy ? file && isPdfFile(file) ? 'Reading transcript…' : 'Preparing sample record…' : 'Continue to verify & review'}</span>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}</button>
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
          <Link href="/start" className="nav-cta" data-testid="link-try-verifee-nav">Try Verifee <ArrowUpRight size={14} /></Link>
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
              <Link href="/start" className="landing-primary" data-testid="link-try-verifee-hero">Try Verifee <ArrowRight size={16} /></Link>
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
        <div className="bottom-cta-action"><p>Start with an academic record and a program in mind.</p><Link href="/start" className="landing-primary" data-testid="link-try-verifee-bottom">Try Verifee <ArrowRight size={16} /></Link></div>
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
      <div className="eyebrow">Step 2 of 4</div>
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
      <div className="eyebrow">Step 3 of 4</div>
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
  const [loading, setLoading] = useState(() => !readStoredMapping(program.id));
  const [mappingError, setMappingError] = useState('');
  const [progressRequirements, setProgressRequirements] = useState<RequirementMapping[]>([]);
  const [progressCourseEvidence, setProgressCourseEvidence] = useState<CourseEvidence[]>([]);
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(
    () => readStoredMapping(program.id)?.requirements[0]?.requirementId ?? null,
  );
  const currentMapping = mapping?.programId === program.id ? mapping : null;

  useEffect(() => {
    if (!started || !sessionStorage.getItem('verifee-file-name') || !academicRecord) setLocation('/start');
  }, [academicRecord, started, setLocation]);

  const requestMapping = async (cancelled: () => boolean = () => false) => {
    if (!academicRecord) return;
    setLoading(true);
    setMappingError('');
    setProgressRequirements([]);
    setProgressCourseEvidence([]);
    setExpandedRequirementId(null);
    try {
      const request: AcademicMappingInput = {
        programId: program.id as AcademicMappingInput['programId'],
        record: academicRecord,
      };
      const result = await runAcademicMappingWithProgress(request, (snapshot) => {
        if (cancelled()) return;
        setProgressRequirements(snapshot.requirements);
        setProgressCourseEvidence(snapshot.courseEvidence);
        const newestRequirement = snapshot.requirements[snapshot.requirements.length - 1];
        if (newestRequirement) setExpandedRequirementId(newestRequirement.requirementId);
      });
      const parsed = RunAcademicMappingResponse.safeParse(result);
      if (!parsed.success || parsed.data.programId !== program.id) {
        throw new Error('The mapping response did not match the selected program.');
      }
      if (cancelled()) return;
      sessionStorage.setItem('verifee-mapping-result', JSON.stringify(parsed.data));
      setMapping(parsed.data);
      setProgressRequirements([]);
      setProgressCourseEvidence([]);
      setExpandedRequirementId(parsed.data.requirements[0]?.requirementId ?? null);
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
      setExpandedRequirementId(cached.requirements[0]?.requirementId ?? null);
      setLoading(false);
    } else {
      setMapping(null);
      void requestMapping(() => cancelled);
    }
    return () => { cancelled = true; };
  }, [academicRecord, program.id, started]);

  const retryMapping = () => {
    sessionStorage.removeItem('verifee-mapping-result');
    void requestMapping();
  };

  const reset = () => {
    [
      'verifee-file-name',
      'verifee-file-format',
      'verifee-target',
      'verifee-program',
      'verifee-started',
      'verifee-verification-status',
      'verifee-verification-explanation',
      'verifee-analysis-mode',
      'verifee-extracted-record',
      'verifee-mapping-result',
      'verifee-visible-course-count',
    ].forEach((key) => sessionStorage.removeItem(key));
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
  const allRequirementsCompleted = program.requirements.length > 0 && progressRequirements.length === program.requirements.length;

  return <div className="shell"><Header /><main className="page-wrap report-page">
    <Stepper current={4} />
    <div className="report-top">
      <div>
        <div className="eyebrow">Step 4 of 4 · Preliminary report</div>
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
    <div className="preliminary" data-testid="notice-preliminary"><AlertCircle size={16} /><span>
      <strong>{isExtracted ? 'Preliminary mapping of extracted academic details.' : 'Preliminary mapping of the synthetic demo record.'}</strong>{' '}
      {isExtracted
        ? `“${fileName}” was used only for extraction. This mapping request contains the extracted academic JSON, not the PDF.`
        : `“${fileName}” was not parsed; this mapping uses only the separately labeled synthetic sample record.`}
    </span></div>
    <div className="report-grid">
      <div className="report-main">
        <section className="panel section-card">
          <div className="section-title"><h2>{isExtracted ? 'Extracted academic record' : 'Synthetic sample record'}</h2><span className="small-label">{academicRecord?.academicRecord.courses.length ?? 0} courses</span></div>
          {academicRecord && <div className="credential-grid">
            <div><span className="data-label">Institution</span><span className="data-value">{displayTranscriptValue(academicRecord.institution.name)}</span></div>
            <div><span className="data-label">Country</span><span className="data-value">{displayTranscriptValue(academicRecord.institution.country)}</span></div>
            <div><span className="data-label">Qualification</span><span className="data-value">{displayTranscriptValue(academicRecord.credential.degree)}</span></div>
            <div><span className="data-label">Program</span><span className="data-value">{displayTranscriptValue(academicRecord.credential.program)}</span></div>
            <div><span className="data-label">Field of study</span><span className="data-value">{displayTranscriptValue(academicRecord.credential.fieldOfStudy)}</span></div>
            <div><span className="data-label">Graduation date</span><span className="data-value">{displayTranscriptValue(academicRecord.credential.graduationDate)}</span></div>
          </div>}
        </section>

        <section className="panel section-card" aria-live="polite">
          <div className="section-title">
            <div><h2>Program requirement mapping</h2><p className="form-note mapping-section-note">The selected program’s stored requirements are compared with extracted courses and available evidence.</p></div>
            <button className="remove-file" type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse program mappings' : 'Expand program mappings'} data-testid="button-toggle-mappings"><ChevronRight size={18} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} /></button>
          </div>
          {expanded && <>
            <details className="source-details"><summary>Stored program source</summary><p>{program.source.title}</p><span>Last checked: {program.source.lastChecked}</span></details>
            {loading && <div className="mapping-loading" role="status" data-testid="status-mapping-loading">
              {allRequirementsCompleted ? <Check size={18} /> : <LoaderCircle size={18} className="animate-spin" />}
              <div>
                <strong>{allRequirementsCompleted ? 'Academic mapping complete' : 'Mapping academic requirements…'}</strong>
                <div className="mapping-progress-count">
                  <strong>{progressRequirements.length} of {program.requirements.length} requirements mapped</strong>
                  <span>{allRequirementsCompleted ? 'All requirements completed' : 'Still in progress'}</span>
                </div>
                <p>Shortlisting courses, checking official course sources where available, and comparing each stored requirement.</p>
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
              {showPartialMapping && requirements.length > 0 && <p className="mapping-progress-note">Completed requirement results are shown below while the remaining requirements continue processing.</p>}
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
            <div><strong>{counts.partial}</strong><span>Partial</span></div>
            <div><strong>{counts.potentialGap}</strong><span>Potential gaps</span></div>
            <div><strong>{counts.insufficient}</strong><span>Insufficient evidence</span></div>
          </div>}
        </section>
        <section className="panel section-card"><p className="report-aside-title">Selected target program</p><p className="mapping-course">{program.name}</p><span className="data-label">{program.school}</span><p className="form-note"><strong>Requirement type:</strong> {formatRequirementType(program.requirementType)}</p><p className="form-note">{program.description}</p></section>
        <section className="panel section-card"><p className="report-aside-title">Items requiring review</p><ul className="review-list"><li><span className="review-dot" />Confirm detailed course coverage with official catalog pages, syllabi, or learning outcomes.</li><li><span className="review-dot" />Confirm grading scale, credit units, and instructional hours with the issuing institution.</li><li><span className="review-dot" />Verify the credential independently; no verification was performed here.</li><li><span className="review-dot" />These preliminary mappings are not admissions, approval, equivalency, or transfer-credit decisions.</li></ul></section>
      </aside>
    </div>
    <div className="report-disclaimer">Verifee provides preliminary academic interpretation and mapping. It is not an official admissions decision, credential equivalency, or transfer-credit determination.</div>
  </main></div>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Landing} /><Route path="/start" component={UploadStep} /><Route path="/analysis" component={Review} /><Route path="/target" component={TargetSelection} /><Route path="/report" component={Report} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;