# ReAct Agent

A TypeScript ReAct agent using the **Vercel AI SDK** with tools for web search, browsing, document reading, and AWS cost estimation. Runs as an interactive CLI or an HTTP server.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Entry Point                          │
│                                                              │
│  src/index.ts                                                 │
│    ├── --server flag? → src/server.ts (HTTP API)             │
│    └── default         → CLI chat loop                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ReAct Loop (Vercel AI SDK generateText)              │    │
│  │                                                      │    │
│  │  Thought → Action → Observation → Thought → Answer  │    │
│  │                                                      │    │
│  │  Tools:                                               │    │
│  │   ┌──────────┐ ┌──────────┐ ┌──────────────┐       │    │
│  │   │ search   │ │ browse   │ │read_document  │       │    │
│  │   │ Tavily   │ │Playwright│ │ fetch+parse   │       │    │
│  │   └──────────┘ └──────────┘ └──────────────┘       │    │
│  │   ┌──────────────────┐                              │    │
│  │   │ aws_calculator   │ ← Playwright-based          │    │
│  │   │ AWS Pricing Calc │                              │    │
│  │   └──────────────────┘                              │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── index.ts                      # CLI entry — ReAct loop + chat UI
├── server.ts                     # HTTP server — POST /api/estimate
├── tools/
│   ├── search.ts                 # Web search via Tavily
│   ├── browser.ts                # Playwright page renderer
│   ├── document.ts               # Fetch-based document reader
│   └── aws-calculator/           # AWS Pricing Calculator automation
│       ├── index.ts              # Tool definition, orchestration, configurator registry
│       ├── browser.ts            # Playwright launch + overlay dismissal
│       ├── add-service.ts        # Find/click service cards, fill fields
│       ├── save-service.ts       # "Save and add service" / "Save and view summary"
│       ├── share-flow.ts         # Extract shareable estimate URL
│       ├── name-map.ts           # Short names → AWS data-cy attribute mapping
│       └── configure-services/   # Per-service configurators (registry pattern)
│           ├── index.ts          # Configurator registry
│           ├── ec2.ts            # EC2-specific configuration
│           ├── rds.ts            # RDS-specific configuration
│           └── s3.ts             # S3-specific configuration
prompts/
└── system.ts                # System prompt for the agent
AGENTS.md                    # OpenCode agent instructions
Dockerfile                   # Docker image definition
.dockerignore                # Files excluded from Docker build
.env                         # Environment variables
package.json
tsconfig.json
```

## Requirements

- [Bun](https://bun.sh) 1.x
- [Tavily API key](https://tavily.com) (free tier available)
- OpenAI API key (or OpenRouter for any model)

## Setup

```bash
git clone <repo>
cd react-agent
bun install
bunx playwright install chromium
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

```env
# ── LLM Provider ──────────────────────────────────
OPENAI_API_KEY=sk-...          # OpenAI
# or OpenRouter:
# OPENAI_API_KEY=sk-or-v1-...
# OPENAI_BASE_URL=https://openrouter.ai/api/v1

# ── Search ────────────────────────────────────────
TAVILY_API_KEY=tvly-xxxx

# ── Optional ──────────────────────────────────────
MODEL=gpt-4o-mini               # Model name
MAX_STEPS=5                     # Max ReAct iterations
MAX_TOKENS=1024                 # Max tokens per response
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

Creates an AWS cost estimate from an architecture description.

**Request** — accepts text descriptions or structured JSON:

```json
{ "architecture": "I need a web app with EC2, RDS PostgreSQL, and S3 behind a load balancer" }
```

```json
{ "architecture": { "app": "EC2", "db": "RDS", "storage": "S3" } }
```

```json
{ "services": [{ "serviceName": "Amazon EC2", "quantity": 2 }] }
```

```json
{
  "services": [
    { "serviceName": "Amazon EC2", "quantity": 2, "description": "Web servers" },
    { "serviceName": "Amazon RDS for PostgreSQL", "quantity": 1 }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "url": "https://calculator.aws/#/estimate?id=c28f1a2b...",
  "title": "Architecture Estimate",
  "region": "US East (Ohio)",
  "services": ["Amazon EC2", "Amazon RDS for PostgreSQL"],
  "message": "Estimate \"Architecture Estimate\" created with 2 service(s) in US East (Ohio)."
}
```

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

Build and run with the included [`Dockerfile`](./Dockerfile):

```bash
# Build the image (installs Chromium + system deps automatically)
docker build -t react-agent .

# Run the server (pass .env for API keys)
docker run -p 3000:3000 --env-file .env react-agent
```

The Dockerfile installs both Playwright's Chromium and its system libraries. `.env` is excluded via `.dockerignore` — secrets stay out of the image.

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

### AWS Calculator Flow

1. **Launch** headless Chromium via Playwright (`src/tools/aws-calculator/browser.ts`)
2. **Navigate** to `https://calculator.aws/#/estimate`
3. **Dismiss** cookie banner and chatbot overlay
4. **For each service:**
   - Click "Add service", find the correct card by `data-cy` attribute (`add-service.ts`)
   - Click "Configure", run the service-specific configurator if one exists (`configure-services/`)
   - Fill quantity, click "Save and add service" (`save-service.ts`)
5. **Extract URL** via "Share" → "Agree and continue" → capture estimate ID (`share-flow.ts`)
6. **Return** the shareable estimate URL

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

### 3. Register in the server

```typescript
// src/server.ts
import { azureCalculatorTool } from "./tools/azure-calculator.js";

const tools = {
  search: searchTool,
  aws_calculator: awsCalculatorTool,
  azure_calculator: azureCalculatorTool,  // ← add
};
```

### 4. Update the system prompt

Add the tool description in `prompts/system.ts`.

### 5. Update AGENTS.md

Document the tool so OpenCode knows when to use it.

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI or OpenRouter API key |
| `OPENAI_BASE_URL` | — | Custom base URL (for OpenRouter etc.) |
| `TAVILY_API_KEY` | — | Tavily search API key |
| `MODEL` | `gpt-4o-mini` | Model name |
| `MAX_STEPS` | `5` | Maximum ReAct iterations |
| `MAX_TOKENS` | `1024` | Max response tokens |
| `PORT` | `3000` | HTTP server port |

## License

MIT
