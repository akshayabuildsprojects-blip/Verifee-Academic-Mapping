---
name: Academic mapping test mock order
description: Keep API-server model tests on the intended mocked fetch transport.
---

Initialize the model mock before importing modules that construct the shared OpenAI client. The client captures its fetch implementation during initialization, so changing only `globalThis.fetch` afterward may not redirect model requests. Reinstall the mock after a test restores the global fetch.

**Why:** Incorrect initialization order can send test requests to the configured API URL and trigger real SDK retries, making tests slow or misleading.

**How to apply:** In server tests, load the mock before the academic mapper/router and explicitly reinstall it at the start of a mapping test when earlier cleanup restored the original fetch. Account for SDK-level retries separately from the mapper's batch retries when simulating failures.