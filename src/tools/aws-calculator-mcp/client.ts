import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client | null = null;
let transport: StdioClientTransport | null = null;

export async function getMcpClient(): Promise<Client> {
  if (client) return client;

  transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "sample-aws-pricing-calculator-mcp@latest"],
  });

  client = new Client(
    { name: "react-agent", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  return client;
}

export async function closeMcpClient(): Promise<void> {
  if (transport) {
    await transport.close();
    transport = null;
  }
  client = null;
}
