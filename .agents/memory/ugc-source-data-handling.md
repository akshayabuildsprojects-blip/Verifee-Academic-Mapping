---
name: UGC source data handling
description: A privacy caution for the public UGC university-list endpoint used by Verifee.
---

The live UGC university-list response includes a `user_password` field alongside directory records. Do not log, display, or persist the raw response; extract only the record fields needed for an institution-status result.

**Why:** The field is unrelated to public registry matching and appears credential-like, so retaining or exposing the full response creates avoidable risk.

**How to apply:** When changing the UGC adapter, keep its parsed in-memory representation limited to ID, institution name, category, and the published status value.