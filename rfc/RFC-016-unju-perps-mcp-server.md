# RFC-001: unju-perps MCP Server Architecture

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Created:** 2026-02-25  
**Updated:** 2026-02-25 (v2 - MCP Apps)

## Abstract

This RFC proposes the architecture for `unju-perps`, an MCP (Model Context Protocol) server that provides AI agents with tools to trade perpetual futures on Hyperliquid. The server exposes trading operations, portfolio monitoring, and risk management through a standardized MCP interface, with **interactive HTML UIs** delivered via the MCP Apps extension.

## Motivation

### Problem Statement

Current challenges for AI agents trading cryptocurrency perpetuals:

1. **Complex API Integration**: Direct Hyperliquid SDK integration requires agents to handle wallet management, signing, nonce tracking, and error recovery
2. **No Interactive Feedback**: Agents cannot show users interactive charts, real-time position updates, or configuration forms
3. **Limited Safety**: No built-in risk management, position limits, or circuit breakers
4. **Poor Agent UX**: Clunky tool interfaces that require multiple calls for common workflows

### Goals

1. **Agent-First Design**: Simple, intuitive tools optimized for LLM function calling
2. **Interactive Output**: Return rich HTML UIs with live charts, buttons, forms via MCP Apps extension
3. **Safety by Default**: Built-in risk controls, position limits, and validation
4. **LiveKit Native**: Seamless integration with unju-agent via LiveKit's MCP support
5. **Bidirectional Communication**: UIs can call tools back to server for actions

### Non-Goals

1. ~~Static images (base64 PNG)~~ — replaced with interactive HTML
2. ~~REST API~~ (MCP only)
3. ~~Multi-exchange support~~ (Hyperliquid only for v1)
4. ~~Historical data analysis~~ (focus on real-time trading)

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│      LiveKit Agent (unju-agent)             │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  MCP Client (native)                  │ │
│  │  - stdio transport                    │ │
│  │  - tool discovery                     │ │
│  │  - function calls                     │ │
│  │  - iframe rendering (MCP Apps)        │ │
│  └──────────┬────────────────────────────┘ │
└─────────────┼──────────────────────────────┘
              │ stdio (JSON-RPC)
              ▼
┌─────────────────────────────────────────────┐
│      unju-perps MCP Server                  │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  MCP Tools (FastMCP)                  │ │
│  │  - market_order()                     │ │
│  │  - get_position()                     │ │
│  │  - get_dashboard() ← UI view          │ │
│  │  - close_position()                   │ │
│  │  - configure_risk() ← UI view         │ │
│  └──────────┬────────────────────────────┘ │
│             │                               │
│  ┌──────────▼────────────────────────────┐ │
│  │  MCP UI Resources (@mcp.resource)     │ │
│  │  - ui://perps/dashboard               │ │
│  │  - ui://perps/position                │ │
│  │  - ui://perps/risk-config             │ │
│  │  (Embedded HTML + MCP Apps SDK)       │ │
│  └──────────┬────────────────────────────┘ │
│             │                               │
│  ┌──────────▼────────────────────────────┐ │
│  │  Trading Logic                        │ │
│  │  - PerpTrader client                  │ │
│  │  - Risk management                    │ │
│  │  - Position tracking                  │ │
│  └──────────┬────────────────────────────┘ │
└─────────────┼──────────────────────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────────────────────┐
│      Hyperliquid Exchange                   │
└─────────────────────────────────────────────┘
```

### MCP Apps Flow

1. **Tool Declaration**: Tool metadata includes `ui/resourceUri` pointing to UI resource
2. **Tool Execution**: Agent calls tool (e.g., `get_dashboard`)
3. **Data Return**: Server returns structured data in tool result
4. **UI Fetch**: Host fetches UI resource (HTML) via `ui://` URI
5. **Render**: Host renders HTML in sandboxed iframe
6. **Initialize**: UI connects via MCP Apps SDK using postMessage
7. **Tool Result**: Host sends tool result data to UI via notification
8. **Render**: UI renders interactive chart/form/dashboard
9. **Interaction**: User clicks buttons, UI calls other tools back to server

