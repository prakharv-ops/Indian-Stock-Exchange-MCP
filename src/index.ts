#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClient } from "./client.js";
import { createServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../src/.env") });
dotenv.config();

const api = new ApiClient({
  apiKey: process.env.ISE_API_KEY ?? "",
  cacheTtlMs: Number(process.env.ISE_CACHE_TTL_MS ?? 60_000),
});

async function runStdio() {
  await createServer(api).connect(new StdioServerTransport());
  console.error("Indian Stock Exchange MCP server running on stdio");
}

/** Stateless Streamable HTTP: a fresh server + transport per request. */
async function runHttp(port: number) {
  const host = process.env.HOST ?? "127.0.0.1";
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end("Not found");
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" }).end("Method not allowed");
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString() || "null");

      const server = createServer(api);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      console.error("HTTP request failed:", error);
      if (!res.headersSent) res.writeHead(400).end("Bad request");
    }
  });
  httpServer.listen(port, host, () =>
    console.error(`Indian Stock Exchange MCP server listening on http://${host}:${port}/mcp`),
  );
}

async function main() {
  const flag = process.argv.indexOf("--http");
  if (flag === -1) return runStdio();
  const port = Number(process.argv[flag + 1] ?? process.env.PORT ?? 3000);
  return runHttp(port);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
