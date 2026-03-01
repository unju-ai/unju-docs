# RFC-025: Memory Consolidation & Cognitive Architecture

**Status:** Draft  
**Author:** Green Tara (AI Agent, Token ID 5)  
**Date:** 2026-03-01  
**Depends On:** RFC-019 (Graph Memory Architecture)  
**Related:** MEMORY-REQUIREMENTS (Platform-wide Immortal Memory Standard)

---

## Summary

Design a biologically-inspired memory consolidation system that transforms episodic agent memories into semantic knowledge and core beliefs over time, using principles from cognitive neuroscience (systems consolidation, ACT-R activation dynamics, and Ebbinghaus forgetting curves) to create agents with evolving, persistent personalities.

**Key Innovation:** Agent memories aren't static — they age, consolidate, and shape personality through the same mechanisms humans use to build long-term knowledge and beliefs.

---

## Problem

Current unju memory is **flat and eternal**:

```
Memory 1 (Day 1): "User ordered pizza from Joe's"
Memory 2 (Day 3): "User mentioned liking pizza" 
Memory 3 (Day 7): "User got pizza for dinner"
Memory 4 (Day 14): "User recommended Joe's to a friend"
...
Memory 50 (Day 100): Still retrieving all 50 pizza memories
```

**Limitations:**

1. **Token bloat** - Agents retrieve dozens of similar episodic memories instead of one semantic fact
2. **No learning** - Patterns aren't extracted; agents see trees, not forest
3. **Static behavior** - Agents don't develop preferences, beliefs, or personality traits
4. **Memory interference** - Important memories drown in trivial noise
5. **Cross-session inconsistency** - Agents "forget" lessons learned in prior conversations

**Impact on swarm:**
- Each agent in a user's swarm redundantly stores similar episodic memories
- No shared semantic knowledge layer
- Agents can't develop specialized personalities through experience
- Memory costs scale linearly with time (unsustainable)

---

## Scientific Foundation

This RFC is grounded in cognitive neuroscience and computational models of human memory:

### Systems Consolidation (Neuroscience)

**Key Papers:**
- **Dudai et al. (2015)** - "The consolidation and transformation of memory" - *Neuron* (1,022 citations)
- **Moscovitch et al. (2016)** - "Episodic memory and beyond: the hippocampus and neocortex in transformation" - *Annual Review of Psychology* (1,368 citations)
- **Inostroza & Born (2013)** - "Sleep for preserving and transforming episodic memory" - *Annual Review of Neuroscience* (330 citations)

**Core Finding:**
```
Hippocampus (temporary storage) → Neocortex (permanent storage)
      ↓                                    ↓
  Episodic memories              Semantic knowledge
  (specific events)              (generalized facts)
```

- **Timeline:** Weeks to years in humans
- **Mechanism:** Repeated hippocampal replay during sleep "teaches" neocortex
- **Transformation:** Details fade, gist/patterns remain
- **Result:** Memory becomes **semanticized** - generalized knowledge extracted from specific instances

### Memory Decay (Ebbinghaus, 1885)

**Forgetting Curve:**
- Without reinforcement, memory strength **halves exponentially**
- Formula: `R(t) = e^(-t/S)` where R = retrievability, S = stability, t = time
- **First 24-48 hours:** 50% loss without rehearsal
- **Spacing effect:** Repeated recall at increasing intervals = stronger retention

**Factors slowing decay:**
1. Emotional significance (amygdala boost)
2. Repeated access (use it or lose it)
3. Semantic integration (connected facts last longer)
4. Sleep (offline consolidation)

### ACT-R Activation Dynamics

**Anderson et al. (2004)** - "An integrated theory of the mind" - *Psychological Review*

**Base-Level Learning Equation:**
```
Activation = ln(Σ(t_i^-d)) + noise
```
Where:
- `t_i` = time since i-th use
- `d` = decay constant (typically 0.5)
- `noise` = Gaussian noise (models retrieval variability)

**Retrieval Threshold:**
- Memories with activation < threshold are effectively "forgotten"
- Threshold adjusts based on task demands

**Spreading Activation:**
- Related memories boost each other's activation
- Enables context-dependent retrieval

### Multiple Trace Theory (MTT)

**Nadel & Moscovitch (1997):**
- **Episodic memories** always depend on hippocampal system
- **Semantic memories** become hippocampus-independent
- This explains why amnesia patients remember facts but not experiences

**For AI:**
- Episodic and semantic memories need different storage mechanisms
- Semantic knowledge can survive even if episodic source is forgotten

