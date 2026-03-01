# RFC-026: Kumiko - AI Research Agent

**Status:** Draft → Implementation Started  
**Author:** Green Tara (AI Agent, Token ID 5)  
**Date:** 2026-03-01  
**Priority:** High (First production unju agent)

---

## Summary

Kumiko is unju's first production AI research agent. She monitors arXiv, Papers with Code, and other sources for the latest AI/ML papers, stores them in unju memory with semantic embeddings, builds a knowledge graph of papers/authors/techniques, and provides conversational access via text and voice.

**Current Status:** Phase 1 (Telegram integration) ✅ Live  
**Next:** Phase 2 (Full unju-api integration)

---

## Vision

**Mission:** Make AI research accessible and discoverable through natural conversation.

**User Story:**
> "I'm working on image generation. I ask Kumiko 'What's new in diffusion models?' She not only shows me the latest papers but explains key innovations, connects them to prior work, and suggests follow-up reading based on my interests."

---

## Architecture

### Current (Phase 1) - Telegram Lite ✅

```
User (Telegram) → Green Tara → kumiko-handler.py → arXiv API
                      ↑                                  ↓
                      └──────── Response ←───────────────┘
```

**Limitations:**
- No persistent storage (1-hour cache)
- No LLM summaries
- Basic keyword search
- No knowledge graph

### Target (Phase 2+) - Full unju Integration

```
┌─────────────────────────────────────────────────────────┐
│                    KUMIKO AGENT                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Data Sources                                           │
│  ├─ arXiv API (cs.AI, cs.LG, cs.CV, cs.CL)            │
│  ├─ Papers with Code (implementations)                 │
│  └─ Hugging Face Papers (curated)                      │
│                      ↓                                   │
│  Processing Pipeline                                     │
│  ├─ Fetch & Parse                                       │
│  ├─ LLM Summarization (GPT-4o-mini)                    │
│  │   - Key contributions                                │
│  │   - Methods used                                     │
│  │   - Results/benchmarks                               │
│  ├─ Entity Extraction                                   │
│  │   - Authors                                          │
│  │   - Techniques (transformers, diffusion, etc.)      │
│  │   - Datasets (ImageNet, COCO, etc.)                 │
│  │   - Benchmarks (GLUE, SuperGLUE, etc.)              │
│  └─ Embedding Generation (sentence-transformers)       │
│                      ↓                                   │
│  Storage (unju-api)                                     │
│  ├─ Memories: Papers as episodic → semantic            │
│  ├─ Graph: Citations, authors, techniques              │
│  └─ Beliefs: Research trends ("Diffusion > GANs")      │
│                      ↓                                   │
│  Query Interface                                        │
│  ├─ Text: Telegram, Web UI                             │
│  ├─ Voice: LiveKit realtime                            │
│  └─ API: /v1/agents/kumiko/chat                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### ✅ Phase 1: Telegram Integration (DONE)

**Delivered:**
- Lightweight Kumiko (no deps, stdlib only)
- arXiv paper fetching (XML parsing)
- Basic search (keyword matching)
- Telegram access via Green Tara relay

**Files:**
- `kumiko_telegram_integration.py`
- `kumiko-handler.py`
- `KUMIKO-TELEGRAM.md`

**Status:** Live and working ✅

---

### 🚧 Phase 2: Full unju-api Integration (IN PROGRESS)

**Goals:**
1. Store papers in unju memory (persistent)
2. LLM summarization (key contributions, methods, results)
3. Semantic embeddings for better search
4. Papers with Code integration (find implementations)

**Tasks:**

#### 2.1 Memory Storage
```python
# Store each paper in unju memory
await memory.create(
    content=f"Title: {paper.title}\n\nAuthors: {authors}\n\n{summary}",
    metadata={
        'type': 'paper',
        'arxiv_id': paper.arxiv_id,
        'title': paper.title,
        'authors': paper.authors,
        'categories': paper.categories,
        'published': paper.published,
        'url': paper.url,
        'keywords': keywords
    },
    embedding=embedding,
    agent_id='kumiko'
)
```

#### 2.2 LLM Summarization
```python
# Extract key contributions via GPT-4o-mini
summary = await summarize_paper(paper)
# Returns: {contributions: [...], methods: "...", results: "..."}
```

#### 2.3 Semantic Search
```python
# Generate embeddings for title + abstract
embedding = embedder.encode(f"{title}. {abstract}")

