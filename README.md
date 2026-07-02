# ReAct Agent

A TypeScript ReAct agent using the **Vercel AI SDK** with tools for web search, browsing, document reading, and AWS cost estimation. Runs as an interactive CLI or an HTTP server (Fastify).

> **[`AGENTS.md`](./AGENTS.md)** is an **AI context file** — it tells AI coding assistants (OpenCode, Cline, Cursor, etc.) about the project's stack, tools, conventions, and how to help effectively. If you use an AI assistant while developing, this file gives it the right context. Update it when adding tools or changing the architecture.

## Architecture

```
                     ┌──────────────────────┐
                     │    src/index.ts        │
                     │  (dual-mode entry)     │
                     ├──────┬───────┬────────┤
                     │ CLI  │       │ Server │
                     │ loop │       │  mode  │
                     └──────┘       └───┬────┘
                                        │
                     ┌──────────────────▼───────┐
                     │   src/server/ (Fastify)    │
                     │                           │
                     │  POST /api/estimate        │
                     │    1. Extract (LLM)        │
                     │    2. Enrich (LLM)         │
                     │    3. Calculator (tool)    │
                     │                           │
                     │  GET /health               │
                     └───────────────────────────┘
```

## Project Structure

```
src/
├── index.ts                        # CLI entry — ReAct loop + chat UI
├── server/
│   ├── index.ts                    # Fastify server (routes, plugins, CORS)
│   ├── schemas/
│   │   └── estimate.ts             # TypeBox JSON schemas for request validation
│   ├── handlers/
│   │   └── estimate.ts             # Two-step LLM pipeline + calculator execution
│   └── utils/
│       └── pdf.ts                  # PDF text extraction (pdfjs-dist)
├── tools/
│   ├── search.ts                   # Web search via Tavily
│   ├── browser.ts                  # Playwright page renderer
│   ├── document.ts                 # Fetch-based document reader
│   ├── aws-calculator/             # AWS Pricing Calculator (legacy Playwright)
│   │   ├── index.ts                # Tool definition, orchestration, configurator registry
│   │   ├── browser.ts              # Playwright launch + overlay dismissal
│   │   ├── add-service.ts          # Find/click service cards, fill fields
│   │   ├── save-service.ts         # "Save and add service" / "Save and view summary"
│   │   ├── share-flow.ts           # Extract shareable estimate URL
│   │   ├── name-map.ts             # Short names → AWS data-cy attribute mapping
│   │   └── configure-services/     # Per-service configurators (registry pattern)
│   │       ├── index.ts            # Configurator registry
│   │       ├── ec2.ts              # EC2-specific configuration
│   │       ├── rds.ts              # RDS-specific configuration
│   │       └── s3.ts               # S3-specific configuration
│   └── aws-calculator-mcp/         # AWS Pricing Calculator via MCP (preferred)
│       ├── client.ts               # MCP client manager — spawns server via npx
│       └── index.ts                # Auto-wraps MCP tools as AI SDK tools
prompts/
└── system.ts                  # System prompt for the agent
AGENTS.md                      # OpenCode AI coding assistant instructions (dev only)
Dockerfile                     # Docker image definition
.dockerignore                  # Files excluded from Docker build
.env                           # Environment variables
package.json
tsconfig.json
```

## Requirements

