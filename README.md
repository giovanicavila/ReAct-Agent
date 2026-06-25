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
├── index.ts                 # CLI entry — ReAct loop + chat UI
├── server.ts                # HTTP server — POST /api/estimate
├── tools/
│   ├── search.ts            # Web search via Tavily
│   ├── browser.ts           # Playwright page renderer
│   ├── document.ts          # Fetch-based document reader
│   └── aws-calculator.ts    # AWS Pricing Calculator automation
prompts/
└── system.ts                # System prompt for the agent
AGENTS.md                    # OpenCode agent instructions
.env                         # Environment variables
package.json
tsconfig.json
```

## Requirements

- Node.js 20+
- [Tavily API key](https://tavily.com) (free tier available)
- OpenAI API key (or OpenRouter for any model)

## Setup

```bash
git clone <repo>
cd react-agent
npm install
npx playwright install chromium
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
npm run dev

# Production
npm start
```

Type your questions and watch the agent reason step by step, calling tools as needed.

### Server mode (HTTP API)

```bash
# Development (watch mode)
npm run server:dev

# Production
npm run server
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

### Node.js (any host)

```bash
npm ci --production
npx playwright install chromium
npm run server
```

The server listens on `$PORT` (default 3000).

### Docker

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci && npx playwright install chromium
COPY . .
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/server.ts"]
```

### Fly.io / Railway / Render

Set the start command to `npm run server`, set your environment variables, and ensure the build step runs `npx playwright install chromium`.

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

1. Launch headless Chromium via Playwright
2. Navigate to `https://calculator.aws/#/estimate`
3. Dismiss cookie banner and chatbot overlay
4. Click "Add service", find the service by `data-cy` attribute
5. Click "Configure", fill quantity, save
6. Click "Share" → "Agree and continue" → extract shareable URL
7. Return the URL with the estimate ID

## Adding a New Tool (e.g. `azure_calculator`)

### 1. Create the tool file

```typescript
// src/tools/azure-calculator.ts
import { tool } from "ai";
import { z } from "zod";

export const azureCalculatorTool = tool({
  description: `Navigate the Azure Pricing Calculator and return a shareable estimate URL.`,
  parameters: z.object({
    services: z
      .array(
        z.object({
          serviceName: z.string().describe("Full Azure service name e.g. 'Virtual Machines'"),
          quantity: z.number().optional().default(1),
          description: z.string().optional(),
        })
      )
      .min(1),
    region: z.string().optional().default("East US"),
    title: z.string().optional().default("Architecture Estimate"),
  }),
  execute: async ({ services, region, title }) => {
    // Your Playwright automation here
    return {
      success: true,
      url: "https://...",
      services: services.map(s => s.serviceName),
      message: `Estimate created.`,
    };
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
  azure_calculator: azureCalculatorTool,  // ← add here
};
```

### 3. Register in the server

```typescript
// src/server.ts
import { azureCalculatorTool } from "./tools/azure-calculator.js";

const tools = {
  search: searchTool,
  aws_calculator: awsCalculatorTool,
  azure_calculator: azureCalculatorTool,  // ← add here
};
```

### 4. Update the system prompt

```typescript
// prompts/system.ts
// Add the tool description to the system prompt
- **azure_calculator**: navigate the Azure Pricing Calculator...
```

### 5. Update AGENTS.md

Document the tool so OpenCode knows when to use it.

### 6. (Optional) Add a server endpoint

If the tool needs a dedicated API endpoint (like `/api/estimate` for AWS):

```typescript
// src/server.ts
if (req.method === "POST" && req.url === "/api/azure-estimate") {
  // handle Azure estimate request
}
```

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