### Project Structure

```
unju-perps/
├── unju_perps/
│   ├── __init__.py
│   ├── server.py           # MCP server (FastMCP + UI resources)
│   ├── client.py           # Hyperliquid trading logic
│   ├── views/              # Embedded HTML UIs
│   │   ├── dashboard.html  # Portfolio overview
│   │   ├── position.html   # Position detail chart
│   │   └── risk.html       # Risk configuration form
│   ├── types.py            # Order, Position, Market, Balance
│   ├── risk.py             # Risk management & limits
│   ├── exceptions.py       # Custom exceptions
│   └── utils.py            # Helpers (formatting, vault, etc.)
├── tests/
│   ├── test_server.py
│   ├── test_client.py
│   └── test_ui.py
├── examples/
│   └── agent_integration.py
├── pyproject.toml
├── README.md
└── RFC-001-MCP-SERVER.md  # This document
```

### MCP Tools Specification

#### 1. `market_order`

Execute a market order with slippage protection.

**Input Schema:**
```json
{
  "symbol": {
    "type": "string",
    "description": "Asset symbol (BTC, ETH, SOL, etc.)"
  },
  "side": {
    "type": "string",
    "enum": ["long", "short"],
    "description": "Order side"
  },
  "size_usd": {
    "type": "number",
    "minimum": 1,
    "description": "Position size in USD"
  },
  "slippage_bps": {
    "type": "integer",
    "default": 50,
    "description": "Max slippage in basis points (50 = 0.5%)"
  },
  "stop_loss_pct": {
    "type": "number",
    "optional": true,
    "description": "Stop loss percentage from entry"
  },
  "take_profit_pct": {
    "type": "number",
    "optional": true,
    "description": "Take profit percentage from entry"
  }
}
```

**Output:**
```json
{
  "order_id": "1234567890",
  "symbol": "BTC",
  "side": "long",
  "size": 0.01,
  "entry_price": 51234.56,
  "fees_usd": 0.51,
  "timestamp": "2026-02-25T12:00:00Z",
  "message": "✅ Long BTC: $100 @ $51,234.56 (0.01 BTC)"
}
```

**UI:** None (simple text response)

#### 2. `get_position`

Get detailed information about a specific position with interactive chart.

**Tool Metadata:**
```json
{
  "_meta": {
    "ui/resourceUri": "ui://perps/position"
  }
}
```

**Input Schema:**
```json
{
  "symbol": {
    "type": "string",
    "description": "Asset symbol"
  }
}
```

**Output (Tool Result):**
```json
{
  "symbol": "BTC",
  "side": "long",
  "size": 0.01,
  "entry_price": 51234.56,
  "mark_price": 51500.00,
  "liquidation_price": 46000.00,
  "leverage": 10.0,
  "unrealized_pnl": 2.65,
  "unrealized_pnl_pct": 5.18,
  "margin": 102.47,
  "price_history": [
    {"time": "12:00", "price": 51234.56},
    {"time": "12:05", "price": 51300.00},
    {"time": "12:10", "price": 51500.00}
  ]
}
```

**UI View (`ui://perps/position`):**
- Interactive price chart (plotly/chartjs)
- Entry price marker
- Current price line
- Liquidation zone (red shaded)
- P&L indicator
- "Close Position" button (calls `close_position` tool)
- "Set Stop Loss" button (calls `set_stop_loss` tool)

#### 3. `get_dashboard`

Generate interactive portfolio dashboard.

**Tool Metadata:**
```json
{
  "_meta": {
    "ui/resourceUri": "ui://perps/dashboard"
  }
}
```

**Input Schema:**
```json
{
  "refresh_interval": {
    "type": "integer",
    "default": 5,
    "description": "Auto-refresh interval in seconds (0 = disabled)"
  }
}
```