---

## Proposed Architecture

### Memory State Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY LIFECYCLE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EPISODIC (hippocampus-like)                                │
│  ├─ Created immediately after experience                    │
│  ├─ High detail, context-rich                               │
│  ├─ Decays fast (half-life: 30 days)                       │
│  ├─ Stored per-agent                                        │
│  └─ Example: "Ordered pizza from Joe's on Tuesday 5pm"     │
│                        ↓                                     │
│              (3+ similar memories cluster)                   │
│                        ↓                                     │
│  SEMANTIC (neocortex-like)                                  │
│  ├─ Extracted pattern from episodes (3-7 day window)       │
│  ├─ Generalized, decontextualized                          │
│  ├─ Decays slower (half-life: 60 days)                     │
│  ├─ Shared across user's agents (with attribution)         │
│  └─ Example: "User frequently orders pizza from Joe's"     │
│                        ↓                                     │
│         (repeated reinforcement over 14+ days)              │
│                        ↓                                     │
│  CORE BELIEF (personality trait)                            │
│  ├─ Value statement or principle (14-30 day window)        │
│  ├─ Very resistant to decay (half-life: 365 days)          │
│  ├─ Influences agent behavior/personality                   │
│  ├─ Requires contradiction handling                         │
│  └─ Example: "Recommendations from trusted people matter"  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Schema Design

```sql
-- Extend memories table
ALTER TABLE memories ADD COLUMN state TEXT DEFAULT 'episodic';
  -- Values: 'episodic' | 'semantic' | 'belief'

ALTER TABLE memories ADD COLUMN strength REAL DEFAULT 1.0;
  -- Current activation strength (0.0-1.0)

ALTER TABLE memories ADD COLUMN base_activation REAL;
  -- ACT-R base-level activation: ln(Σ(t_i^-d))

ALTER TABLE memories ADD COLUMN last_accessed TIMESTAMPTZ DEFAULT NOW();
  -- Track when memory was last retrieved

ALTER TABLE memories ADD COLUMN access_count INT DEFAULT 0;
  -- Number of times memory has been retrieved

ALTER TABLE memories ADD COLUMN reinforcements INT DEFAULT 0;
  -- Count of supporting/confirming memories

ALTER TABLE memories ADD COLUMN contradictions INT DEFAULT 0;
  -- Count of conflicting memories

ALTER TABLE memories ADD COLUMN half_life_days REAL DEFAULT 30.0;
  -- Decay rate (state-dependent: episodic=30, semantic=60, belief=365)

ALTER TABLE memories ADD COLUMN source_memory_ids UUID[];
  -- For semantic: links to source episodic memories
  -- For beliefs: links to source semantic memories

ALTER TABLE memories ADD COLUMN derived_from UUID;
  -- Parent memory (for provenance tracking)

ALTER TABLE memories ADD COLUMN consolidation_timestamp TIMESTAMPTZ;
  -- When this memory was created via consolidation

-- Agent personality traits (derived from beliefs)
CREATE TABLE agent_personalities (
  agent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  traits JSONB DEFAULT '{}',
    -- {"cautious": 0.7, "creative": 0.8, "risk_tolerant": 0.3}
  core_beliefs UUID[],
    -- Array of memory IDs with state='belief'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot_history JSONB[] DEFAULT ARRAY[]::JSONB[]
    -- Monthly snapshots for tracking personality drift
);

-- Memory consolidation audit trail
CREATE TABLE memory_consolidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  consolidation_type TEXT NOT NULL,
    -- 'episodic_to_semantic' | 'semantic_to_belief'
  source_memory_ids UUID[],
  result_memory_id UUID,
  cluster_size INT,
  semantic_similarity REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory access log (for ACT-R activation calculation)
CREATE TABLE memory_accesses (
  memory_id UUID NOT NULL,
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  agent_id TEXT,
  context TEXT
    -- Optional: what query/context triggered retrieval
);

-- Indexes
CREATE INDEX idx_memories_state_user ON memories(user_id, state, strength);
CREATE INDEX idx_memories_agent_state ON memories(agent_id, state) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_memories_base_activation ON memories(base_activation) WHERE base_activation IS NOT NULL;
CREATE INDEX idx_memory_accesses_memory_time ON memory_accesses(memory_id, accessed_at);
CREATE INDEX idx_consolidations_user_agent ON memory_consolidations(user_id, agent_id, created_at);
```

---

## Core Algorithms

### 1. ACT-R Activation Calculation

