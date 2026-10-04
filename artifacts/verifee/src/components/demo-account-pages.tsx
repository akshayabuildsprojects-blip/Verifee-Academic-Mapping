import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  GraduationCap,
  LogOut,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import './demo-account-pages.css';

export interface DemoSavedReportSummary {
  reportId: string;
  createdAt: string;
  sourceInstitution: string;
  targetInstitution: string;
  targetProgram: string;
  reportStatus: string;
  verificationStatus: string;
  mappingSummary: {
    requirementsAnalyzed: number;
    covered: number;
    partiallyCovered: number;
    potentialGap: number;
    insufficientEvidence: number;
  };
}

export interface DemoLoginPageProps {
  onEnterDemo(): void;
}

export interface DemoDashboardPageProps {
  displayName: string;
  reportCount: number;
  onNewMapping(): void;
  onMyReports(): void;
  onLogOut(): void;
}

export interface DemoReportsPageProps {
  displayName: string;
  reports: DemoSavedReportSummary[];
  onNewMapping(): void;
  onDashboard(): void;
  onOpenReport(reportId: string): void;
  onLogOut(): void;
}

function DemoMark() {
  return (
    <span className="demo-account__brand-mark" aria-hidden="true">
      <BookOpen size={16} strokeWidth={2.1} />
    </span>
  );
}

function DemoHeader({
  onLogOut,
  onNewMapping,
  onMyReports,
  onDashboard,
  activePage,
}: {
  onLogOut?: () => void;
  onNewMapping?: () => void;
  onMyReports?: () => void;
  onDashboard?: () => void;
  activePage?: 'dashboard' | 'reports';
}) {
  return (
    <header className="demo-account__header">
      <a className="demo-account__brand" href={onLogOut ? '/dashboard' : '/'} aria-label="Verifee home" data-testid="link-verifee-home">
        <DemoMark />
        <span>verifee</span>
      </a>
      {onLogOut && <nav className="demo-account__navigation" aria-label="Demo navigation">
        {onNewMapping && <button type="button" onClick={onNewMapping} data-testid="nav-new-mapping">New Mapping</button>}
        {onMyReports && <button type="button" onClick={onMyReports} aria-current="page" data-testid="nav-my-reports">My Reports</button>}
        {!onMyReports && activePage === 'reports' && <span aria-current="page" data-testid="nav-my-reports">My Reports</span>}
        {onDashboard && <button type="button" onClick={onDashboard} data-testid="nav-dashboard">Dashboard</button>}
        {!onDashboard && activePage === 'dashboard' && <span aria-current="page" data-testid="nav-dashboard">Dashboard</span>}
      </nav>}
      <div className="demo-account__header-right">
        <span className="demo-account__mode"><span aria-hidden="true" /> Demo mode</span>
        {onLogOut && (
          <button className="demo-account__quiet-action" type="button" onClick={onLogOut} data-testid="button-demo-log-out">
            <LogOut size={15} aria-hidden="true" />
            <span>Exit demo</span>
          </button>
        )}
      </div>
    </header>
  );
}