**Output (Tool Result):**
```json
{
  "balance": {
    "total": 10234.56,
    "available": 5000.00,
    "margin_used": 5234.56,
    "unrealized_pnl": 234.56
  },
  "positions": [
    {
      "symbol": "BTC",
      "side": "long",
      "size": 0.01,
      "entry_price": 51234.56,
      "mark_price": 51500.00,
      "unrealized_pnl": 2.65,
      "unrealized_pnl_pct": 5.18
    },
    {
      "symbol": "ETH",
      "side": "short",
      "size": 0.5,
      "entry_price": 2345.67,
      "mark_price": 2320.00,
      "unrealized_pnl": 12.84,
      "unrealized_pnl_pct": 1.09
    }
  ],
  "balance_history": [
    {"time": "2026-02-18", "balance": 10000.00},
    {"time": "2026-02-19", "balance": 10050.00},
    {"time": "2026-02-25", "balance": 10234.56}
  ]
}
```

**UI View (`ui://perps/dashboard`):**
- **Header**: Total balance, P&L, available margin
- **Chart 1**: Position P&L bar chart (green/red)
- **Chart 2**: Balance history line chart (7d)
- **Table**: Active positions with entry/current/liq prices
- **Buttons**: "New Order", "Close All", "Risk Settings"
- **Auto-refresh**: Updates every N seconds via repeated tool calls

#### 4. `get_position_chart`

**DEPRECATED** - Merged into `get_position` with UI view.

#### 5. `close_position`

Close an open position at market price.

**Input Schema:**
```json
{
  "symbol": {
    "type": "string",
    "description": "Asset symbol"
  },
  "slippage_bps": {
    "type": "integer",
    "default": 50,
    "description": "Max slippage in basis points"
  }
}
```

**Output:**
```json
{
  "order_id": "9876543210",
  "symbol": "BTC",
  "size": 0.01,
  "exit_price": 51500.00,
  "realized_pnl": 2.65,
  "realized_pnl_pct": 2.59,
  "fees_usd": 0.51,
  "holding_time": "2h 34m",
  "message": "✅ Closed BTC: +$2.65 (+2.59%) | Held 2h 34m"
}
```

**UI:** None (simple text response)

#### 6. `get_balance`

Get account balance and available margin.

**Input Schema:**
```json
{}
```

**Output:**
```json
{
  "total": 10234.56,
  "available": 5000.00,
  "margin_used": 5234.56,
  "unrealized_pnl": 234.56,
  "buying_power": 50000.00,
  "message": "💵 Balance: $10,234 | Available: $5,000 | BP: $50,000"
}
```

**UI:** None (simple text response)

#### 7. `get_market_data`

Get current market data for a symbol.

**Input Schema:**
```json
{
  "symbol": {
    "type": "string",
    "description": "Asset symbol"
  }
}
```

**Output:**
```json
{
  "symbol": "BTC",
  "mark_price": 51500.00,
  "index_price": 51498.23,
  "funding_rate": 0.0001,
  "funding_rate_annual": 10.95,
  "open_interest": 1250000000,
  "volume_24h": 5000000000,
  "high_24h": 52000.00,
  "low_24h": 50500.00,
  "change_24h": 1.23,
  "message": "📊 BTC: $51,500 | Funding: 0.01% (10.95% APR) | Vol: $5.0B"
}
```

**UI:** None (simple text response)

#### 8. `configure_risk`

Configure risk management limits with interactive form.

**Tool Metadata:**
```json
{
  "_meta": {
    "ui/resourceUri": "ui://perps/risk-config"
  }
}
```

**Input Schema:**
```json
{
  "max_position_size_usd": {
    "type": "number",
    "description": "Max position size in USD"
  },
  "max_leverage": {
    "type": "number",
    "minimum": 1,
    "maximum": 50,
    "description": "Max leverage allowed"
  },
  "max_daily_loss_usd": {
    "type": "number",
    "description": "Max daily loss before circuit breaker"
  },
  "allowed_symbols": {
    "type": "array",
    "items": {"type": "string"},
    "description": "Whitelist of allowed symbols (empty = all)"
  }
}
```

