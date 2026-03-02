# Issue #027: Self-Hosted LiveKit Implementation

**Created:** 2026-03-01  
**Priority:** HIGH  
**Blocks:** Kumiko full deployment, platform independence  
**RFC:** RFC-027  
**Owner:** Green Tara

---

## Decision

**Architectural shift:** Move from LiveKit Cloud to self-hosted LiveKit infrastructure

**Rationale:**
1. **Cost:** 90% savings at scale (Cloud: $2,400/mo → Self-hosted: $200/mo @ 10k hours)
2. **Control:** Full infrastructure ownership
3. **Privacy:** No external dependency for voice data
4. **Platform independence:** Own the stack

**Approval:** esper (2026-03-01)

---

## Implementation Plan

### Phase 1: Infrastructure Setup (3 days)

**Goal:** LiveKit server running on unju-vm

**Tasks:**

1. **Create infrastructure repo structure**
```bash
mkdir -p /home/unju/infrastructure/livekit
cd /home/unju/infrastructure
```

2. **Docker Compose stack**
```yaml
# docker-compose.yml
version: '3.9'

services:
  livekit:
    image: livekit/livekit-server:latest
    container_name: livekit
    ports:
      - "7880:7880"      # WebSocket
      - "7881:7881/tcp"  # RTC/TCP
      - "7881:7881/udp"  # RTC/UDP
      - "50000-60000:50000-60000/udp"  # Media
    volumes:
      - ./livekit.yaml:/livekit.yaml:ro
      - livekit-data:/data
    command: --config /livekit.yaml
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: livekit-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

  coturn:
    image: coturn/coturn:latest
    container_name: livekit-turn
    network_mode: host
    environment:
      - DETECT_EXTERNAL_IP=yes
    command: |
      -n --log-file=stdout
      --listening-port=3478
      --min-port=49152
      --max-port=65535
      --realm=unju.ai
      --user=unju:${TURN_PASSWORD}
    restart: unless-stopped

volumes:
  livekit-data:
  redis-data:
```

3. **LiveKit configuration**
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
  turn_servers:
    - host: localhost
      port: 3478
      protocol: udp
      username: unju
      credential: ${TURN_PASSWORD}

redis:
  address: redis:6379

keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}

room:
  auto_create: true
  empty_timeout: 300
  max_participants: 50
  max_metadata_size: 2048

logging:
  level: info
  sample: false

webhook:
  api_key: ${WEBHOOK_KEY}
  urls:
    - https://api.unju.ai/webhooks/livekit
```

4. **Generate secrets**
```bash
# Generate LiveKit keys
docker run --rm livekit/livekit-server generate-keys

# Generate TURN password
openssl rand -hex 16

# Create .env file
cat > .env << EOF
LIVEKIT_API_KEY=APIxxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxx
TURN_PASSWORD=$(openssl rand -hex 16)
WEBHOOK_KEY=$(openssl rand -hex 32)
EOF
```

5. **Deploy**
```bash
cd /home/unju/infrastructure
docker-compose up -d
docker-compose logs -f livekit
```

6. **Verify**
```bash
# Check server status
curl http://localhost:7880/

# Test WebSocket
wscat -c ws://localhost:7880
```

**Deliverables:**
- ✅ LiveKit server running
- ✅ Redis connected
- ✅ TURN server operational
- ✅ Secrets generated and stored
- ✅ Health checks passing

---

### Phase 2: Kumiko Integration (2 days)

**Goal:** Full Kumiko agent on self-hosted LiveKit

**Tasks:**

1. **Update Kumiko agent.py**
```python
# agents/kumiko/agent.py
import os
from livekit import rtc, agents
from livekit.agents import JobContext, WorkerOptions, cli

# Self-hosted LiveKit
LIVEKIT_URL = os.getenv('LIVEKIT_URL', 'ws://localhost:7880')
LIVEKIT_API_KEY = os.getenv('LIVEKIT_API_KEY')
LIVEKIT_API_SECRET = os.getenv('LIVEKIT_API_SECRET')

