# react-agent

TypeScript ReAct agent using Vercel AI SDK.

## Stack

- Bun
- TypeScript
- Vercel AI SDK
- Fastify (`@fastify/cors`, `@fastify/multipart`)
- OpenCode
- Tavily
- Playwright

## Server Structure

```
src/server/
  schemas/          — TypeBox JSON schemas for request validation
  handlers/
    estimate.ts     — Two-step LLM pipeline (extract → enrich) + calculator execution
  utils/
    pdf.ts          — PDF text extraction (pdfjs-dist)
  index.ts          — Fastify server entry point (routes, plugins, content-type parsers)
```

## Tools

### search

Search the web for current information. Use for factual questions, recent events, or documentation lookups.

### browse

Open a URL in a real browser and return its text content. Use for JS-rendered pages, SPAs, or when search snippets aren't enough.

### read_document

Extract structured text from a document URL (PDF, HTML page, plain text, CSV, JSON). Use when you need to read the full content of a specific document.

### aws_calculator (legacy)

Navigate the AWS Pricing Calculator via Playwright browser automation, add the specified services, and return a shareable estimate URL. Use only as fallback. Prefer the MCP-based AWS tools below.

### MCP-based AWS tools (preferred — more accurate)

These tools use the AWS Pricing Calculator MCP server (`sample-aws-pricing-calculator-mcp`) for precise service selection and configuration:

- **search_services** — Search AWS services by name or keyword to find the correct service code (e.g. `amazonEC2`, `aWSLambda`).
- **get_service_fields** — Get input field IDs, types, labels, and valid options for one or more services.
- **create_estimate** — Create a new empty estimate. Returns an estimate ID.
- **add_service** — Add one or more services to an estimate with field values.
- **validate_estimate** — Dry-run preflight check before saving.
- **build_estimate** — One-shot: create estimate + add services + validate + save. Returns shareable URL.
- **export_estimate** — Save the current estimate and return a shareable URL.
- **import_estimate** — Download an existing estimate by URL or ID.

Recommended workflow: `search_services` → `get_service_fields` → `build_estimate`.

## API Server

Fastify-based HTTP server for creating AWS cost estimates programmatically.

```bash
bun run server        # Start API server (production)
bun run server:dev    # Start API server (watch mode)
```

### POST /api/estimate

Accepts an architecture description (text, JSON, or PDF) and returns the calculator link with per-service explanations.

The server processes requests in a **two-step LLM pipeline**:

1. **Extract** — sends the architecture to an LLM to identify relevant AWS services (name, quantity, description)
2. **Enrich** — sends the extracted services back to the LLM to generate `reasoning` (why each service was chosen) and `usage` (how it will be sized/configured)

This split keeps each LLM call small enough to avoid token limits.

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

For PDF uploads, the server extracts the text using `pdfjs-dist` and passes it through the two-step LLM pipeline.

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
      "reasoning": "Why this service was chosen based on the architecture requirements.",
      "usage": "How the service will be used with estimated sizing details.",
      "added": true
    }
  ],
  "summary": "This estimate includes 5 AWS service(s) totaling approximately 15 resource(s). Services added: Amazon EC2 (5 × Compute for payment microservices)..."
}
```

Each service entry includes `reasoning` (why this AWS service was selected for the architecture) and `usage` (how much and in what configuration it will be used). The `summary` provides a human-readable overview of the estimate. If services were pre-defined by the caller (skipping the LLM), `reasoning` and `usage` are omitted.

### Docker

```bash
docker build -t react-agent .
docker run -d --name react-agent -p 3000:3000 --env-file .env react-agent
```

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
