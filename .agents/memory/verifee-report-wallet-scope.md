---
name: Verifee report wallet boundary
description: Product rules for demo report generation, receipts, and future account-backed report retrieval.
---

## Scope

- Demo report generation does not charge or claim payment; represent its payment state as `DEMO_FREE`.
- Opening or generating a final report does not create a Solana proof; only the user's explicit confirmation of “Create proof & send” may anchor it.
- After anchoring succeeds, mark the report ready for institution sharing; this demo does not claim actual delivery or acceptance.
- Do not retain original transcripts permanently.
- Retain the frozen report payload for verification for 90 days, then remove it while keeping minimal proof metadata.
- Demo account and saved report content remain browser-session scoped; do not add real authentication or account-backed retrieval.
- Do not add real authentication, registration, password management, OAuth, or a production database to this demo.
- Student account retrieval remains future work.

**Why:** The demo is free and does not deliver reports externally. The user explicitly restricted proof creation to a confirmation click and selected 90-day payload retention for verification.

**How to apply:** Keep proof creation behind the final-preview confirmation; downloads and earlier workflow steps must not anchor. Never describe “ready for sharing” as institution delivery, and retain only the report payload needed for the chosen verification window.