# Search with semantic similarity
results = await memory.search(
    query="diffusion models for image generation",
    filters={'type': 'paper'},
    limit=10
)
```

#### 2.4 Papers with Code Integration
```python
# Fetch code repository for paper
code_url = await pwc_client.get_paper_code(arxiv_id)
# Store in metadata
```

**Timeline:** Sprint 1 (this week)

---

### 📋 Phase 3: Knowledge Graph (NEXT)

**Goals:**
1. Build citation graph (papers that cite X)
2. Extract entities (authors, techniques, datasets)
3. Link similar papers via embeddings
4. Track research trends

**Schema:**

```sql
-- Graph nodes
CREATE TABLE paper_entities (
  paper_id UUID REFERENCES memories(id),
  entity_type TEXT, -- 'author' | 'technique' | 'dataset' | 'benchmark'
  entity_name TEXT,
  metadata JSONB
);

-- Graph edges
CREATE TABLE paper_relationships (
  source_paper_id UUID,
  target_paper_id UUID,
  relationship_type TEXT, -- 'cites' | 'similar_to' | 'builds_on'
  strength REAL,
  metadata JSONB
);
```

**Queries enabled:**
- "Papers that cite Attention is All You Need"
- "Authors who work on diffusion models"
- "Papers similar to CLIP"
- "What datasets are used for vision-language models?"

**Timeline:** Sprint 2 (week 2)

---

### 🎯 Phase 4: Production Deployment

**Goals:**
1. Cron jobs for auto-updates
2. Public API endpoint
3. LiveKit voice interface
4. Monitoring & analytics

**Cron Schedule:**
```python
# Every 6 hours: Fetch new papers
@cron("0 */6 * * *")
async def fetch_arxiv_papers()

# Daily: Fetch Papers with Code
@cron("0 3 * * *")
async def fetch_paperswithcode()

# Weekly: Detect trends
@cron("0 4 * * 0")
async def detect_trends()
```

**API Endpoint:**
```typescript
POST /v1/agents/kumiko/chat
{
  "message": "What's new in transformers?",
  "user_id": "...",
  "include_sources": true
}

Response:
{
  "response": "I found 5 recent papers on transformers...",
  "sources": [
    {"title": "...", "url": "...", "published": "..."}
  ]
}
```

**Timeline:** Sprint 3 (week 3)

---

## Technical Specifications

### Memory Schema

```python
{
  "content": """
Title: Attention is All You Need

Authors: Vaswani, Shazeer, Parmar, et al.

Abstract: The dominant sequence transduction models...

Key Contributions:
- Introduced transformer architecture
- Multi-head self-attention mechanism
- Positional encoding for sequence modeling

Methods: Encoder-decoder architecture with stacked self-attention
and feed-forward layers. Multi-head attention allows model to
attend to different positions.

Results: State-of-the-art on WMT 2014 English-to-German
translation (28.4 BLEU). Faster training than RNNs.

Categories: cs.CL, cs.LG
Published: 2017-06-12
arXiv: https://arxiv.org/abs/1706.03762
Code: https://github.com/tensorflow/tensor2tensor
  """,
  
  "metadata": {
    "type": "paper",
    "arxiv_id": "1706.03762",
    "title": "Attention is All You Need",
    "authors": ["Ashish Vaswani", "Noam Shazeer", ...],
    "categories": ["cs.CL", "cs.LG"],
    "published": "2017-06-12",
    "url": "https://arxiv.org/abs/1706.03762",
    "code_url": "https://github.com/tensorflow/tensor2tensor",
    "citations": 50000,
    "keywords": ["transformer", "attention", "seq2seq", "NLP"],
    "importance": 1.0  // Highly influential
  },
  
  "embedding": [0.123, -0.456, ...],  // 384-dim
  "agent_id": "kumiko",
  "state": "episodic"  // Will consolidate to semantic
}
```

### LLM Summarization Prompt

```
Analyze this AI/ML research paper and extract:

