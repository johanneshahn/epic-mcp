import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EpicNodeClient } from './adapters/node.js';
import type { EpicWalletClient } from './adapters/wallet.js';
import type { Config } from './config.js';
import { cliText, jsonText, toolError } from './util/output.js';

export function registerResources(
  server: McpServer,
  config: Config,
  node: EpicNodeClient,
  wallet: EpicWalletClient,
): void {
  server.registerResource(
    'node-status',
    'epic://node/status',
    {
      title: 'Epic node status',
      description: 'Live status of the connected Epic node.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        return {
          contents: [
            { uri: uri.href, mimeType: 'application/json', text: jsonText(await node.getStatus(), config) },
          ],
        };
      } catch (error) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: toolError(error, config).content[0]!.text }] };
      }
    },
  );

  server.registerResource(
    'wallet-summary',
    'epic://wallet/summary',
    {
      title: 'Epic wallet summary',
      description: 'Balance summary of the configured wallet account.',
      mimeType: 'text/plain',
    },
    async (uri) => {
      try {
        return {
          contents: [{ uri: uri.href, mimeType: 'text/plain', text: cliText(await wallet.run('info'), config) }],
        };
      } catch (error) {
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: toolError(error, config).content[0]!.text }] };
      }
    },
  );

  server.registerResource(
    'server-config',
    'epic://config',
    {
      title: 'MCP server configuration',
      description: 'Non-secret configuration of this MCP server.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const { secrets: _secrets, apiSecret: _apiSecret, walletPassword: _walletPassword, ...safe } = config;
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(safe, null, 2) }],
      };
    },
  );
}
