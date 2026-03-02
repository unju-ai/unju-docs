# RFC-027: Self-Hosted LiveKit Infrastructure

**Status:** Draft  
**Author:** Green Tara  
**Created:** 2026-03-01  
**Priority:** HIGH (blocks Kumiko full deployment)

---

## Problem Statement

**Current:** unju agents rely on LiveKit Cloud for voice/video infrastructure
- External dependency (livekit.cloud)
- Potential cost scaling issues
- Less control over infrastructure
- Privacy/security concerns at scale

**Proposed:** Self-hosted LiveKit server
- Full infrastructure control
- Cost optimization at scale
- Enhanced privacy/security
- Platform independence

---

## Architecture

### Current (LiveKit Cloud)

```
User Device
    ↓
livekit.cloud (SaaS)
    ↓
unju-agent (Python)
    ↓
unju-api (memory, credits)
```

### Proposed (Self-Hosted)

```
User Device
    ↓
LiveKit Server (self-hosted)
    ├─ Media routing
    ├─ WebRTC handling
    └─ Agent connections
        ↓
    unju-agent (Python)
        ↓
    unju-api (memory, credits)
```

---

## Infrastructure Requirements

### 1. LiveKit Server

**Deployment options:**
- **Docker** (recommended for dev/staging)
- **Kubernetes** (production, scalable)
- **Bare metal** (maximum performance)

**Minimum specs (production):**
- CPU: 4+ cores
- RAM: 8GB+
- Network: 1Gbps+
- Ports: 7880 (WebSocket), 7881 (WebRTC), 7882 (TURN)

**Configuration:**
```yaml
# livekit.yaml
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
redis:
  address: redis:6379
keys:
  api_key: <generated>
  api_secret: <generated>
```

### 2. Redis

**Purpose:** Session state, agent coordination
**Specs:** 2GB RAM minimum

### 3. TURN Server

**Purpose:** NAT traversal for WebRTC
**Implementation:** coturn or LiveKit built-in

---

## Deployment Plan

### Phase 1: Development Environment (Week 1)

**Goal:** Prove self-hosted LiveKit works

**Tasks:**
1. Docker Compose stack:
   - LiveKit server
   - Redis
   - TURN server
2. Deploy on unju-vm
3. Test basic voice connection
4. Verify agent connectivity

**Files:**
```
unju-infrastructure/
├─ docker-compose.yml
├─ livekit/
│  ├─ livekit.yaml
│  └─ Dockerfile
├─ redis/
│  └─ redis.conf
└─ README.md
```

### Phase 2: Kumiko Integration (Week 2)

**Goal:** Full agent deployment

**Tasks:**
1. Update Kumiko agent.py for self-hosted URL
2. Configure API keys
3. Deploy to unju-vm
4. Test Telegram → LiveKit → Agent flow
5. Monitor performance

**Environment:**
```bash
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
OPENAI_API_KEY=<key>
UNJU_API_KEY=<key>
```

### Phase 3: Production Hardening (Week 3-4)

**Goal:** Production-ready infrastructure