**Output (Tool Result):**
```json
{
  "max_position_size_usd": 10000,
  "max_leverage": 10,
  "max_daily_loss_usd": 1000,
  "allowed_symbols": ["BTC", "ETH", "SOL"],
  "current_daily_loss": -123.45,
  "circuit_breaker_active": false
}
```

**UI View (`ui://perps/risk-config`):**
- **Form fields** for each risk parameter
- **Current values** pre-filled
- **Visual warnings** if limits close to breach
- **Circuit breaker status** indicator
- **Save button** (calls `configure_risk` with new values)
- **Reset to defaults** button

### UI Resources Implementation

#### Server Side (`unju_perps/server.py`)

```python
from mcp.server.fastmcp import FastMCP
from mcp import types
import json

VIEW_DASHBOARD = "ui://perps/dashboard"
VIEW_POSITION = "ui://perps/position"
VIEW_RISK = "ui://perps/risk-config"

mcp = FastMCP("unju-perps", stateless_http=True)

# Tool with UI reference
@mcp.tool(meta={"ui": {"resourceUri": VIEW_DASHBOARD}})
def get_dashboard(refresh_interval: int = 5) -> list[types.TextContent]:
    """Get interactive portfolio dashboard."""
    balance = trader.get_balance()
    positions = trader.get_all_positions()
    history = trader.get_balance_history(days=7)
    
    data = {
        "balance": balance.dict(),
        "positions": [p.dict() for p in positions],
        "balance_history": history
    }
    
    return [types.TextContent(
        type="text",
        text=json.dumps(data)
    )]

# UI Resource
@mcp.resource(
    VIEW_DASHBOARD,
    mime_type="text/html;profile=mcp-app",
    meta={"ui": {"csp": {"resourceDomains": [
        "https://unpkg.com",
        "https://cdn.plot.ly"
    ]}}}
)
def dashboard_view() -> str:
    """Interactive dashboard UI."""
    with open("unju_perps/views/dashboard.html") as f:
        return f.read()
```

