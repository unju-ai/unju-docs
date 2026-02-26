# RFC-021: Multi-Language SDK Parity — TypeScript, Python, Rust

**Status:** Proposed  
**Author:** Bhaiṣajyaguru (sera-plz)  
**Created:** 2026-02-26  
**Dependencies:** RFC-014 (CLI distribution), unju-api `openapi.json`

---

## Abstract

Unju API should have first-class SDKs in TypeScript/Node, Python, and Rust — all generated from a single OpenAPI spec and kept in sync automatically via GitHub Actions. No manual drift. No "which SDK supports this endpoint" confusion.

---

## Problem

Three SDKs, maintained by hand, will diverge. They already are:

- `unju-python` — exists, partial coverage, manually maintained
- Node/TypeScript — doesn't exist yet (the CLI calls the API but there is no published client package)
- Rust — doesn't exist

As unju-api grows (university routes, ACP, A2A, swarm marketplace), keeping three SDKs updated manually is not sustainable. The cost of drift: users on one language SDK have capabilities the others don't; integration tests fail; documentation lies.

---

## Solution

**Single source of truth: `unju-api/openapi.json`**

This file is already generated at build time from the Hono route definitions. It is 4600+ lines and covers the full API surface. Everything else is derived from it.

**Generator: Stainless (primary) or Speakeasy (alternative)**

Both are used by major API providers to generate and maintain their official SDKs:

| Tool | Used by | TypeScript | Python | Rust | GitHub Action |
|------|---------|:----------:|:------:|:----:|:-------------:|
| Stainless | Anthropic, OpenAI, Stripe | ✅ | ✅ | ✅ | ✅ |
| Speakeasy | Vercel, Clerk | ✅ | ✅ | ✅ | ✅ |
| fern | Cohere, ElevenLabs | ✅ | ✅ | 🚧 | ✅ |
| OpenAPI Generator | (OSS) | ✅ | ✅ | ✅ | ✅ |

**Recommendation: Stainless** for TypeScript and Python. Anthropic's own SDKs (`anthropic-sdk-typescript`, `anthropic-sdk-python`) are generated with it — the output is indistinguishable from hand-written code. Free for open-source.

**Rust exception:** Generated Rust SDK output from any tool is verbose and non-idiomatic. For Rust, use [`progenitor`](https://github.com/oxidecomputer/progenitor) by Oxide Computer — it generates Rust-native async clients using `reqwest` + `serde` that feel hand-written.

---

## Architecture

### Repos

| Repo | Language | Package | Status |
|------|----------|---------|--------|
| `unju-ai/unju-python` | Python | `unju` on PyPI | Exists, needs regeneration |
| `unju-ai/unju-node` | TypeScript | `@unju/sdk` on npm | **Create** |
| `unju-ai/unju-rust` | Rust | `unju` on crates.io | **Create** |

### Automation Flow

```
unju-api main branch
│
├── Build generates openapi.json
│
└── .github/workflows/sdk-sync.yml
    │
    ├── Detects diff in openapi.json (on push to main)
    │
    ├── Calls Stainless API → TypeScript SDK update
    │   └── Opens PR to unju-ai/unju-node
    │
    ├── Calls Stainless API → Python SDK update  
    │   └── Opens PR to unju-ai/unju-python
    │
    └── Calls progenitor → Rust SDK update
        └── Opens PR to unju-ai/unju-rust
```

### GitHub Action (unju-api)

```yaml
# .github/workflows/sdk-sync.yml
name: SDK Sync

on:
  push:
    branches: [main]
    paths:
      - openapi.json

jobs:
  sync-typescript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stainless-api/upload-openapi-spec-action@main
        with:
          stainless-api-key: ${{ secrets.STAINLESS_API_KEY }}
          input-path: openapi.json
          project-name: unju
          target-sdk: typescript

  sync-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stainless-api/upload-openapi-spec-action@main
        with:
          stainless-api-key: ${{ secrets.STAINLESS_API_KEY }}
          input-path: openapi.json
          project-name: unju
          target-sdk: python

  sync-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install progenitor CLI
        run: cargo install progenitor-cli
      - name: Generate Rust SDK
        run: progenitor -i openapi.json -o /tmp/unju-rust-sdk
      - name: Open PR to unju-rust
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.SDK_SYNC_PAT }}
          path: /tmp/unju-rust-sdk
          commit-message: "chore: sync from openapi.json (${{ github.sha }})"
          title: "chore: SDK sync from unju-api@${{ github.sha }}"
```

---

## SDK Feature Parity Target

All three SDKs expose the same surface:

```typescript
// TypeScript
const unju = new UnjuClient({ apiKey: "unj_..." })
await unju.credits.balance()
await unju.university.courses.list()
await unju.university.enroll("building-swarms-101")
await unju.agents.completions.create({ model: "gemini-2.0-flash", messages: [...] })
```

```python
# Python
client = UnjuClient(api_key="unj_...")
await client.credits.balance()
await client.university.courses.list()
await client.university.enroll("building-swarms-101")
```

```rust
// Rust
let client = UnjuClient::new("unj_...");
client.credits().balance().await?;
client.university().courses().list().await?;
client.university().enroll("building-swarms-101").await?;
```

---

## Versioning

All three SDKs track the same semver version as the unju-api release. Breaking changes in the API = major version bump across all three simultaneously (automated by the sync workflow).

Published packages:
- `@unju/sdk` — npm
- `unju` — PyPI (already reserved)
- `unju` — crates.io

---

## Migration: unju-python

`unju-python` currently has hand-written SDK code. The migration:

1. Stainless generates a new Python SDK from `openapi.json`
2. Compare coverage: generated vs current
3. Port any hand-written extras (auth helpers, retry logic) to Stainless config
4. Cut a new major version (`unju==1.0.0`) with generated client as the base
5. Deprecate the hand-written version

---

## Open Questions

1. **Stainless vs Speakeasy** — both are good. Stainless if we want the Anthropic-SDK level of polish. Speakeasy if we want more control over generated output and faster Rust support. Decision deferred to Esper.

2. **Rust sync mechanism** — `progenitor` is mature but requires a manual "generate + PR" step. If Speakeasy supports Rust in their GitHub Action natively, that's simpler. Check.

3. **Versioning cadence** — do we version all three SDKs in lockstep, or let them drift on patch versions? Recommendation: lockstep on minor/major, independent patches.

4. **unju-agent vs unju-python** — `unju-agent` (the Python runtime/CLI) and `unju-python` (the SDK) are different packages. The generated SDK goes into `unju-python`. The `unju-agent` CLI (`pip install unju`) is separate and uses the generated SDK internally.

---

## Implementation Plan

| Phase | Task | Owner |
|-------|------|-------|
| 1 | Sign up for Stainless (free OSS tier) | Esper |
| 1 | Create `unju-ai/unju-node` repo | Bhaiṣajyaguru |
| 1 | Create `unju-ai/unju-rust` repo | Bhaiṣajyaguru |
| 1 | Add `sdk-sync.yml` to unju-api | Bhaiṣajyaguru |
| 2 | Configure Stainless project (stainless.yml) | Bhaiṣajyaguru |
| 2 | First generation run → review output | Esper + Bhaiṣajyaguru |
| 2 | Set up progenitor for Rust | Bhaiṣajyaguru |
| 3 | Migrate unju-python to generated client | Bhaiṣajyaguru |
| 3 | Publish @unju/sdk to npm | Esper (needs npm org access) |
| 3 | Publish unju to crates.io | Esper (needs crates.io account) |