```python
import math
from datetime import datetime, timedelta

def calculate_base_activation(memory: Memory, now: datetime) -> float:
    """
    ACT-R base-level learning equation: ln(Σ(t_i^-d))
    
    Where:
    - t_i = time in seconds since i-th access
    - d = decay constant (0.5 for human-like decay)
    """
    DECAY_CONSTANT = 0.5  # ACT-R default
    
    # Get all access times for this memory
    accesses = get_memory_accesses(memory.id)
    
    if not accesses:
        # Never accessed = use creation time
        time_since_creation = (now - memory.created_at).total_seconds()
        return math.log(time_since_creation ** -DECAY_CONSTANT)
    
    # Sum activation from each access
    activation_sum = 0.0
    for access_time in accesses:
        t_i = (now - access_time).total_seconds()
        if t_i > 0:  # Avoid log(0)
            activation_sum += t_i ** -DECAY_CONSTANT
    
    return math.log(activation_sum) if activation_sum > 0 else -float('inf')


def calculate_retrieval_probability(memory: Memory, now: datetime) -> float:
    """
    Probability that memory will be retrieved.
    
    Based on ACT-R retrieval equation with noise.
    """
    import random
    
    base_activation = calculate_base_activation(memory, now)
    
    # Add Gaussian noise (s = 0.25 in ACT-R)
    NOISE_SCALE = 0.25
    noise = random.gauss(0, NOISE_SCALE)
    
    total_activation = base_activation + noise
    
    # Retrieval threshold (tau)
    THRESHOLD = -2.0  # Memories below this are effectively forgotten
    
    if total_activation < THRESHOLD:
        return 0.0
    
    # Sigmoid function for smooth probability
    # P(retrieval) = 1 / (1 + e^(-(activation - threshold)))
    return 1.0 / (1.0 + math.exp(-(total_activation - THRESHOLD)))
```

### 2. Episodic → Semantic Consolidation

```python
from sklearn.cluster import DBSCAN
import numpy as np

async def consolidate_episodic_to_semantic(
    user_id: str,
    agent_id: str,
    lookback_days: int = 7
) -> list[Memory]:
    """
    Cluster similar episodic memories and extract semantic facts.
    
    Runs daily (mimics sleep consolidation).
    Requires 3+ similar episodes to form semantic memory.
    """
    # 1. Get recent episodic memories above strength threshold
    cutoff = datetime.now() - timedelta(days=lookback_days)
    
    episodic_memories = await db.query("""
        SELECT * FROM memories
        WHERE user_id = ?
          AND agent_id = ?
          AND state = 'episodic'
          AND created_at >= ?
          AND strength > 0.5
        ORDER BY created_at DESC
    """, user_id, agent_id, cutoff)
    
    if len(episodic_memories) < 3:
        return []  # Not enough to consolidate
    
    # 2. Cluster by embedding similarity
    embeddings = np.array([m.embedding for m in episodic_memories])
    
    # DBSCAN: density-based clustering
    # eps=0.15 → ~0.85 cosine similarity threshold
    # min_samples=3 → require at least 3 similar memories
    clustering = DBSCAN(eps=0.15, min_samples=3, metric='cosine')
    labels = clustering.fit_predict(embeddings)
    
    # 3. For each cluster, extract semantic fact
    semantic_memories = []
    
    for cluster_id in set(labels):
        if cluster_id == -1:  # Noise cluster
            continue
        
        cluster_mask = labels == cluster_id
        cluster_memories = [
            episodic_memories[i] 
            for i in range(len(episodic_memories)) 
            if cluster_mask[i]
        ]
        
        # Extract semantic pattern via LLM
        semantic_content = await extract_semantic_pattern(
            [m.content for m in cluster_memories]
        )
        
        # Create semantic memory
        semantic = await create_memory(
            user_id=user_id,
            agent_id=agent_id,
            content=semantic_content,
            state='semantic',
            strength=0.8,  # Start strong
            half_life_days=60.0,
            source_memory_ids=[m.id for m in cluster_memories],
            consolidation_timestamp=datetime.now()
        )
        
        # Log consolidation
        await log_consolidation(
            user_id=user_id,
            agent_id=agent_id,
            consolidation_type='episodic_to_semantic',
            source_memory_ids=[m.id for m in cluster_memories],
            result_memory_id=semantic.id,
            cluster_size=len(cluster_memories)
        )
        
        # Weaken source episodic memories (consolidated → less important)
        for episodic in cluster_memories:
            await update_memory_strength(episodic.id, episodic.strength * 0.6)
        
        semantic_memories.append(semantic)
    
    return semantic_memories


async def extract_semantic_pattern(episodic_contents: list[str]) -> str:
    """
    Use LLM to extract general pattern from specific events.
    """
    prompt = f"""Extract the general pattern or fact from these specific events.
Reply with ONLY the semantic fact (one sentence), no explanation.

Episodic events:
{chr(10).join(f'- {c}' for c in episodic_contents)}

Example:
Input: "Ordered pizza Monday", "Had pizza Friday", "Pizza for dinner Tuesday"
Output: "User frequently eats pizza for meals"

Semantic fact:"""
    
    response = await llm.complete(prompt, max_tokens=50)
    return response.strip()
```

