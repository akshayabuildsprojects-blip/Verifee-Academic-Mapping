---
name: Verifee report wallet boundary
description: Product rules for demo report generation, receipts, and future account-backed report retrieval.
---

## Scope

- Demo report generation does not charge or claim payment; represent its payment state as `DEMO_FREE`.
- A generated report is `NOT_SENT`. The receipt confirms report generation only, not institutional delivery or acceptance.
- Do not retain original transcripts permanently.
- Student account retrieval and production persistence are future work; do not add authentication or payment persistence as part of the demo report step.

**Why:** The Step 5 brief separates a free report-generation demonstration from future student-wallet and institutional-delivery capabilities.

**How to apply:** Preserve the free/unsent states and transcript-retention boundary in report, receipt, and storage changes. Scope account-backed retrieval as a separate feature.