# LLM
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# Memory
UNJU_API_KEY = os.getenv('UNJU_API_KEY')
UNJU_BASE_URL = 'https://api.unju.ai'

async def entrypoint(ctx: JobContext):
    """Kumiko voice agent entrypoint"""
    
    # Connect to room
    await ctx.connect()
    
    # Initialize LLM
    llm = agents.llm.LLM(
        model="gpt-4o-mini",
        api_key=OPENAI_API_KEY
    )
    
    # System prompt
    system_prompt = """You are Kumiko, an AI research assistant.
    
You help users discover and understand AI/ML research papers.
You're knowledgeable, friendly, and passionate about research.

When asked about papers:
1. Search arXiv
2. Summarize key findings
3. Explain implications
4. Suggest related work

Be conversational and engaging!"""
    
    # Voice assistant
    assistant = agents.VoiceAssistant(
        llm=llm,
        system_prompt=system_prompt,
        # ... tools, memory integration
    )
    
    await assistant.start(ctx.room)

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            url=LIVEKIT_URL,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
        )
    )
```

2. **Environment setup**
```bash
# /home/unju/agents/kumiko/.env
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=APIxxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxx
UNJU_API_KEY=unju_xxxxxxxxx
KUMIKO_BOT_TOKEN=8636632225:AAGLBY8GCXOHYr6QzRuCwMOha77A7ZxQzQo
```

3. **Systemd service**
```ini
# /etc/systemd/system/kumiko-agent.service
[Unit]
Description=Kumiko LiveKit Agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=unju
WorkingDirectory=/home/unju/agents/kumiko
EnvironmentFile=/home/unju/agents/kumiko/.env
ExecStart=/usr/bin/python3 agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

4. **Deploy agent**
```bash
# Copy to unju-vm
scp -r agents/kumiko unju@unju-vm:/home/unju/agents/

# SSH to unju-vm
ssh unju@unju-vm

# Install dependencies
cd /home/unju/agents/kumiko
pip3 install -r requirements.txt

# Enable service
sudo systemctl enable kumiko-agent
sudo systemctl start kumiko-agent
sudo systemctl status kumiko-agent

# Watch logs
journalctl -u kumiko-agent -f
```

5. **Test connection**
```bash
# From unju frontend, create room with Kumiko
# Or via API:
curl -X POST https://api.unju.ai/v1/rooms/create \
  -H "Authorization: Bearer $UNJU_API_KEY" \
  -d '{
    "name": "kumiko-test",
    "agent": "kumiko"
  }'
```

**Deliverables:**
- ✅ Agent connects to self-hosted LiveKit
- ✅ Voice conversation works end-to-end
- ✅ LLM integration functional
- ✅ Memory writes to unju-api
- ✅ Telegram integration (via webhook)
- ✅ Auto-restart on crash

---

### Phase 3: Production Hardening (1 week)

**Goal:** Production-ready infrastructure

**Tasks:**

