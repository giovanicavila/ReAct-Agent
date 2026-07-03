import { tool } from "ai";
import { z } from "zod";
import { getMcpClient } from "./client.js";

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  if (schema.type === "array") {
    const items = schema.items as Record<string, unknown> | undefined;
    return z.array(items ? jsonSchemaToZod(items) : z.any());
  }
  if (schema.type === "number" || schema.type === "integer") return z.number();
  if (schema.type === "boolean") return z.boolean();
  if (schema.type === "object") {
    const props = schema.properties as Record<string, unknown> | undefined;
    if (!props) return z.record(z.any());
    const shape: Record<string, z.ZodType> = {};
    const required = new Set<string>(
      Array.isArray(schema.required) ? schema.required : []
    );
    for (const [key, prop] of Object.entries(props)) {
      const zodType = jsonSchemaToZod(prop as Record<string, unknown>);
      shape[key] = required.has(key) ? zodType : zodType.optional();
    }
    return z.object(shape);
  }
  return z.string();
}

type WrappedTools = Record<string, ReturnType<typeof tool>>;

let cachedTools: WrappedTools | null = null;
let mcpClient: Awaited<ReturnType<typeof getMcpClient>> | null = null;

export async function getMcpTools(): Promise<WrappedTools> {
  if (cachedTools) return cachedTools;

  mcpClient = await getMcpClient();
  const { tools: mcpToolDefs } = await mcpClient.listTools();

  const wrapped: WrappedTools = {};

  for (const def of mcpToolDefs) {
    const inputSchema = (def.inputSchema ?? {}) as Record<string, unknown>;
    const props = inputSchema.properties as Record<string, unknown> | undefined;
    const required = new Set<string>(
      Array.isArray(inputSchema.required) ? inputSchema.required : []
    );
    const shape: Record<string, z.ZodType> = {};
    if (props) {
      for (const [key, prop] of Object.entries(props)) {
        const zodType = jsonSchemaToZod(prop as Record<string, unknown>);
        shape[key] = required.has(key) ? zodType : zodType.optional();
      }
    }

    const t = tool({
      description: def.description ?? "",
      parameters: z.object(shape),
      execute: async (args: Record<string, unknown>) => {
        const result = await mcpClient!.callTool({
          name: def.name,
          arguments: args,
        });
        const content = result.content as Array<{ type: string; text?: string }>;
        return content.map((c) => c.text ?? JSON.stringify(c)).join("\n") as unknown;
      },
    });
    wrapped[def.name] = t as unknown as WrappedTools[string];
  }

  if (wrapped["build_estimate"]) {
    const alias = tool({
      description: `One-shot AWS cost estimate via MCP. Provide services as { serviceCode, quantity, fields? }. Use search_services + get_service_fields first to discover service codes and field IDs.`,
      parameters: z.object({
        services: z.array(z.object({
          serviceCode: z.string(),
          quantity: z.number().optional().default(1),
          description: z.string().optional(),
          fields: z.record(z.any()).optional(),
        })).min(1),
        region: z.string().optional().default("US East (Ohio)"),
        title: z.string().optional().default("Architecture Estimate"),
      }),
      execute: async (args) => {
        const { services, region, title } = args as {
          services: Array<{ serviceCode: string; quantity?: number; description?: string; fields?: Record<string, unknown> }>;
          region?: string;
          title?: string;
        };
        const mcpServices = services.map((svc) => ({
          service: svc.serviceCode,
          config: {
            region: region ?? "US East (Ohio)",
            ...(svc.description ? { description: svc.description } : {}),
            ...(svc.fields ?? {}),
          },
        }));
        const result = await mcpClient!.callTool({
          name: "build_estimate",
          arguments: {
            services: JSON.stringify(mcpServices),
            name: title ?? "Architecture Estimate",
            partition: "aws",
          },
        });
        const content = result.content as Array<{ type: string; text?: string }>;
        return content.map((c) => c.text ?? JSON.stringify(c)).join("\n") as unknown;
      },
    });
    wrapped["aws_calculator"] = alias as unknown as WrappedTools[string];
  }

  cachedTools = wrapped;
  return cachedTools;
}
