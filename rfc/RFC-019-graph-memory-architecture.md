# RFC-019: Graph Memory Architecture for AI Agents

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Date:** 2026-02-25  
**Supersedes:** Current flat memory storage

## Summary

Design a scalable graph database architecture for AI agent memory that combines semantic embeddings with rich relationship modeling. Evaluate PostgreSQL property graphs, Neo4j, and hybrid approaches to determine the ideal solution for 100k+ users with millions of interconnected memories.

## Problem

Current memory architecture is **flat** - memories are isolated vectors with no relationships:

```
Memory 1: "I love pizza"
Memory 2: "Ordered from Joe's Pizza last week"
Memory 3: "Joe recommended the margherita"

No connection between:
- Pizza preference ↔ Restaurant choice
- Joe (person) ↔ Restaurant recommendation
- Time (last week) ↔ Ordering event
```

**Limitations:**
1. **No context chaining** - can't traverse relationships
2. **No entity resolution** - "Joe" in memory 2 vs 3 might be same person
3. **No temporal reasoning** - can't answer "when did I first try X?"
4. **No inference** - can't deduce "I trust Joe's food recommendations"
5. **Redundant storage** - same entities repeated across memories

**Impact:**
- Agents forget connections between facts
- Can't build knowledge graphs
- Poor reasoning over time
- Inefficient token usage (must include all context)

## Goals

1. **Rich relationships** - Model how memories connect
2. **Entity resolution** - Deduplicate people, places, concepts
3. **Graph traversal** - Answer "show me all memories related to X"
4. **Temporal reasoning** - Understand sequences and evolution
5. **Scalability** - 100k+ users, 1M+ memories each
6. **Performance** - <100ms graph queries
7. **Hybrid search** - Combine vector similarity + graph structure

## Proposal

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Memory API (unju-python, unju-api)              │  │
│  │  - Add memory (text → embedding + graph)         │  │
│  │  - Search (vector + graph traversal)             │  │
│  │  - Traverse (relationship following)             │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│              Storage Layer (Hybrid)                      │
│                                                          │
│  ┌─────────────────────┐    ┌──────────────────────┐   │
│  │  Vector Store       │    │  Graph Store         │   │
│  │  (pgvector)         │◄──►│  (PostgreSQL / Neo4j)│   │
│  │                     │    │                      │   │
│  │  - Embeddings       │    │  - Entities          │   │
│  │  - Semantic search  │    │  - Relationships     │   │
│  │  - Similarity       │    │  - Properties        │   │
│  └─────────────────────┘    └──────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Data Model

**Node Types:**

```
MEMORY
├── id: UUID
├── content: TEXT
├── embedding: VECTOR(1536)
├── type: ENUM (episodic, semantic, procedural)
├── timestamp: TIMESTAMPTZ
├── user_id: TEXT
└── importance: REAL

ENTITY
├── id: UUID
├── name: TEXT
├── type: ENUM (person, place, thing, concept, event)
├── canonical_name: TEXT  # After entity resolution
├── embedding: VECTOR(1536)
├── properties: JSONB
└── user_id: TEXT

CONCEPT
├── id: UUID
├── name: TEXT
├── category: TEXT
├── embedding: VECTOR(1536)
└── user_id: TEXT
```

**Relationship Types:**

```
MENTIONS
- memory → entity
- properties: {context, sentiment}

RELATES_TO
- memory → memory
- properties: {type: causation|sequence|similarity, strength}

IS_A
- entity → concept
- properties: {confidence}

HAS_PROPERTY
- entity → attribute
- properties: {value, timestamp}

OCCURRED_AT
- memory → time/place
- properties: {precision}

INVOLVES
- memory → entity
- properties: {role: subject|object|actor}
```

**Example Graph:**

