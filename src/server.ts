import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import Busboy from "busboy";
import type { Readable } from "node:stream";

const provider = process.env.OPENAI_BASE_URL
  ? createOpenAI({ baseURL: process.env.OPENAI_BASE_URL })
  : createOpenAI();

import { awsCalculatorTool } from "./tools/aws-calculator.js";

const PORT = Number(process.env.PORT ?? 3000);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";

const model = provider(MODEL);

const ESTIMATE_SYSTEM_PROMPT = `You are an AWS Solutions Architect. Your task is to analyze an architecture description and output a comprehensive list of AWS services needed.

IMPORTANT: Be COMPREHENSIVE. Think through ALL layers:
- Compute (EC2, ECS, EKS, Lambda)
- Networking (ALB, NAT Gateway, VPC, CloudFront, Route 53, WAF, Shield)
- Storage (S3, EBS, EFS, S3 Glacier)
- Databases (RDS, Aurora, DynamoDB, ElastiCache, OpenSearch)
- Messaging (SQS, SNS, EventBridge, MQ, MSK)
- Security (IAM, KMS, Secrets Manager, GuardDuty, Security Hub, Cognito)
- Monitoring (CloudWatch, X-Ray, CloudTrail, Config)
- CI/CD (CodePipeline, CodeBuild, CodeDeploy, ECR, CodeCommit)
- Migration (DMS, Migration Hub)
- Management (Systems Manager, Organizations, Control Tower)

Rules:
- Use FULL official AWS names (e.g. "Amazon EC2" not "EC2")
- Extract ALL services relevant to the architecture
- Use reasonable defaults (1 instance unless specified)

Output your answer as a JSON array inside a fenced code block \`\`\`json ... \`\`\`. Example:
\`\`\`json
[
  { "serviceName": "Amazon EC2", "quantity": 3, "description": "Compute for microservices" },
  { "serviceName": "Amazon RDS for PostgreSQL", "quantity": 1, "description": "Main database" }
]
\`\`\`

Only output the JSON array. No extra text before or after.`;

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

// ── Binary body reading ─────────────────────────────────────────────────────

function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Multipart form parser (PDF upload) ──────────────────────────────────────

function parseMultipartForm(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let pdfBuffer: Buffer | null = null;

    busboy.on("file", (fieldname: string, file: Readable, filename: string, encoding: string, mimetype: string) => {
      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (
          !pdfBuffer &&
          (mimetype === "application/pdf" || buffer.slice(0, 5).toString() === "%PDF-")
        ) {
          pdfBuffer = buffer;
        }
      });
    });

    busboy.on("finish", () => {
      if (pdfBuffer && pdfBuffer.length > 0) {
        resolve(pdfBuffer);
      } else {
        reject(new Error("No PDF file found in upload. Ensure the file has a .pdf extension."));
      }
    });

    busboy.on("error", reject);
    req.pipe(busboy);
  });
}

// ── PDF text extraction ─────────────────────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    useSystemFonts: true,
  } as any);
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => (item as { str: string }).str).join(" ");
    pages.push(pageText);
  }

  const text = pages.join("\n").trim();
  if (!text) {
    throw new Error("No text could be extracted from the PDF. The PDF may be scanned or image-based.");
  }
  return text;
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

  // Run the LLM to extract services as JSON
  const result = await generateText({
    model,
    system: ESTIMATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: architecture }],
    maxTokens: Number(process.env.MAX_TOKENS ?? 4096),
  });

  // Parse JSON from the response
  const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : result.text.trim();
  let parsed: Array<{ serviceName: string; quantity?: number; description?: string }>;
  try {
    parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error("Not an array");
  } catch {
    return {
      success: false,
      url: null,
      services: [],
      message: `Failed to parse service list from LLM response: ${result.text.slice(0, 500)}`,
      error: "JSON parse error",
    };
  }

  if (parsed.length === 0) {
    return {
      success: false,
      url: null,
      services: [],
      message: "LLM returned no services",
    };
  }

  console.log(`[server] extracted ${parsed.length} services from LLM response`);

  // Call the calculator tool directly
  const toolResult = await awsCalculatorTool.execute({
    services: parsed.map((s) => ({
      serviceName: s.serviceName,
      quantity: s.quantity ?? 1,
      description: s.description,
    })),
    region: "US East (Ohio)",
    title: "Architecture Estimate",
  }, {} as any);

  return toolResult;
}

async function estimateHandlerFromPdf(pdfText: string): Promise<object> {
  const architecture = `The following architecture description was extracted from a PDF document. Identify the AWS services needed and create an estimate.\n\n${pdfText}`;

  const result = await generateText({
    model,
    system: ESTIMATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: architecture }],
    maxTokens: Number(process.env.MAX_TOKENS ?? 4096),
  });

  // Parse JSON from the response
  const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : result.text.trim();
  let parsed: Array<{ serviceName: string; quantity?: number; description?: string }>;
  try {
    parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error("Not an array");
  } catch {
    return {
      success: false,
      url: null,
      services: [],
      message: `Failed to parse service list from LLM response: ${result.text.slice(0, 500)}`,
      error: "JSON parse error",
    };
  }

  if (parsed.length === 0) {
    return {
      success: false,
      url: null,
      services: [],
      message: "LLM returned no services",
    };
  }

  console.log(`[server] extracted ${parsed.length} services from LLM response`);

  const toolResult = await awsCalculatorTool.execute({
    services: parsed.map((s) => ({
      serviceName: s.serviceName,
      quantity: s.quantity ?? 1,
      description: s.description,
    })),
    region: "US East (Ohio)",
    title: "Architecture Estimate",
  }, {} as any);

  return toolResult;
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
        const contentType = req.headers["content-type"] ?? "";
        let data: object;

        if (contentType.includes("multipart/form-data")) {
          console.log(`[server] received PDF upload (multipart)`);
          const pdfBuffer = await parseMultipartForm(req);
          const pdfText = await extractPdfText(pdfBuffer);
          console.log(`[server] extracted ${pdfText.length} chars from PDF`);
          data = await estimateHandlerFromPdf(pdfText);
        } else if (contentType.includes("application/pdf")) {
          console.log(`[server] received PDF upload (raw)`);
          const buffer = await readBodyBuffer(req);
          const pdfText = await extractPdfText(buffer);
          console.log(`[server] extracted ${pdfText.length} chars from PDF`);
          data = await estimateHandlerFromPdf(pdfText);
        } else {
          const body = await readBody(req);
          console.log(`[server] received architecture description (${body.length} chars)`);
          data = await estimateHandler(body);
        }

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
    console.log(`[server] POST /api/estimate  - create an estimate (JSON, PDF, or multipart/form-data with PDF)`);
    console.log(`[server] GET  /health        - health check`);
  });
}

// Allow direct execution: npx tsx src/server.ts
const isMain = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isMain) {
  main();
}
