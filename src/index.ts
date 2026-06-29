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
import { SYSTEM_PROMPT } from "../prompts/system.js";

// ── Types ────────────────────────────────────────────────────────────────────

type Message = { role: "user" | "assistant"; content: string };

// ── Agent config ─────────────────────────────────────────────────────────────

const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 5);

const model = provider(MODEL);

const tools = {
  search: searchTool,
  browse: browseTool,
  read_document: readDocumentTool,
  aws_calculator: awsCalculatorTool,
};

// ── Core: single agent turn ───────────────────────────────────────────────────

async function runAgent(
  userMessage: string,
  history: Message[] = []
): Promise<string> {
  const messages: Message[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools,
    maxSteps: MAX_STEPS,
    maxTokens: Number(process.env.MAX_TOKENS ?? 1024),
    onStepFinish({ stepType, toolCalls, toolResults, text }) {
      // Pretty-print each step so you can watch the reasoning
      if (stepType === "tool-result") {
        for (const call of toolCalls ?? []) {
          console.log(
            `\n🔧 [${call.toolName}]`,
            JSON.stringify(call.args, null, 2)
          );
        }
        for (const result of toolResults ?? []) {
          const preview = JSON.stringify(result.result).slice(0, 300);
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
  const { main: serverMain } = await import("./server.js");
  serverMain();
} else {
  main();
}