```cypher
(m1:MEMORY {content: "I love pizza"})
  -[:MENTIONS {sentiment: positive}]→
    (pizza:ENTITY {name: "pizza", type: thing})
      -[:IS_A]→
        (food:CONCEPT {name: "food"})

(m2:MEMORY {content: "Ordered from Joe's Pizza last week"})
  -[:MENTIONS]→
    (joes:ENTITY {name: "Joe's Pizza", type: place})
  -[:INVOLVES {role: actor}]→
    (user:ENTITY {name: "me", type: person})
  -[:OCCURRED_AT]→
    (lastweek:TIME {value: "2026-02-18"})

(m3:MEMORY {content: "Joe recommended the margherita"})
  -[:INVOLVES {role: subject}]→
    (joe:ENTITY {name: "Joe", type: person})
  -[:MENTIONS]→
    (margherita:ENTITY {name: "margherita pizza", type: thing})
      -[:IS_A]→ (pizza)

(m2) -[:RELATES_TO {type: causation}]→ (m1)
(m3) -[:RELATES_TO {type: sequence}]→ (m2)
(joe) -[:ASSOCIATED_WITH]→ (joes)
```

### Query Patterns

**1. Semantic Search + Graph Context**

```sql
-- Find memories about "food recommendations"
WITH vector_matches AS (
  SELECT id, embedding <=> query_embedding AS distance
  FROM memories
  WHERE user_id = ?
  ORDER BY distance LIMIT 20
),
graph_context AS (
  SELECT DISTINCT m2.id, m2.content
  FROM vector_matches vm
  JOIN memory_entity me ON vm.id = me.memory_id
  JOIN entity_relationships er ON me.entity_id = er.entity_id
  JOIN memory_entity me2 ON er.related_entity_id = me2.entity_id
  JOIN memories m2 ON me2.memory_id = m2.id
  WHERE er.relationship = 'RELATES_TO'
)
SELECT * FROM vector_matches
UNION
SELECT * FROM graph_context
ORDER BY distance LIMIT 10;
```

**2. Entity-Centric Retrieval**

```cypher
// Neo4j: Find all memories about "Joe"
MATCH (joe:ENTITY {canonical_name: "Joe"})<-[:MENTIONS]-(m:MEMORY)
OPTIONAL MATCH (m)-[:RELATES_TO*1..2]-(related:MEMORY)
RETURN m, collect(related)
ORDER BY m.timestamp DESC
LIMIT 10
```

**3. Temporal Reasoning**

```cypher
// Find how my opinion evolved over time
MATCH (concept:CONCEPT {name: "pizza"})<-[:IS_A]-(entity)<-[:MENTIONS]-(m:MEMORY)
WHERE m.user_id = ?
RETURN m.timestamp, m.content, m.sentiment
ORDER BY m.timestamp ASC
```

**4. Transitive Relationships**

```cypher
// Find everything connected to "Joe" within 3 hops
MATCH (joe:ENTITY {canonical_name: "Joe"})-[*1..3]-(related)
WHERE related:MEMORY OR related:ENTITY
RETURN related
LIMIT 50
```

## Solution Comparison

### Option 1: PostgreSQL with Property Graphs (SQL/PGQ)

**Tech:** PostgreSQL 17+ with SQL/PGQ extension

**Pros:**
- ✅ Single database (no sync issues)
- ✅ ACID transactions
- ✅ Already using Postgres
- ✅ pgvector integration (same DB)
- ✅ Standard SQL + graph syntax
- ✅ Lower operational complexity

**Cons:**
- ❌ Newer technology (less mature)
- ❌ Graph performance worse than Neo4j
- ❌ Limited graph algorithms
- ❌ Smaller community for graph use cases

**Performance:**
- Simple traversals: <50ms
- Complex graph queries: 200-500ms
- Vector search: <100ms (with pgvector)

**Schema Example:**

```sql
-- Property graph definition (SQL/PGQ)
CREATE PROPERTY GRAPH memory_graph
  VERTEX TABLES (
    memories PROPERTIES (id, content, embedding, user_id, timestamp),
    entities PROPERTIES (id, name, type, canonical_name, user_id)
  )
  EDGE TABLES (
    memory_mentions_entity SOURCE memories DESTINATION entities
      PROPERTIES (sentiment, context),
    memory_relates_memory SOURCE memories DESTINATION memories
      PROPERTIES (relationship_type, strength)
  );

-- Query with graph syntax
GRAPH_TABLE (memory_graph
  MATCH (m:memories WHERE user_id = ?)-[r:memory_mentions_entity]->(e:entities)
  WHERE e.canonical_name = 'Joe'
  COLUMNS (m.id, m.content, r.sentiment)
);
```