- [Bun](https://bun.sh) 1.x
- [Tavily API key](https://tavily.com) (free tier available)
- OpenAI API key (or OpenRouter for any model)
- Model name set via `MODEL` env (e.g. `openai/gpt-4o-mini`, `poolside/laguna-m.1:free`)

## Setup

```bash
git clone <repo>
cd react-agent
bun install
bunx playwright install chromium
cp .env.example .env
# Edit .env with your API keys and model
```

### Environment Variables

```env
# ── LLM Provider ──────────────────────────────────
OPENAI_API_KEY=sk-...          # OpenAI or OpenRouter
OPENAI_BASE_URL=               # Optional (e.g. https://openrouter.ai/api/v1)
MODEL=openai/gpt-4o-mini       # Required — model name

# ── Search ────────────────────────────────────────
TAVILY_API_KEY=tvly-xxxx

# ── Optional ──────────────────────────────────────
MAX_STEPS=5                     # Max ReAct iterations
MAX_TOKENS=4096                 # Max tokens per LLM call
PORT=3000                       # Server port (default 3000)
```

## Usage

### CLI mode (interactive chat)

```bash
# Development (watch mode)
bun run dev

# Production
bun start
```

Type your questions and watch the agent reason step by step, calling tools as needed.

### Server mode (HTTP API)

```bash
# Development (watch mode)
bun run server:dev

# Production
bun run server
```

#### POST /api/estimate

Creates an AWS cost estimate from an architecture description. Uses a **two-step LLM pipeline**:

1. **Extract** — LLM identifies relevant AWS services (name, quantity, description)
2. **Enrich** — LLM generates explanation (`reasoning`) and sizing (`usage`) for each service

**Request** — accepts text descriptions, structured JSON, or PDF:

```json
{ "architecture": "I need a web app with EC2, RDS PostgreSQL, and S3 behind a load balancer" }
```

```json
{ "architecture": { "app": "EC2", "db": "RDS", "storage": "S3" } }
```

```json
{ "services": [{ "serviceName": "Amazon EC2", "quantity": 2 }] }
```

```bash
# PDF upload (multipart)
curl -F "file=@architecture.pdf" http://localhost:3000/api/estimate

# PDF upload (raw)
curl -X POST --data-binary @architecture.pdf \
  -H "Content-Type: application/pdf" \
  http://localhost:3000/api/estimate
```

**Response:**

```json
{
  "success": true,
  "url": "https://calculator.aws/#/estimate/...",
  "title": "Architecture Estimate",
  "region": "US East (Ohio)",
  "services": [
    {
      "name": "Amazon EC2",
      "quantity": 5,
      "description": "Compute for payment microservices",
      "reasoning": "Why this service was chosen based on architecture requirements.",
      "usage": "How the service will be used with estimated sizing details.",
      "added": true
    }
  ],
  "summary": "This estimate includes 5 AWS service(s) totaling approximately 15 resource(s). Services added: Amazon EC2 (5 × Compute for payment microservices)..."
}
```

Each service entry includes `reasoning` (why this AWS service was selected) and `usage` (configuration/sizing details). The `summary` provides a human-readable overview. If services were pre-defined by the caller (skipping the LLM), `reasoning` and `usage` are omitted.

#### GET /health

```json
{ "status": "ok" }
```

## Deploy

### Node.js / Bun (any host)

```bash
bun install --production
bunx playwright install chromium
bun run server
```

The server listens on `$PORT` (default 3000).

### Docker

The included [`Dockerfile`](./Dockerfile) bundles Bun, Chromium, and all system dependencies.

```bash
# Build
docker build -t react-agent .

# Run the HTTP server — pass env via .env file
docker run -d --name react-agent -p 3000:3000 --env-file .env react-agent

# Run the interactive CLI instead
docker run -it --env-file .env react-agent bun run src/index.ts
```

The Dockerfile installs Playwright's Chromium and system libraries at build time. `.env` is excluded via `.dockerignore` — secrets stay out of the image.

### Fly.io / Railway / Render

Set the build command to `bunx playwright install chromium && bunx playwright install-deps chromium` and the start command to `bun run server`. Set environment variables via the platform dashboard.

## How It Works

### ReAct Loop

The agent follows the **Reasoning + Acting** pattern:

```
Thought: I need to look up the latest pricing for EC2
Action: search("AWS EC2 pricing 2026")
Observation: [search results]
Thought: Now I can create the estimate
Action: aws_calculator({ services: ["Amazon EC2"] })
Observation: [estimate URL]
Answer: Here is the estimate...
```

### Tool Execution

Each tool wraps a concrete action:

| Tool | Mechanism | Use Case |
|------|-----------|----------|
| `search` | Tavily API | Factual questions, news, docs |
| `browse` | Playwright Chromium | JS-rendered pages, SPAs |
| `read_document` | HTTP fetch + parsers | PDFs, JSON, CSV, static HTML |
| `aws_calculator` | Playwright Chromium | AWS cost estimation |

### AWS Calculator (Two Approaches)

**Legacy (Playwright-based)** — `src/tools/aws-calculator/`

1. **Launch** headless Chromium via Playwright (`browser.ts`)
2. **Navigate** to `https://calculator.aws/#/estimate`
3. **Dismiss** overlays, add services by clicking cards (`add-service.ts`)
4. Run service-specific configurators (`configure-services/`)
5. Extract shareable URL via the share flow (`share-flow.ts`)

**MCP-based (preferred)** — `src/tools/aws-calculator-mcp/`

Uses the official [AWS Pricing Calculator MCP server](https://github.com/aws-samples/sample-aws-pricing-calculator-mcp) — no browser automation. The agent connects via the MCP protocol (stdio transport, spawned via `npx`):

1. **`search_services`** — find the correct service codes by name
2. **`get_service_fields`** — discover configurable fields for each service
3. **`build_estimate`** — one-shot: create estimate + add services + validate + save → shareable URL

The MCP server fetches the live AWS Calculator manifest (~436 services) and validates configurations against real service definitions, making it more accurate than the Playwright approach.

### Estimate Endpoint Pipeline

The `POST /api/estimate` handler processes requests in two LLM calls to avoid token limits:

1. **Extract** — sends the architecture to an LLM → returns a JSON array of `{ serviceName, quantity, description }`
2. **Enrich** — sends the extracted services back to the LLM → returns `{ reasoning, usage }` for each service
3. **Execute** — calls the `awsCalculatorTool` to build the estimate in the AWS Pricing Calculator
4. **Build response** — merges calculator result + enriched explanations → final response with `summary`

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI or OpenRouter API key |
| `OPENAI_BASE_URL` | — | Custom base URL (for OpenRouter etc.) |
| `MODEL` | — | **Required** — model name (e.g. `openai/gpt-4o-mini`) |
| `TAVILY_API_KEY` | — | Tavily search API key |
| `MAX_STEPS` | `5` | Maximum ReAct iterations |
| `MAX_TOKENS` | `4096` | Max response tokens per LLM call |
| `PORT` | `3000` | HTTP server port |

## Adding a New Tool

### 1. Create the tool file

```typescript
// src/tools/azure-calculator.ts
import { tool } from "ai";
import { z } from "zod";

export const azureCalculatorTool = tool({
  description: `Navigate the Azure Pricing Calculator and return a shareable estimate URL.`,
  parameters: z.object({
    services: z.array(z.object({
      serviceName: z.string(),
      quantity: z.number().optional().default(1),
    })).min(1),
    region: z.string().optional().default("East US"),
  }),
  execute: async ({ services }) => {
    // Playwright automation here
    return { success: true, url: "https://...", services: services.map(s => s.serviceName), message: "Done" };
  },
});
```

### 2. Register in the CLI agent

```typescript
// src/index.ts
import { azureCalculatorTool } from "./tools/azure-calculator.js";

const tools = {
  search: searchTool,
  browse: browseTool,
  read_document: readDocumentTool,
  aws_calculator: awsCalculatorTool,
  azure_calculator: azureCalculatorTool,  // ← add
};
```

### 3. Update the system prompt

Add the tool description in `prompts/system.ts`.

### 4. Update AGENTS.md

Document the tool so OpenCode knows when to use it.

## License

MIT
