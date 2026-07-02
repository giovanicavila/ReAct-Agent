import "dotenv/config";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createOpenAI } from "@ai-sdk/openai";
import type { IncomingMessage } from "node:http";
import { extractPdfText } from "./utils/pdf.js";
import { estimateHandler, estimateHandlerFromPdf } from "./handlers/estimate.js";

const provider = process.env.OPENAI_BASE_URL
  ? createOpenAI({ baseURL: process.env.OPENAI_BASE_URL } as any)
  : createOpenAI({} as any);

const PORT = Number(process.env.PORT ?? 3000);
const MODEL = process.env.MODEL;
if (!MODEL) throw new Error("MODEL environment variable is required");
const model = provider(MODEL);

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
        const data = await estimateHandlerFromPdf(pdfText, model);
        return reply.send(data);
      }

      // Raw PDF binary
      if (ct.includes("application/pdf")) {
        console.log(`[server] received PDF upload (raw)`);
        const pdfText = await extractPdfText(req.body as Buffer);
        console.log(`[server] extracted ${pdfText.length} chars from PDF`);
        const data = await estimateHandlerFromPdf(pdfText, model);
        return reply.send(data);
      }

      // JSON or plain text
      const body = req.body as string | Record<string, unknown> | unknown[];
      console.log(`[server] received payload`);
      const data = await estimateHandler(body, model);
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
