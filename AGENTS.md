# react-agent

TypeScript ReAct agent using Vercel AI SDK.

## Stack

- Bun
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
bun run server        # Start API server (production)
bun run server:dev    # Start API server (watch mode)
```

### POST /api/estimate

Accepts an architecture description (text, JSON, or PDF) and returns the calculator link.

**Request formats:**

1. **JSON** — architecture description or explicit services list:

    ```json
    { "architecture": "I need a web app with EC2, RDS PostgreSQL, and S3 behind a load balancer" }
    ```

    ```json
    { "architecture": { "app": "EC2", "db": "RDS", "storage": "S3" } }
    ```

    ```json
    { "services": [{ "serviceName": "Amazon EC2", "quantity": 2 }] }
    ```

2. **PDF upload (multipart/form-data)** — upload a PDF file containing the architecture description:

    ```bash
    curl -F "file=@architecture.pdf" http://localhost:3000/api/estimate
    ```

3. **PDF upload (raw)** — send PDF bytes directly:

    ```bash
    curl -X POST --data-binary @architecture.pdf -H "Content-Type: application/pdf" http://localhost:3000/api/estimate
    ```

For PDF uploads, the server extracts the text using `pdf-parse` and passes it to the agent, which reasons about the required AWS services and calls `aws_calculator` to create the estimate.

## Commands

```bash
bun run dev                 # CLI agent (watch mode)
bun start                   # CLI agent
bun run server              # API server (production)
bun run server:dev          # API server (watch mode)
bunx playwright install chromium
```

## Process to add a new tool

1. Create a file in `src/tools/`
2. Export using `tool()` from the `ai` package
3. Register in `src/index.ts`
4. Update the system prompt
5. Update this AGENTS.md
