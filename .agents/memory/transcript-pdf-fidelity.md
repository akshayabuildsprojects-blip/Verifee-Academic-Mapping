---
name: Transcript PDF fidelity
description: Preserve exact academic transcript values when using AI to interpret PDFs.
---

For transcript extraction, keep the original PDF as the model's primary source and supply its embedded text layer as supporting text when available. Keep extracted text in memory only; do not persist or log it. If a PDF has no readable text layer, retain the PDF interpretation path.

**Why:** Model-only interpretation omitted the minus in a synthetic A- grade even after prompt clarification. Supplying embedded text restored the exact grade, showing that a text layer helps preserve small but important symbols.

**How to apply:** Treat embedded text as untrusted supporting data, not as verified facts or a replacement for the PDF's layout. Keep absent fields null, validate the model output against the generated schema, and test signed grades plus missing fields against a real or redacted transcript when available.