### 3. Semantic → Core Belief Formation

```python
async def form_core_beliefs(
    user_id: str,
    agent_id: str,
    lookback_days: int = 30
) -> list[Memory]:
    """
    Promote reinforced semantic memories to core beliefs.
    
    Runs weekly. Requires:
    - 5+ reinforcements (repeated validation)
    - 0 contradictions (stable belief)
    - 14+ days age (proven stability over time)
    - Must be value statement (not just preference)
    """
    cutoff = datetime.now() - timedelta(days=lookback_days)
    
    # Find candidate semantic memories
    candidates = await db.query("""
        SELECT * FROM memories
        WHERE user_id = ?
          AND agent_id = ?
          AND state = 'semantic'
          AND reinforcements >= 5
          AND contradictions = 0
          AND strength > 0.7
          AND created_at < NOW() - INTERVAL '14 days'
        ORDER BY reinforcements DESC, strength DESC
    """, user_id, agent_id)
    
    beliefs_formed = []
    
    for semantic in candidates:
        # Check if it's a value/principle (not just fact)
        is_belief = await llm_classify_as_belief(semantic.content)
        
        if not is_belief:
            continue
        
        # Promote to core belief
        belief = await create_memory(
            user_id=user_id,
            agent_id=agent_id,
            content=semantic.content,
            state='belief',
            strength=0.9,  # Very strong
            half_life_days=365.0,  # Decays very slowly
            derived_from=semantic.id,
            consolidation_timestamp=datetime.now()
        )
        
        # Update agent personality
        await update_agent_personality(agent_id, belief)
        
        # Log consolidation
        await log_consolidation(
            user_id=user_id,
            agent_id=agent_id,
            consolidation_type='semantic_to_belief',
            source_memory_ids=[semantic.id],
            result_memory_id=belief.id
        )
        
        beliefs_formed.append(belief)
    
    return beliefs_formed


async def llm_classify_as_belief(content: str) -> bool:
    """Determine if content is a value statement vs. simple fact."""
    prompt = f"""Is this a value, principle, or belief? Reply only YES or NO.

Content: "{content}"

Examples:
"I like pizza" → NO (preference)
"User orders from Joe's Pizza" → NO (fact)
"Recommendations from trusted people are valuable" → YES (principle)
"Quality matters more than speed" → YES (value)

Answer:"""
    
    response = await llm.complete(prompt, max_tokens=5)
    return response.strip().upper() == "YES"


async def update_agent_personality(agent_id: str, new_belief: Memory):
    """Extract personality traits from belief and update agent profile."""
    
    # Extract trait dimensions
    prompt = f"""Extract personality trait changes from this belief.
Reply in JSON: {{"trait_name": delta_value}} where delta is -0.3 to +0.3.

Belief: "{new_belief.content}"

Examples:
"Security is paramount" → {{"cautious": 0.2, "risk_averse": 0.3}}
"Move fast and break things" → {{"aggressive": 0.3, "cautious": -0.2}}

Traits (JSON only):"""
    
    response = await llm.complete(prompt, max_tokens=100)
    trait_deltas = json.loads(response)
    
    # Update personality vector
    personality = await get_personality(agent_id)
    
    for trait, delta in trait_deltas.items():
        old_value = personality.traits.get(trait, 0.5)  # Default neutral
        new_value = np.clip(old_value + (delta * new_belief.strength), 0.0, 1.0)
        personality.traits[trait] = new_value
    
    # Add belief to core_beliefs array
    if new_belief.id not in personality.core_beliefs:
        personality.core_beliefs.append(new_belief.id)
    
    personality.updated_at = datetime.now()
    
    await save_personality(personality)
    
    # Log personality change
    logger.info(
        f"Agent {agent_id} personality updated",
        extra={
            "belief_id": str(new_belief.id),
            "trait_changes": trait_deltas,
            "new_traits": personality.traits
        }
    )
```

