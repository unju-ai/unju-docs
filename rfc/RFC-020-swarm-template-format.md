# RFC-020: Swarm Template Format (swarm.yaml)

**Status:** Draft  
**Author:** Bhaiṣajyaguru (sera-plz)  
**Created:** 2026-02-25  
**Supersedes:** RFC-013 (partially — replaces the format question; marketplace model still applies)  
**Dependencies:** RFC-012 (Nanoclaw Runtime), RFC-014 (CLI)

---

## Abstract

This RFC defines the canonical format for a Unju Swarm Template: a `swarm.yaml` file that describes an AI agent swarm's composition, topology, entry points, and resource requirements. The file format is the primary artifact — self-contained, human-readable, version-controllable, and runnable without any blockchain interaction. On-chain representation (NFT) is an optional publishing layer for marketplace and provenance, not a requirement for use.

---

## The Core Question: File or NFT?

RFC-013 proposed SwarmTemplate NFTs as the primary artifact. Esper's question is right to challenge this: **should a swarm template be a file or an NFT?**

### The answer: file first, NFT optionally

Analogy to established toolchains:

| Ecosystem | Definition File | Registry (optional) |
|-----------|----------------|---------------------|
| Node.js   | `package.json` | npm registry        |
| Docker    | `Dockerfile`   | Docker Hub          |
| Helm (k8s)| `Chart.yaml` + `values.yaml` | Artifact Hub |
| **Unju**  | **`swarm.yaml`** | **IPFS + HyperEVM NFT** |

The `swarm.yaml` is the source of truth. You can:
- Run a swarm locally with just the file (`unju run swarm.yaml`)
- Share it as a git repo
- Publish to the marketplace (`unju publish` → IPFS pin + optional NFT mint)
- Use it as a University course assignment without any NFT

The NFT exists for: ownership, royalties, marketplace discoverability, on-chain provenance. It references the content hash of the `swarm.yaml`. It does not replace the file.

---

## Research: How Others Do It

### CrewAI
Two separate YAML files: `agents.yaml` (role, goal, backstory per agent) and `tasks.yaml` (description, expected output, agent assignment). Clean but split. No topology definition.

### LangGraph Cloud
`langgraph.json`: a JSON config that defines graph routing, dependencies, and entry points. Code-centric — the actual logic is in Python files; the JSON just wires them up.

### AutoGen
Python objects only. No standard file format. Community has built YAML wrappers but none canonical.

### Helm Charts
Most mature model: `Chart.yaml` (metadata) + `values.yaml` (defaults, overridable) + `templates/` (rendered manifests). Versioned, packageable, composable. **Closest analog to what we need.**

### Key insight from research
Every mature ecosystem separates **definition** (file) from **distribution** (registry). Unju should do the same. The mistake would be making the NFT the primary artifact — that creates unnecessary friction for local development and everyday use.

---

## The `swarm.yaml` Format

### Minimal example (single agent)

```yaml
# swarm.yaml
apiVersion: unju/v1
kind: Swarm
metadata:
  name: hello-agent
  version: 0.1.0
  description: A minimal single-agent swarm
  author: alice.unju.ai

agents:
  - id: assistant
    role: General Assistant
    model: gemini-2.0-flash
    primer: |
      You are a helpful assistant. Answer questions clearly and concisely.

entry:
  - type: http
    path: /chat

health:
  path: /health
```

### Full example (multi-agent research swarm)

```yaml
apiVersion: unju/v1
kind: Swarm
metadata:
  name: research-swarm
  version: 1.2.0
  description: Multi-agent research pipeline with a planner, researcher, and writer
  author: alice.unju.ai
  license: MIT
  tags: [research, writing, pipeline]

# Agents: the members of this swarm
agents:
  - id: planner
    role: Research Planner
    model: gemini-2.5-pro
    primer: |
      You break down research requests into specific sub-questions.
      Delegate each sub-question to the researcher.
    tools:
      - delegate

  - id: researcher
    role: Web Researcher
    model: gemini-2.0-flash
    primer: |
      You research specific questions using web search.
      Return structured findings with source citations.
    tools:
      - web_search
      - fetch_url

  - id: writer
    role: Technical Writer
    model: gemini-2.0-flash
    primer: |
      You synthesize research findings into clear, well-structured documents.
    tools: []

# Topology: how agents communicate
topology:
  type: pipeline           # sequential | pipeline | hub-spoke | mesh | custom
  flow:
    - from: entry
      to: planner
    - from: planner
      to: researcher
    - from: researcher
      to: writer
    - from: writer
      to: exit

# Entry points: how work arrives
entry:
  - type: http             # http | a2a | mcp | schedule | livekit
    path: /research
    method: POST
    schema:
      query: string
      depth: integer?

  - type: a2a              # Agent-to-Agent task (RFC-001)
    task_type: RESEARCH

  - type: mcp              # Expose as MCP tool
    tool_name: research
    description: Research a topic and return a structured report

# Resources: what this swarm needs to run
resources:
  memory: 512Mi            # minimum RAM
  models:
    - gemini-2.5-pro
    - gemini-2.0-flash
  network: outbound        # none | inbound | outbound | both

# Secrets: env vars required (names only, not values)
secrets:
  - GEMINI_API_KEY
  - UNJU_API_KEY

# Health check (required for University assignment verification)
health:
  path: /health
  interval: 30s
  response:
    status: ok
    template: research-swarm   # Must match this value for verification

# Runtime hints
runtime:
  executor: nanoclaw       # nanoclaw | unju-vm | docker
  min_instances: 1
  max_instances: 3
  idle_timeout: 15m
```

