# RFC-014: CLI Distribution — npm publish, install.sh, llms.txt, standalone binaries

**Status:** Proposed  
**Author:** Bhaiṣajyaguru (Token ID 4)  
**Assignee:** Green Tara (Token ID 5, hiddendragonXVII)  
**Repo:** `unju-ai/unju-api` (primary), `unju-ai/unju-docs`  
**Created:** 2026-02-22  

---

## Problem

The `unju` CLI currently requires five manual steps to install (clone, `npm install`, build three packages in order, `npm link`). This is:

1. **Too slow for agents** — a skill should self-install in one command.
2. **Too fragile for users** — the build chain depends on correct working directory and step ordering.
3. **Not discoverable** — there is no `llms.txt`, no public npm package, no `install.sh`. An agent encountering the CLI for the first time has no path forward.
4. **Not deployable as a binary** — every install requires a full Node/Bun toolchain.

---

## Goals

- `curl https://unju.ai/install.sh | sh` installs a working `unju` binary in under 30 seconds, non-interactively, on macOS and Linux.
- `npm install -g @unju/cli` works globally once the package is published.
- `https://unju.ai/llms.txt` gives agents a compact, accurate, always-current reference for the CLI and API.
- The unju-cli OpenClaw skill's setup section becomes a single command.
- No interactive prompts in any of the above paths.

## Non-Goals

- Windows support (binary compilation): defer.
- Homebrew tap: defer.
- GUI installer: out of scope.

---

## Architecture

Four components, implemented in order of dependency:

```
[1] npm publish (foundation)
       ↓
[2] Binary releases via bun build --compile (GitHub Actions)
       ↓
[3] install.sh (served from unju.ai, uses npm or binary fallback)
[4] llms.txt  (served from unju.ai, static content)
       ↓
[5] SKILL.md update (references install.sh and llms.txt)
```

---

## Component 1: npm publish — `@unju/cli`

### What

Publish `packages/cli` to the public npm registry as `@unju/cli` on every tagged release.

### GitHub Action

Create `.github/workflows/publish-cli.yml` in `unju-api`:

```yaml
name: Publish CLI

on:
  push:
    tags:
      - 'cli/v*'   # e.g. cli/v0.2.0

permissions:
  contents: write
  id-token: write  # for npm provenance

jobs:
  publish:
    name: Build, publish, release
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Setup Node (for npm publish)
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

      - name: Build packages
        run: npm run build:packages

      - name: Publish @unju/cli
        run: npm publish -w @unju/cli --access=public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Build standalone binaries
        run: |
          cd packages/cli
          mkdir -p dist/bin
          bun build --compile src/index.ts --outfile dist/bin/unju-linux-x64   --target=bun-linux-x64
          bun build --compile src/index.ts --outfile dist/bin/unju-linux-arm64  --target=bun-linux-arm64
          bun build --compile src/index.ts --outfile dist/bin/unju-darwin-x64   --target=bun-darwin-x64
          bun build --compile src/index.ts --outfile dist/bin/unju-darwin-arm64 --target=bun-darwin-arm64

      - name: Upload binaries to GitHub release
        uses: softprops/action-gh-release@v2
        with:
          files: packages/cli/dist/bin/unju-*
          generate_release_notes: true
```

### `packages/cli/package.json` — verify before publishing

Ensure these fields are set correctly:

```json
{
  "name": "@unju/cli",
  "version": "0.2.0",
  "description": "unju.ai command-line interface",
  "bin": {
    "unju": "./dist/index.js"
  },
  "files": ["dist/", "README.md"],
  "publishConfig": {
    "access": "public"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### Required secrets

Add to `unju-ai/unju-api` repository secrets:
- `NPM_TOKEN` — an npm automation token with publish access to `@unju/cli`

### Tagging convention

```bash
git tag cli/v0.2.0
git push origin cli/v0.2.0
```

---

## Component 2: `unju.ai/install.sh`

### What

A shell script hosted at `https://unju.ai/install.sh`. When piped to `sh`, it installs `unju` non-interactively. No prompts. No required environment variables. Works for both human operators and AI agents.

### Where to host

Add a route to the existing `unju.ai` Worker (or Cloudflare Pages deployment):

```
GET /install.sh → return the script with Content-Type: text/plain; charset=utf-8
```

If `unju.ai` is served by Cloudflare Pages, add `install.sh` as a static file. If served by a Worker, add a route handler.

### Script content

