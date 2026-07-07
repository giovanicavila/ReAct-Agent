import "dotenv/config";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { IncomingMessage } from "node:http";
import { extractPdfText } from "./utils/pdf.js";
import { estimateHandler, estimateHandlerFromPdf } from "./handlers/estimate.js";

if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY environment variable is required");
if (!process.env.MODEL) throw new Error("MODEL environment variable is required");

const PORT = Number(process.env.PORT ?? 3000);

export async function main() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });

  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // ── Custom content type parsers ──────────────────────────────────────────

  async function readStream(payload: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of payload as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  app.addContentTypeParser("text/plain", async (_req: FastifyRequest, payload: IncomingMessage) => {
    const buf = await readStream(payload);
    return buf.toString("utf-8");
  });
  app.addContentTypeParser("application/pdf", async (_req: FastifyRequest, payload: IncomingMessage) => {
    return readStream(payload);
  });

  // ── Routes ───────────────────────────────────────────────────────────────

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/test-llm", async (req, reply) => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.MODEL,
          messages: [{ role: "user", content: "Say hello in one word" }],
          max_tokens: 50,
        }),
      });
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      return reply.send({ success: true, content, contentLength: content.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  app.post("/api/estimate", async (req, reply) => {
    try {
      const ct = req.headers["content-type"] ?? "";

      // Multipart form — PDF file upload
      if (ct.includes("multipart/form-data")) {
        const file = await req.file();
        if (!file) {
          return reply.status(400).send({ success: false, error: "No file uploaded" });
        }
        console.log(`[server] received PDF upload (multipart): ${file.filename}`);
        const buffer = await file.toBuffer();
        const pdfText = await extractPdfText(buffer);
        console.log(`[server] extracted ${pdfText.length} chars from PDF`);
        const data = await estimateHandlerFromPdf(pdfText);
        return reply.send(data);
      }

      // Raw PDF binary
      if (ct.includes("application/pdf")) {
        console.log(`[server] received PDF upload (raw)`);
        const pdfText = await extractPdfText(req.body as Buffer);
        console.log(`[server] extracted ${pdfText.length} chars from PDF`);
        const data = await estimateHandlerFromPdf(pdfText);
        return reply.send(data);
      }

      // JSON or plain text
      const body = req.body as string | Record<string, unknown> | unknown[];
      console.log(`[server] received payload`);
      const data = await estimateHandler(body);
      return reply.send(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[server] error:`, msg);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // ── Start ────────────────────────────────────────────────────────────────

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[server] AWS Calculator API running at http://localhost:${PORT}`);
  console.log(`[server] POST /api/estimate  - create an estimate (JSON, PDF, or multipart/form-data with PDF)`);
  console.log(`[server] GET  /health        - health check`);
}
