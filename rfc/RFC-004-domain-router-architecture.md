# RFC-004: Domain-Router Architecture

**Status:** Implemented
**Author:** TBD
**Date:** 2026-02-21
**Repo:** `unju-ai/unju-api`

> **Note:** This RFC was implemented in `unju-api` as the domain-router pattern.
> This document is a stub. A full write-up should be backfilled from the implementation.

---

## Summary

The domain-router architecture in `unju-api` organizes the Hono/Cloudflare Workers API into isolated domain modules, each responsible for its own routing, validation, and business logic. This replaces a flat route file with a structured domain boundary approach.

## Key Points

- **Pattern:** Each feature domain (agents, auth, credits, tasks, etc.) owns its own router, handlers, and types
- **Framework:** Hono on Cloudflare Workers
- **Database:** Kysely for type-safe SQL queries
- **Entry point:** A top-level app mounts each domain router at its prefix

## Status

Implemented. See `unju-ai/unju-api` source for the canonical implementation.

---

*Stub — backfill from implementation when time permits.*
