import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// EPIC_MCP_CHAIN is intentionally set to prove it is ignored.
const env = { ...process.env, EPIC_MCP_CHAIN: 'floonet' };
delete env.EPIC_MCP_NODE_URL;
delete env.EPIC_MCP_NODE_CONFIG;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  env,
  stderr: 'pipe',
});

const client = new Client({ name: 'epic-mcp-smoke', version: '0.0.0' });
await client.connect(transport);

const [tools, prompts, resources] = await Promise.all([
  client.listTools(),
  client.listPrompts(),
  client.listResources(),
]);

console.log(`tools: ${tools.tools.length}`);
console.log(`prompts: ${prompts.prompts.length}`);
console.log(`resources: ${resources.resources.length}`);
console.log(`tool names: ${tools.tools.map((tool) => tool.name).sort().join(', ')}`);

const configResource = await client.readResource({ uri: 'epic://config' });
const config = JSON.parse(configResource.contents[0].text);
if (config.chain !== 'mainnet' || 'walletPassword' in config) {
  throw new Error('epic://config returned unexpected content');
}
console.log('resource epic://config: ok (no secrets)');

await client.close();
