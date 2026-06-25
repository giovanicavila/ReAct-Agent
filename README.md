# ReAct Agent + OpenCode

A TypeScript ReAct agent using the **Vercel AI SDK**, running inside **OpenCode**, with specialized tools for search, web browsing, and document reading.

OpenCode provides the agent environment (session, context, workspace, models), while the Vercel AI SDK runs the ReAct loop and tool calling.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│ OpenCode                                                     │
│                                                               │
│ • Interactive session                                         │
│ • Persistent workspace context                                │
│ • AGENTS.md awareness                                         │
│ • Native model access                                         │
│ • Local agent execution                                       │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ ReAct Agent (Vercel AI SDK)                           │    │
│  │                                                       │    │
│  │ Thought → Action → Observe → Thought → Final Answer  │    │
│  │                                                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐     │    │
│  │  │ search   │ │ browse   │ │ read_document      │     │    │
│  │  │ Tavily   │ │Playwright│ │ fetch + parsers    │     │    │
│  │  └──────────┘ └──────────┘ └────────────────────┘     │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│                       OpenCode Models                         │
│                                                               │
│             Claude / Gemini / Qwen / Kimi / etc              │
└───────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| OpenCode | Agent environment, context, AGENTS.md, interactive session |
| Vercel AI SDK | ReAct loop, tool calling, orchestration |
| Search Tool | Structured web search |
| Browse Tool | JavaScript-rendered page navigation |
| Read Document Tool | PDF, JSON, CSV, HTML reading |
| Model | Reasoning and decision-making |

---

## Execution Flow

```
User
   │
   ▼
OpenCode
   │
   ▼
ReAct Agent
   │
   ▼
Model
   │
   ├─ Needs to search?
   │      └─ search()
   │
   ├─ Needs to open a page?
   │      └─ browse()
   │
   ├─ Needs to read a document?
   │      └─ read_document()
   │
   ▼
Final Answer
```

---

## Project Structure

```
react-agent/
│
├── src/
│   ├── index.ts
│   │
│   └── tools/
│       ├── search.ts
│       ├── browser.ts
│       └── document.ts
│
├── prompts/
│   └── system.ts
│
├── AGENTS.md
├── package.json
├── tsconfig.json
└── .env
```

---

## Dependencies

### Install

```bash
npm install
```

### Browser

```bash
npx playwright install chromium
```

---

## Environment Variables

```env
TAVILY_API_KEY=tvly-xxxx
MAX_STEPS=10
```

---

## Tools

### 1. Search — Web search via Tavily

Allows the agent to retrieve up-to-date information from the web.

Ideal for:
- Documentation
- Changelogs
- News
- APIs
- General research

```ts
import { tool } from "ai";
import { z } from "zod";

export const searchTool = tool({
  description:
    "Search the web for information and return relevant results.",

  parameters: z.object({
    query: z.string(),
    max_results: z.number().default(5),
  }),

  execute: async ({ query, max_results }) => {
    // Tavily call
  },
});
```

**When to use:** factual questions, news, documentation, quick research

**When NOT to use:** specific URLs, PDFs, JavaScript applications

---

### 2. Browse — Playwright browser navigation

Opens real pages and renders JavaScript.

Many modern sites return empty HTML on a plain fetch.

Examples: Notion, Vercel, GitHub, Dashboards, React/Vue apps

```ts
export const browseTool = tool({
  description:
    "Open and extract content from web pages.",

  parameters: z.object({
    url: z.string(),
    selector: z.string().optional(),
  }),

  execute: async ({ url, selector }) => {
    // Playwright
  },
});
```

**Internal flow:**
1. Launch Chromium
2. Navigate to URL
3. Wait for render
4. Clean up useless elements
5. Extract text
6. Return content

**When to use:** blogs, React/Vue sites, SPAs, dashboards

**When NOT to use:** JSON APIs, PDFs, CSV files

---

### 3. Read Document — Fetch-based document reading

Reads files directly without a browser. Faster than Playwright.

Supported types: JSON, CSV, TXT, HTML, PDF

```ts
export const readDocumentTool = tool({
  description:
    "Read documents and extract content.",

  parameters: z.object({
    url: z.string(),
    max_chars: z.number().default(6000),
  }),

  execute: async ({ url }) => {
    // fetch
  },
});
```

**When to use:** PDFs, JSON, CSV, TXT, static HTML

**When NOT to use:** React/Angular apps, SPAs

---

## Tool Registration

```ts
const tools = {
  search: searchTool,
  browse: browseTool,
  read_document: readDocumentTool,
};
```

---

## ReAct Agent Configuration

```ts
const result = await generateText({
  model,
  system,
  messages,
  tools,
  maxSteps: 10,
});
```

---

## How the ReAct Loop Works

ReAct = **Reasoning + Acting**

The agent alternates between:

```
Thought
↓
Action
↓
Observation
↓
Thought
↓
Action
↓
Observation
↓
Final Answer
```

### Example

**User:** What's the main new feature in Next.js 15?

```
Thought: I need to find the latest release.
Action: search("Next.js 15 release notes")
Observation: Results found.
Thought: I need to open the official page.
Action: browse("https://nextjs.org/blog/next-15")
Observation: Content extracted.
Final Answer: Release summary.
```

---

## Possible Future Tools

- **run_code** — execute JavaScript in isolation
- **database_query** — query PostgreSQL
- **github_tool** — read repositories, PRs, commits
- **vector_search** — semantic search on private documents (RAG)

---

## Summary

```
OpenCode
    │
    ▼
Vercel AI SDK
    │
    ├── search (Tavily)
    ├── browse (Playwright)
    └── read_document
    │
    ▼
OpenCode Model
```

OpenCode provides the agent environment. The Vercel AI SDK implements the ReAct loop. The tools execute real actions. The model decides which tool to use, interprets the results, and produces the final answer.