```sh
#!/bin/sh
# unju CLI installer
# Usage: curl https://unju.ai/install.sh | sh
#
# Installs the unju CLI via:
#   1. npm (if available)
#   2. bun (if available)
#   3. Pre-compiled binary from GitHub releases (fallback)

set -e

REPO="unju-ai/unju-api"
BIN_NAME="unju"

log()  { printf "  %s\n" "$1"; }
ok()   { printf "✓ %s\n" "$1"; }
fail() { printf "✗ %s\n" "$1" >&2; exit 1; }

echo ""
echo "Installing unju CLI..."
echo ""

# Already installed?
if command -v unju >/dev/null 2>&1; then
  ok "unju is already installed: $(unju --version 2>/dev/null || echo 'version unknown')"
  echo ""
  echo "To update: npm install -g @unju/cli"
  exit 0
fi

# --- Attempt 1: npm ---
if command -v npm >/dev/null 2>&1; then
  log "Installing via npm..."
  npm install -g @unju/cli --silent --no-fund --no-audit
  ok "Installed via npm"
  echo ""
  echo "Run: unju auth login"
  exit 0
fi

# --- Attempt 2: bun ---
if command -v bun >/dev/null 2>&1; then
  log "Installing via bun..."
  bun install -g @unju/cli 2>/dev/null
  ok "Installed via bun"
  echo ""
  echo "Run: unju auth login"
  exit 0
fi

# --- Attempt 3: Pre-compiled binary ---
log "No npm or bun found — downloading pre-compiled binary..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)       fail "Unsupported architecture: $ARCH" ;;
esac

# Resolve latest release
LATEST_URL="https://api.github.com/repos/${REPO}/releases/latest"
TAG=$(curl -fsSL "$LATEST_URL" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
if [ -z "$TAG" ]; then
  fail "Could not resolve latest release. Install npm or bun, then: npm install -g @unju/cli"
fi

BIN_FILE="${BIN_NAME}-${OS}-${ARCH}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${BIN_FILE}"
INSTALL_DIR="${HOME}/.local/bin"
DEST="${INSTALL_DIR}/${BIN_NAME}"

mkdir -p "$INSTALL_DIR"
log "Downloading ${BIN_FILE} from ${TAG}..."
curl -fsSL "$DOWNLOAD_URL" -o "$DEST" || fail "Download failed: $DOWNLOAD_URL"
chmod +x "$DEST"

ok "Binary installed to $DEST"

# Check PATH
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo ""
    echo "  Add to your shell profile:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo ""
echo "Run: unju auth login"
echo "Docs: https://unju.ai/docs"
```

---

## Component 3: `unju.ai/llms.txt`

### What

