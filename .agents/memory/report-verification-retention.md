---
name: Report verification retention
description: Retention limit for academic report data used to recalculate Solana integrity proofs.
---

Retain complete report payloads for 90 days to support report hash verification, then remove the payload while keeping minimal report ID, hash, signature, and timestamp metadata.

**Why:** The user selected a bounded retention period to enable public verification without retaining students' academic report details permanently.

**How to apply:** Any new persistence or verification feature that needs report payloads must honor this window and clearly distinguish expired payloads from failed or missing Solana proofs.
