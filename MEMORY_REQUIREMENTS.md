# Immortal and Perfect Memory Requirements

**Goal:** AI agents with memory that never forgets, never corrupts, and always recalls the right information.

Inspired by [mem0.ai](https://mem0.ai)'s research:
- +26% accuracy vs baseline
- 91% faster responses
- 90% fewer tokens

## Core Principles

### 1. Immortality (Reliability)

**Zero Data Loss**
- ✅ Memories persist immediately after write
- ✅ No silent failures (all errors surfaced)
- ✅ Atomic operations (all or nothing)
- ✅ Redundancy (backups, replication)
- ✅ Corruption detection and recovery

**Forever Accessible**
- ✅ Old memories retrievable after years
- ✅ No degradation over time
- ✅ Migration-safe (schema changes don't lose data)
- ✅ Export/import without loss

**Concurrent Safety**
- ✅ Multiple agents can access simultaneously
- ✅ Race conditions prevented
- ✅ Deadlock-free
- ✅ Eventually consistent

### 2. Perfection (Accuracy)

**Semantic Understanding**
- ✅ Finds relevant memories, not just keyword matches
- ✅ Understands synonyms and variations
- ✅ Handles multi-entity queries
- ✅ Temporal context awareness (recent vs old)

**Intelligent Ranking**
- ✅ Most relevant results first
- ✅ Importance scoring (signal vs noise)
- ✅ Recency bias (configurable)
- ✅ User-specific personalization

**Deduplication**
- ✅ No exact duplicates
- ✅ Consolidation of similar memories
- ✅ Update existing vs create new
- ✅ Conflict resolution (newer overwrites older)

### 3. Performance (Speed)

**Fast Retrieval**
- ✅ Search <200ms (target: <100ms)
- ✅ List <500ms even with 1000s of memories
- ✅ Add <100ms
- ✅ Delete <50ms

**Efficient Storage**
- ✅ Compression where possible
- ✅ Lazy loading (don't fetch everything)
- ✅ Pagination for large sets
- ✅ Indexing for common queries

**Token Optimization**
- ✅ Return only relevant memories
- ✅ Summaries instead of full text when possible
- ✅ Limit enforcement
- ✅ Context-aware truncation

## Architecture Requirements

### Storage Layer

**Database:**
- PostgreSQL with pgvector for semantic search
- Or Qdrant/Weaviate for pure vector DB
- Backup to S3/R2 every hour
- Point-in-time recovery enabled

**Schema:**
```sql
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- or 768 for smaller models
  metadata JSONB,
  importance REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,  -- Soft delete
  version INT DEFAULT 1
);

CREATE INDEX idx_memories_user ON memories(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memories_created ON memories(created_at DESC);
```

### Embedding Layer

**Model:**
- OpenAI text-embedding-3-small (1536 dims, cheap)
- Or text-embedding-3-large (3072 dims, better)
- Or open source: all-MiniLM-L6-v2 (768 dims, free)

**Process:**
1. User adds memory → extract text
2. Generate embedding (cache if seen before)
3. Store content + embedding
4. Index for fast retrieval

**Caching:**
- Cache embeddings for common queries
- Redis for hot data (<1s access)
- Database for cold data

### Retrieval Layer

**Search Pipeline:**
```
Query → Embed → Vector Search → Rerank → Filter → Return
```

**Steps:**
1. **Embed query** (same model as storage)
2. **Vector search** (cosine similarity, top 20 candidates)
3. **Rerank** by:
   - Semantic relevance (primary)
   - Recency (configurable weight)
   - Importance score (user-set or auto)
   - User-specific patterns
4. **Filter**:
   - Remove soft-deleted
   - Apply metadata filters
   - Deduplicate similar results
5. **Return** top N with metadata

**Optimization:**
- ANN (Approximate Nearest Neighbors) for speed
- HNSW index for <100ms searches
- IVF index for larger datasets

### Deduplication Layer

**Strategies:**

**1. Exact Match (hash-based)**
```python
def add_memory(content):
    content_hash = hash(content.strip().lower())
    existing = db.get_by_hash(content_hash)
    if existing:
        return existing  # Don't add duplicate
    # Add new memory
```

**2. Semantic Similarity (embedding-based)**
```python
def add_memory(content, user_id):
    embedding = embed(content)
    similar = vector_search(embedding, threshold=0.95, limit=1)
    
    if similar:
        # Update existing instead of creating new
        update_memory(similar[0].id, content, importance=+0.1)
    else:
        # Create new
        create_memory(content, embedding, user_id)
```

**3. Consolidation (LLM-based)**
```python
def consolidate_memories(user_id):
    """Periodic task to merge similar memories"""
    memories = get_user_memories(user_id)
    clusters = cluster_by_similarity(memories, threshold=0.85)
    
    for cluster in clusters:
        if len(cluster) > 1:
            # Ask LLM to consolidate
            consolidated = llm.consolidate(cluster)
            # Keep newest ID, update content
            update_memory(cluster[0].id, consolidated)
            # Mark others as superseded
            for m in cluster[1:]:
                soft_delete(m.id, reason="consolidated")
```

## Testing Requirements

### Unit Tests

**Core Operations:**
- ✅ Add memory (sync + async)
- ✅ Search memory (semantic)
- ✅ List memories (pagination)
- ✅ Get memory by ID
- ✅ Delete memory (soft delete)
- ✅ Delete all (user)

**Edge Cases:**
- ✅ Empty content
- ✅ Very long content (>10k chars)
- ✅ Special characters, unicode
- ✅ Null/undefined values
- ✅ Invalid user IDs

### Integration Tests

**Semantic Accuracy:**
- ✅ Find exact matches
- ✅ Find semantic matches
- ✅ Rank by relevance
- ✅ Handle temporal context
- ✅ Multi-entity queries

**Deduplication:**
- ✅ Prevent exact duplicates
- ✅ Consolidate similar memories
- ✅ Update vs create new
- ✅ Conflict resolution

**Performance:**
- ✅ Search latency <200ms
- ✅ Bulk add performance
- ✅ List pagination speed
- ✅ Concurrent access

**Reliability:**
- ✅ Persistence after add
- ✅ Retrieve old memories
- ✅ Delete verification
- ✅ Concurrent safety

**Context:**
- ✅ Conversation memory extraction
- ✅ Multiple facts from one message
- ✅ Metadata handling

**Token Efficiency:**
- ✅ Relevant memories only
- ✅ Limit enforcement
- ✅ Context compression

### Load Tests

**Scenarios:**
- 1,000 memories per user
- 10,000 memories per user
- 100,000 memories total
- 100 concurrent users
- 1,000 searches/second

**Metrics:**
- p50, p95, p99 latency
- Throughput (ops/sec)
- Error rate
- Memory usage
- Database connections

### Chaos Tests

**Failure Scenarios:**
- Database connection lost
- Embedding API timeout
- Partial write (transaction rollback)
- Concurrent conflicting writes
- Out of memory
- Full disk

**Recovery Tests:**
- Automatic retry
- Graceful degradation
- Data integrity after crash
- Backup restoration

## Monitoring Requirements

### Metrics

**Performance:**
- `memory.search.latency` (histogram)
- `memory.add.latency` (histogram)
- `memory.list.latency` (histogram)
- `memory.ops.throughput` (counter)

**Quality:**
- `memory.search.results_count` (histogram)
- `memory.search.relevance_score` (histogram)
- `memory.duplicates.prevented` (counter)
- `memory.consolidations.performed` (counter)

**Reliability:**
- `memory.errors.rate` (counter)
- `memory.retries.count` (counter)
- `memory.backups.success` (gauge)
- `memory.storage.size_bytes` (gauge)

### Alerts

**Critical:**
- Error rate >1%
- Search latency p95 >1s
- Database connection failures
- Backup failed

**Warning:**
- Search latency p95 >500ms
- Storage >80% capacity
- Duplicate rate >5%

### Dashboards

**Real-time:**
- Operations/second
- Latency percentiles (p50, p95, p99)
- Error rate
- Active connections

**Historical:**
- Total memories over time
- Storage growth
- Search quality trends
- User engagement

## Maintenance Requirements

### Regular Tasks

**Hourly:**
- Backup to S3/R2
- Health checks
- Metric collection

**Daily:**
- Consolidate similar memories (per user)
- Rebuild vector indexes
- Archive old memories (>1 year)

**Weekly:**
- Full database backup
- Performance analysis
- Index optimization
- Dead memory cleanup

**Monthly:**
- Capacity planning
- Cost optimization
- Security audit
- Schema migration planning

### Operational Playbooks

**Memory Not Found:**
1. Check soft delete status
2. Verify user ID correct
3. Check database replication lag
4. Restore from backup if needed

**Slow Searches:**
1. Check index health
2. Analyze query patterns
3. Rebuild indexes if fragmented
4. Scale horizontally if needed

**Data Corruption:**
1. Isolate affected records
2. Restore from point-in-time backup
3. Replay transactions if possible
4. Notify affected users

**Out of Storage:**
1. Archive old memories
2. Compress embeddings
3. Scale storage
4. Review retention policies

## Migration Strategy

### Adding New Fields

**Safe Migration:**
```sql
-- 1. Add column (nullable)
ALTER TABLE memories ADD COLUMN new_field TEXT;

-- 2. Backfill in batches
UPDATE memories SET new_field = compute_value(content)
WHERE new_field IS NULL LIMIT 1000;

-- 3. Make non-nullable after backfill
ALTER TABLE memories ALTER COLUMN new_field SET NOT NULL;
```

### Changing Embedding Model

**Zero-Downtime Process:**
1. Add `embedding_v2` column
2. Dual-write (old + new embeddings)
3. Backfill old memories in background
4. Switch read queries to new column
5. Drop old column after verification

### Schema Versioning

**Track Versions:**
```sql
CREATE TABLE schema_migrations (
  version INT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
);
```

## Security Requirements

### Data Protection

**Encryption:**
- At rest: Database-level encryption
- In transit: TLS 1.3
- Backups: Encrypted before upload

**Access Control:**
- User can only access own memories
- Admin access logged and audited
- API keys rotated regularly

**Privacy:**
- No logging of memory content
- Anonymize in error reports
- GDPR-compliant export/delete

### Compliance

**Data Retention:**
- Keep memories indefinitely by default
- User can request deletion (GDPR)
- Hard delete after 30 days (soft delete period)

**Audit Trail:**
- Log all write operations
- Track who accessed what
- Retention: 1 year

## Success Criteria

### Phase 1: Foundation (Week 1-2)
- ✅ Basic add/search/list/delete
- ✅ Vector embeddings working
- ✅ Unit tests passing
- ✅ <1s search latency

### Phase 2: Quality (Week 3-4)
- ✅ Semantic search accuracy >80%
- ✅ Deduplication implemented
- ✅ Integration tests passing
- ✅ <200ms search latency

### Phase 3: Scale (Week 5-6)
- ✅ Support 10k+ memories per user
- ✅ Concurrent access safe
- ✅ <100ms search latency
- ✅ Load tests passing

### Phase 4: Production (Week 7-8)
- ✅ Monitoring dashboards
- ✅ Alerting configured
- ✅ Backup/restore tested
- ✅ Chaos tests passing
- ✅ Documentation complete

## References

- [mem0 Research Paper](https://mem0.ai/research) - +26% accuracy, 91% faster
- [pgvector Documentation](https://github.com/pgvector/pgvector) - PostgreSQL vector extension
- [HNSW Algorithm](https://arxiv.org/abs/1603.09320) - Approximate nearest neighbors
- [Text Embeddings](https://platform.openai.com/docs/guides/embeddings) - OpenAI embeddings guide

## Related

- [RFC-002: Agent Authentication Strategy](rfc/RFC-002-agent-authentication-strategy.md)
- [ADR-001: Authentication & Wallet Strategy](adr/ADR-001-authentication-and-wallet-strategy.md)
