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

### aws_calculator

Navigate the AWS Pricing Calculator, add the specified services, and return a shareable estimate URL. Use this to create cost estimates for AWS architectures. Pass services with their full official names (e.g. "Amazon EC2", "Amazon S3", "AWS Lambda").

## API Server

The project includes an HTTP server for creating estimates programmatically.

```bash
npm run server        # Start API server (production)
npm run server:dev    # Start API server (watch mode)
```

### POST /api/estimate

Accepts an architecture description (text or JSON) and returns the calculator link.

**Request examples:**

```json
{ "architecture": "I need a web app with EC2, RDS PostgreSQL, and S3 behind a load balancer" }
```

```json
{ "architecture": { "app": "EC2", "db": "RDS", "storage": "S3" } }
```

```json
{ "services": [{ "serviceName": "Amazon EC2", "quantity": 2 }] }
```

## Commands

```bash
npm run dev                 # CLI agent (watch mode)
npm start                   # CLI agent
npm run server              # API server (production)
npm run server:dev          # API server (watch mode)
npx playwright install chromium
```

## Process to add a new tool

1. Create a file in `src/tools/`
2. Export using `tool()` from the `ai` package
3. Register in `src/index.ts`
4. Update the system prompt
5. Update this AGENTS.md
