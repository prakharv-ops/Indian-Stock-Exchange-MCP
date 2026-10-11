// Captures real tool output into docs/demo-data.js for the demo page.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ name: "demo", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: [path.join(root, "build/index.js")] }));
const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

const data = {
  capturedAt: new Date().toISOString(),
  compare: { args: { names: ["TCS", "Infosys", "Wipro"] }, result: await call("compare-stocks", { names: ["TCS", "Infosys", "Wipro"] }) },
  overview: { args: { limit: 3 }, result: await call("get-market-overview", { limit: 3 }) },
};
fs.writeFileSync(path.join(root, "docs/demo-data.js"), `window.DEMO = ${JSON.stringify(data, null, 2)};\n`);
await client.close();
console.log("captured", data.capturedAt);
