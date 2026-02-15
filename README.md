# unju-docs

API documentation for [unju.ai](https://unju.ai) — auto-generated from the OpenAPI spec.

## How it works

1. **unju-api** pushes to `main` → triggers `update-docs` workflow
2. `update-docs` sends a `repository_dispatch` to this repo
3. This repo fetches the latest `openapi.json` from unju-api
4. Builds a [Scalar](https://scalar.com) API reference site
5. Deploys to Cloudflare Pages

## Local dev

```bash
node build.js
npx serve public
```

## Manual rebuild

Trigger via GitHub Actions → "Deploy Docs" → Run workflow.
