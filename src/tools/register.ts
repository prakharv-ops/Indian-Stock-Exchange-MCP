import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../client.js";

export interface Context {
  api: ApiClient;
}

const MAX_CHARS = 100_000;

export function textResult(data: unknown) {
  let text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + `\n… truncated (${text.length - MAX_CHARS} more characters). Use a narrower request.`;
  }
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(toolName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `${toolName} failed: ${message}` }],
    isError: true as const,
  };
}

interface ToolSpec<S extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

/** Registers a read-only tool with uniform annotations, error handling and output shaping. */
export function defineTool<S extends z.ZodRawShape>(server: McpServer, spec: ToolSpec<S>) {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        return textResult(await spec.handler(args));
      } catch (error) {
        console.error(`[${spec.name}]`, error instanceof Error ? error.message : error);
        return errorResult(spec.name, error);
      }
    }) as any,
  );
}

export const stockName = (example = "Reliance Industries") =>
  z.string().min(1).describe(`Company name or NSE symbol (e.g. '${example}')`);

export const exchange = z.enum(["NSE", "BSE"]).default("NSE").describe("Exchange");

export const limitArg = (max: number, def: number) =>
  z.number().int().min(1).max(max).default(def).describe(`Maximum items to return (1-${max})`);
