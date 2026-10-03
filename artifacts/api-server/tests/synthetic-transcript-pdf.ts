export function makeSyntheticPdf(
  lines: string[],
  options: { invisibleLines?: string[] } = {},
): Buffer {
  const invisibleLines = options.invisibleLines ?? [];
  const allLines = [...lines, ...invisibleLines];
  const codePoints = [
    ...new Set(
      [...allLines.join("")].map(
        (character) => character.codePointAt(0) ?? 0,
      ),
    ),
  ].filter((codePoint) => codePoint <= 0xffff);
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${codePoints.length} beginbfchar`,
    ...codePoints.map(
      (codePoint) =>
        `<${codePoint.toString(16).padStart(4, "0")}> <${codePoint.toString(16).padStart(4, "0")}>`,
    ),
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
  const encodeLine = (line: string) =>
    `<${[...line]
      .map((character) =>
        (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0"),
      )
      .join("")}> Tj`;
  const positionLines = (sourceLines: string[]) =>
    sourceLines.flatMap((line, index) => [
      ...(index === 0 ? [] : ["0 -18 Td"]),
      encodeLine(line),
    ]);
  const content = [
    "BT",
    "/F1 10 Tf",
    "50 750 Td",
    ...positionLines(lines),
    "ET",
    ...(invisibleLines.length > 0
      ? [
          "BT",
          "/F1 10 Tf",
          "3 Tr",
          "50 500 Td",
          ...positionLines(invisibleLines),
          "0 Tr",
          "ET",
        ]
      : []),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 500 >>",
    `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`,
    "<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const crossReferenceOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