1. **SSL/TLS (Let's Encrypt)**
```bash
# Install certbot
sudo apt install certbot

# Generate cert
sudo certbot certonly --standalone \
  -d livekit.unju.ai

# Configure nginx reverse proxy
cat > /etc/nginx/sites-available/livekit << EOF
server {
    listen 443 ssl http2;
    server_name livekit.unju.ai;

    ssl_certificate /etc/letsencrypt/live/livekit.unju.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/livekit.unju.ai/privkey.pem;

    location / {
        proxy_pass http://localhost:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

sudo nginx -t && sudo nginx -s reload
```

2. **Monitoring (Prometheus + Grafana)**
```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

3. **Alerts**
```yaml
# prometheus.yml
rule_files:
  - /etc/prometheus/alerts.yml

scrape_configs:
  - job_name: 'livekit'
    static_configs:
      - targets: ['livekit:6789']

  - job_name: 'node_exporter'
    static_configs:
      - targets: ['localhost:9100']
```

```yaml
# alerts.yml
groups:
  - name: livekit_alerts
    rules:
      - alert: LiveKitDown
        expr: up{job="livekit"} == 0
        for: 1m
        annotations:
          summary: "LiveKit server is down"
      
      - alert: HighCPU
        expr: rate(process_cpu_seconds_total{job="livekit"}[5m]) > 0.8
        for: 5m
        annotations:
          summary: "LiveKit CPU usage > 80%"
      
      - alert: HighMemory
        expr: process_resident_memory_bytes{job="livekit"} > 6e9
        for: 5m
        annotations:
          summary: "LiveKit memory > 6GB"
```

4. **Firewall**
```bash
# UFW rules
sudo ufw allow 7880/tcp   # LiveKit WebSocket
sudo ufw allow 7881/tcp   # RTC/TCP
sudo ufw allow 7881/udp   # RTC/UDP
sudo ufw allow 50000:60000/udp  # Media
sudo ufw allow 3478/udp   # TURN
sudo ufw enable
```

5. **Backup**
```bash
# Backup script
cat > /home/unju/backup-livekit.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/backup/livekit/$(date +%Y-%m-%d)
mkdir -p $BACKUP_DIR

# Backup configs
cp /home/unju/infrastructure/livekit.yaml $BACKUP_DIR/
cp /home/unju/infrastructure/.env $BACKUP_DIR/

# Backup Redis
docker exec livekit-redis redis-cli SAVE
docker cp livekit-redis:/data/dump.rdb $BACKUP_DIR/

# Compress
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

# Rotate (keep 7 days)
find /backup/livekit -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /home/unju/backup-livekit.sh

# Cron (daily at 3 AM)
echo "0 3 * * * /home/unju/backup-livekit.sh" | crontab -
```

**Deliverables:**
- ✅ HTTPS/WSS enabled
- ✅ Monitoring dashboards
- ✅ Alerting configured
- ✅ Firewall hardened
- ✅ Daily backups
- ✅ 99.9% uptime proven

---

## Success Criteria

**Phase 1 (Infrastructure):**
- [ ] LiveKit server responds on port 7880
- [ ] Redis connected and operational
- [ ] TURN server functional
- [ ] WebSocket accepts connections

**Phase 2 (Kumiko):**
- [ ] Agent connects to LiveKit
- [ ] Voice conversation works
- [ ] LLM responds intelligently
- [ ] Memory writes persist
- [ ] <200ms voice latency
- [ ] Zero crashes in 24h test

**Phase 3 (Production):**
- [ ] HTTPS enabled (A+ SSL Labs)
- [ ] Monitoring live
- [ ] Alerts tested (simulate outage)
- [ ] Backups restore successfully
- [ ] 99.9% uptime over 1 week
- [ ] <100ms p95 latency

---

## Rollback Plan

If critical failure:

1. **Revert DNS:**
```bash
# Change LIVEKIT_URL back to Cloud
export LIVEKIT_URL=wss://unju.livekit.cloud
```

2. **Restart agents:**
```bash
sudo systemctl restart kumiko-agent
```

3. **Verify:**
```bash
# Check connection
journalctl -u kumiko-agent -n 50
```

**Downtime:** <5 minutes

---

## Timeline

| Task | Duration | Owner |
|------|----------|-------|
| Phase 1: Setup | 3 days | Green Tara |
| Phase 2: Kumiko | 2 days | Green Tara |
| Phase 3: Hardening | 5 days | Green Tara |
| **Total** | **10 days** | |

**Start:** 2026-03-02  
**Target completion:** 2026-03-12

---

## Next Actions

**Today (2026-03-01):**
- [x] Create RFC-027
- [x] Document implementation plan
- [ ] Commit to unju-docs
- [ ] Create GitHub issue

**Tomorrow (2026-03-02):**
- [ ] Set up infrastructure directory on unju-vm
- [ ] Write docker-compose.yml
- [ ] Generate API keys
- [ ] Deploy LiveKit server
- [ ] Verify health

**This Week:**
- [ ] Complete Phase 1
- [ ] Complete Phase 2
- [ ] Kumiko live on self-hosted

---

**This is infrastructure independence. We own the platform.** 🪷
