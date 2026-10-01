import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, ChevronRight, FileText, LoaderCircle, RotateCcw, ShieldAlert, Upload, X } from 'lucide-react';
import { checkVerification, extractMockRecord, georgiaTechDataset, mapStoredProgramRequirements, sampleCourses, sampleCredential, uploadSchema, type CredentialVerification, type ProgramRequirementMapping } from '@/lib/mock-analysis';

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

function Header() {
  return <header className="masthead">
    <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><BookOpen size={16} strokeWidth={2.1} /></span><span>verifee</span></Link>
    <div className="mast-meta"><span className="mast-dot" /> Preliminary academic interpretation <span className="demo-badge">Demo mode</span></div>
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
function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const chooseFile = (candidate?: File) => {
    setError('');
    if (!candidate) return;
    const validation = uploadSchema.safeParse({ file: candidate });
    if (!validation.success) { setFile(null); setError(validation.error.issues[0]?.message || 'Choose a supported credential file.'); return; }
    setFile(candidate);
  };
  const submit = async () => {
    if (!file) { setError('Choose a credential file to continue.'); return; }
    setBusy(true);
    setError('');
    try {
      await extractMockRecord();
      const verification = await checkVerification();
      sessionStorage.setItem('verifee-file-name', file.name);
      sessionStorage.setItem('verifee-file-format', formatForFileName(file.name));
      sessionStorage.setItem('verifee-verification-status', verification.status);
      sessionStorage.setItem('verifee-verification-explanation', verification.explanation);
      sessionStorage.removeItem('verifee-target');
      sessionStorage.removeItem('verifee-program');
      sessionStorage.setItem('verifee-started', 'yes');
      setLocation('/analysis');
    } catch {
      setError('We could not prepare the sample credential record. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="shell"><Header /><main className="page-wrap wizard-wrap">
    <Stepper current={1} />
    <section className="wizard-card">
      <div className="eyebrow">Step 1 of 4</div>
      <h1 className="wizard-title">Upload an academic credential</h1>
      <p className="wizard-intro">Upload an English-language academic record. Verifee can interpret standard transcripts and report whether a verification method is available for supported digital formats.</p>
      <div className="format-grid" aria-label="Accepted credential formats">
        <div className="format-option"><span className="format-name">PDF</span><span>Standard transcript or Diploma Supplement</span></div>
        <div className="format-option"><span className="format-name">OpenCerts <span className="format-ext">.opencert</span></span><span>Digitally verifiable credential</span></div>
        <div className="format-option"><span className="format-name">European Digital Credential <span className="format-ext">.jsonld</span></span><span>Machine-readable European credential</span></div>
      </div>
      <div className={`dropzone wizard-dropzone ${drag ? 'drag' : ''}`} onDragOver={(event) => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); chooseFile(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} aria-label="Choose a credential file" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} data-testid="dropzone-credential">
        <div><span className="upload-icon"><Upload size={19} /></span><p className="drop-title">{file ? 'Credential selected' : 'Drop your credential here or'} {!file && <button className="browse" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>browse files</button>}</p><p className="drop-hint">{file ? `${formatForFileName(file.name)} · ${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'PDF, .opencert, or .jsonld · 20 MB maximum'}</p></div>
      </div>
      <input ref={inputRef} className="file-control" type="file" accept=".pdf,.opencert,.jsonld,application/pdf,application/ld+json" aria-label="Choose a credential file" data-testid="input-credential" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
      {file && <div className="file-chip" data-testid="text-selected-file"><div className="chip-file"><FileText size={17} color="#55766c" /><div><strong>{file.name}</strong><div className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB · {formatForFileName(file.name)}</div></div></div><button className="remove-file" aria-label="Remove selected file" data-testid="button-remove-file" onClick={() => { setFile(null); setError(''); if (inputRef.current) inputRef.current.value = ''; }}><X size={16} /></button></div>}
      <p className="upload-note">Supported digital credentials can be checked for authenticity when a verification method is available. Standard PDFs can still be interpreted and mapped but may require external verification.</p>
      <div className="demo-disclosure"><strong>Demo mode:</strong> This preview uses a sample academic record. File contents are not read or saved, and no credential verification is performed.</div>
      {error && <div className="error-message" role="alert" data-testid="status-upload-error">{error}</div>}
      <button className="cta" type="button" onClick={() => void submit()} disabled={!file || busy} data-testid="button-continue-upload"><span>{busy ? 'Preparing sample record…' : 'Continue to verify & review'}</span>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}</button>
    </section>
    <Disclaimer />
  </main></div>;
}
function Review() {
  const [, setLocation] = useLocation();
  const fileName = sessionStorage.getItem('verifee-file-name');
  useEffect(() => { if (!fileName || sessionStorage.getItem('verifee-started') !== 'yes') setLocation('/'); }, [fileName, setLocation]);
  const format = sessionStorage.getItem('verifee-file-format') || 'PDF transcript';
  const verificationStatus = (sessionStorage.getItem('verifee-verification-status') || 'Verification unavailable') as CredentialVerification['status'];
  const verificationExplanation = sessionStorage.getItem('verifee-verification-explanation') || 'No independent verification source is connected in this demonstration.';
  return <div className="shell"><Header /><main className="page-wrap wizard-wrap">
    <Stepper current={2} />
    <section className="wizard-card">
      <div className="eyebrow">Step 2 of 4</div>
      <h1 className="wizard-title">Verify &amp; review</h1>
      <p className="wizard-intro">Review the credential context and the available verification information before choosing a target.</p>
      <div className="review-disclosure"><AlertCircle size={17} /><span><strong>Sample record shown for demonstration.</strong> “{fileName || 'Selected credential'}” was not parsed or saved. No authenticity check was performed.</span></div>
      <section className="review-section" aria-labelledby="format-heading">
        <div className="section-title"><h2 id="format-heading">Credential format</h2><span className="small-label">Selected file</span></div>
        <div className="format-summary"><span className="format-summary-type">{format}</span><span className="format-summary-name">{fileName || 'Selected credential'}</span></div>
      </section>
      <section className="review-section" aria-labelledby="verification-heading">
        <div className="section-title"><h2 id="verification-heading">Verification status</h2></div>
        <div className="verification-review"><ShieldAlert size={18} /><div><span className="status-pill" data-testid="status-verification">{verificationStatus}</span><p>{verificationExplanation}</p></div></div>
      </section>
      <section className="review-section" aria-labelledby="credential-heading">
        <div className="section-title"><h2 id="credential-heading">Academic interpretation</h2><span className="small-label">Sample record</span></div>
        <div className="credential-grid">{Object.entries(sampleCredential).map(([key, value]) => <div key={key}><span className="data-label">{({institution:'Issuer',country:'Country / education system',qualification:'Qualification',major:'Field of study',graduationDate:'Graduation date'} as Record<string,string>)[key]}</span><span className="data-value" data-testid={`text-credential-${key}`}>{value}</span></div>)}</div>
      </section>
      <section className="review-section" aria-labelledby="courses-heading">
        <div className="section-title"><h2 id="courses-heading">Courses detected</h2><span className="small-label">{sampleCourses.length} in sample record</span></div>
        <div className="course-preview">{sampleCourses.map((course) => <div className="course-preview-row" key={course.code}><span className="course-code">{course.code}</span><span>{course.title}</span><span>{course.credits} {course.unitsLabel}</span></div>)}</div>
      </section>
      <div className="wizard-actions"><button className="secondary-btn" type="button" onClick={() => setLocation('/')}><ArrowLeft size={14} /> Back to upload</button><button className="cta wizard-next" type="button" onClick={() => setLocation('/target')} data-testid="button-continue-target"><span>Continue to target selection</span><ArrowRight size={16} /></button></div>
    </section>
    <Disclaimer />
  </main></div>;
}
function TargetSelection() {
  const [, setLocation] = useLocation();
  const [programId, setProgramId] = useState(() => {
    const saved = sessionStorage.getItem('verifee-program');
    return georgiaTechDataset.programs.some((item) => item.id === saved) ? saved! : georgiaTechDataset.programs[0].id;
  });
  const program = georgiaTechDataset.programs.find((item) => item.id === programId) || georgiaTechDataset.programs[0];
  useEffect(() => { if (sessionStorage.getItem('verifee-started') !== 'yes') setLocation('/'); }, [setLocation]);
  const changeProgram = (value: string) => {
    setProgramId(value);
    sessionStorage.setItem('verifee-program', value);
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
      <p className="wizard-intro">Verifee compares evidence from the uploaded academic record against the selected target requirements.</p>
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
      <p className="form-note">Program requirement type and importance are preserved from the stored Georgia Tech data; not every criterion is a mandatory admissions prerequisite. This demo compares the sample academic record shown in Verify &amp; Review, not the uploaded file.</p>
      <div className="wizard-actions"><button className="secondary-btn" type="button" onClick={() => setLocation('/analysis')}><ArrowLeft size={14} /> Back to review</button><button className="cta wizard-next" type="button" onClick={continueToMapping} data-testid="button-generate-mapping"><span>Generate preliminary mapping</span><ArrowRight size={16} /></button></div>
    </section>
    <Disclaimer />
  </main></div>;
}
function Status({ result }: { result: ProgramRequirementMapping['result'] }) {
  const cls = result === 'Covered' ? 'good' : result === 'Potential Gap' ? 'gap' : 'review';
  return <span className={`status-pill ${cls}`} data-testid={`status-mapping-${result.toLowerCase().replaceAll(' ', '-')}`}>{result}</span>;
}
function Report() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState('All requirements');
  const [expanded, setExpanded] = useState(true);
  const fileName = sessionStorage.getItem('verifee-file-name') || 'Selected credential';
  const verificationStatus = (sessionStorage.getItem('verifee-verification-status') || 'Verification unavailable') as CredentialVerification['status'];
  const verificationExplanation = sessionStorage.getItem('verifee-verification-explanation') || 'No independent verification source is connected in this demonstration.';
  const savedProgramId = sessionStorage.getItem('verifee-program');
  const program = georgiaTechDataset.programs.find((item) => item.id === savedProgramId) || georgiaTechDataset.programs[0];
  const mapping = mapStoredProgramRequirements(program.id, sampleCourses);
  const visible = filter === 'All requirements' ? mapping : mapping.filter((item) => item.result === filter);
  useEffect(() => { if (sessionStorage.getItem('verifee-started') !== 'yes') setLocation('/'); }, [setLocation]);
  const reset = () => {
    ['verifee-file-name', 'verifee-file-format', 'verifee-target', 'verifee-program', 'verifee-started', 'verifee-verification-status', 'verifee-verification-explanation'].forEach((key) => sessionStorage.removeItem(key));
    setLocation('/');
  };
  const covered = mapping.filter((item) => item.result === 'Covered').length;
  const reviewCount = mapping.length - covered;
  return <div className="shell"><Header /><main className="page-wrap report-page">
    <Stepper current={4} />
    <div className="report-top"><div><div className="eyebrow">Step 4 of 4 · Preliminary report</div><h1 className="report-title">Academic mapping</h1><p className="report-lede">A transparent first look at the sample academic record against stored {program.shortName} background criteria.</p></div><div className="report-actions"><button className="secondary-btn" type="button" onClick={() => setLocation('/target')}><ArrowLeft size={14} /> Change target</button><button className="secondary-btn" type="button" onClick={reset} data-testid="button-new-analysis"><RotateCcw size={14} /> New analysis</button></div></div>
    <section className="report-verification" data-testid="card-verification"><div className="report-verification-top"><p className="verify-heading"><ShieldAlert size={16} color="#8a764d" /> Overall credential verification</p><span className="status-pill" data-testid="status-verification">{verificationStatus}</span></div><p className="verify-copy">{verificationExplanation} Verification is separate from academic interpretation and course mapping.</p></section>
    <div className="preliminary" data-testid="notice-preliminary"><AlertCircle size={16} /><span><strong>Preliminary, mock-data report.</strong> The selected file “{fileName}” was not parsed or saved. This report uses the sample record below and does not represent an analysis of the uploaded file.</span></div>
    <div className="report-grid">
      <div className="report-main">
        <section className="panel section-card">
          <div className="section-title"><h2>Credential interpretation</h2><span className="small-label">Sample record</span></div>
          <div className="credential-grid">{Object.entries(sampleCredential).map(([key, value]) => <div key={key}><span className="data-label">{({institution:'Institution',country:'Country',qualification:'Qualification',major:'Field of study',graduationDate:'Graduation date'} as Record<string,string>)[key]}</span><span className="data-value" data-testid={`text-credential-${key}`}>{value}</span></div>)}</div>
        </section>
        <section className="panel section-card">
          <div className="section-title"><h2>Normalized courses</h2><span className="small-label">As shown in sample</span></div>
          <div style={{overflowX:'auto'}}><table className="course-table"><thead><tr><th>Course</th><th>Title</th><th>Grade</th><th>Credits</th></tr></thead><tbody>{sampleCourses.map((course) => <tr key={course.code} data-testid={`row-course-${course.code}`}><td className="course-code">{course.code}</td><td>{course.title}</td><td>{course.grade}</td><td>{course.credits} {course.unitsLabel}</td></tr>)}</tbody></table></div>
          <p className="form-note">Grades and credit values are presented as reported in the sample record. No conversion to Georgia Tech credits or grading scale has been made.</p>
        </section>
        <section className="panel section-card">
          <div className="section-title"><div><h2>Program requirement mapping</h2><div className="form-note" style={{marginTop:5}}>The comparison uses only the selected program’s stored requirements.</div></div><button className="remove-file" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse program mappings' : 'Expand program mappings'} data-testid="button-toggle-mappings"><ChevronRight size={18} style={{transform:expanded?'rotate(90deg)':'none',transition:'transform .2s'}} /></button></div>
          {expanded && <>
            <p className="source-claim">Target criteria sourced from Georgia Tech program materials.</p>
            <details className="source-details"><summary>Source details</summary><p>{program.source.title}</p><span>Last checked: {program.source.lastChecked}</span></details>
            <div className="mapping-filter">{['All requirements','Covered','Partially Covered','Potential Gap','Insufficient Evidence'].map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className="secondary-btn" style={{padding:'7px 10px',fontSize:10,background:filter===value?'#eaf1ed':'#fff',borderColor:filter===value?'#a9c1b6':undefined}} data-testid={`filter-${value.toLowerCase().replaceAll(' ','-')}`}>{value}</button>)}</div>
            <div className="mapping-list">{visible.map((match) => <article className="mapping-row" key={match.requirementId} data-testid={`mapping-${match.requirementId}`}>
              <div className="mapping-head"><div><p className="mapping-course">{match.requirementName}</p><p className="mapping-desc">{match.category.replaceAll('_', ' ')} · {formatImportance(match.importance)}</p></div><Status result={match.result} /></div>
              <p className="mapping-desc mapping-match-courses"><strong>Matched student course(s):</strong> {match.matchedCourses.join(', ') || 'No clearly corresponding course identified'}</p>
              <p className="mapping-desc mapping-rationale"><strong>Rationale:</strong> {match.rationale}</p>
              <div className="mapping-evidence"><strong>Evidence &amp; limits</strong> — {match.evidence}<br /><span><strong>Stored matching concepts:</strong> {match.matchingConcepts.join(', ')}</span></div>
              <span className="confidence">Confidence: {match.confidence} · Preliminary</span>
            </article>)}{visible.length === 0 && <p className="form-note">No requirements have this result.</p>}</div>
          </>}
        </section>
      </div>
      <aside className="report-side">
        <section className="panel section-card"><p className="report-aside-title">Mapping overview</p><div className="summary-number">{mapping.length}</div><div className="summary-caption">Stored {program.shortName} criteria reviewed</div><div className="summary-split"><div><strong>{covered}</strong><span>Covered</span></div><div><strong>{reviewCount}</strong><span>Needs review</span></div></div></section>
        <section className="panel section-card"><p className="report-aside-title">Selected target program</p><p className="mapping-course">{program.name}</p><span className="data-label">{program.school}</span><p className="form-note"><strong>Requirement type:</strong> {formatRequirementType(program.requirementType)}</p><p className="form-note">{program.description}</p></section>
        <section className="panel section-card"><p className="report-aside-title">Items requiring review</p><ul className="review-list"><li><span className="review-dot" />Obtain course descriptions, syllabi, or learning outcomes for topic-level comparison.</li><li><span className="review-dot" />Confirm grading scale, credit units, and instructional hours with the issuing institution.</li><li><span className="review-dot" />Verify the credential independently; no verification was performed here.</li><li><span className="review-dot" />Program background requirements are not admissions or transfer-credit decisions.</li></ul></section>
      </aside>
    </div>
    <div className="report-disclaimer">Verifee provides preliminary academic interpretation and mapping. It is not an official admissions, credential-equivalency, or transfer-credit determination.</div>
  </main></div>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/analysis" component={Review} /><Route path="/target" component={TargetSelection} /><Route path="/report" component={Report} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;