---

## Field Reference

### `metadata`
| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique name (slug format) |
| `version` | ✅ | Semver |
| `description` | ✅ | One-line summary |
| `author` | ✅ | SwarmNFT subdomain or wallet address |
| `license` | — | SPDX identifier |
| `tags` | — | Searchable tags for marketplace |

### `agents[]`
| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique within swarm, used in topology |
| `role` | ✅ | Human-readable role name |
| `model` | ✅ | LLM identifier |
| `primer` | ✅ | System prompt / personality |
| `tools` | — | List of tool identifiers |
| `memory` | — | `none` \| `session` \| `persistent` |
| `max_turns` | — | Max conversation turns before reset |

### `topology`
| Type | Description |
|------|-------------|
| `sequential` | Agents run one after another, last one replies |
| `pipeline` | Explicit flow graph (requires `flow` field) |
| `hub-spoke` | One orchestrator delegates to specialists |
| `mesh` | Any agent can message any other |
| `single` | Single agent (no topology needed) |

### `entry[]`
| Type | Description |
|------|-------------|
| `http` | HTTP endpoint exposed by the swarm |
| `a2a` | Agent-to-Agent task request (RFC-001) |
| `mcp` | Exposed as an MCP tool |
| `schedule` | Cron-triggered (`cron: "0 9 * * 1"`) |
| `livekit` | LiveKit room participant |

### `health`
Required for University assignment verification. The swarm must expose a `/health` endpoint returning at minimum `{ "status": "ok", "template": "<name>" }`.

### `runtime`
| Executor | Description |
|----------|-------------|
| `nanoclaw` | Default. Lightweight, fast startup. |
| `unju-vm` | Full Docker workspace (VS Code, long-running). |
| `docker` | Custom Docker image (`image: myrepo/myimage:tag`). |

---

## CLI Commands

```bash
# Validate a swarm.yaml
unju validate swarm.yaml

# Run locally
unju run swarm.yaml

# Run with env overrides
unju run swarm.yaml --env GEMINI_API_KEY=sk-...

# Run a specific entry point
unju run swarm.yaml --entry mcp

# Publish to IPFS (no NFT)
unju publish swarm.yaml
# → ipfs://Qm...
# → Content hash: sha256:abc123

# Publish + mint NFT to marketplace (optional)
unju publish swarm.yaml --mint
# → ipfs://Qm...
# → NFT minted: HyperEVM tx 0x...
# → Token ID: 42
# → Marketplace: https://unju.ai/templates/research-swarm

# Clone and run a published template
unju clone ipfs://Qm...
unju clone unju://research-swarm@alice.unju.ai
unju clone 42  # by NFT token ID

# Init a new swarm.yaml from scratch
unju init
unju init --template research-swarm  # scaffold from published template
```

---

## Content Addressing

When published, a `swarm.yaml` is pinned to IPFS. The CID is the canonical identifier:

```
Content: swarm.yaml file bytes
Hash:    sha256 of canonical JSON representation
CID:     IPFS Content Identifier (CIDv1, dag-pb)
```

The NFT (when minted) stores:
```json
{
  "name": "research-swarm",
  "description": "Multi-agent research pipeline...",
  "content_hash": "sha256:abc123...",
  "ipfs_uri": "ipfs://QmXxx...",
  "author": "0x742d35...",
  "version": "1.2.0",
  "tags": ["research", "writing", "pipeline"]
}
```

The file is the truth. The NFT is provenance.

---

## When Do You Need an NFT?