**Cost:** $0 (included in Postgres)  
**Ops Complexity:** Low (one DB to manage)  
**Learning Curve:** Medium (new SQL/PGQ syntax)

---

### Option 2: Neo4j (Dedicated Graph DB)

**Tech:** Neo4j (community or enterprise)

**Pros:**
- ✅ Best graph performance
- ✅ Mature ecosystem
- ✅ Rich graph algorithms
- ✅ Visualization tools
- ✅ Strong community
- ✅ Native graph storage

**Cons:**
- ❌ Separate database (sync complexity)
- ❌ Eventual consistency with Postgres
- ❌ Higher operational cost
- ❌ No native vector search (need plugin)
- ❌ JVM memory overhead

**Performance:**
- Simple traversals: <10ms
- Complex graph queries: 50-200ms
- Vector search: 100-300ms (via plugin)

**Architecture:**

```
PostgreSQL (source of truth)
├── memories table (with embeddings)
└── Change Data Capture (CDC)
    ↓
Neo4j (graph view)
├── Memory nodes
├── Entity nodes
└── Relationship edges
```

**Schema Example:**

```cypher
// Create constraints
CREATE CONSTRAINT memory_id IF NOT EXISTS
FOR (m:Memory) REQUIRE m.id IS UNIQUE;

CREATE CONSTRAINT entity_canonical IF NOT EXISTS
FOR (e:Entity) REQUIRE (e.user_id, e.canonical_name) IS UNIQUE;

// Create indexes
CREATE INDEX memory_user IF NOT EXISTS
FOR (m:Memory) ON (m.user_id);

CREATE INDEX entity_type IF NOT EXISTS
FOR (e:Entity) ON (e.type);

// Ingest from Postgres via CDC
CALL apoc.load.jdbc('postgres', 
  'SELECT * FROM memories WHERE updated_at > ?') 
YIELD row
MERGE (m:Memory {id: row.id})
SET m += row;
```

**Cost:** $0-$5k/month (community free, enterprise paid)  
**Ops Complexity:** High (two databases + sync)  
**Learning Curve:** Medium (Cypher query language)

---

### Option 3: Apache AGE (PostgreSQL Graph Extension)

**Tech:** PostgreSQL + Apache AGE extension

**Pros:**
- ✅ PostgreSQL-based (familiar)
- ✅ OpenCypher support
- ✅ Single database
- ✅ ACID transactions
- ✅ Open source (free)

**Cons:**
- ❌ Less mature than Neo4j
- ❌ Smaller community
- ❌ Performance between Postgres and Neo4j
- ❌ Limited tooling

**Performance:**
- Simple traversals: <30ms
- Complex graph queries: 100-400ms
- Vector search: <100ms (with pgvector)

**Cost:** $0 (open source)  
**Ops Complexity:** Medium (extension management)  
**Learning Curve:** Low (Cypher in Postgres)

---

### Option 4: Hybrid (Postgres + Redis Graph)

**Tech:** Postgres (persistent) + Redis Graph (cache layer)

**Pros:**
- ✅ Fast hot path (Redis in-memory)
- ✅ Postgres fallback (reliability)
- ✅ Flexible caching strategy

**Cons:**
- ❌ Complex sync logic
- ❌ Cache invalidation challenges
- ❌ Redis Graph deprecated (moved to RedisGraph module)
- ❌ Three systems to manage

**Cost:** $50-500/month (Redis hosting)  
**Ops Complexity:** Very High  
**Learning Curve:** High  

---

## Recommendation: PostgreSQL SQL/PGQ (Option 1)

**Why:**

1. **Operational Simplicity**
   - Single database to backup, scale, monitor
   - No cross-DB sync issues
   - Existing Postgres expertise

