import { awsCalculatorTool } from "../../tools/aws-calculator/index.js";

const API_BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

async function callLLM(system: string, userMessage: string, maxTokens: number): Promise<string> {
  const model = process.env.MODEL || "gpt-4o-mini";
  const body = {
    model,
    messages: [
      { role: "user", content: `${system}\n\n${userMessage}` },
    ],
    max_tokens: maxTokens,
  };

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (content) {
    console.log(`[server] LLM response OK, length: ${content.length}`);
  } else {
    console.log(`[server] LLM response EMPTY or ERROR. Full data:`, JSON.stringify(data).slice(0, 1000));
  }
  return content ?? "";
}

const EXTRACT_PROMPT = `You are an AWS Solutions Architect. Analyze an architecture description and output a comprehensive list of AWS services needed.

Cover all layers: Compute, Networking, Storage, Databases, Messaging, Security, Monitoring, CI/CD.

Rules:
- Use FULL official AWS names (e.g. "Amazon EC2" not "EC2")
- Include ALL services relevant to the architecture
- Use reasonable defaults (1 instance unless specified)

Output ONLY a JSON array inside \`\`\`json ... \`\`\` with each entry having "serviceName", "quantity", and "description". No extra text.

Example:
\`\`\`json
[
  { "serviceName": "Amazon EC2", "quantity": 5, "description": "Compute for microservices" },
  { "serviceName": "Amazon RDS for PostgreSQL", "quantity": 2, "description": "Main transactional database" }
]
\`\`\``;

const ENRICH_PROMPT = `You are an AWS Solutions Architect. Explain why each service was chosen and how it will be used.

For each service in the list, provide:
  - "reasoning": Why this service was selected (1 sentence, tied to business requirements)
  - "usage": How it will be used with estimated sizing (1 sentence)

Output ONLY a JSON array inside \`\`\`json ... \`\`\`. Example:
\`\`\`json
[
  { "serviceName": "Amazon EC2", "reasoning": "EC2 chosen for long-running stateful workloads.", "usage": "5 t3.large instances, auto-scaling to 10 during peak." }
]
\`\`\``;

type ServiceEntry = { serviceName: string; quantity: number; description?: string };

interface ServiceExplanation {
  serviceName: string;
  quantity: number;
  description?: string;
  reasoning?: string;
  usage?: string;
}

function defaultServices(raw: any[]): ServiceEntry[] {
  return raw.map((s: any) => ({
    serviceName: s.serviceName ?? s.name,
    quantity: s.quantity ?? 1,
    description: s.description,
  }));
}

