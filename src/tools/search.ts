import { tool } from "ai";
import { z } from "zod";

export const searchTool = tool({
  description:
    "Search the web for current information. Use this for factual questions, recent events, or documentation lookups.",
  parameters: z.object({
    query: z.string().describe("The search query"),
    max_results: z
      .number()
      .optional()
      .default(5)
      .describe("Max number of results to return"),
  }),
  execute: async ({ query, max_results }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY not set in environment");

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!res.ok) throw new Error(`Tavily error: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as {
      answer?: string;
      results: Array<{ title: string; url: string; content: string; score: number }>;
    };

    return {
      answer: data.answer,
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 500),
        score: r.score,
      })),
    };
  },
});
