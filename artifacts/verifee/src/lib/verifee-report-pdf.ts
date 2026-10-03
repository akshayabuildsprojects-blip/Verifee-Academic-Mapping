import { jsPDF } from 'jspdf';
import type {
  GeneratedReportMetadata,
  VerifeeReportContextField,
  VerifeeReportData,
  VerifeeReportRequirement,
  VerifeeReportSource,
} from './verifee-report';
import { VERIFEE_REPORT_DISCLAIMER } from './verifee-report';

const palette = {
  ink: [43, 58, 53] as const,
  muted: [104, 119, 111] as const,
  green: [52, 99, 82] as const,
  sage: [232, 240, 232] as const,
  pale: [247, 248, 243] as const,
  line: [218, 226, 218] as const,
  amber: [153, 119, 66] as const,
  clay: [150, 102, 77] as const,
  white: [255, 255, 252] as const,
};

const margin = 52;
const footerTop = 738;
const contentBottom = 720;
const contentWidth = 508;

function safeFilePart(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'Unknown'
  );
}

function sourceLabel(field: VerifeeReportContextField) {
  if (field.source === 'TRANSCRIPT') return 'Source: Transcript';
  if (field.source === 'MAPPED') return 'Mapped by Verifee';
  return 'Not available';
}

function statusText(status: VerifeeReportRequirement['status']) {
  switch (status) {
    case 'COVERED':
      return 'Covered';
    case 'PARTIALLY_COVERED':
      return 'Partially Covered';
    case 'POTENTIAL_GAP':
      return 'Potential Gap';
    case 'INSUFFICIENT_EVIDENCE':
      return 'Insufficient Evidence';
  }
}

function statusColor(status: VerifeeReportRequirement['status']) {
  switch (status) {
    case 'COVERED':
      return palette.green;
    case 'PARTIALLY_COVERED':
      return palette.amber;
    case 'POTENTIAL_GAP':
      return palette.clay;
    case 'INSUFFICIENT_EVIDENCE':
      return palette.muted;
  }
}

function institutionStatusLabel(status: VerifeeReportData['institutionStatus']['status']) {
  if (status === 'LISTED') return 'Listed in source';
  if (status === 'NOT_LISTED') return 'No exact name match found';
  return 'Unable to check';
}

