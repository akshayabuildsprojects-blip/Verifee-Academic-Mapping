import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileText,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import {
  VERIFEE_REPORT_DISCLAIMER,
  type GeneratedReportMetadata,
  type VerifeeReportContextField,
  type VerifeeReportData,
  type VerifeeReportRequirement,
  type VerifeeReportSource,
} from '@/lib/verifee-report';
import './verifee-report-view.css';

export interface VerifeeReportViewProps {
  data: VerifeeReportData;
  generatedReport: GeneratedReportMetadata | null;
  onGenerate(): void;
  onDownload(): void;
  onDownloadReceipt(): void;
  onBackToMapping(): void;
  onStartNewAnalysis(): void;
}

const statusLabels: Record<string, string> = {
  COVERED: 'Covered',
  PARTIALLY_COVERED: 'Partially covered',
  POTENTIAL_GAP: 'Potential gap',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};

function display(value: string | null | undefined) {
  return value?.trim() || 'Not available';
}

function contextSource(field: VerifeeReportContextField) {
  if (field.source === 'TRANSCRIPT') return 'Source: Transcript';
  if (field.source === 'MAPPED') return 'Mapped by Verifee';
  return 'Not available';
}

function SourceLinks({
  sources,
  label,
}: {
  sources: VerifeeReportSource[];
  label: string;
}) {
  if (sources.length === 0) return null;
  return (
    <ul className="v-report-source-list" aria-label={label}>
      {sources.map((source, index) => (
        <li key={`${source.url}-${index}`}>
          <a href={source.url} target="_blank" rel="noreferrer">
            <span>{source.title?.trim() || source.url}</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function ContextValue({
  label,
  field,
}: {
  label: string;
  field: VerifeeReportContextField;
}) {
  return (
    <div className="v-report-context-item">
      <span className="v-report-label">{label}</span>
      <strong>{display(field.value)}</strong>
      <span className="v-report-context-origin">{contextSource(field)}</span>
      {field.sourceUrl && (
        <a className="v-report-context-link" href={field.sourceUrl} target="_blank" rel="noreferrer">
          View source <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function statusTone(status: string) {
  switch (status) {
    case 'COVERED':
      return 'covered';
    case 'PARTIALLY_COVERED':
      return 'partial';
    case 'POTENTIAL_GAP':
      return 'gap';
    default:
      return 'evidence';
  }
}

function institutionStatusLabel(status: VerifeeReportData['institutionStatus']['status']) {
  if (status === 'LISTED') return 'Listed in source';
  if (status === 'NOT_LISTED') return 'No exact match found';
  return 'Unable to check';
}

function RequirementCard({ requirement, index }: { requirement: VerifeeReportRequirement; index: number }) {
  const tone = statusTone(requirement.status);
  return (
    <article className="v-report-requirement" data-testid={`report-requirement-${requirement.requirementId}`}>
      <div className="v-report-requirement-top">
        <div className="v-report-requirement-index">{String(index + 1).padStart(2, '0')}</div>
        <div className="v-report-requirement-heading">
          <div className="v-report-requirement-meta">
            <span>{display(requirement.category)}</span>
            <span aria-hidden="true">·</span>
            <span>{display(requirement.importance)}</span>
          </div>
          <h3>{requirement.name}</h3>
        </div>
        <div className={`v-report-status v-report-status-${tone}`}>
          <span className="v-report-status-mark" aria-hidden="true" />
          {statusLabels[requirement.status] || requirement.status.replaceAll('_', ' ')}
        </div>
      </div>

      <div className="v-report-requirement-details">
        <div className="v-report-detail-line">
          <span className="v-report-label">Confidence</span>
          <span>{requirement.confidence}</span>
        </div>
        <div className="v-report-detail-line">
          <span className="v-report-label">Matching concepts</span>
          <span>{requirement.matchingConcepts.length ? requirement.matchingConcepts.join(' · ') : 'Not available'}</span>
        </div>

        <section className="v-report-evidence-block" aria-label={`Coursework evidence for ${requirement.name}`}>
          <h4>Coursework evidence</h4>
          {requirement.courses.length === 0 ? (
            <p className="v-report-empty-value">No candidate coursework was listed for this requirement.</p>
          ) : (
            <div className="v-report-course-list">
              {requirement.courses.map((course, courseIndex) => (
                <div className="v-report-course" key={`${course.courseIndex}-${course.code || course.title || courseIndex}`}>
                  <div className="v-report-course-heading">
                    <div>
                      <strong>{[course.code, course.title].filter(Boolean).join(' — ') || 'Course title not available'}</strong>
                      <span>{course.relevance}</span>
                    </div>
                    <div className="v-report-course-facts">
                      <span>Credits: {display(course.credits)}</span>
                      <span>Grade: {display(course.grade)}</span>
                    </div>
                  </div>
                  {course.transcriptDescription && (
                    <p className="v-report-course-description">{course.transcriptDescription}</p>
                  )}
                  {course.researchStatus && (
                    <p className="v-report-research-status">Evidence research: {course.researchStatus.replaceAll('_', ' ').toLowerCase()}</p>
                  )}
                  {course.evidence.length > 0 && (
                    <ul className="v-report-bullet-list">
                      {course.evidence.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
                    </ul>
                  )}
                  <SourceLinks sources={course.sources} label={`Sources for ${course.title || course.code || 'course'}`} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="v-report-evidence-block">
          <h4>Assessment and reasoning</h4>
          <p className="v-report-reasoning">{requirement.rationale}</p>
          {requirement.evidence.length > 0 && (
            <ul className="v-report-bullet-list">
              {requirement.evidence.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
            </ul>
          )}
          <SourceLinks sources={requirement.sources} label={`Sources for ${requirement.name}`} />
        </section>
      </div>
    </article>
  );
}

function GeneratedDate({ value }: { value: string }) {
  const date = new Date(value);
  return <>{Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</>;
}

export function VerifeeReportView({
  data,
  generatedReport,
  onGenerate,
  onDownload,
  onDownloadReceipt,
  onBackToMapping,
  onStartNewAnalysis,
}: VerifeeReportViewProps) {
  const counts = [
    { label: 'Covered', count: data.counts.covered, tone: 'covered' },
    { label: 'Partially covered', count: data.counts.partiallyCovered, tone: 'partial' },
    { label: 'Potential gap', count: data.counts.potentialGap, tone: 'gap' },
    { label: 'Insufficient evidence', count: data.counts.insufficientEvidence, tone: 'evidence' },
  ];

  return (
    <main className="v-report-page">
      <div className="v-report-wrap">
        <header className="v-report-intro">
          <div className="v-report-overline"><span /> Preliminary academic interpretation</div>
          <h1>Verifee Report</h1>
          <p>Generate a professional preliminary academic mapping report based on the completed analysis.</p>
        </header>

        <section className="v-report-summary" aria-labelledby="v-report-summary-title">
          <div className="v-report-summary-heading">
            <div>
              <span className="v-report-label">Analysis overview</span>
              <h2 id="v-report-summary-title">{data.issuingInstitution}</h2>
            </div>
            <div className="v-report-verification">
              <ShieldCheck size={17} aria-hidden="true" />
              <span><small>Credential verification</small><strong>{data.credentialVerification.status}</strong></span>
            </div>
          </div>

          <div className="v-report-overview-grid">
            <div className="v-report-overview-context">
              <ContextValue label="Country / education system" field={data.countryEducationSystem} />
              <ContextValue label="Broad academic field" field={data.broadAcademicField} />
              <ContextValue label="Specific discipline" field={data.specificDiscipline} />
              <ContextValue label="Source program" field={data.sourceProgram} />
              <div className="v-report-context-item">
                <span className="v-report-label">Target institution &amp; program</span>
                <strong>{data.targetInstitution}</strong>
                <span className="v-report-context-origin">{data.targetProgram.name} ({data.targetProgram.shortName}) · {data.targetProgram.school}</span>
              </div>
              <div className="v-report-context-item">
                <span className="v-report-label">Academic interpretation</span>
                <strong>{data.academicInterpretation}</strong>
              </div>
            </div>
            <div className="v-report-count-panel">
              <div className="v-report-count-total">
                <span className="v-report-label">Requirements analyzed</span>
                <strong>{data.requirementsAnalyzed}</strong>
              </div>
              <div className="v-report-counts" aria-label="Requirement status counts">
                {counts.map(({ label, count, tone }) => (
                  <div className="v-report-count-item" key={label}>
                    <span className={`v-report-count-dot v-report-count-dot-${tone}`} aria-hidden="true" />
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {!generatedReport ? (
          <>
            <section className="v-report-fee" aria-labelledby="v-report-fee-title">
              <div className="v-report-fee-icon"><FileText size={19} aria-hidden="true" /></div>
              <div className="v-report-fee-copy">
                <h2 id="v-report-fee-title">Verifee Preliminary Academic Mapping Report</h2>
                <p>Report pricing is disabled during the Verifee demo. No payment information is required.</p>
              </div>
              <div className="v-report-fee-amount">
                <strong>$0.00</strong>
                <span>Free in Demo Mode</span>
              </div>
            </section>

            <div className="v-report-generate">
              <button className="v-report-button v-report-button-primary" type="button" onClick={onGenerate} data-testid="button-generate-report">
                Generate Report <ArrowRight size={16} aria-hidden="true" />
              </button>
              <p>Generate a report preview from the completed academic mapping.</p>
            </div>
          </>
        ) : (
          <>
            <section className="v-report-preview" aria-labelledby="v-report-preview-title">
              <div className="v-report-preview-toolbar">
                <div>
                  <span className="v-report-label">Generated academic report</span>
                  <h2 id="v-report-preview-title">Report preview</h2>
                </div>
                <div className="v-report-download-actions">
                  <button className="v-report-button v-report-button-secondary" type="button" onClick={onDownloadReceipt} data-testid="button-download-submission-receipt">
                    <FileText size={15} aria-hidden="true" /> Download Submission Receipt
                  </button>
                  <button className="v-report-button v-report-button-primary" type="button" onClick={onDownload} aria-label="Download report as PDF" data-testid="button-download-report">
                    <ArrowDownToLine size={16} aria-hidden="true" /> Download PDF
                  </button>
                </div>
              </div>

              <article className="v-report-cover" aria-label="Report cover page">
                <div className="v-report-cover-top">
                  <span className="v-report-wordmark"><span className="v-report-brand-mark"><BookOpen size={16} aria-hidden="true" /></span> verifee</span>
                  <span>ACADEMIC INTERPRETATION</span>
                </div>
                <div className="v-report-cover-content">
                  <div className="v-report-cover-rule" />
                  <span className="v-report-cover-kicker">Credential &amp; program review</span>
                  <h2>Preliminary Academic Mapping Report</h2>
                  <div className="v-report-cover-context">
                    <div><span>Issuing institution</span><strong>{data.issuingInstitution}</strong></div>
                    <div><span>Country / education system</span><strong>{display(data.countryEducationSystem.value)}</strong></div>
                    <div><span>Broad academic field</span><strong>{display(data.broadAcademicField.value)}</strong></div>
                    <div><span>Specific discipline</span><strong>{display(data.specificDiscipline.value)}</strong></div>
                    <div><span>Source program</span><strong>{display(data.sourceProgram.value)}</strong></div>
                    <div><span>Target institution</span><strong>{data.targetInstitution}</strong></div>
                    <div><span>Target program</span><strong>{data.targetProgram.name} ({data.targetProgram.shortName}) · {data.targetProgram.school}</strong></div>
                  </div>
                  <div className="v-report-cover-status">
                    <span>Credential verification · {data.credentialVerification.status}</span>
                    <strong>Academic Interpretation · {data.academicInterpretation}</strong>
                  </div>
                  <div className="v-report-cover-total">
                    <span>Mapping summary</span>
                    <strong>{data.requirementsAnalyzed} requirements analyzed</strong>
                  </div>
                  <div className="v-report-cover-counts" aria-label="Requirement status counts">
                    {counts.map(({ label, count }) => (
                      <div key={label}><strong>{count}</strong><span>{label}</span></div>
                    ))}
                  </div>
                </div>
                <div className="v-report-cover-footer">
                  <span className="v-report-cover-brand-line">A record, with context.</span>
                  <span>Generated <GeneratedDate value={generatedReport.generatedAt} /></span>
                  <span className="v-report-cover-id">Report {generatedReport.reportId}</span>
                </div>
              </article>

              <section className="v-report-document-section" aria-labelledby="v-report-context-heading">
                <div className="v-report-section-heading">
                  <span>01 / CONTEXT</span>
                  <h2 id="v-report-context-heading">Mapped academic context</h2>
                  <p>Academic details are shown with their origin so reviewers can distinguish transcript information from contextual mapping.</p>
                </div>
                <div className="v-report-document-context">
                  <ContextValue label="Issuing institution" field={{ value: data.issuingInstitution, source: 'TRANSCRIPT', sourceUrl: null }} />
                  <ContextValue label="Country / education system" field={data.countryEducationSystem} />
                  <ContextValue label="Broad academic field" field={data.broadAcademicField} />
                  <ContextValue label="Specific discipline" field={data.specificDiscipline} />
                  <ContextValue label="Source program" field={data.sourceProgram} />
                  <div className="v-report-context-item">
                    <span className="v-report-label">Target institution / program</span>
                    <strong>{data.targetInstitution}</strong>
                    <span className="v-report-context-origin">{data.targetProgram.name} ({data.targetProgram.shortName}) · {data.targetProgram.school}</span>
                    <span className="v-report-context-origin">Mapped by Verifee</span>
                  </div>
                </div>
                <div className="v-report-verification-detail">
                  <span className="v-report-label">Credential verification · {data.credentialVerification.status}</span>
                  <p>{data.credentialVerification.explanation}</p>
                  {data.credentialVerification.method && <span className="v-report-context-origin">Method: {data.credentialVerification.method}</span>}
                </div>
              </section>

              <section className="v-report-document-section v-report-institution-section" aria-labelledby="v-report-institution-heading">
                <div className="v-report-section-heading">
                  <span>02 / INSTITUTION STATUS</span>
                  <h2 id="v-report-institution-heading">Institution status check</h2>
                  <p>This source-scoped directory result is separate from credential authenticity, academic mapping, and admissions.</p>
                </div>
                <div className={`v-report-institution-result v-report-institution-result-${data.institutionStatus.status.toLowerCase().replaceAll('_', '-')}`}>
                  <span className="v-report-label">Directory result</span>
                  <strong>{institutionStatusLabel(data.institutionStatus.status)}</strong>
                  <p>{data.institutionStatus.summary}</p>
                </div>
                <div className="v-report-document-context v-report-institution-context">
                  <div className="v-report-context-item">
                    <span className="v-report-label">Jurisdiction</span>
                    <strong>{display(data.institutionStatus.jurisdiction)}</strong>
                  </div>
                  <div className="v-report-context-item">
                    <span className="v-report-label">Source</span>
                    {data.institutionStatus.sourceName && data.institutionStatus.sourceUrl
                      ? <a className="v-report-context-link" href={data.institutionStatus.sourceUrl} target="_blank" rel="noreferrer">{data.institutionStatus.sourceName} <ExternalLink size={12} aria-hidden="true" /></a>
                      : <strong>Not available for this jurisdiction</strong>}
                  </div>
                  {data.institutionStatus.matchedName && <div className="v-report-context-item">
                    <span className="v-report-label">Registry entry</span>
                    <strong>{data.institutionStatus.matchedName}</strong>
                  </div>}
                  {data.institutionStatus.registryStatus && <div className="v-report-context-item">
                    <span className="v-report-label">Registry status</span>
                    <strong>{data.institutionStatus.registryStatus}</strong>
                    <span className="v-report-context-origin">Status text published by source</span>
                  </div>}
                  <div className="v-report-context-item">
                    <span className="v-report-label">Checked at</span>
                    <strong><GeneratedDate value={data.institutionStatus.checkedAt} /></strong>
                  </div>
                </div>
                <p className="v-report-institution-coverage"><strong>Coverage limits:</strong> {data.institutionStatus.coverageLimits}</p>
              </section>

              <section className="v-report-document-section" aria-labelledby="v-report-mapping-heading">
                <div className="v-report-section-heading">
                  <span>03 / MAPPING SUMMARY</span>
                  <h2 id="v-report-mapping-heading">Requirement overview</h2>
                  <p>{data.requirementsAnalyzed} requirements assessed against {data.targetProgram.name}.</p>
                </div>
                <div className="v-report-summary-strip">
                  {counts.map(({ label, count, tone }) => (
                    <div className={`v-report-summary-stat v-report-summary-stat-${tone}`} key={label}>
                      <strong>{count}</strong><span>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="v-report-summary-destination">
                  <Landmark size={17} aria-hidden="true" />
                  <span><strong>{data.targetInstitution}</strong>{data.targetProgram.name} ({data.targetProgram.shortName}) · {data.targetProgram.school}</span>
                </div>
              </section>

              <section className="v-report-document-section" aria-labelledby="v-report-requirements-heading">
                <div className="v-report-section-heading">
                  <span>04 / REQUIREMENT DETAIL</span>
                  <h2 id="v-report-requirements-heading">Coursework against requirements</h2>
                  <p>Each stored requirement is presented with its assessment, confidence, supporting coursework, evidence, reasoning, and available sources.</p>
                </div>
                <div className="v-report-requirements">
                  {data.requirements.map((requirement, index) => (
                    <RequirementCard key={requirement.requirementId} requirement={requirement} index={index} />
                  ))}
                </div>
              </section>

              {data.itemsRequiringReview.length > 0 && (
                <section className="v-report-review-section" aria-labelledby="v-report-review-heading">
                  <span className="v-report-review-kicker">05 / REVIEW NOTES</span>
                  <h2 id="v-report-review-heading">Items requiring review</h2>
                  <ul>
                    {data.itemsRequiringReview.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                  </ul>
                </section>
              )}

              <footer className="v-report-disclaimer">
                <span>INTERPRETATION BOUNDARY</span>
                <p>{VERIFEE_REPORT_DISCLAIMER}</p>
              </footer>
            </section>
            <div className="v-report-post-actions">
              <button className="v-report-button v-report-button-secondary" type="button" onClick={onBackToMapping} data-testid="button-back-to-mapping">
                <ArrowLeft size={15} aria-hidden="true" /> Back to Academic Mapping
              </button>
              <button className="v-report-button v-report-button-text" type="button" onClick={onStartNewAnalysis} data-testid="button-start-new-analysis">
                Start New Analysis <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default VerifeeReportView;