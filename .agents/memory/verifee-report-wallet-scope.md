---
name: Verifee report wallet boundary
description: Product rules for demo report generation, receipts, and future account-backed report retrieval.
---

## Scope

- Demo report generation does not charge or claim payment; represent its payment state as `DEMO_FREE`.
- A generated report is `NOT_SENT`. The receipt confirms report generation only, not institutional delivery or acceptance.
- Do not retain original transcripts permanently.
- The demo account and saved reports exist only in browser `sessionStorage`; logout clears them.
- Do not add real authentication, registration, password management, OAuth, or a production database to this demo.
- Student account retrieval and production persistence are future work.

**Why:** The product brief separates a free, browser-session demo from future account-backed retrieval and explicitly excludes real authentication and production persistence.

**How to apply:** Preserve the free/unsent states and transcript-retention boundary. Keep account and report data session-only unless the user explicitly requests a separately scoped persistent account feature.