1. Key Contributions (2-4 bullet points)
   - What novel ideas/techniques does this introduce?
   
2. Methods
   - How does it work? (architecture, algorithm)
   
3. Results
   - Main findings, benchmarks, comparisons

Paper:
Title: {title}
Authors: {authors}
Abstract: {abstract}

Reply in JSON:
{
  "contributions": ["...", "..."],
  "methods": "...",
  "results": "..."
}
```

---

## Example Interactions

### Simple Query

**User:** "What's new in AI this week?"

**Kumiko:**
```
📚 I found 12 new papers this week! Here are the highlights:

1. **MediX-R1: Medical Reinforcement Learning**
   - Authors: Mullappilly et al.
   - Key contribution: Open-ended RL for medical LLMs
   - Published: 2026-02-26
   - [Read on arXiv](...)

2. **VGG-T³: 3D Reconstruction at Scale**
   - Offline feed-forward approach
   - 10x faster than previous methods
   - [Read on arXiv](...)

Want me to dive deeper into any of these?
```

---

### Deep Dive

**User:** "Tell me more about MediX-R1"

**Kumiko:**
```
**MediX-R1: Open Ended Medical Reinforcement Learning**

🔍 Key Contributions:
- Introduces RL framework for medical multimodal LLMs
- Enables clinical decision support with open-ended learning
- Demonstrates improved diagnostic accuracy

📊 Methods:
Uses a reward model trained on expert feedback to guide
the LLM's medical reasoning. The model learns to ask
clarifying questions and suggest differential diagnoses.

🎯 Results:
- 15% improvement on medical QA benchmarks
- Better explainability vs. supervised fine-tuning
- Validated on real clinical cases

🔗 Related work:
This builds on prior work in RLHF for LLMs. Similar to
Med-PaLM but with continuous learning capability.

📄 [Read full paper](...)
💻 [Code not yet available]
```

---

### Search Query

**User:** "Papers about diffusion models from 2023"

**Kumiko:**
```
🔍 Found 24 papers on diffusion models from 2023:

**Top 5 by impact:**

1. **Consistency Models** (OpenAI)
   - One-step generation with diffusion quality
   - 50x faster sampling
   - Cited by 243 papers

2. **SDXL: Stable Diffusion XL** (Stability AI)
   - 2.3B parameter text-to-image model
   - State-of-the-art photorealism

3. **DiffEdit: Semantic Image Editing**
   - Zero-shot editing via diffusion
   - No fine-tuning required

4. **ControlNet: Adding Conditions to Diffusion**
   - Spatial control (edges, depth, pose)
   - 800+ citations

5. **Imagen Video: High-Definition Video Generation**
   - Text-to-video with diffusion
   - 5.7s clips at 1280x768

Show more? Or dive into a specific paper?
```

---

### Trend Analysis

**User:** "What's trending in AI right now?"

**Kumiko:**
```
📈 Top Trends (Last 30 Days):

1. **Multimodal LLMs** 🔥
   - 47 papers this month (+60% vs last month)
   - Hot: GPT-4V, LLaVA, Qwen-VL
   - Focus: vision-language understanding

2. **Efficient Fine-tuning**
   - 32 papers on LoRA variants
   - QLoRA for 4-bit training
   - DoRA: weight decomposition

3. **Diffusion Models**
   - 28 papers (steady interest)
   - New: video generation, 3D synthesis
   - Consistency models gaining traction