#### Client Side (`unju_perps/views/dashboard.html`)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
      margin: 0;
      padding: 20px;
      background: var(--background);
      color: var(--text);
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .metric {
      background: var(--surface);
      padding: 15px;
      border-radius: 8px;
      flex: 1;
      margin: 0 5px;
    }
    .chart {
      background: var(--surface);
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    button {
      background: var(--primary);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="header">
    <div class="metric">
      <div class="label">Total Balance</div>
      <div class="value" id="balance">$0</div>
    </div>
    <div class="metric">
      <div class="label">Unrealized P&L</div>
      <div class="value" id="pnl">$0</div>
    </div>
    <div class="metric">
      <div class="label">Available Margin</div>
      <div class="value" id="available">$0</div>
    </div>
  </div>

  <div class="chart" id="pnl-chart"></div>
  <div class="chart" id="balance-chart"></div>

  <div id="positions-table"></div>

  <div style="margin-top: 20px;">
    <button onclick="closeAllPositions()">Close All Positions</button>
    <button onclick="configureRisk()">Risk Settings</button>
  </div>

  <script type="module">
    import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@0.4.0/app-with-deps";

    const app = new App({ name: "Perps Dashboard", version: "1.0.0" });

    let refreshInterval;

    app.ontoolresult = ({ content }) => {
      const data = JSON.parse(content[0].text);
      renderDashboard(data);
      
      // Start auto-refresh if requested
      if (data.refresh_interval && data.refresh_interval > 0) {
        clearInterval(refreshInterval);
        refreshInterval = setInterval(async () => {
          await app.callTool("get_dashboard", { refresh_interval: data.refresh_interval });
        }, data.refresh_interval * 1000);
      }
    };

    function renderDashboard(data) {
      // Update header metrics
      document.getElementById('balance').textContent = 
        `$${data.balance.total.toFixed(2)}`;
      document.getElementById('pnl').textContent = 
        `$${data.balance.unrealized_pnl.toFixed(2)}`;
      document.getElementById('available').textContent = 
        `$${data.balance.available.toFixed(2)}`;
      
      // Render position P&L bar chart
      const pnlTrace = {
        x: data.positions.map(p => p.symbol),
        y: data.positions.map(p => p.unrealized_pnl),
        type: 'bar',
        marker: {
          color: data.positions.map(p => p.unrealized_pnl >= 0 ? '#10b981' : '#ef4444')
        }
      };
      Plotly.newPlot('pnl-chart', [pnlTrace], {
        title: 'Position P&L',
        height: 300,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
      });

      // Render balance history line chart
      const balanceTrace = {
        x: data.balance_history.map(h => h.time),
        y: data.balance_history.map(h => h.balance),
        type: 'scatter',
        mode: 'lines',
        line: { color: '#3b82f6' }
      };
      Plotly.newPlot('balance-chart', [balanceTrace], {
        title: 'Balance (7d)',
        height: 300,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
      });

      // Render positions table
      const table = `
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--surface);">
              <th style="padding: 10px; text-align: left;">Symbol</th>
              <th style="padding: 10px; text-align: left;">Side</th>
              <th style="padding: 10px; text-align: right;">Entry</th>
              <th style="padding: 10px; text-align: right;">Current</th>
              <th style="padding: 10px; text-align: right;">P&L</th>
              <th style="padding: 10px; text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.positions.map(p => `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">${p.symbol}</td>
                <td style="padding: 10px;">${p.side}</td>
                <td style="padding: 10px; text-align: right;">$${p.entry_price.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right;">$${p.mark_price.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; color: ${p.unrealized_pnl >= 0 ? '#10b981' : '#ef4444'};">
                  $${p.unrealized_pnl.toFixed(2)} (${p.unrealized_pnl_pct.toFixed(2)}%)
                </td>
                <td style="padding: 10px; text-align: center;">
                  <button onclick="closePosition('${p.symbol}')">Close</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      document.getElementById('positions-table').innerHTML = table;
    }

    window.closePosition = async (symbol) => {
      await app.callTool("close_position", { symbol });
      // Dashboard will auto-refresh and show updated positions
    };

    window.closeAllPositions = async () => {
      if (confirm('Close all positions?')) {
        await app.callTool("close_all_positions", {});
      }
    };

    window.configureRisk = async () => {
      await app.callTool("configure_risk", {});
    };

    app.onhostcontextchanged = (ctx) => {
      // Handle theme changes
      if (ctx.theme === 'dark') {
        document.documentElement.style.setProperty('--background', '#0f172a');
        document.documentElement.style.setProperty('--surface', '#1e293b');
        document.documentElement.style.setProperty('--text', '#f1f5f9');
      } else {
        document.documentElement.style.setProperty('--background', '#ffffff');
        document.documentElement.style.setProperty('--surface', '#f8fafc');
        document.documentElement.style.setProperty('--text', '#0f172a');
      }
    };

    await app.connect();
  </script>
</body>
</html>
```

### Risk Management

#### Position Limits
- Default: $10,000 max position size
- Default: 10x max leverage
- Configurable per-account via `configure_risk` UI

#### Daily Loss Circuit Breaker
- Default: $1,000 max daily loss
- All trading disabled when limit hit
- Resets at 00:00 UTC
- Can only close positions after trigger

#### Symbol Whitelist
- Optional: restrict trading to specific symbols
- Prevents agents from trading low-liquidity/high-risk assets
- Default: all Hyperliquid-supported symbols allowed
- Configurable via `configure_risk` UI

#### Slippage Protection
- Default: 50 bps (0.5%) max slippage
- Orders rejected if slippage exceeds limit
- Configurable per-order

#### Validation
- Balance checks before order placement
- Position size validation
- Leverage limit enforcement
- Symbol whitelist enforcement

### Security

#### Private Key Management
- Environment variable: `HYPERLIQUID_PRIVATE_KEY`
- Optional: Integration with unju vault system (future)
- Never logged or exposed in responses
- Testnet mode for safe development

#### API Security
- User-Agent header: `unju-perps/{version}`
- Rate limiting handled by Hyperliquid
- Exponential backoff on errors
- Connection pooling

#### MCP Apps Security
- Sandboxed iframes with CSP restrictions
- Explicit `resourceDomains` whitelist for external CDNs
- No arbitrary script execution
- All UI-to-server communication via MCP JSON-RPC
- User consent for tool calls from UI (host-enforced)

### Testing Strategy

#### Unit Tests
- Mock Hyperliquid API responses
- Test all MCP tools independently
- Risk limit enforcement
- UI resource generation

#### Integration Tests
- Connect to Hyperliquid testnet
- End-to-end order placement
- Position management
- Balance queries

#### UI Tests
- Render UI views in test harness
- Verify postMessage communication
- Test tool calls from UI
- Theme switching

#### Agent Integration Tests
- LiveKit agent connection
- Tool discovery
- Function calling
- UI rendering in chat

### Deployment

#### Installation
```bash
pip install unju-perps
```

#### Configuration
```bash
export HYPERLIQUID_PRIVATE_KEY="0x..."
export HYPERLIQUID_TESTNET="true"  # optional
```

#### Running MCP Server (stdio)
```bash
uv run unju-perps --stdio
# or
python -m unju_perps.server --stdio
```

#### Running MCP Server (HTTP for testing)
```bash
uv run unju-perps
# Starts HTTP server on http://localhost:3001/mcp
```

#### LiveKit Agent Integration
```python
# In unju-agent
from livekit.agents import mcp

perps = mcp.connect(
    "stdio",
    command="uv",
    args=["run", "unju-perps", "--stdio"]
)

# Tools automatically available
tools = await perps.list_tools()

# Agent conversation
# User: "Show me my portfolio"
# Agent calls: get_dashboard()
# Host renders: Interactive dashboard UI
```

#### Claude Desktop Configuration
```json
{
  "mcpServers": {
    "unju-perps": {
      "command": "uv",
      "args": ["run", "unju-perps", "--stdio"],
      "env": {
        "HYPERLIQUID_PRIVATE_KEY": "0x...",
        "HYPERLIQUID_TESTNET": "true"
      }
    }
  }
}
```

## Alternatives Considered

### Alternative 1: Static Base64 Images

**Approach:** Tools return matplotlib charts as base64 PNG.

**Pros:**
- Simple implementation
- No iframe sandboxing needed
- Works in any host

**Cons:**
- No interactivity (no buttons, forms, real-time updates)
- No bidirectional communication
- Poor UX for complex data
- Regenerate entire image for updates

**Rejected because:** MCP Apps provides vastly better UX with interactive HTML.

### Alternative 2: Web UI + REST API

**Approach:** Build a web server with REST API and browser UI.

**Pros:**
- Human-friendly interface
- Direct browser access
- Standard HTTP patterns

**Cons:**
- Requires separate deployment
- Agents need HTTP client
- More complex architecture
- Two interfaces to maintain
- Network dependency

**Rejected because:** MCP with interactive UIs provides better agent UX and simpler architecture.

### Alternative 3: Multi-Exchange Support

**Approach:** Support multiple DEXs (dYdX, GMX, etc.) via unified interface.

**Pros:**
- More flexibility
- Best execution across venues
- Redundancy

**Cons:**
- Complex abstraction layer
- Different API patterns
- More maintenance burden
- Increases scope significantly

**Deferred because:** Focus on Hyperliquid first, add exchanges later if needed.

### Alternative 4: Direct SDK in Agent

**Approach:** Import Hyperliquid SDK directly in agent code.

**Pros:**
- No separate server
- Simpler deployment
- Fewer moving parts

**Cons:**
- Agent needs wallet management
- No safety layer
- Hard to share across agents
- Complex error handling
- No visual feedback

**Rejected because:** MCP abstraction provides better safety and UX.

## Implementation Plan

### Phase 1: Core MCP Server (Week 1)
- [ ] FastMCP server setup with stdio transport
- [ ] Hyperliquid SDK integration
- [ ] Basic tools: `market_order`, `get_position`, `get_balance`
- [ ] Risk management layer
- [ ] Unit tests

### Phase 2: Interactive UIs (Week 1-2)
- [ ] MCP Apps SDK integration
- [ ] Dashboard UI view (HTML + plotly)
- [ ] Position detail UI view
- [ ] UI resource registration
- [ ] Bidirectional communication (UI → tool calls)
- [ ] Theme support (light/dark)

### Phase 3: Advanced Tools (Week 2)
- [ ] `close_position` tool
- [ ] `get_market_data` tool
- [ ] `configure_risk` tool with UI form
- [ ] Stop loss / take profit automation
- [ ] Integration tests

### Phase 4: LiveKit Integration (Week 2-3)
- [ ] Example agent integration
- [ ] Tool discovery validation
- [ ] UI rendering in LiveKit
- [ ] Documentation
- [ ] Demo video

### Phase 5: Production Hardening (Week 3-4)
- [ ] Error recovery
- [ ] Logging to stderr
- [ ] Connection pooling
- [ ] Rate limit handling
- [ ] Performance optimization
- [ ] Security audit
- [ ] Auto-refresh optimization

## Open Questions

1. **Chart library choice**: plotly (rich, interactive) vs chartjs (lightweight)?
   - **Recommendation**: Plotly for rich features, optimize bundle size with CDN caching

2. **Auto-refresh strategy**: polling vs websocket?
   - **Recommendation**: Polling initially (UI calls `get_dashboard` on interval), websocket in Phase 6

3. **Vault integration**: When to add secure key management?
   - **Recommendation**: Phase 6 after core features stable

4. **Multi-account support**: Should one server support multiple trading accounts?
   - **Recommendation**: One server per account initially, add multi-account in Phase 6

5. **UI framework**: Vanilla JS vs React/Vue/Svelte?
   - **Recommendation**: Vanilla JS for dashboard (no build step), allow React for complex UIs later

6. **CSP domains**: Which chart/UI libraries to whitelist?
   - **Recommendation**: unpkg.com (MCP Apps SDK), cdn.plot.ly (charts)

## Success Metrics

### Agent UX
- Tool call success rate: >99%
- Average response time: <500ms
- UI render time: <1000ms
- Error recovery rate: >95%

### Trading Performance
- Order fill rate: >98%
- Slippage within limits: >99%
- Risk limit enforcement: 100%
- Zero unauthorized trades

### UI Performance
- Initial render: <1s
- Interaction responsiveness: <100ms
- Chart rendering: <500ms
- Auto-refresh overhead: <50ms

### Adoption
- Used by >3 unju.ai agents
- >100 trades executed in first month
- Zero security incidents
- Positive agent feedback
- UI interactions per session: >5

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP Apps Extension (SEP-1865)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865)
- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps)
- [MCP Apps Blog Post](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/)
- [LiveKit Agents MCP Support](https://docs.livekit.io/agents/)
- [Hyperliquid API Documentation](https://hyperliquid.gitbook.io/)
- [FastMCP Documentation](https://github.com/modelcontextprotocol/python-sdk)
- [unju-agent Repository](https://github.com/unju-ai/unju-agent)

## Changelog

- **2026-02-25 v2**: Major revision - replaced static images with MCP Apps interactive HTML UIs
- **2026-02-25 v1**: Initial draft with base64 image approach
