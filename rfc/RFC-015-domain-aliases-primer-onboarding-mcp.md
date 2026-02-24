# RFC-015: Domain Aliases, Agent Primer Onboarding & MCP Component Architecture

**Status:** Proposed
**Author:** Bhaiṣajyaguru (Token ID 4)
**Date:** 2026-02-23
**Repo:** `unju-ai/unju-api` (issue #38), `unju-ai/unju-ionic`

---

## Summary

Three interconnected concerns that landed together during the unju-ionic frontend build:

1. **Domain aliases** — `esper.chat` and `kimiko.chat` should route to the same underlying `unju.ai` deployment, with the `AGENT_NAME` env var (or subdomain) driving agent identity
2. **Agent primer onboarding** — each agent has a configurable "primer" (system-level context) that users can set via a UI; primers are persisted per-user per-agent
3. **MCP component architecture** — how agent capabilities (tools / MCP servers) are surfaced in the frontend and configured per-agent

---

## 1. Domain Aliases

### Problem

`esper.chat` and `kimiko.chat` are separate Cloudflare deployments pointing at the same codebase. Maintaining two separate deployments means:
- Double the Worker/Pages deploys per code change
- Split configuration and env vars
- No easy way to add a third agent domain (`yafu.chat`, etc.)

### Proposed Solution

- All agent domains CNAME to `unju.ai`
- `unju.ai` Cloudflare Worker inspects `Host` header to determine which agent to serve
- Agent identity driven by host → `AGENT_NAME` lookup table in KV
- Single deployment, N agent domains

### Routing Logic

```
Host: esper.chat     → AGENT_NAME=esper
Host: kimiko.chat    → AGENT_NAME=kimiko
Host: unju.ai        → AGENT_NAME=default (or user-selectable)
Host: *.unju.ai      → AGENT_NAME=<subdomain>
```

### Implementation

- Cloudflare `unju-ionic` Worker: add host-inspection middleware
- KV namespace `AGENT_HOSTS`: `{ "esper.chat": "esper", "kimiko.chat": "kimiko" }`
- Fallback to `AGENT_NAME` env var if host not found in KV
- DNS: add CNAME records for `esper.chat` and `kimiko.chat` pointing to `unju.ai`

---

## 2. Agent Primer Onboarding

### Problem

Each agent has a system prompt (primer). Users want to personalize their agent's behavior, but there's no UI for this and primers are currently hardcoded.

Known primers per agent:
- **Yafu** — birthday (personalizes its birthday assistant behavior)
- **Kimiko** — language + proficiency level (personalizes language tutoring)
- **Esper** — wallet address via unju-wallet MCP

### Proposed Solution

- `SettingsSheet` in unju-ionic surfaces primer inputs per agent
- Primer values stored in user preferences API (new endpoint: `PUT /v1/users/prefs`)
- Agent token endpoint includes primer in the session metadata
- Frontend `AvatarButton` (top-right on all screens) → `SettingsSheet` → per-agent primer inputs

### API Changes

```
GET  /v1/users/prefs           → { agentPrimers: { yafu: {...}, kimiko: {...} } }
PUT  /v1/users/prefs           → update partial prefs, returns updated object
```

### Frontend Changes

- `SettingsSheet` component: profile section + per-agent primer inputs + credits + theme + logout
- No hamburger menu — accessible only via `AvatarButton`
- Primer fields are agent-specific (Yafu shows birthday field, Kimiko shows language/level, etc.)

---

## 3. MCP Component Architecture

### Problem

Agents expose tools via MCP (Model Context Protocol). The frontend needs a way to:
- Show which MCP tools/servers are available for a given agent
- Let users configure MCP connections (e.g., connect Esper to their wallet via unju-wallet MCP)
- Surface tool call results in the chat UI

### Proposed Architecture

MCP components are **not** embedded in the `Chat` component. Instead, they live in a `VisualizationPanel` that receives data via **LiveKit RPC**.

```
Agent (server-side) → LiveKit RPC → VisualizationPanel (client-side)
```

When an agent calls an MCP tool:
1. Agent executes tool, gets result
2. Agent sends RPC message: `{ type: "mcp_result", tool: "...", result: {...} }`
3. `VisualizationPanel` renders the result with the appropriate component
4. Chat shows a text summary; rich visualization appears in the panel

### MCP Configuration UI

- In `SettingsSheet`, an "Integrations" section lists available MCP servers per agent
- Users toggle connections and provide required config (e.g., wallet address for unju-wallet MCP)
- Config stored in user prefs API (same `PUT /v1/users/prefs` endpoint)

---

## Implementation Checklist

### Phase 1: Domain routing (unju-api)
- [ ] Add host-inspection middleware to unju-ionic Worker
- [ ] Create `AGENT_HOSTS` KV namespace with initial entries
- [ ] Add CNAME records for esper.chat, kimiko.chat
- [ ] Test: `curl -H "Host: esper.chat" https://unju.ai` returns Esper agent

### Phase 2: Prefs API (unju-api)
- [ ] `GET /v1/users/prefs` endpoint
- [ ] `PUT /v1/users/prefs` endpoint
- [ ] D1 table: `user_prefs (user_id, key, value, updated_at)`
- [ ] Auth: JWT required, prefs scoped to user

### Phase 3: Primer UI (unju-ionic)
- [ ] `AvatarButton` component (avatar circle, top-right, all screens)
- [ ] `SettingsSheet` component (profile, primer inputs, credits, theme, logout)
- [ ] Per-agent primer field definitions
- [ ] Wire to prefs API

### Phase 4: MCP visualization
- [ ] `VisualizationPanel` component
- [ ] LiveKit RPC handler for `mcp_result` messages
- [ ] Initial tool renderers (wallet balance, search results, code output)

---

## Related

- unju-api issue #38 (original filing)
- [RFC-014: CLI Distribution](./RFC-014-cli-distribution.md)
- [ADR-001: Authentication & Wallet Strategy](../adr/ADR-001-authentication-and-wallet-strategy.md)

---

*Bhaiṣajyaguru — RFC-015 — 2026-02-23*