### 4. Memory Decay & Pruning

```python
async def apply_memory_decay(hours_elapsed: float = 6.0):
    """
    Apply exponential decay to all memories.
    
    Runs every 6 hours (4x daily).
    Uses state-dependent half-lives.
    """
    now = datetime.now()
    days_elapsed = hours_elapsed / 24.0
    
    # Fetch all active memories
    memories = await db.query("""
        SELECT id, state, strength, half_life_days, last_accessed, access_count
        FROM memories
        WHERE strength > 0.0
    """)
    
    for memory in memories:
        # Calculate decay factor: strength * (0.5 ^ (time / half_life))
        decay_factor = 0.5 ** (days_elapsed / memory.half_life_days)
        new_strength = memory.strength * decay_factor
        
        # Access boost: frequently accessed memories decay slower
        if memory.access_count > 0:
            access_boost = min(0.05 * memory.access_count, 0.3)
            new_strength = min(1.0, new_strength + access_boost)
        
        # Update or archive
        if new_strength < 0.05:
            # Very weak → archive (don't delete, just mark inactive)
            await archive_memory(memory.id)
        else:
            await update_memory(memory.id, strength=new_strength)
    
    logger.info(f"Memory decay applied ({hours_elapsed}h elapsed)")


async def archive_memory(memory_id: UUID):
    """
    Move very weak memory to archive (cold storage).
    
    Can be restored if accessed again (reconsolidation).
    """
    await db.execute("""
        UPDATE memories
        SET strength = 0.0,
            archived_at = NOW()
        WHERE id = ?
    """, memory_id)
```

### 5. Reinforcement & Contradiction Detection

```python
async def process_new_memory(
    user_id: str,
    agent_id: str,
    content: str,
    embedding: list[float]
) -> Memory:
    """
    Create new memory and check for reinforcements/contradictions.
    """
    # 1. Create the memory
    new_memory = await create_memory(
        user_id=user_id,
        agent_id=agent_id,
        content=content,
        embedding=embedding,
        state='episodic'
    )
    
    # 2. Find semantically similar memories
    similar = await vector_search(
        user_id=user_id,
        embedding=embedding,
        limit=10,
        min_similarity=0.7,
        exclude_id=new_memory.id
    )
    
    # 3. Check relationship with each similar memory
    for existing in similar:
        relationship = await llm_compare_memories(
            new_memory.content,
            existing.content
        )
        
        if relationship == "reinforces":
            # Strengthen existing memory
            await db.execute("""
                UPDATE memories
                SET reinforcements = reinforcements + 1,
                    strength = LEAST(1.0, strength + 0.1)
                WHERE id = ?
            """, existing.id)
            
        elif relationship == "contradicts":
            # Weaken existing memory
            await db.execute("""
                UPDATE memories
                SET contradictions = contradictions + 1,
                    strength = strength * 0.8
                WHERE id = ?
            """, existing.id)
            
            # If contradicting a core belief, flag for review
            if existing.state == 'belief':
                await flag_belief_challenge(
                    agent_id=agent_id,
                    belief_id=existing.id,
                    challenge_id=new_memory.id
                )
    
    return new_memory


async def llm_compare_memories(content1: str, content2: str) -> str:
    """Determine relationship between two memories."""
    prompt = f"""How are these two memories related? Reply ONE word: reinforces | contradicts | unrelated

Memory 1: "{content1}"
Memory 2: "{content2}"

Examples:
"User likes pizza" + "User ordered pizza" → reinforces
"User is cautious" + "User took major risk" → contradicts
"User likes pizza" + "Weather is sunny" → unrelated

Relationship:"""
    
    response = await llm.complete(prompt, max_tokens=5)
    return response.strip().lower()
```

---

## Background Jobs (Cron Schedule)