function extractServices(jsonStr: string): any[] | null {
  let raw = jsonStr.trim();
  const openIdx = raw.indexOf("```json");
  const closeIdx = raw.lastIndexOf("```");
  if (openIdx !== -1) {
    const start = openIdx + 7;
    const end = closeIdx > openIdx ? closeIdx : raw.length;
    raw = raw.slice(start, end).trim();
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildResponse(
  toolResult: any,
  enriched: Map<string, ServiceExplanation>,
  summary: string,
): object {
  const addedNames = new Set(
    (toolResult.services as string[]).map((s: string) => s.replace(/\s*\(.*?\)\s*$/, "")),
  );

  const services = [...enriched.entries()].map(([name, exp]) => ({
    name,
    quantity: exp.quantity ?? 1,
    description: exp.description,
    reasoning: exp.reasoning,
    usage: exp.usage,
    added: addedNames.has(name),
  }));

  return {
    success: toolResult.success ?? true,
    url: toolResult.url,
    title: toolResult.title,
    region: toolResult.region,
    services,
    summary,
    message: toolResult.message,
  };
}

function generateSummary(services: { name: string; quantity: number; added: boolean }[]): string {
  const added = services.filter((s) => s.added);
  const totalInstances = added.reduce((acc, s) => acc + s.quantity, 0);
  const parts = [`This estimate includes ${added.length} AWS service(s) totaling approximately ${totalInstances} resource(s).`];
  if (added.length) {
    parts.push(`Services added: ${added.map((s) => `${s.name} (${s.quantity})`).join(", ")}.`);
  }
  return parts.join(" ");
}

async function extractServicesFromLLM(architecture: string) {
  const maxTokens = Number(process.env.MAX_TOKENS ?? 4096);
  console.log(`[server] LLM extract call — maxTokens: ${maxTokens}, architecture length: ${architecture.length}`);
  const raw = await callLLM(EXTRACT_PROMPT, architecture, maxTokens);
  console.log(`[server] LLM extract response length: ${raw.length}`);

  if (!raw.trim()) {
    return {
      error: "LLM returned empty response. The model may be overloaded or the input is too long.",
    };
  }

  const extracted = extractServices(raw);
  if (!extracted) {
    return {
      error: `Failed to parse service list. Raw (${raw.length} chars): ${raw.slice(0, 300)}`,
    };
  }
  return { services: defaultServices(extracted), raw: extracted };
}

async function enrichServices(
  services: any[],
  architecture: string,
): Promise<{ serviceName: string; reasoning?: string; usage?: string }[]> {
  const serviceNames = services.map((s) => s.serviceName).join(", ");
  const userMessage = `Architecture: ${architecture.slice(0, 1000)}\n\nExplain these services: ${serviceNames}`;
  const raw = await callLLM(ENRICH_PROMPT, userMessage, Number(process.env.MAX_TOKENS ?? 4096));
  console.log(`[server] LLM enrich response length: ${raw.length}`);

  if (!raw.trim()) {
    console.warn("[server] enrich returned empty, skipping explanations");
    return [];
  }

  const enriched = extractServices(raw);
  if (!enriched) return [];
  return enriched;
}

export async function estimateHandler(
  body: string | Record<string, unknown> | unknown[],
): Promise<object> {
  console.log(`[server] estimateHandler body type: ${typeof body}, isArray: ${Array.isArray(body)}`);

  let architecture: string;
  let services: ServiceEntry[] | null = null;

  if (typeof body === "string") {
    architecture = body;
  } else if (Array.isArray(body)) {
    services = defaultServices(body);
    architecture = JSON.stringify(body);
  } else {
    if (body.services && Array.isArray(body.services)) {
      services = defaultServices(body.services as any[]);
    }
    architecture = typeof body.architecture === "string" ? body.architecture : JSON.stringify(body);
  }

  console.log(`[server] architecture length: ${architecture.length}, services pre-defined: ${services?.length ?? 0}`);

  if (services && services.length > 0) {
    const toolResult = await awsCalculatorTool.execute({
      services,
      region: "US East (Ohio)",
      title: "Architecture Estimate",
    }, {} as any);

    return {
      ...toolResult,
      services: services.map((s) => ({ name: s.serviceName, quantity: s.quantity, description: s.description })),
      summary: `Estimate created with ${services.length} pre-defined service(s).`,
    };
  }

  // Step 1: extract services from LLM
  const extracted = await extractServicesFromLLM(architecture);
  if ("error" in extracted) {
    return { success: false, url: null, services: [], message: extracted.error, error: "JSON parse error" };
  }
  if (extracted.services.length === 0) {
    return { success: false, url: null, services: [], message: "LLM returned no services" };
  }

  console.log(`[server] extracted ${extracted.services.length} services from LLM`);

  // Step 2: enrich with reasoning/usage
  const enriched = await enrichServices(extracted.raw, architecture);
  console.log(`[server] enriched ${enriched.length} services with explanations`);

  // Step 3: merge enrichments into a map keyed by serviceName
  const enrichedMap = new Map<string, ServiceExplanation>();
  for (const s of extracted.raw) {
    enrichedMap.set(s.serviceName, {
      serviceName: s.serviceName,
      quantity: s.quantity ?? 1,
      description: s.description,
      reasoning: undefined,
      usage: undefined,
    });
  }
  for (const s of enriched) {
    const existing = enrichedMap.get(s.serviceName);
    if (existing) {
      existing.reasoning = s.reasoning;
      existing.usage = s.usage;
    }
  }

  // Step 4: execute calculator
  const toolResult = await awsCalculatorTool.execute({
    services: extracted.services,
    region: "US East (Ohio)",
    title: "Architecture Estimate",
  }, {} as any);

  const summary = generateSummary([...enrichedMap.entries()].map(([name, exp]) => ({
    name, quantity: exp.quantity ?? 1, added: true,
  })));

  return buildResponse(toolResult, enrichedMap, summary);
}

export async function estimateHandlerFromPdf(pdfText: string): Promise<object> {
  const architecture = `The following architecture description was extracted from a PDF document. Identify the AWS services needed and create an estimate.\n\n${pdfText}`;

  // Step 1: extract services
  const extracted = await extractServicesFromLLM(architecture);
  if ("error" in extracted) {
    return { success: false, url: null, services: [], message: extracted.error, error: "JSON parse error" };
  }
  if (extracted.services.length === 0) {
    return { success: false, url: null, services: [], message: "LLM returned no services" };
  }

  console.log(`[server] extracted ${extracted.services.length} services from LLM`);

  // Step 2: enrich
  const enriched = await enrichServices(extracted.raw, architecture);
  console.log(`[server] enriched ${enriched.length} services with explanations`);

  const enrichedMap = new Map<string, ServiceExplanation>();
  for (const s of extracted.raw) {
    enrichedMap.set(s.serviceName, {
      serviceName: s.serviceName,
      quantity: s.quantity ?? 1,
      description: s.description,
      reasoning: undefined,
      usage: undefined,
    });
  }
  for (const s of enriched) {
    const existing = enrichedMap.get(s.serviceName);
    if (existing) {
      existing.reasoning = s.reasoning;
      existing.usage = s.usage;
    }
  }

  const toolResult = await awsCalculatorTool.execute({
    services: extracted.services,
    region: "US East (Ohio)",
    title: "Architecture Estimate",
  }, {} as any);

  const summary = generateSummary([...enrichedMap.entries()].map(([name, exp]) => ({
    name, quantity: exp.quantity ?? 1, added: true,
  })));

  return buildResponse(toolResult, enrichedMap, summary);
}