function DemoDisclaimer() {
  return (
    <footer className="demo-account__disclaimer">
      <span className="demo-account__disclaimer-mark" aria-hidden="true"><CircleHelp size={14} /></span>
      <p>Verifee offers a preliminary academic interpretation. It is not an official credential evaluation, admissions decision, or transfer-credit determination.</p>
    </footer>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Date not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function statusTone(value: string) {
  const status = value.toLowerCase();
  if (status.includes('ready') || status.includes('verified') || status.includes('listed') || status.includes('covered')) return 'positive';
  if (status.includes('unavailable') || status.includes('unable') || status.includes('not checked')) return 'caution';
  return 'neutral';
}

function ReportSummary({ report }: { report: DemoSavedReportSummary }) {
  const { mappingSummary } = report;
  return (
    <div className="demo-account__mapping-summary" data-testid={`report-summary-${report.reportId}`}>
      <div className="demo-account__summary-total">
        <span>Requirements analyzed</span>
        <strong data-testid={`report-requirements-${report.reportId}`}>{mappingSummary.requirementsAnalyzed}</strong>
      </div>
      <div className="demo-account__summary-counts" aria-label="Mapping result counts">
        <span><i className="demo-account__count-dot is-covered" aria-hidden="true" />Covered <strong data-testid={`report-covered-${report.reportId}`}>{mappingSummary.covered}</strong></span>
        <span><i className="demo-account__count-dot is-partial" aria-hidden="true" />Partial <strong data-testid={`report-partial-${report.reportId}`}>{mappingSummary.partiallyCovered}</strong></span>
        <span><i className="demo-account__count-dot is-gap" aria-hidden="true" />Potential gaps <strong data-testid={`report-potential-gap-${report.reportId}`}>{mappingSummary.potentialGap}</strong></span>
        <span><i className="demo-account__count-dot is-evidence" aria-hidden="true" />Insufficient evidence <strong data-testid={`report-insufficient-evidence-${report.reportId}`}>{mappingSummary.insufficientEvidence}</strong></span>
      </div>
    </div>
  );
}

function ReportCard({
  report,
  onOpen,
}: {
  report: DemoSavedReportSummary;
  onOpen(reportId: string): void;
}) {
  return (
    <article className="demo-account__report-card" data-testid={`card-saved-report-${report.reportId}`}>
      <div className="demo-account__report-main">
        <div className="demo-account__report-meta">
          <span className="demo-account__report-icon" aria-hidden="true"><FileText size={17} /></span>
          <span data-testid={`report-date-${report.reportId}`}>{formatDate(report.createdAt)}</span>
          <span className="demo-account__meta-separator" aria-hidden="true">·</span>
          <span className="demo-account__report-id">Report {report.reportId}</span>
        </div>
        <h2 data-testid={`report-program-${report.reportId}`}>{report.targetProgram}</h2>
        <div className="demo-account__institutions">
          <span data-testid={`report-source-institution-${report.reportId}`}>{report.sourceInstitution}</span>
          <ArrowRight size={14} aria-hidden="true" />
          <span data-testid={`report-target-institution-${report.reportId}`}>{report.targetInstitution}</span>
        </div>
        <div className="demo-account__report-status-row">
          <span className={`demo-account__status is-${statusTone(report.reportStatus)}`} data-testid={`report-status-${report.reportId}`}>
            <Check size={14} aria-hidden="true" />
            {report.reportStatus || 'Report status not available'}
          </span>
          <span className="demo-account__verification-label" data-testid={`report-verification-status-${report.reportId}`}>
            <ShieldCheck size={13} aria-hidden="true" />
            <span>Credential verification · {report.verificationStatus || 'Not available'}</span>
          </span>
        </div>
        <ReportSummary report={report} />
      </div>
      <button
        className="demo-account__open-report"
        type="button"
        onClick={() => onOpen(report.reportId)}
        aria-label={`Open report for ${report.targetProgram}`}
        data-testid={`button-open-report-${report.reportId}`}
      >
        <span>Open report</span><ChevronRight size={17} aria-hidden="true" />
      </button>
    </article>
  );
}

export function DemoLoginPage({ onEnterDemo }: DemoLoginPageProps) {
  return (
    <div className="demo-account demo-account--login">
      <DemoHeader />
      <main className="demo-account__login-main">
        <section className="demo-account__login-panel" aria-labelledby="demo-login-title">
          <div className="demo-account__login-side">
            <div className="demo-account__side-kicker"><span /> A clearer first look</div>
            <div className="demo-account__book-illustration" aria-hidden="true">
              <div className="demo-account__book-spine"><BookOpen size={22} /></div>
              <div className="demo-account__book-page">
                <span className="demo-account__page-label">ACADEMIC RECORD</span>
                <span className="demo-account__page-rule" />
                <span className="demo-account__page-line" />
                <span className="demo-account__page-line short" />
                <span className="demo-account__page-check"><Check size={12} /></span>
              </div>
              <span className="demo-account__orbit orbit-one" />
              <span className="demo-account__orbit orbit-two" />
            </div>
            <p>Context before conclusions.</p>
          </div>
          <div className="demo-account__login-copy">
            <span className="demo-account__eyebrow">VERIFEE · SESSION-ONLY DEMO</span>
            <span className="demo-account__demo-label"><span aria-hidden="true" /> Demo Mode</span>
            <h1 id="demo-login-title">Welcome to your<br /><em>Verifee workspace.</em></h1>
            <p className="demo-account__login-description">Explore saved academic mappings and see how international credentials can be understood before formal review.</p>
            <div className="demo-account__session-note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>This is a browser-session demo. No email or password is needed.</span>
            </div>
            <button className="demo-account__primary-button" type="button" onClick={onEnterDemo} data-testid="button-enter-demo">
              Continue to demo <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="demo-account__login-footnote">Your demo account view is held only for this browser session.</p>
          </div>
        </section>
        <DemoDisclaimer />
      </main>
    </div>
  );
}

export function DemoDashboardPage({
  displayName,
  reportCount,
  onNewMapping,
  onMyReports,
  onLogOut,
}: DemoDashboardPageProps) {
  return (
    <div className="demo-account">
      <DemoHeader onLogOut={onLogOut} onNewMapping={onNewMapping} onMyReports={onMyReports} activePage="dashboard" />
      <main className="demo-account__page">
        <div className="demo-account__page-topline">
          <div className="demo-account__breadcrumbs"><span>Workspace</span><span aria-hidden="true">/</span><strong>Overview</strong></div>
          <span className="demo-account__demo-label"><span aria-hidden="true" /> Demo Mode</span>
        </div>
        <section className="demo-account__welcome" aria-labelledby="demo-dashboard-title">
          <div>
            <span className="demo-account__eyebrow">YOUR VERIFEE WORKSPACE</span>
            <h1 id="demo-dashboard-title">Good to have you here, <em>{displayName}.</em></h1>
            <p>Review the reports saved in this session or start a new academic mapping below.</p>
          </div>
        </section>

        <section className="demo-account__dashboard-grid" aria-label="Workspace overview">
          <article className="demo-account__reports-overview">
            <div className="demo-account__overview-heading">
              <div>
                <span className="demo-account__eyebrow">SAVED IN THIS SESSION</span>
                <h2>Your reports</h2>
              </div>
              <span className="demo-account__report-count" data-testid="text-report-count">{reportCount}</span>
            </div>
            <p>{reportCount === 1 ? 'One report is available' : `${reportCount} reports are available`} in this browser session.</p>
            <button className="demo-account__text-action" type="button" onClick={onMyReports} data-testid="button-my-reports">
              View saved reports <ArrowRight size={15} aria-hidden="true" />
            </button>
          </article>
          <button
            className="demo-account__support-note demo-account__mapping-cta"
            type="button"
            onClick={onNewMapping}
            aria-labelledby="dashboard-mapping-action"
            data-testid="button-dashboard-start-mapping"
          >
            <span className="demo-account__support-icon" aria-hidden="true"><GraduationCap size={20} /></span>
            <span className="demo-account__eyebrow">A CAREFUL FIRST PASS</span>
            <span className="demo-account__support-title" role="heading" aria-level={2}>Understand the context behind a credential.</span>
            <span className="demo-account__support-copy">Mappings help make academic preparation more legible. They are preliminary and do not replace formal review.</span>
            <span className="demo-account__mapping-cta-action" id="dashboard-mapping-action">
              <Plus size={16} aria-hidden="true" />
              Start a new mapping
              <ArrowRight size={15} aria-hidden="true" />
            </span>
          </button>
        </section>

        <section className="demo-account__boundary" aria-label="Demo account details">
          <span className="demo-account__boundary-mark"><ShieldCheck size={16} aria-hidden="true" /></span>
          <div>
            <strong>Demo data stays in this session</strong>
            <p>Saved report details are available in this browser session only.</p>
          </div>
        </section>
        <DemoDisclaimer />
      </main>
    </div>
  );
}

export function DemoReportsPage({
  displayName,
  reports,
  onNewMapping,
  onDashboard,
  onOpenReport,
  onLogOut,
}: DemoReportsPageProps) {
  return (
    <div className="demo-account">
      <DemoHeader onLogOut={onLogOut} onNewMapping={onNewMapping} onDashboard={onDashboard} activePage="reports" />
      <main className="demo-account__page">
        <div className="demo-account__page-topline">
          <div className="demo-account__breadcrumbs">
            <button type="button" onClick={onDashboard} data-testid="button-back-dashboard" aria-label="Back to dashboard">
              <ArrowLeft size={14} aria-hidden="true" /> Workspace
            </button>
            <span aria-hidden="true">/</span><strong>My reports</strong>
          </div>
          <span className="demo-account__demo-label"><span aria-hidden="true" /> Demo Mode</span>
        </div>
        <section className="demo-account__reports-heading" aria-labelledby="demo-reports-title">
          <div>
            <span className="demo-account__eyebrow">SESSION-SAVED MAPPINGS</span>
            <h1 id="demo-reports-title">My reports</h1>
            <p>{displayName}, review the preliminary academic mappings saved in this session.</p>
          </div>
          <button className="demo-account__primary-button" type="button" onClick={onNewMapping} data-testid="button-new-mapping">
            <Plus size={17} aria-hidden="true" /> New mapping
          </button>
        </section>

        {reports.length > 0 ? (
          <section className="demo-account__report-list" aria-label="Saved reports">
            {reports.map((report) => (
              <ReportCard key={report.reportId} report={report} onOpen={onOpenReport} />
            ))}
          </section>
        ) : (
          <section className="demo-account__empty-state" aria-labelledby="demo-empty-title" data-testid="empty-saved-reports">
            <span className="demo-account__empty-icon" aria-hidden="true"><FileText size={23} /></span>
            <span className="demo-account__eyebrow">NOTHING SAVED YET</span>
            <h2 id="demo-empty-title">Your first report will appear here.</h2>
            <p>Start an academic mapping to compare prior coursework with a target program. Once saved, its summary will be available for this browser session.</p>
            <button className="demo-account__primary-button" type="button" onClick={onNewMapping} data-testid="button-empty-new-mapping">
              Start a mapping <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>
        )}

        <DemoDisclaimer />
      </main>
    </div>
  );
}