function generatedDateLabel(generatedAt: string) {
  const date = new Date(generatedAt);
  return Number.isNaN(date.getTime())
    ? generatedAt
    : new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

function safeSourceUrl(source: VerifeeReportSource) {
  try {
    const url = new URL(source.url);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function downloadVerifeeReportPdf(
  data: VerifeeReportData,
  metadata: GeneratedReportMetadata,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - margin;
  const width = pageWidth - margin * 2;
  const generatedAt = generatedDateLabel(metadata.generatedAt);
  let y = 58;

  doc.setProperties({
    title: 'Verifee Preliminary Academic Mapping Report',
    subject: `Academic mapping report ${metadata.reportId}`,
    author: 'Verifee',
    creator: 'Verifee',
    keywords: 'academic interpretation, preliminary mapping',
  });

  const setColor = (color: readonly number[]) => {
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const nextPage = () => {
    doc.addPage('letter', 'portrait');
    y = 72;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setColor(palette.green);
    doc.text('VERIFEE  /  PRELIMINARY ACADEMIC MAPPING REPORT', margin, 39);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.7);
    doc.line(margin, 49, right, 49);
  };

  const ensureSpace = (height: number) => {
    if (y + height > contentBottom) nextPage();
  };

  const addWrapped = (
    value: string,
    options: {
      x?: number;
      width?: number;
      size?: number;
      font?: 'helvetica' | 'times';
      style?: 'normal' | 'bold' | 'italic' | 'bolditalic';
      color?: readonly number[];
      gap?: number;
      url?: string;
      lineHeight?: number;
    } = {},
  ) => {
    const {
      x = margin,
      width: textWidth = contentWidth,
      size = 9,
      font = 'helvetica',
      style = 'normal',
      color = palette.ink,
      gap = 4,
      url,
      lineHeight = size * 1.42,
    } = options;
    const cleanValue = value.replace(/\r\n/g, '\n').trim();
    if (!cleanValue) return;
    doc.setFont(font, style);
    doc.setFontSize(size);
    const lines = cleanValue
      .split('\n')
      .flatMap((line) => (line ? doc.splitTextToSize(line, textWidth) : ['']));
    setColor(color);
    for (const line of lines) {
      ensureSpace(lineHeight);
      if (line) {
        doc.text(line, x, y);
        if (url) {
          doc.link(x, y - size, doc.getTextWidth(line), lineHeight, { url });
        }
      }
      y += lineHeight;
    }
    y += gap;
  };

  const addSectionHeading = (index: string, title: string, description?: string) => {
    ensureSpace(59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColor(palette.green);
    doc.text(index.toUpperCase(), margin, y);
    y += 15;
    doc.setFont('times', 'normal');
    doc.setFontSize(20);
    setColor(palette.ink);
    doc.text(title, margin, y);
    y += 17;
    if (description) {
      addWrapped(description, { size: 8.5, color: palette.muted, gap: 8 });
    } else {
      y += 5;
    }
  };

  const drawCoverField = (
    x: number,
    top: number,
    fieldWidth: number,
    label: string,
    value: string,
    detail?: string,
  ) => {
    doc.setFillColor(...palette.white);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.7);
    doc.roundedRect(x, top, fieldWidth, 52, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    setColor(palette.muted);
    doc.text(label.toUpperCase(), x + 11, top + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    setColor(palette.ink);
    const valueLines = doc.splitTextToSize(value || 'Not available', fieldWidth - 22);
    doc.text(valueLines.slice(0, 2), x + 11, top + 28);
    if (detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setColor(palette.muted);
      doc.text(detail, x + 11, top + 45);
    }
  };

  const drawCover = () => {
    doc.setFillColor(...palette.pale);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(...palette.green);
    doc.rect(0, 0, 17, pageHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setColor(palette.green);
    doc.text('VERIFEE', margin, 64);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(palette.muted);
    doc.text('PRELIMINARY ACADEMIC INTERPRETATION', right, 64, { align: 'right' });
    doc.setDrawColor(...palette.line);
    doc.line(margin, 79, right, 79);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColor(palette.green);
    doc.text('ACADEMIC CREDENTIAL & PROGRAM REVIEW', margin, 124);
    doc.setFont('times', 'normal');
    doc.setFontSize(30);
    setColor(palette.ink);
    doc.text(['Preliminary Academic', 'Mapping Report'], margin, 170, {
      lineHeightFactor: 1.2,
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(palette.green);
    doc.text(data.targetProgram.name, margin, 226, {
      maxWidth: contentWidth,
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(palette.muted);
    doc.text(data.targetInstitution, margin, 243);
    doc.setFontSize(7.5);
    doc.text('A preliminary comparison based on the completed academic analysis.', margin, 262);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(palette.muted);
    doc.text(`REPORT ID  ${metadata.reportId}`, margin, 292);
    doc.text(`GENERATED  ${generatedAt}`, right, 292, { align: 'right' });

    const columns = 3;
    const gap = 9;
    const fieldWidth = (contentWidth - gap * (columns - 1)) / columns;
    const rowTop = 311;
    const rowHeight = 59;
    const fields = [
      ['Issuing Institution', data.issuingInstitution, 'Source: Transcript'],
      [
        'Country / Education System',
        data.countryEducationSystem.value,
        sourceLabel(data.countryEducationSystem),
      ],
      [
        'Broad Academic Field',
        data.broadAcademicField.value,
        sourceLabel(data.broadAcademicField),
      ],
      [
        'Specific Discipline',
        data.specificDiscipline.value,
        sourceLabel(data.specificDiscipline),
      ],
      [
        'Source Program',
        data.sourceProgram.value,
        sourceLabel(data.sourceProgram),
      ],
      ['Target Institution', data.targetInstitution, 'Selected target'],
      [
        'Target Program',
        data.targetProgram.name,
        `${data.targetProgram.shortName} · ${data.targetProgram.school}`,
      ],
      [
        'Credential Verification',
        data.credentialVerification.status,
        data.credentialVerification.method
          ? `Method: ${data.credentialVerification.method}`
          : 'No authenticity claim is made',
      ],
      ['Academic Interpretation', data.academicInterpretation, 'Completed'],
    ];
    fields.forEach(([label, value, detail], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      drawCoverField(
        margin + column * (fieldWidth + gap),
        rowTop + row * rowHeight,
        fieldWidth,
        label,
        value,
        detail,
      );
    });

    const summaryTop = rowTop + Math.ceil(fields.length / columns) * rowHeight + 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(palette.green);
    doc.text(
      `MAPPING SUMMARY · ${data.requirementsAnalyzed} REQUIREMENTS ANALYZED`,
      margin,
      summaryTop + 9,
    );
    const stats = [
      ['Covered', data.counts.covered, palette.green],
      ['Partially Covered', data.counts.partiallyCovered, palette.amber],
      ['Potential Gaps', data.counts.potentialGap, palette.clay],
      ['Insufficient Evidence', data.counts.insufficientEvidence, palette.muted],
    ] as const;
    const statWidth = contentWidth / stats.length;
    stats.forEach(([label, count, color], index) => {
      const x = margin + index * statWidth;
      doc.setFillColor(...palette.white);
      doc.setDrawColor(...palette.line);
      doc.roundedRect(x, summaryTop + 17, statWidth - 5, 41, 4, 4, 'FD');
      doc.setFont('times', 'normal');
      doc.setFontSize(17);
      setColor(color);
      doc.text(String(count), x + 10, summaryTop + 37);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      setColor(palette.muted);
      doc.text(label, x + 10, summaryTop + 50);
    });

    doc.setFont('times', 'italic');
    doc.setFontSize(12);
    setColor(palette.green);
    doc.text('A record, with context.', margin, 700);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(palette.muted);
    doc.text('PRELIMINARY · FOR REVIEW', right, 700, { align: 'right' });
  };

  const addContextRow = (
    label: string,
    value: string,
    origin: string,
    sourceUrl?: string | null,
  ) => {
    const valueWidth = contentWidth - 164;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const valueLines = doc.splitTextToSize(value || 'Not available', valueWidth);
    const lineHeight = 12.5;
    const rowHeight = Math.max(38, valueLines.length * lineHeight + 21);
    ensureSpace(rowHeight);
    const startY = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColor(palette.muted);
    doc.text(label, margin, startY + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(palette.ink);
    doc.text(valueLines, margin + 164, startY + 10);
    doc.setFontSize(7);
    setColor(palette.green);
    doc.text(origin, margin + 164, startY + 10 + valueLines.length * lineHeight);
    if (sourceUrl) {
      const source = safeSourceUrl({ title: null, url: sourceUrl });
      if (source) {
        const linkLabel = 'View source';
        doc.setFontSize(7);
        setColor(palette.green);
        doc.text(linkLabel, right, startY + 10, { align: 'right' });
        const linkWidth = doc.getTextWidth(linkLabel);
        doc.link(
          right - linkWidth,
          startY + 3,
          linkWidth,
          10,
          { url: source },
        );
      }
    }
    y = startY + rowHeight;
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.5);
    doc.line(margin, y, right, y);
    y += 4;
  };

  const drawContextField = (label: string, field: VerifeeReportContextField) => {
    addContextRow(label, field.value, sourceLabel(field), field.sourceUrl);
  };

  const addSourceList = (sources: VerifeeReportSource[]) => {
    if (sources.length === 0) {
      addWrapped('No official source links were recorded for this item.', {
        size: 8,
        color: palette.muted,
      });
      return;
    }
    for (const source of sources) {
      const href = safeSourceUrl(source);
      const label = source.title?.trim() || source.url;
      addWrapped(label, {
        size: 8,
        color: palette.green,
        x: margin + 13,
        width: contentWidth - 13,
        url: href ?? undefined,
        gap: 1,
      });
      if (source.title?.trim() && href) {
        addWrapped(source.url, {
          size: 6.5,
          color: palette.muted,
          x: margin + 13,
          width: contentWidth - 13,
          url: href,
          gap: 4,
        });
      }
    }
  };

  const drawRequirement = (
    requirement: VerifeeReportRequirement,
    index: number,
  ) => {
    ensureSpace(78);
    const headerTop = y;
    doc.setFillColor(...palette.sage);
    doc.roundedRect(margin, headerTop, contentWidth, 42, 4, 4, 'F');
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    setColor(palette.green);
    doc.text(String(index + 1).padStart(2, '0'), margin + 11, headerTop + 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(palette.ink);
    const nameLines = doc.splitTextToSize(requirement.name, contentWidth - 190);
    doc.text(nameLines.slice(0, 2), margin + 42, headerTop + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColor(statusColor(requirement.status));
    doc.text(statusText(requirement.status), right - 10, headerTop + 17, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(palette.muted);
    doc.text(
      `${requirement.category.replaceAll('_', ' ')} · ${requirement.importance.replaceAll('_', ' ')} · ${requirement.confidence} confidence`,
      margin + 42,
      headerTop + 32,
    );
    y = headerTop + 53;

    addWrapped('Matching concepts', {
      size: 7,
      style: 'bold',
      color: palette.green,
      gap: 2,
    });
    addWrapped(
      requirement.matchingConcepts.length
        ? requirement.matchingConcepts.join(' · ')
        : 'No matching concepts were recorded.',
      { size: 8.5, color: palette.ink, gap: 7 },
    );

    addWrapped('Relevant prior coursework', {
      size: 7,
      style: 'bold',
      color: palette.green,
      gap: 3,
    });
    if (requirement.courses.length === 0) {
      addWrapped('No candidate coursework was identified for this requirement.', {
        size: 8,
        color: palette.muted,
      });
    }
    requirement.courses.forEach((course) => {
      ensureSpace(43);
      doc.setFillColor(250, 251, 247);
      doc.setDrawColor(...palette.line);
      doc.roundedRect(margin, y, contentWidth, 34, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setColor(palette.ink);
      const courseTitle = [course.code, course.title].filter(Boolean).join(' · ');
      doc.text(doc.splitTextToSize(courseTitle || 'Course title not available', 355).slice(0, 2), margin + 9, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setColor(palette.muted);
      doc.text(
        `Credits: ${course.credits || 'Not available'}  ·  Grade: ${course.grade || 'Not available'}`,
        right - 9,
        y + 25,
        { align: 'right' },
      );
      doc.setFontSize(6.5);
      doc.text(course.relevance, margin + 9, y + 25);
      y += 41;
      if (course.transcriptDescription) {
        addWrapped(`Course description: ${course.transcriptDescription}`, {
          size: 8,
          color: palette.muted,
          x: margin + 10,
          width: contentWidth - 10,
          gap: 3,
        });
      }
      if (course.researchStatus) {
        addWrapped(
          `Evidence research: ${course.researchStatus.replaceAll('_', ' ').toLowerCase()}.`,
          {
            size: 7,
            color: palette.muted,
            x: margin + 10,
            width: contentWidth - 10,
            gap: 3,
          },
        );
      }
      for (const evidence of course.evidence) {
        addWrapped(`• ${evidence}`, {
          size: 8,
          color: palette.ink,
          x: margin + 10,
          width: contentWidth - 10,
          gap: 2,
        });
      }
      if (course.sources.length > 0) {
        addWrapped('Course sources', {
          size: 7,
          style: 'bold',
          color: palette.green,
          x: margin + 10,
          width: contentWidth - 10,
          gap: 1,
        });
        addSourceList(course.sources);
      }
    });

    addWrapped('Evidence and reasoning', {
      size: 7,
      style: 'bold',
      color: palette.green,
      gap: 3,
    });
    if (requirement.evidence.length > 0) {
      for (const evidence of requirement.evidence) {
        addWrapped(`• ${evidence}`, { size: 8, color: palette.ink, gap: 2 });
      }
    } else {
      addWrapped('No additional requirement-level evidence was recorded.', {
        size: 8,
        color: palette.muted,
        gap: 2,
      });
    }
    addWrapped(`Reasoning: ${requirement.rationale}`, {
      size: 8,
      color: palette.ink,
      gap: 5,
    });

    addWrapped('Sources', {
      size: 7,
      style: 'bold',
      color: palette.green,
      gap: 1,
    });
    addSourceList(requirement.sources);
    y += 10;
  };

  drawCover();

  nextPage();
  addSectionHeading(
    '01 / CONTEXT',
    'Mapped Academic Context',
    'Transcript facts and contextual mappings are labeled separately. Mapped context is informational and does not authenticate a credential.',
  );
  addContextRow('Issuing institution', data.issuingInstitution, 'Source: Transcript');
  drawContextField('Country / education system', data.countryEducationSystem);
  drawContextField('Broad academic field', data.broadAcademicField);
  drawContextField('Specific discipline', data.specificDiscipline);
  drawContextField('Source program', data.sourceProgram);
  addContextRow(
    'Target institution',
    data.targetInstitution,
    'Selected target',
  );
  addContextRow(
    'Selected target program',
    `${data.targetProgram.name} (${data.targetProgram.shortName}) · ${data.targetProgram.school}`,
    'Mapped by Verifee',
  );

  addSectionHeading(
    '02 / INSTITUTION STATUS',
    'Institution status check',
    'This source-scoped directory result is separate from credential authenticity, academic mapping, and admissions.',
  );
  const institutionStatus = data.institutionStatus;
  addContextRow(
    'Status',
    institutionStatusLabel(institutionStatus.status),
    'Institution directory result',
  );
  addContextRow(
    'Jurisdiction',
    institutionStatus.jurisdiction || 'Not stated in the transcript',
    'Jurisdiction checked',
  );
  if (institutionStatus.sourceName) {
    addContextRow(
      'Source',
      institutionStatus.sourceName,
      'Authoritative source',
      institutionStatus.sourceUrl,
    );
  }
  if (institutionStatus.matchedName) {
    addContextRow(
      'Registry entry',
      institutionStatus.matchedName,
      'Institution name shown in source',
    );
  }
  if (institutionStatus.registryStatus) {
    addContextRow(
      'Registry status',
      institutionStatus.registryStatus,
      'Status text published by source',
    );
  }
  addContextRow(
    'Checked at',
    generatedDateLabel(institutionStatus.checkedAt),
    'Registry check time',
  );
  addWrapped(institutionStatus.summary, { size: 8, color: palette.ink });
  addWrapped(`Coverage limits: ${institutionStatus.coverageLimits}`, {
    size: 8,
    color: palette.muted,
    gap: 8,
  });

  addSectionHeading(
    '03 / MAPPING SUMMARY',
    'Academic Mapping Summary',
    `${data.requirementsAnalyzed} requirements analyzed against ${data.targetProgram.name}.`,
  );
  const summaryRows = [
    ['Covered', data.counts.covered, palette.green],
    ['Partially Covered', data.counts.partiallyCovered, palette.amber],
    ['Potential Gaps', data.counts.potentialGap, palette.clay],
    ['Insufficient Evidence', data.counts.insufficientEvidence, palette.muted],
  ] as const;
  const summaryWidth = contentWidth / summaryRows.length;
  summaryRows.forEach(([label, count, color], index) => {
    ensureSpace(50);
    const x = margin + summaryWidth * index;
    doc.setFillColor(...palette.pale);
    doc.setDrawColor(...palette.line);
    doc.rect(x, y, summaryWidth - 4, 40, 'FD');
    doc.setFont('times', 'normal');
    doc.setFontSize(17);
    setColor(color);
    doc.text(String(count), x + 9, y + 19);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setColor(palette.muted);
    doc.text(label, x + 9, y + 32, {
      maxWidth: summaryWidth - 18,
    });
  });
  y += 54;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(palette.green);
  doc.text('Credential Verification', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(palette.ink);
  doc.text(data.credentialVerification.status, margin + 130, y);
  y += 14;
  if (data.credentialVerification.method) {
    addWrapped(`Verification method: ${data.credentialVerification.method}`, {
      size: 8,
      color: palette.muted,
    });
  }
  addWrapped(data.credentialVerification.explanation, {
    size: 8,
    color: palette.muted,
    gap: 7,
  });

  nextPage();
  addSectionHeading(
    '04 / REQUIREMENT RESULTS',
    'Detailed Requirement Results',
    'Results below use the completed Step 4 mapping exactly as stored. No additional analysis was run to prepare this report.',
  );
  data.requirements.forEach(drawRequirement);

  addSectionHeading(
    '05 / REVIEW',
    'Items Requiring Review',
    'These items are derived from the current academic context, verification state, and requirement results.',
  );
  if (data.itemsRequiringReview.length > 0) {
    for (const item of data.itemsRequiringReview) {
      addWrapped(`• ${item}`, {
        size: 8.5,
        color: palette.ink,
        x: margin + 9,
        width: contentWidth - 9,
        gap: 5,
      });
    }
  } else {
    addWrapped('No specific review items were identified in this analysis.', {
      size: 8.5,
      color: palette.muted,
    });
  }

  addSectionHeading('06 / IMPORTANT INFORMATION', 'Interpretation Disclaimer');
  addWrapped(VERIFEE_REPORT_DISCLAIMER, {
    size: 8.5,
    color: palette.ink,
    gap: 12,
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.6);
    doc.line(margin, footerTop, right, footerTop);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setColor(palette.muted);
    doc.text('Verifee · Preliminary Academic Mapping Report', margin, footerTop + 15);
    doc.text(`${metadata.reportId} · ${generatedAt}`, pageWidth / 2, footerTop + 15, {
      align: 'center',
    });
    doc.text(`Page ${page} of ${totalPages}`, right, footerTop + 15, {
      align: 'right',
    });
  }

  const fileName = [
    'Verifee_Report',
    safeFilePart(data.issuingInstitution),
    safeFilePart(data.targetProgram.shortName || data.targetProgram.name),
    metadata.reportId.replace(/[^a-z0-9-]/gi, ''),
  ].join('_');
  doc.save(`${fileName}.pdf`);
}

export function downloadVerifeeSubmissionReceiptPdf(
  metadata: GeneratedReportMetadata,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - margin;
  const generatedAt = generatedDateLabel(metadata.generatedAt);

  doc.setProperties({
    title: `Verifee Submission Receipt ${metadata.reportId}`,
    subject: `Receipt for generated academic mapping report ${metadata.reportId}`,
    author: 'Verifee',
    creator: 'Verifee',
  });

  doc.setFillColor(...palette.pale);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setFillColor(...palette.green);
  doc.rect(0, 0, 17, pageHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...palette.green);
  doc.text('VERIFEE', margin, 64);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...palette.muted);
  doc.text('REPORT RECEIPT', right, 64, { align: 'right' });
  doc.setDrawColor(...palette.line);
  doc.line(margin, 79, right, 79);

  doc.setFont('times', 'normal');
  doc.setFontSize(30);
  doc.setTextColor(...palette.ink);
  doc.text('Student report generated', margin, 142, { maxWidth: contentWidth });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...palette.muted);
  doc.text(
    'Receipt for a Verifee preliminary academic mapping report.',
    margin,
    166,
    { maxWidth: contentWidth },
  );

  doc.setFillColor(...palette.white);
  doc.setDrawColor(...palette.line);
  doc.roundedRect(margin, 205, contentWidth, 214, 5, 5, 'FD');

  const receiptRows: Array<[string, string]> = [
    ['Report ID', metadata.reportId],
    ['Target institution', metadata.targetInstitution],
    ['Target program', metadata.targetProgram],
    ['Source institution', metadata.sourceInstitution],
    ['Generated', generatedAt],
    ['Report status', 'Ready for submission'],
    ['Delivery status', 'Not sent'],
    ['Payment status', 'Free in Demo Mode · $0.00'],
  ];
  let y = 232;
  for (const [label, value] of receiptRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...palette.muted);
    doc.text(label.toUpperCase(), margin + 16, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...palette.ink);
    const valueLines = doc.splitTextToSize(value || 'Not available', contentWidth - 180);
    doc.text(valueLines, margin + 155, y);
    y += Math.max(23, valueLines.length * 12 + 8);
  }

  doc.setFillColor(...palette.sage);
  doc.roundedRect(margin, 452, contentWidth, 83, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...palette.green);
  doc.text('RECEIPT SCOPE', margin + 14, 474);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...palette.ink);
  doc.text(
    doc.splitTextToSize(
      'This receipt confirms that the listed Verifee report was generated. It does not confirm receipt or acceptance by the target institution.',
      contentWidth - 28,
    ),
    margin + 14,
    493,
  );

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...palette.green);
  doc.text('A record, with context.', margin, 700);
  doc.setDrawColor(...palette.line);
  doc.line(margin, footerTop, right, footerTop);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...palette.muted);
  doc.text('Verifee · Report generation receipt', margin, footerTop + 15);
  doc.text(`${metadata.reportId} · ${generatedAt}`, right, footerTop + 15, {
    align: 'right',
  });

  const safeReportId = metadata.reportId.replace(/[^a-z0-9-]/gi, '');
  doc.save(`Verifee_Submission_Receipt_${safeReportId}.pdf`);
}