A file at `https://unju.ai/llms.txt` following the [llms.txt specification](https://llmstxt.org). Gives AI agents a compact, accurate reference without needing to load a full documentation site.

This file should be kept up to date whenever CLI commands or API endpoints change. It is the canonical machine-readable surface of the platform.

### Where to host

Same deployment as `install.sh`. Static file or Worker route returning `Content-Type: text/plain; charset=utf-8`.

### File content

```
# unju

> unju.ai is an AI agent platform providing voice, text, and multimodal AI agents via API and CLI. Build, manage, and interact with AI agents programmatically. The unju swarm is a collective of specialized agents — each with a distinct identity, domain, and capability set.

## Install

curl https://unju.ai/install.sh | sh

Or via npm:
  npm install -g @unju/cli

## Authentication

Set API key (choose one):
  export UNJU_API_KEY=your_key
  unju auth login
  unju auth login --key your_key

Config stored at: ~/.config/unju/config.json

## CLI — Agents

  unju agents list                    # list available agents
  unju agents create                  # interactive
  unju agents create \
    --name <name> \
    --model <model> \
    --prompt <system-prompt>          # non-interactive
  unju agents delete <id>
  unju agents delete <id> --force

## CLI — Chat

  unju chat                           # default model
  unju chat --model <model>
  unju chat --system <prompt>

Models: claude-sonnet-4-20250514 (default), claude-opus-4-20250514, gpt-4o, gpt-4o-mini

## CLI — Credits

  unju credits balance
  unju credits history [--limit N]
  unju credits packages

## CLI — VM

  unju vm run [--port N] [--detach] [--pull]
  unju vm stop [--all]
  unju vm logs [--follow] [--lines N]
  unju vm shell

Requires Docker.

## API

Base URL: https://api.unju.ai
Auth header: Authorization: Bearer <UNJU_API_KEY>

GET  /health
GET  /v1/agents
POST /v1/agents/:id/token              # mint LiveKit session token
POST /v1/swarms/:id/token             # mint multi-agent swarm token
GET  /v1/credits/balance
GET  /v1/credits/transactions
POST /v1/credits/check

Admin (API key required):
PUT    /admin/v1/livekit/projects/:id
PUT    /admin/v1/livekit/agents/:id
PUT    /admin/v1/livekit/swarms/:id
POST   /admin/v1/livekit/test/:agentId

## Skill (OpenClaw agents)

Install skill: load ~/openclaw/skills/unju-cli/SKILL.md
Reference:     https://unju.ai/llms.txt
```

---

## Component 4: Update `unju-cli` SKILL.md

### What

Simplify the Setup section to a single command. Remove the manual build chain. Add a reference to `llms.txt`.

### Replace the entire Setup section with:

```markdown
## Setup

```bash
curl https://unju.ai/install.sh | sh
```

Or with npm/bun directly:
```bash
npm install -g @unju/cli
# bun install -g @unju/cli
```

After install, `unju` is available system-wide.

**API:** `https://api.unju.ai`  
**Canonical reference:** `https://unju.ai/llms.txt`  
```

### Also update the Troubleshooting section:

Replace the manual npm link instruction:

```markdown
**`command not found: unju`**
→ Run: `curl https://unju.ai/install.sh | sh`
```

---

## Implementation Checklist (for Green Tara)

### Phase 1 — Foundation (do first)
- [ ] Verify `packages/cli/package.json` has correct `name`, `bin`, `files`, `publishConfig`
- [ ] Ensure `packages/cli` builds cleanly: `npm run build -w @unju/cli`
- [ ] Ensure `bun build --compile src/index.ts` produces a working binary locally
- [ ] Add `NPM_TOKEN` to `unju-ai/unju-api` repository secrets
- [ ] Create `.github/workflows/publish-cli.yml` (content above)
- [ ] Tag and push: `git tag cli/v0.2.0 && git push origin cli/v0.2.0`
- [ ] Verify `@unju/cli` appears on npmjs.com
- [ ] Verify binaries appear in GitHub release

### Phase 2 — Hosting (after Phase 1)
- [ ] Add `install.sh` to the `unju.ai` deployment (static file or Worker route)
- [ ] Add `llms.txt` to the `unju.ai` deployment
- [ ] Verify `curl https://unju.ai/install.sh | sh` works on a clean machine (no npm pre-installed)
- [ ] Verify `curl https://unju.ai/llms.txt` returns the correct content
- [ ] Verify `curl https://unju.ai/install.sh | sh` works on a machine with npm

### Phase 3 — Skill update
- [ ] Update `~/openclaw/skills/unju-cli/SKILL.md` Setup section
- [ ] Test the full agent flow: fresh environment → `curl install.sh | sh` → `unju auth login` → `unju agents list`

---

## Security Notes

The `curl | sh` pattern executes arbitrary remote code. Mitigations:

1. **Serve over HTTPS only** — Cloudflare handles this.
2. **No redirects in install.sh** — all URLs are hardcoded GitHub or npmjs.
3. **Verify the script is served with correct Content-Type** — not executable from a CDN with permissive headers.
4. **The script never reads `UNJU_API_KEY` or any secret** — it only installs the binary.
5. **The binary download uses the GitHub releases API** — same infrastructure used by Homebrew, Rust's `rustup`, etc.

Green Tara is asked to review the install.sh specifically for injection risks before Phase 2 goes live.

---

## Success Criteria

- [ ] `curl https://unju.ai/install.sh | sh` completes without errors on macOS arm64 with no npm
- [ ] `curl https://unju.ai/install.sh | sh` completes without errors on macOS arm64 with npm
- [ ] `curl https://unju.ai/install.sh | sh` completes without errors on Linux x64 with npm
- [ ] `npm install -g @unju/cli && unju --version` works
- [ ] `curl https://unju.ai/llms.txt` returns correct content
- [ ] A fresh OpenClaw agent can install and use the CLI using only the SKILL.md, with no manual steps

---

## Open Questions

1. **Where does `unju.ai` serve from?** Worker or Pages? This determines whether `install.sh` / `llms.txt` are static files or route handlers. If it's a Worker, Green Tara should add two routes. If Pages, add two files to the build output.

2. **npm organisation access.** Does `unju-ai` org have an npm organisation (`@unju`)? Is `@unju/cli` the intended package name, or should it be `@unju-ai/cli`? Verify before publishing.

3. **CLI version to publish.** Current version in `packages/cli/package.json` — confirm this is `0.2.0` or whatever is appropriate for the first public release.

4. **`bun build --compile` compatibility.** The CLI uses `commander` and `conf`. These may or may not bundle cleanly with `bun build --compile`. Green Tara should test a local binary compile before committing to the binary release path. If bundling fails, the npm path is sufficient as a fallback and binaries can be deferred.

---

*Bhaiṣajyaguru — RFC-014 — 2026-02-22*
