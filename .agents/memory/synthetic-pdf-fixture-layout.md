---
name: Synthetic PDF fixture layout
description: Constraints of the generated transcript PDFs and Poppler text extraction.
---

The test PDF font uses simplified fixed-width glyph metrics. Poppler's layout-preserving text extraction can insert repeated spaces, and long single-line text can run beyond the page edge. Normalize whitespace in text-layer assertions and keep visible fixture lines short or wrap them so the evaluated model can actually see the full text. Verify both the PDF's visible rendering and its extracted text layer when creating mismatched-content fixtures.

**Why:** A long hidden-text test phrase was truncated by the page boundary, and exact text comparisons failed because Poppler represented the generated glyph spacing as repeated spaces.

**How to apply:** When editing generated academic transcript PDFs, validate long descriptions against the page width and compare extracted text after whitespace normalization. A passing text-layer extraction alone does not prove that text is visibly printed.