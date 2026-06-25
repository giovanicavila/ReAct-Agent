# react-agent

TypeScript ReAct agent using Vercel AI SDK.

## Stack

- Node.js
- TypeScript
- Vercel AI SDK
- OpenCode
- Tavily
- Playwright

## Tools

### search

Search the web for current information. Use for factual questions, recent events, or documentation lookups.

### browse

Open a URL in a real browser and return its text content. Use for JS-rendered pages, SPAs, or when search snippets aren't enough.

### read_document

Extract structured text from a document URL (PDF, HTML page, plain text, CSV, JSON). Use when you need to read the full content of a specific document.

## Commands

```bash
npm run dev
npm start
npx playwright install chromium
```

## Process to add a new tool

1. Create a file in `src/tools/`
2. Export using `tool()` from the `ai` package
3. Register in `src/index.ts`
4. Update the system prompt
5. Update this AGENTS.md