**Tasks:**
1. SSL/TLS certificates (Let's Encrypt)
2. Load balancing (if needed)
3. Monitoring (Prometheus + Grafana)
4. Backup/disaster recovery
5. Auto-scaling policies
6. Security hardening

**Production URL:**
```
wss://livekit.unju.ai
```

### Phase 4: Migration (Week 5)

**Goal:** Move all agents to self-hosted

**Tasks:**
1. Migrate existing agents
2. Update frontend (unju React app)
3. DNS cutover
4. Decommission LiveKit Cloud
5. Cost analysis

---

## Technical Specifications

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.9'

services:
  livekit:
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"
      - "7881:7881/udp"
      - "50000-60000:50000-60000/udp"
    volumes:
      - ./livekit.yaml:/livekit.yaml
    command: --config /livekit.yaml
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  coturn:
    image: coturn/coturn:latest
    ports:
      - "3478:3478/udp"
      - "3478:3478/tcp"
    environment:
      - DETECT_EXTERNAL_IP=yes
    command: |
      -n --log-file=stdout
      --min-port=49152 --max-port=65535
      --realm=unju.ai
      --user=unju:<password>

volumes:
  redis-data:
```

### LiveKit Configuration

```yaml
# livekit.yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  tcp_port: 7881

redis:
  address: redis:6379

keys:
  devkey: secret  # CHANGE IN PRODUCTION
  # Generate via: livekit-server generate-keys

room:
  auto_create: true
  empty_timeout: 300
  max_participants: 50

logging:
  level: info
  
webhook:
  api_key: <webhook-key>
  urls:
    - https://api.unju.ai/webhooks/livekit
```

### Agent Connection (Python)

```python
# agents/kumiko/agent.py
import os
from livekit import rtc, agents

LIVEKIT_URL = os.getenv('LIVEKIT_URL', 'ws://localhost:7880')
LIVEKIT_API_KEY = os.getenv('LIVEKIT_API_KEY')
LIVEKIT_API_SECRET = os.getenv('LIVEKIT_API_SECRET')

class KumikoAgent(agents.VoiceAssistant):
    def __init__(self):
        super().__init__(
            url=LIVEKIT_URL,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
            # ... agent config
        )
```

---

## Cost Analysis

### LiveKit Cloud (Current)

**Pricing:** ~$0.004/min/participant
- 1000 hours/month = $240/month
- Scales linearly

### Self-Hosted (Proposed)

**Fixed costs:**
- VPS (8GB, 4 cores): $40-80/month
- Bandwidth: ~$10/TB (varies)
- Ops time: ~10 hours/month

**Break-even:** ~100-200 hours/month

**At scale (10,000 hours/month):**
- Cloud: $2,400/month
- Self-hosted: ~$200/month (VPS + bandwidth)
- **Savings: ~90%**

---

## Security Considerations

1. **API Key Rotation**
   - Generate unique keys per environment
   - Rotate every 90 days

2. **Network Security**
   - Firewall rules (only required ports)
   - VPN for admin access
   - DDoS protection (Cloudflare)

3. **TLS/SSL**
   - Let's Encrypt for production
   - Auto-renewal via certbot

4. **Monitoring**
   - Failed auth attempts
   - Bandwidth anomalies
   - CPU/memory spikes

---

## Monitoring & Observability

### Metrics (Prometheus)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'livekit'
    static_configs:
      - targets: ['livekit:6789']  # LiveKit metrics endpoint
```

**Key metrics:**
- Active rooms
- Participant count
- Bandwidth usage
- CPU/memory utilization
- Error rates

### Alerts

```yaml
# alerts.yml
- alert: LiveKitDown
  expr: up{job="livekit"} == 0
  for: 1m
  annotations:
    summary: "LiveKit server is down"

- alert: HighCPU
  expr: livekit_cpu_usage > 80
  for: 5m
  annotations:
    summary: "LiveKit CPU usage > 80%"
```

---

## Rollback Plan

If self-hosted fails:

1. **Immediate:** Revert DNS to LiveKit Cloud
2. **Update:** Change `LIVEKIT_URL` in all agents
3. **Verify:** Test agent connectivity
4. **Postmortem:** Document failure, fix issues
5. **Retry:** After fixes validated in staging

**Downtime:** <5 minutes (DNS propagation)

---

## Success Metrics

**Phase 1 (Dev):**
- ✅ LiveKit server running
- ✅ Agent connects successfully
- ✅ Voice call works end-to-end

**Phase 2 (Kumiko):**
- ✅ Telegram → LiveKit → Agent flow
- ✅ <200ms latency
- ✅ No dropped connections (99.9% uptime)

**Phase 3 (Production):**
- ✅ 99.99% uptime
- ✅ <100ms p95 latency
- ✅ 90% cost reduction vs Cloud
- ✅ Zero security incidents

---

## Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Dev Setup | Week 1 | Docker stack running |
| Phase 2: Kumiko | Week 2 | Full agent deployed |
| Phase 3: Hardening | Week 3-4 | Production-ready |
| Phase 4: Migration | Week 5 | All agents moved |

**Total:** 5 weeks to full production

**Quick win:** Kumiko running on self-hosted in 2 weeks

---

## Next Steps

1. **Immediate:**
   - Create `unju-infrastructure` repo
   - Write docker-compose.yml
   - Generate LiveKit API keys

2. **This Week:**
   - Deploy dev stack on unju-vm
   - Test basic connectivity
   - Update Kumiko for self-hosted URL

3. **Next Week:**
   - Full Kumiko deployment
   - Performance testing
   - Security audit

---

## References

- [LiveKit Self-Hosting Guide](https://docs.livekit.io/home/self-hosting/deployment/)
- [Docker Deployment](https://docs.livekit.io/home/self-hosting/docker/)
- [Production Checklist](https://docs.livekit.io/home/self-hosting/production/)
- [Monitoring Guide](https://docs.livekit.io/home/self-hosting/monitoring/)

---

**This moves unju from "using LiveKit" to "owning the infrastructure."**

Platform independence achieved. 🪷
