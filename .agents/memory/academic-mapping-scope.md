---
name: Academic mapping boundaries
description: Verifee's mapping scope, evidence rules, result labels, and confirmed Responses web-search support.
---

For Verifee academic mapping, compare only the extracted academic JSON with the selected program definition already stored for Georgia Tech. Do not change PDF extraction logic or schema to implement mapping, and do not invent or expand target-program requirements.

Stage A shortlists only likely- or possibly-relevant transcript courses for each stored requirement. Stage B researches shortlisted courses only, reuses research when a course is shortlisted against multiple requirements, and accepts evidence only from university-controlled sources. The exact synthetic institution name `Verifee Demo University` skips web search and uses its embedded course descriptions. Stage C emits only `COVERED`, `PARTIALLY_COVERED`, `INSUFFICIENT_EVIDENCE`, or `POTENTIAL_GAP`, with `HIGH`, `MEDIUM`, or `LOW` confidence. Never describe these preliminary mappings as validated, approved, accepted, or equivalent.

Keep PDF bytes transient and out of mapping requests. Preserve extracted record, filename metadata, selected target, results, and evidence in the browser session across steps; clear them on explicit start-over or after a successful replacement credential. A mapping failure must leave the record available for retry, and one failed requirement must not suppress results for other requirements. Do not log transcript contents.

The configured OpenAI Responses proxy was verified to support structured output with `web_search`, returned search-source URLs, and `allowed_domains` filtering using synthetic data. Treat provider/search failures as recoverable mapping evidence failures rather than assuming search always succeeds.

**Why:** The mapping is an informational comparison, not an admissions or credential decision, and transcript privacy and strict use of published stored requirements are core product boundaries. Runtime web-search support had been uncertain.

**How to apply:** Keep extraction as the source of the academic record, source research restricted to the issuing institution's verified domain, and per-requirement failures isolated. Test provider behavior with synthetic data; an exact-transcript test requires an available transcript file.