2. **Performance Good Enough**
   - 200-500ms for complex queries is acceptable
   - Can optimize with indexes and materialized views
   - Vector search co-located (no network hop)

3. **Future-Proof**
   - SQL/PGQ is ISO standard (SQL:2023)
   - PostgreSQL has strong momentum
   - Can migrate to Neo4j later if needed

4. **Cost-Effective**
   - No additional licensing
   - No additional infrastructure
   - Simpler deployment

5. **Integration**
   - pgvector already in use
   - Same transaction scope
   - Consistent query patterns

**Trade-Offs:**

❌ **Slower than Neo4j** - Accept 2-5x slower graph queries  
✅ **But:** Most queries are vector search first (fast), graph context second  

❌ **Fewer graph algorithms** - Basic traversal only  
✅ **But:** Can implement custom algorithms in application layer

❌ **Newer technology** - Less battle-tested  
✅ **But:** Postgres is rock-solid, SQL/PGQ builds on that

## Implementation Plan

### Phase 1: Schema Design (Week 1)

```sql
-- Add property graph to existing memories table
CREATE PROPERTY GRAPH memory_graph
  VERTEX TABLES (
    memories PROPERTIES (id, content, embedding, user_id, timestamp, importance),
    entities PROPERTIES (id, name, type, canonical_name, embedding, user_id, properties),
    concepts PROPERTIES (id, name, category, embedding, user_id)
  )
  EDGE TABLES (
    memory_entities 
      SOURCE memories DESTINATION entities
      PROPERTIES (relationship_type, sentiment, context),
    
    entity_concepts
      SOURCE entities DESTINATION concepts
      PROPERTIES (confidence),
    
    memory_relations
      SOURCE memories DESTINATION memories
      PROPERTIES (relationship_type, strength),
    
    entity_relations
      SOURCE entities DESTINATION entities
      PROPERTIES (relationship_type, properties)
  );

-- Indexes for performance
CREATE INDEX ON memory_entities (memory_id);
CREATE INDEX ON memory_entities (entity_id);
CREATE INDEX ON entities (canonical_name, user_id);
CREATE INDEX ON memories USING GIN (user_id);
```

### Phase 2: Entity Extraction (Week 2)

```python
from unju.llm import extract_entities

def add_memory_with_graph(user_id: str, content: str):
    # 1. Create memory node
    memory_id = create_memory(user_id, content)
    
    # 2. Extract entities via LLM
    entities = extract_entities(content)
    # Returns: [
    #   {name: "Joe", type: "person", sentiment: "positive"},
    #   {name: "margherita pizza", type: "thing"}
    # ]
    
    # 3. Resolve entities (dedup)
    for entity_data in entities:
        entity = resolve_entity(user_id, entity_data['name'], entity_data['type'])
        
        # 4. Create edges
        create_edge(
            source=memory_id,
            target=entity.id,
            relationship='MENTIONS',
            properties={'sentiment': entity_data.get('sentiment')}
        )
```

### Phase 3: Hybrid Search (Week 3)

```python
def search_with_graph_context(user_id: str, query: str, limit: int = 10):
    # 1. Vector search (fast first pass)
    vector_matches = vector_search(user_id, query, limit=20)
    
    # 2. Expand via graph (get related memories)
    graph_query = """
        GRAPH_TABLE (memory_graph
          MATCH (m:memories WHERE id IN ?)-[*1..2]-(related:memories)
          WHERE related.user_id = ?
          COLUMNS (related.id, related.content, related.timestamp)
        )
    """
    graph_context = execute(graph_query, vector_match_ids, user_id)
    
    # 3. Combine and re-rank
    all_candidates = vector_matches + graph_context
    reranked = rerank_by_relevance(all_candidates, query)
    
    return reranked[:limit]
```

### Phase 4: Entity Resolution (Week 4)

```python
def resolve_entity(user_id: str, name: str, entity_type: str) -> Entity:
    # 1. Check for existing similar entities
    candidates = vector_search_entities(user_id, name, limit=5)
    
    # 2. Use LLM to determine if same entity
    for candidate in candidates:
        if llm_entity_match(candidate.name, name, entity_type):
            return candidate  # Reuse existing
    
    # 3. Create new if no match
    return create_entity(user_id, name, entity_type)
```

