---
name: Academic mapping progress stream
description: Verifee's additive progress-stream contract and rules for truthful requirement-level updates.
---

The progress stream is additive to the existing mapping API. Each progress snapshot uses the established result schema and contains only requirements whose mapping task has completed; concurrent tasks may appear in completion order. The terminal event and the existing non-streaming endpoint retain the complete result shape and behavior. Progress counts must come from completed requirement results, never elapsed time or estimated percentages. In the report, derive the count from the same collection used for cards, commit each snapshot's card/count/expansion state together, and keep the full count visible after completion. Keep mapping, evidence retrieval, and model reasoning unchanged when extending this UI.

**Why:** The report needs useful live progress without changing the application's established mapping semantics, evidence guarantees, saved session behavior, or final response contract.

**How to apply:** For future progress UI, retry flows, or transport changes, emit updates from completed per-requirement tasks, synchronize displayed counts with rendered results through the terminal state, preserve the current final schema, and leave the legacy endpoint available.