4. **AI Safety & Alignment**
   - 19 papers on RLHF improvements
   - DPO (Direct Preference Optimization)
   - Constitutional AI

5. **Long Context**
   - 15 papers on 100K+ token windows
   - Sparse attention mechanisms
   - Retrieval-augmented generation

🎯 Emerging: Mixture-of-Experts (MoE) for scaling
📉 Declining: GANs, vanilla transformers for vision
```

---

## Success Metrics

### Phase 2 (This Week)
- ✅ 100+ papers stored in unju memory
- ✅ LLM summaries for all papers
- ✅ Semantic search working
- ✅ Papers with Code integration

### Phase 3 (Week 2)
- ✅ Citation graph (500+ edges)
- ✅ Entity extraction (authors, techniques)
- ✅ "Papers similar to X" queries working

### Phase 4 (Week 3)
- ✅ Cron jobs running (6h updates)
- ✅ Public API live
- ✅ 10+ users actively querying Kumiko
- ✅ Voice interface (optional)

### Long-term (Month 1-3)
- 📊 5,000+ papers in knowledge base
- 📊 100+ daily active users
- 📊 Avg response time <2s
- 📊 User satisfaction >4.5/5

---

## Dependencies

### Required
- `unju>=0.2.0` - Memory SDK
- `feedparser>=6.0.0` - arXiv RSS
- `requests>=2.31.0` - HTTP client
- `sentence-transformers>=2.0.0` - Embeddings
- `openai>=1.0.0` - LLM summarization

### Optional
- `beautifulsoup4>=4.12.0` - Web scraping
- `livekit>=0.13.0` - Voice interface
- `numpy>=1.24.0` - Numerical ops

---

## Security & Privacy

**Data Handling:**
- Papers are public (arXiv, open access)
- User queries logged for improvement (opt-out available)
- No PII collected

**Rate Limiting:**
- arXiv: 1 request/3 seconds (per their policy)
- unju-api: Standard rate limits apply

**Content Safety:**
- Papers are pre-publication research
- Users advised to verify claims before relying on findings

---

## Future Enhancements

### Research Features
- **Paper recommendations** - "Based on your interests..."
- **Citation alerts** - Notify when tracked papers get cited
- **Author tracking** - Follow specific researchers
- **Reading groups** - Collaborative discussions

### Advanced Queries
- **Cross-paper synthesis** - "How do these 3 papers relate?"
- **Trend forecasting** - "What's likely to be hot in 6 months?"
- **Benchmark tracking** - Live SOTA leaderboards
- **Code execution** - Run paper implementations

### Integrations
- **Notion/Obsidian** - Save papers to notes
- **Zotero** - Export citations
- **Slack/Discord** - Team research channels
- **Email digests** - Weekly research summaries

---

## Open Questions

1. **Citation data source?**
   - Semantic Scholar API?
   - Build from arXiv references?
   - Both?

2. **Storage limits?**
   - How many papers per user?
   - Archive old papers?
   - Tiered storage?

3. **Personalization?**
   - Track user interests?
   - Customized paper feeds?
   - Privacy implications?

4. **Quality filtering?**
   - Filter low-quality papers?
   - Trust community curation?
   - ML-based quality scoring?

---

## References

- [arXiv API](http://export.arxiv.org/api_help/docs/user-manual.html)
- [Papers with Code API](https://paperswithcode.com/api/v1/docs/)
- [Semantic Scholar API](https://api.semanticscholar.org/)
- [unju Memory SDK](../../../unju-python/README.md)

---

## Changelog

- **2026-03-01**: Initial RFC + Phase 1 implementation
- **2026-03-01**: Phase 2 started (full integration)

---

## Approval

- [x] esper - "Make RFC, get issue, make sprint, start going"
- [ ] Product review (post-MVP)
- [ ] Security review (before public launch)

**Status:** ✅ Approved to proceed  
**Next:** Complete Phase 2 sprint
