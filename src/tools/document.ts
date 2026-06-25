import { tool } from "ai";
import { z } from "zod";

/**
 * Document understanding tool.
 *
 * Strategy:
 *  - PDFs → fetch raw bytes, send as base64 to the model via a separate
 *    Anthropic/OpenAI vision call (or use a text extractor lib).
 *  - HTML pages → reuses the same "fetch + strip" logic as the browser tool
 *    but without launching a full browser (fast path for static pages).
 *  - Plain text / JSON / CSV → fetch and return as-is.
 *
 * For simplicity this implementation does a lightweight fetch + text extraction.
 * Swap the PDF branch for `pdf-parse` or Unstructured.io as needed.
 */

const TEXT_TYPES = ["text/plain", "text/csv", "application/json", "text/markdown"];
const PDF_TYPE = "application/pdf";

export const readDocumentTool = tool({
  description:
    "Extract structured text from a document URL (PDF, HTML page, plain text, CSV, JSON). Use when you need to read the full content of a specific document rather than a general web page.",
  parameters: z.object({
    url: z.string().url().describe("Direct URL to the document"),
    max_chars: z
      .number()
      .optional()
      .default(6000)
      .describe("Maximum characters to return"),
  }),
  execute: async ({ url, max_chars }) => {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 ReAct-Agent/1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    // ── Plain text / JSON / CSV ──────────────────────────────────────────
    if (TEXT_TYPES.some((t) => contentType.includes(t))) {
      const text = await response.text();
      return {
        type: contentType,
        content: text.slice(0, max_chars),
        truncated: text.length > max_chars,
      };
    }

    // ── HTML page (lightweight, no JS execution) ─────────────────────────
    if (contentType.includes("text/html")) {
      const html = await response.text();
      // Strip tags naively — good enough for static pages
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      return {
        type: "html",
        content: text.slice(0, max_chars),
        truncated: text.length > max_chars,
      };
    }

    // ── PDF ──────────────────────────────────────────────────────────────
    if (contentType.includes(PDF_TYPE)) {
      // Lightweight approach: return base64 so the caller can pass it to a
      // vision-capable model. For a real pipeline, use `pdf-parse` instead:
      //   import pdfParse from "pdf-parse";
      //   const buffer = Buffer.from(await response.arrayBuffer());
      //   const { text } = await pdfParse(buffer);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return {
        type: "pdf",
        note: "PDF returned as base64. Pass this to a vision model or a PDF parser.",
        base64: base64.slice(0, 50_000), // ~37KB of raw PDF
        truncated: base64.length > 50_000,
      };
    }

    throw new Error(
      `Unsupported content type: ${contentType}. Use the browse tool for complex pages.`
    );
  },
});
