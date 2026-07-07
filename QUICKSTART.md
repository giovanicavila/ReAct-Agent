# Quickstart

## Requirements

- **Bun ≥1.x** (or Node.js ≥20 + `npx`)
- **Playwright Chromium** — install via `bunx playwright install chromium`
- **API keys** — [Tavily](https://tavily.com) (free) + OpenAI or [OpenRouter](https://openrouter.ai)

## Setup

```bash
git clone <repo>
cd react-agent
bun install
bunx playwright install chromium
cp .env.example .env
# Edit .env with your API keys and model
```

## Run

```bash
# HTTP server (watch mode)
bun run server:dev

# Interactive CLI
bun run dev
```

The server listens on `http://localhost:3000`.

---

## `POST /api/estimate`

Creates an AWS cost estimate from an architecture description. Accepts these formats:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `architecture` | `string` | optional* | Free-text architecture description |
| `workloadType` | `string` | no | e.g. `"Web Application"`, `"Microservices"` |
| `monthlyActiveUsers` | `number` | no | Expected monthly active users |
| `peakConcurrentUsers` | `number` | no | Expected peak concurrent users |
| `requestsPerDay` | `number` | no | Estimated daily API requests |
| `storageGB` | `number` | no | Initial storage needed (GB) |
| `monthlyStorageGrowthGB` | `number` | no | Monthly storage growth (GB) |
| `databaseSizeGB` | `number` | no | Estimated database size (GB) |
| `outboundTrafficGBPerMonth` | `number` | no | Monthly outbound data transfer (GB) |
| `availabilityTier` | `string` | no | `"Standard"`, `"High"`, `"Production"` |
| `trafficPattern` | `string` | no | `"Steady"`, `"Variable"`, `"Spiky"` |
| `services` | `Service[]` | optional* | Pre-defined service list (skips LLM extraction) |
| `file` (multipart) | PDF | optional* | Upload a PDF containing the architecture description |
| Raw body (PDF) | `application/pdf` | optional* | Send PDF bytes directly |

`*` — exactly one input format must be provided. Structured metadata fields are passed to the LLM as context for better service selection.

### Service object

```json
{ "serviceName": "string", "quantity": 1, "description": "string" }
```

### Examples

```bash
# Structured architecture (recommended — includes workload metadata)
curl -X POST http://localhost:3000/api/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "workloadType": "Web Application",
    "monthlyActiveUsers": 5000,
    "peakConcurrentUsers": 100,
    "requestsPerDay": 20000,
    "storageGB": 50,
    "monthlyStorageGrowthGB": 5,
    "databaseSizeGB": 20,
    "outboundTrafficGBPerMonth": 100,
    "availabilityTier": "Standard",
    "trafficPattern": "Steady",
    "architecture": "Uma pequena aplicação web para gerenciamento de tarefas. Os usuários podem criar contas, fazer login, cadastrar tarefas e visualizar relatórios simples. A aplicação possui uma API REST, um banco de dados relacional e armazenamento de arquivos para anexos. O objetivo é ter uma arquitetura de baixo custo, fácil de manter e escalável caso o número de usuários cresça."
  }'

# Pre-defined services (skips LLM extraction)
curl -X POST http://localhost:3000/api/estimate \
  -H "Content-Type: application/json" \
  -d '{"services": [{"serviceName":"Amazon EC2","quantity":3}]}'

# PDF upload
curl -X POST --data-binary @architecture.pdf \
  -H "Content-Type: application/pdf" \
  http://localhost:3000/api/estimate

# PDF via multipart
curl -F "file=@architecture.pdf" http://localhost:3000/api/estimate
```

### Response

```json
{
  "success": true,
  "url": "https://calculator.aws/#/estimate?id=...",
  "title": "Architecture Estimate",
  "region": "US East (Ohio)",
  "services": [
    {
      "name": "Amazon EC2",
      "quantity": 5,
      "description": "Compute for microservices",
      "reasoning": "Why this service was selected",
      "usage": "Sizing and configuration details",
      "added": true
    }
  ],
  "summary": "This estimate includes 5 AWS service(s)..."
}
```

### Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | yes | — | OpenAI or OpenRouter API key |
| `MODEL` | yes | — | Model name (e.g. `openai/gpt-4o-mini`) |
| `OPENAI_BASE_URL` | no | — | Custom base URL (for OpenRouter, Azure, etc.) |
| `TAVILY_API_KEY` | no | — | Web search API key (free at tavily.com) |
| `PORT` | no | `3000` | Server port |
| `MAX_TOKENS` | no | `4096` | Max response tokens per LLM call |