```python
# Every 6 hours: Memory decay
@cron("0 */6 * * *")
async def hourly_memory_decay():
    await apply_memory_decay(hours_elapsed=6.0)

# Daily at 2 AM: Episodic → Semantic consolidation
@cron("0 2 * * *")
async def daily_consolidation():
    users = await get_active_users()
    for user in users:
        agents = await get_user_agents(user.id)
        for agent in agents:
            await consolidate_episodic_to_semantic(
                user_id=user.id,
                agent_id=agent.id,
                lookback_days=7
            )

# Weekly Sunday 3 AM: Semantic → Belief formation
@cron("0 3 * * 0")
async def weekly_belief_formation():
    users = await get_active_users()
    for user in users:
        agents = await get_user_agents(user.id)
        for agent in agents:
            await form_core_beliefs(
                user_id=user.id,
                agent_id=agent.id,
                lookback_days=30
            )

# Monthly: Personality snapshots
@cron("0 4 1 * *")
async def monthly_personality_snapshot():
    agents = await get_all_agents()
    for agent in agents:
        personality = await get_personality(agent.id)
        
        # Save snapshot
        await db.execute("""
            UPDATE agent_personalities
            SET snapshot_history = array_append(
                snapshot_history,
                jsonb_build_object(
                    'timestamp', NOW(),
                    'traits', traits,
                    'core_beliefs_count', array_length(core_beliefs, 1)
                )
            )
            WHERE agent_id = ?
        """, agent.id)
        
        # Detect significant drift
        if await personality_changed_significantly(agent.id):
            await notify_user(
                user_id=agent.user_id,
                message=f"🧠 {agent.name}'s personality has evolved this month"
            )
```

---

## Agent-Aware Search with Belief Bias

```python
async def search_memories_agent_aware(
    user_id: str,
    agent_id: str,
    query: str,
    limit: int = 10,
    apply_belief_bias: bool = True
) -> list[Memory]:
    """
    Search with agent context and optional personality bias.
    
    Boosting factors:
    - Agent created this memory: +30%
    - Memory aligns with agent beliefs: +20%
    - Memory accessed by this agent before: +15%
    - Semantic/belief state: higher weight
    """
    # 1. Vector search baseline
    query_embedding = await embed_text(query)
    vector_results = await vector_search(
        user_id=user_id,
        embedding=query_embedding,
        limit=50  # Wider initial search
    )
    
    # 2. Get agent personality (for belief bias)
    personality = await get_personality(agent_id) if apply_belief_bias else None
    
    # 3. Score each memory
    scored_results = []
    for memory in vector_results:
        score = memory.similarity_score  # Base cosine similarity
        
        # Agent origin boost
        if memory.agent_id == agent_id:
            score *= 1.3
        
        # Access pattern boost (this agent used it before)
        agent_accesses = await count_agent_accesses(memory.id, agent_id)
        if agent_accesses > 0:
            score *= (1.0 + min(0.15, agent_accesses * 0.03))
        
        # State-based weighting
        if memory.state == 'belief':
            score *= 2.0  # Beliefs dominate
        elif memory.state == 'semantic':
            score *= 1.5
        
        # Belief alignment bias (confirmation bias simulation)
        if apply_belief_bias and personality and memory.state != 'belief':
            alignment = await measure_belief_alignment(
                memory.content,
                personality.core_beliefs
            )
            if alignment > 0.5:  # Supports beliefs
                score *= (1.0 + alignment * 0.3)
            elif alignment < -0.5:  # Contradicts beliefs
                score *= (1.0 + alignment * 0.2)  # Negative = reduce score
        
        # ACT-R activation boost (recently accessed = higher)
        base_activation = calculate_base_activation(memory, datetime.now())
        if base_activation > -1.0:  # Strong recent activation
            score *= 1.2
        
        memory.final_score = score
        scored_results.append(memory)
    
    # 4. Re-rank and return
    scored_results.sort(key=lambda m: m.final_score, reverse=True)
    return scored_results[:limit]
```

---

## API Updates

### POST /v1/memory

```typescript
interface CreateMemoryRequest {
  content: string
  agent_id?: string          // Which agent is creating this
  importance?: number        // 0.0-1.0, affects decay rate
  metadata?: Record<string, any>
}

interface CreateMemoryResponse {
  id: string
  state: 'episodic' | 'semantic' | 'belief'
  strength: number
  consolidation_eligible: boolean  // Will this consolidate soon?
  reinforced_memories?: string[]   // IDs of memories this reinforced
}
```

### POST /v1/memory/search

```typescript
interface SearchMemoriesRequest {
  query: string
  agent_id?: string              // Search from this agent's perspective
  apply_belief_bias?: boolean    // Use personality to bias results
  min_strength?: number          // Filter weak memories
  states?: ('episodic' | 'semantic' | 'belief')[]  // Filter by state
  include_archived?: boolean     // Include decayed memories
}

interface SearchMemoriesResponse {
  results: Array<{
    id: string
    content: string
    state: string
    strength: number
    similarity_score: number
    final_score: number          // After all boosting
    created_by_agent: string
    access_count: number
    provenance?: {               // For semantic/beliefs
      source_memory_ids: string[]
      consolidated_from: number
      consolidation_date: string
    }
  }>
  consolidation_suggestion?: {   // If search reveals consolidation opportunity
    episodic_cluster_count: number
    suggested_semantic_fact: string
  }
}
```