### Phase 5: Production Deploy (Week 5-6)

- Migration scripts
- Performance testing
- Monitoring dashboards
- Documentation
- Rollback plan

## Migration Strategy

### Step 1: Additive Changes

```sql
-- Don't touch existing memories table
-- Add new tables for graph
CREATE TABLE entities (...);
CREATE TABLE memory_entities (...);
CREATE TABLE entity_relations (...);

-- Populate from existing memories
INSERT INTO entities (...)
SELECT DISTINCT extract_entities(content) FROM memories;
```

### Step 2: Dual Write

```python
def add_memory(user_id, content):
    # Old way (keep working)
    memory_id = insert_memory(content, embedding)
    
    # New way (add graph)
    try:
        entities = extract_entities(content)
        link_memory_to_entities(memory_id, entities)
    except Exception as e:
        log_error(e)  # Don't fail if graph fails
```

### Step 3: Backfill

```python
# Async job to populate graph for old memories
for memory in old_memories:
    add_to_graph(memory)
```

### Step 4: Switch Reads

```python
# Gradually route reads to graph-enhanced search
if feature_flag('graph_search', user_id):
    return search_with_graph(query)
else:
    return legacy_search(query)
```

## Success Metrics

### Phase 1: Working (Week 1-2)
- ✅ Can insert memories with entities
- ✅ Can query graph relationships
- ✅ <1s for simple traversals

### Phase 2: Better (Week 3-4)
- ✅ Entity resolution working (>80% accuracy)
- ✅ Hybrid search returns better results
- ✅ <500ms for graph context queries

### Phase 3: Production (Week 5-6)
- ✅ 100% traffic on graph-enhanced search
- ✅ <200ms p95 latency
- ✅ Zero data loss
- ✅ Monitoring dashboards live

## Alternatives Considered

### Alt 1: Stay Flat (No Graph)

**Rejected because:**
- Can't model relationships
- Poor reasoning ability
- Redundant storage

### Alt 2: Application-Layer Graph

**Store relationships in JSONB, traverse in code**

**Rejected because:**
- Poor query performance
- Complex application logic
- Hard to optimize

### Alt 3: Separate Graph DB (Neo4j)

**Why not chosen:**
- Operational complexity (two DBs)
- Sync challenges
- Higher cost
- Can migrate later if needed

## Security Considerations

**Data Isolation:**
- All queries filtered by user_id
- Row-level security (RLS) on Postgres
- No cross-user graph traversal

**Privacy:**
- Entities tagged per-user (no global entity DB)
- Can delete entire graph for GDPR
- Audit log for graph queries

## Monitoring

**Metrics:**
- `graph.query.latency` (p50, p95, p99)
- `graph.entity.count` (per user)
- `graph.relationship.count` (per user)
- `graph.extraction.success_rate`

**Alerts:**
- Graph query >1s (p95)
- Entity extraction failure >5%
- Database connection issues

## Open Questions

1. **Entity embedding model?**
   - Same as memories (text-embedding-3-small)?
   - Or separate model for entities?

2. **How often to consolidate entities?**
   - Real-time (slow)?
   - Hourly batch (delayed)?
   - Daily (lazy)?

3. **Graph depth limit?**
   - 2 hops (fast)?
   - 3 hops (thorough)?
   - Configurable?

4. **When to use graph vs vector?**
   - Always hybrid?
   - Only for specific query types?
   - User preference?

## References

- [PostgreSQL SQL/PGQ](https://www.postgresql.org/docs/17/sql-graph.html) - SQL:2023 property graphs
- [Neo4j](https://neo4j.com/) - Leading graph database
- [Apache AGE](https://age.apache.org/) - PostgreSQL graph extension
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity in Postgres
- [mem0 Research](https://mem0.ai/research) - Memory architecture inspiration

## Changelog

- **2026-02-25**: Initial draft (Green Tara)
