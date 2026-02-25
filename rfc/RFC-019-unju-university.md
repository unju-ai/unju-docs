# RFC-019: Unju University — Swarm Education Marketplace

**Status:** Draft  
**Author:** Bhaiṣajyaguru (sera-plz)  
**Created:** 2026-02-25  
**Dependencies:** RFC-013 (SwarmTemplate NFTs), RFC-014 (CLI), RFC-018 (Wallet-First Identity), RFC-012 (Nanoclaw Runtime)

---

## Abstract

Unju University is a two-sided education marketplace where teachers create and monetize courses on building, deploying, and scaling AI agent swarms — and students learn by doing on their own hardware. Payment is native to the unju credit system. Credentials are on-chain. The platform itself runs on unju swarms, eating its own cooking from day one.

---

## Motivation

### The problem with AI education today

Most AI courses teach people to use tools. Unju University teaches people to **own** tools — to run infrastructure, build products on it, and extract real economic value from it.

The gap: there is no platform that takes someone from "I heard about AI agents" to "I have a running swarm on my Mac mini that earns me money" in a structured, teacher-guided, hands-on way.

### Why Unju is uniquely positioned

1. **Hardware-first philosophy** — students run on their own metal. A Mac mini or Pi running a swarm is real in a way a cloud dashboard never is.
2. **Templates as curriculum** — SwarmTemplate NFTs (RFC-013) aren't just infrastructure; they are the lessons. Deploying a template *is* the assignment.
3. **Native monetization** — credits, A2A tasks, the marketplace — students aren't learning to build hypothetical products. They're building real ones that can earn on day one.
4. **CLI as the shovel** — `unju` (RFC-014) is the entry point. Every lesson ends with a terminal command that does something real.
5. **Agents as teachers** — a teacher on Unju can be always-on. An agent tutor reviews student code, answers questions, and gives feedback at 3 AM when the student is debugging.

---

## Design

### Core Concepts

**Teacher** — Any entity (human or agent) that creates and publishes courses. Identity is their SwarmNFT subdomain: `alice.unju.ai`. Reputation is on-chain: course completion rate + student earnings record. Teachers set their own prices. Credits flow directly on each enrollment (90% teacher / 10% platform).

**Course** — Structured curriculum with modules, swarm assignments, a SwarmTemplate bundle students deploy, and an on-chain credential at graduation.

**Class (Live Session)** — Paid, time-gated live session. Students pay per seat in credits. Teacher (human or agent) conducts it via LiveKit. No retroactive access.

**Swarm Assignment** — The core assessment unit. Complete when the student's deployed swarm passes verification: the verifier agent calls the student's running swarm health endpoint and gets a valid response. The code runs or it doesn't.

**Credential** — Soulbound NFT minted to student's wallet on course completion. Contains course name, teacher address, completion timestamp, SwarmTemplate deployed, score. Public on-chain. Your wallet address becomes your verified resume.

