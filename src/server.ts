import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const provider = process.env.OPENAI_BASE_URL
  ? createOpenAI({ baseURL: process.env.OPENAI_BASE_URL })
  : createOpenAI();

import { awsCalculatorTool } from "./tools/aws-calculator.js";
import { searchTool } from "./tools/search.js";

const PORT = Number(process.env.PORT ?? 3000);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 5);

const model = provider(MODEL);

const tools = {
  search: searchTool,
  aws_calculator: awsCalculatorTool,
};

const ESTIMATE_SYSTEM_PROMPT = `You estimate AWS architecture costs. Given an architecture description, identify the AWS services needed and call \`aws_calculator\`.

Rules:
- Use full official AWS names (e.g. "Amazon EC2" not "EC2")
- If input is JSON, extract services/config; if free text, interpret it
- Use reasonable defaults (1 instance unless specified)
- Call \`aws_calculator\` with the services to create the estimate
- Present the returned URL prominently`;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

async function estimateHandler(body: string): Promise<object> {
  let architecture: string;
  let services: Array<{ serviceName: string; quantity: number; description?: string }> | null = null;

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      services = parsed.map((s: any) => ({
        serviceName: s.serviceName ?? s.name,
        quantity: s.quantity ?? 1,
        description: s.description,
      }));
      architecture = JSON.stringify(parsed);
    } else if (parsed.architecture) {
      architecture =
        typeof parsed.architecture === "string"
          ? parsed.architecture
          : JSON.stringify(parsed.architecture);
      if (parsed.services) {
        services = parsed.services.map((s: any) => ({
          serviceName: s.serviceName ?? s.name,
          quantity: s.quantity ?? 1,
          description: s.description,
        }));
      }
    } else if (parsed.services) {
      // Handle { services: [...] } at root level
      services = parsed.services.map((s: any) => ({
        serviceName: s.serviceName ?? s.name,
        quantity: s.quantity ?? 1,
        description: s.description,
      }));
      architecture = JSON.stringify(parsed);
    } else {
      architecture = JSON.stringify(parsed);
    }
  } catch {
    architecture = body;
  }

  // If services are explicitly provided, skip LLM and go straight to the calculator
  if (services && services.length > 0) {
    const result = await awsCalculatorTool.execute({
      services,
      region: "US East (Ohio)",
      title: "Architecture Estimate",
    }, {} as any);
    return result;
  }

  // Otherwise, run the agent to analyze the architecture
  const result = await generateText({
    model,
    system: ESTIMATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: architecture }],
    tools,
    maxSteps: MAX_STEPS,
    maxTokens: Number(process.env.MAX_TOKENS ?? 1024),
    onStepFinish({ stepType, toolCalls, text }) {
      if (text) console.log(`[agent] ${text}`);
      for (const call of toolCalls ?? []) {
        console.log(`[agent] calling ${call.toolName}`);
      }
    },
  });

  // Look through all steps for the aws_calculator tool result
  for (const step of result.steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      if (tr.toolName === "aws_calculator") {
        return tr.result as object;
      }
    }
  }

  // Fallback: return the agent's text response
  return {
    success: true,
    message: result.text,
    url: null,
  };
}

export async function main() {
  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "POST" && req.url === "/api/estimate") {
      try {
        const body = await readBody(req);
        console.log(`[server] received architecture description (${body.length} chars)`);

        const data = await estimateHandler(body);

        sendJson(res, 200, data);
        console.log(`[server] response sent`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[server] error:`, msg);
        sendJson(res, 500, { success: false, error: msg });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  server.listen(PORT, () => {
    console.log(`[server] AWS Calculator API running at http://localhost:${PORT}`);
    console.log(`[server] POST /api/estimate  - create an estimate from architecture description`);
    console.log(`[server] GET  /health        - health check`);
  });
}

// Allow direct execution: npx tsx src/server.ts
const isMain = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isMain) {
  main();
}