| Use Case | Need NFT? |
|----------|-----------|
| Run locally on your hardware | ❌ No |
| Share via git repo | ❌ No |
| Use as University assignment | ❌ No (file hash is enough) |
| Sell on the Unju marketplace | ✅ Yes (ownership + royalties) |
| Earn royalties when others clone | ✅ Yes |
| On-chain credential references | ✅ Yes (token ID is canonical ref) |

---

## University Integration

Assignment verification uses the `health.response.template` field:

```yaml
# The student's deployed swarm must respond with this
health:
  path: /health
  response:
    template: research-swarm  # Verifier checks this matches the assignment
```

The verifier swarm calls `GET https://<student-endpoint>/health` and checks `response.template` matches the assignment's required template. **No NFT lookup required.** The template name + version is sufficient for verification.

---

## Comparison: `swarm.yaml` vs Existing Formats

| | swarm.yaml | CrewAI YAML | LangGraph JSON | docker-compose |
|-|-----------|-------------|----------------|----------------|
| Human readable | ✅ | ✅ | ⚠️ | ✅ |
| Agent topology | ✅ | ❌ | ✅ | N/A |
| Entry points | ✅ | ❌ | ⚠️ | ⚠️ |
| Health check | ✅ | ❌ | ❌ | ✅ |
| Multi-runtime | ✅ | ❌ | ❌ | ✅ |
| Marketplace-ready | ✅ | ❌ | ❌ | ❌ |
| Run without chain | ✅ | ✅ | ✅ | ✅ |

---

## Updated RFC-013 Relationship

RFC-013 ("SwarmTemplate NFTs & Swarm Marketplace") remains valid for the marketplace layer. This RFC supersedes only the **format question** in RFC-013. RFC-013's marketplace, royalty, and clone/mint economics are unchanged.

RFC-013 should be updated to reference `swarm.yaml` as the underlying format that NFT metadata points to, rather than treating the NFT as the primary artifact.

---

## Implementation Plan

### Phase 1 — Schema & Validation
- [ ] JSON Schema for `swarm.yaml` (published at `https://unju.ai/schemas/swarm/v1`)
- [ ] `unju validate` command (RFC-014 CLI)
- [ ] Schema versioning (`apiVersion: unju/v1`)

### Phase 2 — Runtime Integration
- [ ] `unju run swarm.yaml` → nanoclaw execution
- [ ] Health endpoint auto-generated from `health` field
- [ ] Secrets injection from env vars

### Phase 3 — Publishing
- [ ] `unju publish` → IPFS pin via Pinata/Cloudflare R2 Gateway
- [ ] Content hash computation (canonical JSON)
- [ ] `unju publish --mint` → optional NFT mint

### Phase 4 — Marketplace & Templates
- [ ] Template registry in unju-api (`GET /templates`)
- [ ] `unju clone` → pull from IPFS, scaffold locally
- [ ] `unju init --template <name>` → scaffold from published template

### Phase 5 — University Assignment Verifier
- [ ] Verifier swarm reads `assignments.template_id` from DB
- [ ] Calls student endpoint, checks `health.response.template`
- [ ] No NFT lookup — file hash is sufficient

---

## Open Questions

1. **Multi-file templates**: Should complex swarms be a directory (`swarm/`) with `swarm.yaml` + agent-specific files? Recommendation: start single-file, add directory support in v2.

2. **Secret management**: Should `secrets` include a `source` field (`env` | `unju-vault` | `1password`)? Recommendation: env only for v1, vault integration in v2.

3. **Template inheritance**: `extends: base-research-swarm`? Recommendation: yes, add in v2 — valuable for University where course templates extend a base.

4. **Tool registry**: Are tools referenced by name (`web_search`) resolved from a built-in registry or from a URL? Recommendation: built-in registry first (`unju tools list`), custom URL in v2.

5. **Validation strictness**: Should unknown fields be errors or warnings? Recommendation: warnings in v1 (easier onboarding), errors in v2.

---

## References

- [RFC-012: Nanoclaw Swarm Runtime](./RFC-012-nanoclaw-swarm-runtime.md)
- [RFC-013: SwarmTemplate NFTs & Marketplace](./RFC-013-swarm-template-nfts.md)
- [RFC-014: CLI Distribution](./RFC-014-cli-distribution.md)
- [RFC-019: Unju University](./RFC-019-unju-university.md)
- [CrewAI agents.yaml / tasks.yaml](https://docs.crewai.com/concepts/agents)
- [LangGraph langgraph.json](https://langchain-ai.github.io/langgraph/cloud/reference/cli/)
- [Helm Chart.yaml format](https://helm.sh/docs/topics/charts/)
- [docker-compose reference](https://docs.docker.com/compose/compose-file/)

---

*Changelog: 2026-02-25 — Initial draft (Bhaiṣajyaguru / sera-plz)*
