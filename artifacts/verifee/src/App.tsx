import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import { AlertCircle, ArrowRight, BookOpen, Check, ChevronRight, Circle, FileText, LoaderCircle, RotateCcw, ShieldAlert, Upload, X } from 'lucide-react';
import { checkVerification, extractMockRecord, mapMockCourses, requirements, sampleCourses, sampleCredential, uploadSchema, type Mapping } from '@/lib/mock-analysis';

const queryClient = new QueryClient();
const stages = ['Reading credential', 'Checking verification options', 'Structuring academic record', 'Comparing coursework', 'Preparing report'];

function Header() {
  return <header className="masthead">
    <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><BookOpen size={16} strokeWidth={2.1} /></span><span>verifee</span></Link>
    <div className="mast-meta"><span className="mast-dot" /> Preliminary academic interpretation</div>
  </header>;
}
function Disclaimer() {
  return <div className="footnote">Verifee provides preliminary academic interpretation and mapping. It is not an official credential evaluation, admissions decision, or transfer-credit determination.</div>;
}
function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(requirements[0].id);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const chooseFile = (candidate?: File) => {
    setError('');
    if (!candidate) return;
    const validation = uploadSchema.safeParse({ file: candidate });
    if (!validation.success) { setFile(null); setError(candidate.size > 20 * 1024 * 1024 ? 'PDF files must be 20 MB or smaller.' : 'Please choose an English-language PDF. Other file types are not supported.'); return; }
    setFile(candidate);
  };
  const submit = () => {
    if (!file) { setError('Choose a PDF to continue.'); return; }
    sessionStorage.setItem('verifee-file-name', file.name);
    sessionStorage.setItem('verifee-target', target);
    sessionStorage.setItem('verifee-started', 'yes');
    setLocation('/analysis');
  };
  return <div className="shell"><Header /><main className="page-wrap">
    <section className="hero">
      <div className="eyebrow">Academic records, made clearer</div>
      <h1>Understand your academic background. Map what comes next.</h1>
      <p className="hero-copy">Make sense of an unfamiliar academic record and compare prior coursework with a focused set of target requirements. See the evidence, the uncertainty, and what may need a closer look.</p>
    </section>
    <section className="journey">
      <div className="panel upload-panel">
        <h2 className="panel-heading">Start with an academic record</h2>
        <p className="panel-sub">Upload an English-language transcript as a PDF, then choose the requirements you want to explore.</p>
        <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(event) => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); chooseFile(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} aria-label="Choose transcript PDF" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} data-testid="dropzone-pdf">
          <div><span className="upload-icon"><Upload size={19} /></span><p className="drop-title">{file ? 'PDF selected' : 'Drop a PDF here or'} {!file && <button className="browse" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>browse files</button>}</p><p className="drop-hint">English-language PDF only · 20 MB maximum</p></div>
        </div>
        <input ref={inputRef} className="file-control" type="file" accept="application/pdf,.pdf" aria-label="Choose a PDF transcript" data-testid="input-pdf" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
        {file && <div className="file-chip" data-testid="text-selected-file"><div className="chip-file"><FileText size={17} color="#55766c" /><div><strong>{file.name}</strong><div className="file-meta">{(file.size / (1024 * 1024)).toFixed(2)} MB · PDF document</div></div></div><button className="remove-file" aria-label="Remove selected file" data-testid="button-remove-file" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}><X size={16} /></button></div>}
        <label className="field-label" htmlFor="target-select">Georgia Institute of Technology requirement</label>
        <select id="target-select" className="target-select" value={target} onChange={(event) => setTarget(event.target.value)} data-testid="select-target">
          {requirements.map((requirement) => <option value={requirement.id} key={requirement.id}>{requirement.courseCode} · {requirement.targetName}</option>)}
        </select>
        <p className="form-note">Choose one local sample requirement for a focused preliminary comparison. Five Georgia Tech course examples are available. File type is checked; document language cannot be confirmed because the PDF is not read.</p>
        <button className="cta" type="button" onClick={submit} data-testid="button-analyze"><span>Analyze a credential</span><ArrowRight size={16} /></button>
        {error && <div className="error-message" role="alert" data-testid="status-upload-error">{error}</div>}
        <div className="mock-notice"><strong>Demonstration notice</strong><br />The selected PDF is not actually parsed or saved. This first build uses a sample academic record for the report; the file is only used to demonstrate the upload flow.</div>
      </div>
      <aside className="panel aside-panel">
        <div><div className="aside-kicker">How Verifee works</div><div className="aside-title">A careful first look, never a final verdict.</div>
          <ol className="step-list">
            <li><span className="step-num">01</span><span>Review the credential context and verification options separately.</span></li>
            <li><span className="step-num">02</span><span>Structure courses without hiding missing or unfamiliar details.</span></li>
            <li><span className="step-num">03</span><span>Compare course evidence against a focused set of requirements.</span></li>
            <li><span className="step-num">04</span><span>Surface uncertainty and items that need human review.</span></li>
          </ol>
        </div>
        <div className="aside-foot">Built for students and university staff. Course matches are preliminary and do not award credit.</div>
      </aside>
    </section>
    <Disclaimer />
  </main></div>;
}
function Analysis() {
  const [, setLocation] = useLocation();
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const fileName = sessionStorage.getItem('verifee-file-name');
  useEffect(() => {
    if (!fileName) { setLocation('/'); return; }
    let current = 0;
    const run = async () => {
      try {
        await extractMockRecord();
        await checkVerification();
        const timer = window.setInterval(() => {
          current++;
          setActive(current);
          if (current >= stages.length) {
            window.clearInterval(timer);
            window.setTimeout(() => setLocation('/report'), 500);
          }
        }, 650);
      } catch { setFailed(true); }
    };
    void run();
  }, [fileName, setLocation]);
  const retry = () => { setFailed(false); setActive(0); window.location.reload(); };
  return <div className="shell"><Header /><main className="center-page"><section className="panel analysis-box">
    <div className="analysis-top"><span className="eyebrow">Analysis in progress</span><span>{Math.min(Math.round((active / stages.length) * 100), 100)}%</span></div>
    <h1>Preparing your report</h1><p className="panel-sub">This takes a moment. The report will clearly distinguish sample interpretation from document verification.</p>
    <div className="progress-track"><div className="progress-value" style={{ width: `${Math.min((active / stages.length) * 100, 100)}%` }} /></div>
    <ol className="analysis-list">{stages.map((stage, index) => <li key={stage} className={`analysis-item ${index < active ? 'done' : index === active ? 'active' : ''}`}><span className="analysis-mark">{index < active ? <Check size={13} /> : index === active ? <LoaderCircle size={13} className="animate-spin" /> : <Circle size={8} />}</span>{stage}</li>)}</ol>
    <div className="analysis-note">Mock-data demonstration: the selected PDF is not read or saved. Analysis stages illustrate the intended workflow using a sample record.</div>
    {failed && <div role="alert" className="error-message">We couldn't prepare this sample report. <button type="button" className="browse" onClick={retry}>Try again</button></div>}
  </section></main></div>;
}
function Status({ result }: { result: Mapping['result'] }) {
  const cls = result === 'Covered' ? 'good' : result === 'Potential gap' ? 'gap' : 'review';
  return <span className={`status-pill ${cls}`} data-testid={`status-mapping-${result.toLowerCase().replaceAll(' ', '-')}`}>{result}</span>;
}
function Report() {
  const [, setLocation] = useLocation();
  const [target, setTarget] = useState(sessionStorage.getItem('verifee-target') || requirements[0].id);
  const [filter, setFilter] = useState('All requirements');
  const [expanded, setExpanded] = useState(true);
  const fileName = sessionStorage.getItem('verifee-file-name') || 'Selected PDF';
  const mapping = mapMockCourses(target);
  const visible = filter === 'All requirements' ? mapping : mapping.filter((item) => item.result === filter);
  const reset = () => { sessionStorage.removeItem('verifee-file-name'); sessionStorage.removeItem('verifee-target'); sessionStorage.removeItem('verifee-started'); setLocation('/'); };
  const covered = mapping.filter((item) => item.result === 'Covered').length;
  const reviewCount = mapping.filter((item) => item.result === 'Partially covered' || item.result === 'Insufficient evidence' || item.result === 'Potential gap').length;
  return <div className="shell"><Header /><main className="page-wrap report-page">
    <div className="report-top"><div><div className="eyebrow">Preliminary report · Sample record</div><h1 className="report-title">Credential interpretation</h1><p className="report-lede">A transparent first look at prior coursework against Georgia Institute of Technology requirements.</p></div><button className="secondary-btn" type="button" onClick={reset} data-testid="button-new-analysis"><RotateCcw size={14} /> New analysis</button></div>
    <div className="preliminary" data-testid="notice-preliminary"><AlertCircle size={16} /><span><strong>Preliminary, mock-data report.</strong> The selected file “{fileName}” was not parsed or saved. This report uses the sample record below and does not represent an analysis of that PDF.</span></div>
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
          <div className="section-title"><div><h2>Course mapping</h2><div className="form-note" style={{marginTop:5}}>Compare sample coursework with local Georgia Tech target requirements.</div></div><button className="remove-file" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Collapse course mappings' : 'Expand course mappings'} data-testid="button-toggle-mappings"><ChevronRight size={18} style={{transform:expanded?'rotate(90deg)':'none',transition:'transform .2s'}} /></button></div>
          {expanded && <>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:18}}>{['All requirements','Covered','Partially covered','Potential gap','Insufficient evidence'].map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className="secondary-btn" style={{padding:'7px 10px',fontSize:10,background:filter===value?'#eaf1ed':'#fff',borderColor:filter===value?'#a9c1b6':undefined}} data-testid={`filter-${value.toLowerCase().replaceAll(' ','-')}`}>{value}</button>)}</div>
            <div className="mapping-list">{visible.map((match) => {
              const requirement = requirements.find((item) => item.id === match.requirementId)!;
              return <article className="mapping-row" key={match.requirementId} data-testid={`mapping-${match.requirementId}`}>
                <div className="mapping-head"><div><p className="mapping-course"><span className="course-code">{requirement.courseCode}</span> · {requirement.targetName}</p><p className="mapping-desc">{requirement.description}</p></div><Status result={match.result} /></div>
                <p className="mapping-desc" style={{marginTop:9}}><strong>Matched sample course:</strong> {match.matchedCourses.join(', ') || 'No clearly corresponding course identified'}</p>
                <p className="mapping-desc" style={{marginTop:6}}><strong>Target course description:</strong> {requirement.courseDescription}</p>
                <p className="mapping-desc" style={{marginTop:6}}>{match.rationale}</p>
                <div className="mapping-evidence"><strong>Evidence &amp; limits</strong> — {match.evidence}<br /><span><strong>Prerequisite concepts:</strong> {requirement.prerequisiteConcepts.join(', ')}</span></div>
                <span className="confidence">Confidence: {match.confidence} · Preliminary</span>
              </article>;
            })}{visible.length === 0 && <p className="form-note">No requirements have this result.</p>}</div>
          </>}
        </section>
      </div>
      <aside className="report-side">
        <section className="verify-card" data-testid="card-verification"><p className="verify-heading"><ShieldAlert size={16} color="#8a764d" /> Credential verification</p><span className="status-pill" data-testid="status-verification">Verification unavailable</span><p className="verify-copy" style={{marginTop:10}}>No independent verification source is connected in this preliminary demonstration. Reading a document does not verify its authenticity.</p></section>
        <section className="panel section-card"><p className="report-aside-title">Mapping overview</p><div className="summary-number">{mapping.length}</div><div className="summary-caption">Georgia Tech requirements reviewed</div><div className="summary-split"><div><strong>{covered}</strong><span>Covered</span></div><div><strong>{reviewCount}</strong><span>Needs review</span></div></div></section>
        <section className="panel section-card"><p className="report-aside-title">Items requiring review</p><ul className="review-list"><li><span className="review-dot" />Obtain official course descriptions or syllabi for topic-level comparison.</li><li><span className="review-dot" />Confirm grading scale, credit units, and instructional hours with the issuing institution.</li><li><span className="review-dot" />Verify the credential independently; no verification was performed here.</li><li><span className="review-dot" />Have an authorized institution reviewer determine any transfer-credit outcome.</li></ul></section>
        <section className="panel section-card"><p className="report-aside-title">Target requirement</p><label className="data-label" htmlFor="report-target">Georgia Institute of Technology</label><select id="report-target" value={target} className="target-select" onChange={(event) => { setTarget(event.target.value); sessionStorage.setItem('verifee-target', event.target.value); }} data-testid="select-report-target">{requirements.map((item) => <option value={item.id} key={item.id}>{item.courseCode} · {item.targetName}</option>)}</select><p className="form-note">Local sample requirement choices:</p><ul className="review-list">{requirements.map((item) => <li key={item.id}><span className="review-dot" />{item.courseCode} — {item.targetName}</li>)}</ul></section>
      </aside>
    </div>
    <div className="report-disclaimer">Verifee provides preliminary academic interpretation and mapping. It is not an official credential evaluation, admissions decision, or transfer-credit determination. Verification is separate from interpretation and course mapping. This report is based on mock transcript data; no file contents were analyzed.</div>
  </main></div>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/analysis" component={Analysis} /><Route path="/report" component={Report} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;