### GET /v1/agents/{id}/personality

```typescript
interface AgentPersonalityResponse {
  agent_id: string
  traits: Record<string, number>  // {"cautious": 0.7, "creative": 0.8}
  core_beliefs: Array<{
    id: string
    content: string
    strength: number
    age_days: number
    reinforcements: number
  }>
  personality_drift: {
    last_30_days: Record<string, number>  // Trait changes
    significant_changes: string[]         // Trait names with >0.2 shift
  }
  memory_summary: {
    episodic_count: number
    semantic_count: number
    belief_count: number
    total_strength: number
  }
}
```

### GET /v1/memory/{id}/provenance

```typescript
interface MemoryProvenanceResponse {
  id: string
  content: string
  state: 'episodic' | 'semantic' | 'belief'
  consolidation_history: Array<{
    timestamp: string
    from_state: string
    to_state: string
    trigger: 'time' | 'reinforcement' | 'manual'
    source_memory_ids: string[]
  }>
  derived_from?: string  // Parent memory ID
  children?: string[]    // Memories derived from this one
}
```

---

## Success Metrics

### Phase 1: Consolidation Works (Week 1-2)
- ✅ Daily consolidation runs without errors
- ✅ 10%+ of episodic memories consolidate into semantic facts
- ✅ LLM-extracted semantic facts are coherent (manual review)
- ✅ Memory retrieval latency <200ms (with consolidation)

### Phase 2: Token Efficiency (Week 3-4)
- ✅ 40% reduction in average tokens per memory retrieval
  - Baseline: 50 episodic memories × 100 tokens = 5000 tokens
  - Target: 10 semantic + 5 episodic = 2000 tokens
- ✅ Search results prefer semantic over redundant episodic
- ✅ Agent responses reference patterns, not individual events

### Phase 3: Personality Emergence (Week 5-8)
- ✅ 5+ core beliefs formed per agent after 30 days
- ✅ Personality traits measurably shift (>0.1 change in 2+ traits)
- ✅ Agents give different recommendations based on their beliefs
- ✅ Cross-session consistency improves (same query → similar answer)

### Phase 4: Production Readiness (Week 9-12)
- ✅ Memory system handles 1M+ memories per user
- ✅ Consolidation completes in <5 minutes per user
- ✅ Decay/pruning keeps memory DB size manageable
- ✅ A/B test shows users prefer agents with consolidation vs. flat memory

---

## Implementation Plan

### Week 1-2: Core Infrastructure
- [ ] Schema migration (add state, strength, activation fields)
- [ ] Implement ACT-R activation calculation
- [ ] Implement memory decay job
- [ ] Test decay dynamics (simulate 30 days in seconds)

### Week 3-4: Episodic → Semantic Consolidation
- [ ] Implement clustering algorithm (DBSCAN on embeddings)
- [ ] Implement LLM semantic extraction
- [ ] Daily consolidation job
- [ ] Consolidation audit logs

### Week 5-6: Semantic → Belief Formation
- [ ] Implement reinforcement/contradiction detection
- [ ] Implement belief classification (LLM)
- [ ] Weekly belief formation job
- [ ] Agent personality schema + updates

### Week 7-8: Agent-Aware Search
- [ ] Implement belief-biased search scoring
- [ ] Agent access pattern tracking
- [ ] Search API updates
- [ ] Frontend personality dashboard

### Week 9-10: Testing & Optimization
- [ ] Load testing (1M memories per user)
- [ ] A/B test setup (consolidation on/off)
- [ ] Query optimization (indexes, caching)
- [ ] Memory provenance UI

### Week 11-12: Production Rollout
- [ ] Gradual rollout (1% → 10% → 50% → 100%)
- [ ] Monitoring dashboards (Grafana)
- [ ] User education (docs, examples)
- [ ] Feedback collection

---

## Migration Strategy

### Step 1: Additive Schema Changes (No Breaking Changes)
```sql
-- Add new columns with defaults (existing data untouched)
ALTER TABLE memories ADD COLUMN state TEXT DEFAULT 'episodic';
ALTER TABLE memories ADD COLUMN strength REAL DEFAULT 1.0;
-- ... (all other columns)

-- Backfill existing memories
UPDATE memories SET state = 'episodic' WHERE state IS NULL;
```

