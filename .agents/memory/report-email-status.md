---
name: Report email status
description: Why email delivery confirmation must not reuse legacy report-sharing timestamps.
---

Use a dedicated email-delivery timestamp or status to decide whether a report was emailed. Historical `sentAt` values can represent an earlier “ready for institution sharing” state, not a provider-accepted email.

**Why:** Reusing that older field can falsely show existing reports as sent before any email was sent.

**How to apply:** When showing “Sent,” rely only on persisted confirmation from the email provider flow; preserve legacy sharing timestamps for their original meaning.