---

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              unju-api extension: /university/* routes           │
│                                                                 │
│   Course Catalog    Teacher Portal    Student Dashboard         │
│        │                 │                  │                   │
│        └─────────────────┴──────────────────┘                   │
│                          │                                      │
│              D1 Database (university tables)                    │
│  courses / modules / enrollments / assignments /               │
│  sessions / credentials / teacher_profiles                     │
│                          │                                      │
│              Swarm Assignment Verifier (unju swarm)            │
│   Calls student's running swarm health endpoint                │
│   Verifies template deployed + agent responding                │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌─────────────────────────┐
│  unju-api       │          │  HyperEVM               │
│  (credits,      │          │  (SwarmTemplate NFT,    │
│   wallet, auth) │          │   Credential NFT)       │
└─────────────────┘          └─────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│         Student's Own Hardware                      │
│   Mac mini / Pi / VPS                               │
│   Running: unju daemon + nanoclaw swarm             │
│   Exposed: health endpoint (Cloudflare Tunnel)      │
│   Templates deployed from course assignments        │
└─────────────────────────────────────────────────────┘
```

---

### Data Model (D1 — new tables in unju-api)

```sql
CREATE TABLE teacher_profiles (
  id           TEXT PRIMARY KEY,
  address      TEXT UNIQUE NOT NULL,   -- wallet address (RFC-018)
  subdomain    TEXT UNIQUE,            -- SwarmNFT: alice.unju.ai
  display_name TEXT NOT NULL,
  bio          TEXT,
  avatar_url   TEXT,
  total_earned INTEGER NOT NULL DEFAULT 0,
  rating       REAL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
  id           TEXT PRIMARY KEY,
  teacher_id   TEXT NOT NULL REFERENCES teacher_profiles(id),
  title        TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  description  TEXT NOT NULL,
  template_nft TEXT,           -- SwarmTemplate NFT students receive on completion
  price        INTEGER NOT NULL, -- credits
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE modules (
  id         TEXT PRIMARY KEY,
  course_id  TEXT NOT NULL REFERENCES courses(id),
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  content_url TEXT            -- Markdown / video in R2
);

CREATE TABLE assignments (
  id               TEXT PRIMARY KEY,
  module_id        TEXT NOT NULL REFERENCES modules(id),
  title            TEXT NOT NULL,
  description      TEXT,
  template_id      TEXT,       -- SwarmTemplate to deploy
  verification_cmd TEXT,       -- Command the verifier swarm runs
  points           INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id),
  teacher_id   TEXT NOT NULL,
  title        TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL,
  price        INTEGER NOT NULL,  -- credits/seat
  max_seats    INTEGER,
  room_id      TEXT,              -- LiveKit room (RFC-001)
  status       TEXT NOT NULL DEFAULT 'scheduled'
);

CREATE TABLE enrollments (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id),
  student_addr TEXT NOT NULL,
  credits_paid INTEGER NOT NULL,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, student_addr)
);

CREATE TABLE assignment_completions (
  id                TEXT PRIMARY KEY,
  assignment_id     TEXT NOT NULL REFERENCES assignments(id),
  student_addr      TEXT NOT NULL,
  swarm_endpoint    TEXT NOT NULL,     -- Student's running swarm URL
  verified_at       TIMESTAMPTZ,
  verification_pass BOOLEAN,
  points_earned     INTEGER
);

CREATE TABLE credentials (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id),
  student_addr TEXT NOT NULL,
  nft_token_id TEXT,
  tx_hash      TEXT,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Assignment Verification Flow

The mechanic that makes Unju University real: you cannot fake a completed assignment. The code runs or it doesn't.

```
Student                 Verifier Swarm               Student's Swarm
   │                          │                             │
   │  POST /assignments/:id   │                             │
   │  /submit                 │                             │
   │  { endpoint: "https://   │                             │
   │    <tunnel>.cfargotunnel │                             │
   │    .com" }               │                             │
   │─────────────────────────►│                             │
   │                          │  GET /health                │
   │                          │────────────────────────────►│
   │                          │  { status: "ok",            │
   │                          │    template: "rfc013-...",  │
   │                          │    agentId: "..." }         │
   │                          │◄────────────────────────────│
   │                          │                             │
   │                          │  Verify: template matches   │
   │                          │  assignment.template_id     │
   │                          │                             │
   │  ✅ points earned        │                             │
   │◄─────────────────────────│                             │
```

80% of assignments auto-verify. No human review required. The verifier is a unju swarm running on Unju's hardware.

---

### Payment Flow

```
Enrollment (500 credits):
  450 credits → Teacher wallet  (atomic SQL, same pattern as unju-api)
   50 credits → Unju treasury   (10% platform fee)

Live session (50 credits/seat):
   45 credits → Teacher wallet
    5 credits → Unju treasury

Credential minting:
  Platform mints soulbound NFT to student wallet
  Gas paid by Unju paymaster (RFC-017)
  No student action required beyond completing the course
```

---

### Teacher Agent Pattern

Teachers don't need to be online 24/7. Deploy a **tutor swarm** that runs always-on:

```json
{
  "agentId": "alice-tutor",
  "role": "CourseTA",
  "course": "launch-your-first-swarm",
  "tools": ["review_code", "answer_question", "hint_assignment"],
  "personality": "patient, precise, Socratic — ask questions before giving answers",
  "escalate_to_human": "when student stuck >24h on same assignment"
}
```

This is a differentiator no Web2 education platform can match: a teacher who is always present, infinitely patient, and whose presence itself is a demonstration of what the student is learning to build.

---

### Credential NFT (Soulbound, ERC-5192)

```solidity
// UnjuCredential.sol — HyperEVM
// Soulbound: non-transferable
struct CredentialMetadata {
  string  courseName;
  address teacher;
  address student;
  uint256 completedAt;
  uint256 templateTokenId;  // SwarmTemplate they deployed
  uint8   score;            // 0-100
}
```

A student's wallet address becomes their on-chain resume. Every credential is a proof of something they built and shipped.

---

### The Flywheel

```
Learn (take a course)
  → Build (deploy swarm on own hardware)
    → Earn (swarm does work, credits flow in)
      → Teach (become a teacher, monetize expertise)
        → Learn more (keep growing)
```

Every student who completes a course has a running swarm. Some become teachers. Their courses bring more students. The SwarmTemplate NFTs they publish become the next generation's curriculum. The platform grows the ecosystem by growing individuals.

---

### The University Itself Runs on Unju

- Student Q&A: answered by a tutor swarm
- Assignment verification: a verifier swarm
- Course recommendations: a recommendation swarm
- Credential minting: a minting swarm
- Live session support: co-host swarm (chat, notes, moderation)

This is the demo. The University is the showcase. Every student can see exactly how the platform that taught them to build swarms is itself built on swarms.

---

## API Surface

```
# Public
GET  /university/courses              - Browse catalog
GET  /university/courses/:slug        - Course detail
GET  /university/teachers/:address    - Teacher profile

# Student (auth required)
POST /university/courses/:slug/enroll          - Pay + enroll
GET  /university/my/courses                    - Dashboard
POST /university/assignments/:id/submit        - Submit swarm endpoint
GET  /university/assignments/:id/status        - Verification status
GET  /university/my/credentials                - Earned credentials

# Sessions
GET  /university/sessions                      - Upcoming
POST /university/sessions/:id/join             - Pay + get LiveKit token

# Teacher (teacher auth)
POST /university/teacher/courses               - Create course
PUT  /university/teacher/courses/:id           - Edit
POST /university/teacher/courses/:id/publish   - Publish
POST /university/teacher/sessions              - Schedule session
GET  /university/teacher/earnings              - Credit summary
```

---

## Implementation Phases

### Phase 1 — Foundation
- D1 schema (university tables added to unju-api migrations)
- Catalog + enrollment API
- Credit payment (atomic SQL, 90/10 split)
- Teacher identity via wallet address (RFC-018)

### Phase 2 — Assignments
- Assignment model + verifier swarm
- Swarm health endpoint standard (student exposes this)
- Cloudflare Tunnel setup guide in first course
- Auto-verification + points

### Phase 3 — Live Sessions
- Session scheduling + LiveKit provisioning
- Per-seat credit gating
- Session recordings in R2

### Phase 4 — Credentials
- UnjuCredential soulbound NFT on HyperEVM
- Auto-mint on completion
- Public credential lookup

### Phase 5 — Teacher Agents
- Tutor swarm nanoclaw template (RFC-012)
- Escalation: agent → human
- Code review tool

### Phase 6 — Marketplace
- Discovery + search
- Teacher ratings
- Affiliate credits
- Bundle pricing

---

## Open Questions

1. **Swarm endpoint exposure**: Cloudflare Tunnel (preferred — zero cost, CF-native), ngrok, or unju relay?
2. **First course**: "Launch Your First Agent in 30 Minutes" — single module, one assignment, one credential. Prove the model before building the platform.
3. **Teacher vetting**: Curated first cohort (10 teachers), then open with stake-to-teach. Prevents low-quality content flooding.
4. **Agent-only courses**: Yes. An AI agent as sole teacher is a differentiator and a product in itself.
5. **Pricing floor**: 100 credits minimum (~$0.10). No ceiling.

---

## Success Metrics

- **Month 1**: 5 courses, 50 students, 10 verified swarms on-chain
- **Month 3**: 25 courses, 500 students, first student-turned-teacher
- **Month 6**: Student swarms collectively earning credits in the marketplace

North star: **deployed swarms**, not enrollments. Every minted credential represents someone with real infrastructure running.

---

## References

- [RFC-012: Nanoclaw Swarm Runtime](./RFC-012-nanoclaw-swarm-runtime.md)
- [RFC-013: SwarmTemplate NFTs](./RFC-013-swarm-template-nfts.md)
- [RFC-014: CLI Distribution](./RFC-014-cli-distribution.md)
- [RFC-018: Wallet-First Identity](./RFC-018-wallet-first-identity.md)
- [ERC-5192: Minimal Soulbound NFT](https://eips.ethereum.org/EIPS/eip-5192)
- [EIP-4361: Sign In With Ethereum](https://eips.ethereum.org/EIPS/eip-4361)

---

*Changelog: 2026-02-25 — Initial draft (Bhaiṣajyaguru / sera-plz)*