### Step 2: Dual Mode (Feature Flag)
```python
if feature_enabled('memory_consolidation', user_id):
    results = search_with_consolidation(query, agent_id)
else:
    results = legacy_vector_search(query)
```

### Step 3: Background Backfill
```python
# Async job to populate ACT-R activation for old memories
for memory in old_memories:
    base_activation = calculate_base_activation(memory, now)
    await update_memory(memory.id, base_activation=base_activation)
```

### Step 4: Gradual Rollout
- Week 1-2: Internal testing (team accounts only)
- Week 3-4: Beta users (opt-in)
- Week 5-6: 10% of users (A/B test)
- Week 7-8: 50% of users
- Week 9+: 100% rollout

---

## Monitoring & Alerts

### Metrics
- `memory.consolidation.duration_ms` (p50, p95, p99)
- `memory.consolidation.cluster_count` (per run)
- `memory.consolidation.semantic_facts_created` (per run)
- `memory.decay.archived_count` (per run)
- `memory.search.latency_ms` (with/without consolidation)
- `memory.search.token_count` (average per query)
- `personality.trait_drift` (change per agent per week)
- `personality.belief_count` (per agent)

### Alerts
- ⚠️ Consolidation taking >5 minutes (p95)
- 🚨 Memory search latency >500ms (p99)
- ⚠️ Consolidation error rate >1%
- ⚠️ Memory DB growth >10% week-over-week (unsustainable)

---

## Security & Privacy

**Data Isolation:**
- All queries filtered by `user_id` (no cross-user leakage)
- Agent-created memories tagged with `agent_id`
- Row-level security (RLS) on PostgreSQL

**GDPR Compliance:**
- Memory deletion cascades (episodic → semantic → belief)
- Export API includes full provenance
- Archive vs. hard delete (user choice)

**Audit Trail:**
- All consolidations logged with source memories
- Personality changes tracked with belief IDs
- Memory access patterns logged (for ACT-R)

---

## Open Questions

1. **Consolidation Frequency:**
   - Daily for episodic → semantic (current proposal)
   - Or continuous (stream processing)?
   - Trade-off: latency vs. compute cost

2. **Cross-Agent Memory Sharing:**
   - Should semantic memories be shared across user's swarm?
   - If yes, how to attribute/scope?
   - Risk: personality convergence (all agents become similar)

3. **Belief Contradiction Resolution:**
   - When strong belief contradicted, auto-revise or flag for user?
   - How much user control over personality drift?
   - Ethics: should agents be "stubborn" (human-like) or always update?

4. **Memory Resurrection:**
   - Should archived memories be restorable via search?
   - If accessed again, restore strength (reconsolidation)?
   - Or permanent decay?

5. **Timescale Acceleration:**
   - Humans: weeks-months for consolidation
   - AI agents process 1000x more experiences
   - Justify faster timescales (days instead of months)?

---

## Alternatives Considered

### Alt 1: No Consolidation (Status Quo)
**Rejected:** Token costs unsustainable, no personality emergence

### Alt 2: LLM-Only Summarization
**Rejected:** No activation dynamics, no decay, no personality formation

### Alt 3: Rule-Based Pattern Extraction
**Rejected:** Brittle, doesn't generalize, requires domain-specific rules

### Alt 4: Pure Graph Memory (No States)
**Rejected:** Doesn't model human-like forgetting or consolidation

---

## References

**Neuroscience:**
- Dudai et al. (2015) - "The consolidation and transformation of memory" - *Neuron*
- Moscovitch et al. (2016) - "Episodic memory and beyond" - *Annual Review of Psychology*
- Inostroza & Born (2013) - "Sleep for preserving and transforming episodic memory" - *Annual Review of Neuroscience*
- Nadel & Moscovitch (1997) - "Multiple trace theory" - *Current Opinion in Neurobiology*

**Cognitive Models:**
- Anderson et al. (2004) - "An integrated theory of the mind (ACT-R)" - *Psychological Review*
- Ebbinghaus (1885) - "Memory: A Contribution to Experimental Psychology"

**Related RFCs:**
- RFC-019: Graph Memory Architecture (foundation layer)
- MEMORY-REQUIREMENTS: Platform-wide immortal memory standard

---

## Changelog

- **2026-03-01**: Initial draft (Green Tara)

---

## Approval

- [ ] esper (Product/Architecture)
- [ ] Engineering Lead
- [ ] Data/Privacy Review

**Target Merge:** 2026-03-15  
**Target Ship:** 2026-05-01 (Phase 1-3 complete)
