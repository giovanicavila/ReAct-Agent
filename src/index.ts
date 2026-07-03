import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const provider = process.env.OPENAI_BASE_URL
  ? createOpenAI({ baseURL: process.env.OPENAI_BASE_URL })
  : createOpenAI();

import { searchTool } from "./tools/search.js";
import { browseTool } from "./tools/browser.js";
import { readDocumentTool } from "./tools/document.js";
import { awsCalculatorTool } from "./tools/aws-calculator/index.js";
import { getMcpTools } from "./tools/aws-calculator-mcp/index.js";
import { SYSTEM_PROMPT } from "../prompts/system.js";
// ── Types ────────────────────────────────────────────────────────────────────

type Message = { role: "user" | "assistant"; content: string };

// ── Agent config ─────────────────────────────────────────────────────────────

const MODEL = process.env.MODEL;
if (!MODEL) throw new Error("MODEL environment variable is required");
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 5);

const model = provider(MODEL);

const BASE_TOOLS = {
  search: searchTool,
  browse: browseTool,
  read_document: readDocumentTool,
  aws_calculator: awsCalculatorTool,
};

let tools: Record<string, unknown> = BASE_TOOLS;

async function ensureMcpTools() {
  if (tools !== BASE_TOOLS) return;
  try {
    const mcpTools = await getMcpTools();
    tools = { ...BASE_TOOLS, ...mcpTools };
    console.log("  AWS Pricing Calculator MCP tools ready");
  } catch (err) {
    console.warn("  AWS MCP tools unavailable (run `npx -y sample-aws-pricing-calculator-mcp@latest` to test):", (err as Error).message);
  }
}

// ── Core: single agent turn ───────────────────────────────────────────────────

async function runAgent(
  userMessage: string,
  history: Message[] = [],
  agentTools: Record<string, unknown> = tools
): Promise<string> {
  const messages: Message[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: agentTools as any,
    maxSteps: MAX_STEPS,
    maxTokens: Number(process.env.MAX_TOKENS ?? 1024),
    onStepFinish({ stepType, toolCalls, toolResults, text }: any) {
      if (stepType === "tool-result") {
        for (const call of toolCalls ?? []) {
          console.log(
            `\n🔧 [${call.toolName}]`,
            JSON.stringify(call.args, null, 2)
          );
        }
        for (const tr of toolResults ?? []) {
          const preview = JSON.stringify(tr.result).slice(0, 300);
          console.log(`📥 result preview: ${preview}…`);
        }
      }
      if (text) {
        process.stdout.write(`\n💭 ${text}\n`);
      }
    },
  });

  return result.text;
}

// ── CLI chat loop ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🤖 ReAct Agent initializing…");
  await ensureMcpTools();
  console.log("🤖 ReAct Agent ready. Type your question (ctrl+c to quit)\n");

  const rl = readline.createInterface({ input, output });
  const history: Message[] = [];

  while (true) {
    const userInput = await rl.question("You: ").catch(() => null);
    if (userInput === null || userInput.trim() === "") break;

    console.log("\n🤔 Thinking…\n");

    try {
      const response = await runAgent(userInput, history);

      // Persist turn in history for multi-turn context
      history.push({ role: "user", content: userInput });
      history.push({ role: "assistant", content: response });

      console.log(`\n🤖 Agent: ${response}\n`);
    } catch (err) {
      console.error("❌ Agent error:", err);
    }
  }

  rl.close();
}

if (process.argv.includes("--server")) {
  // Start HTTP server instead of CLI
  console.log("🤖 ReAct Agent initializing…");
  await ensureMcpTools();
  const { main: serverMain } = await import("./server/index.js");
  serverMain();
} else {
  main();
}
