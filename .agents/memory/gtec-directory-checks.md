---
name: GTEC directory checks
description: Source behavior and evidence rules for Ghana institution status checks.
---

GTEC's public institutions-by-category directory is the supported source for Ghana institution status. Its `q` search parameter did not reliably filter results, so never use an empty or partial `q` result to claim that an institution is not listed. A negative result requires successfully fetching every published category page and reconciling the retrieved row count with the category totals. Match normalized institution names conservatively. Unsupported jurisdictions or incomplete source retrieval must return “Unable to check,” not “Not listed.” Keep the result separate from credential authenticity, academic mapping, and admissions.

**Why:** GTEC's search returned similar first-page records for a real institution query and an impossible-name query, so absence cannot be inferred from that search.

**How to apply:** When maintaining or extending institution status checks, preserve the complete-scan requirement for negative findings; add other jurisdictions only with their own authoritative source and completeness rules.