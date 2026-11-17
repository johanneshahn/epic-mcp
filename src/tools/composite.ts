import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { EpicNodeClient } from '../adapters/node.js';
import type { EpicWalletClient } from '../adapters/wallet.js';
import type { Config } from '../config.js';
import { cliText, jsonText } from '../util/output.js';
import { addTool, NETWORK_READ, READ } from './shared.js';

/** High-level bundled tools: fewer round-trips for an LLM. */
export function registerCompositeTools(
  server: McpServer,
  config: Config,
  node: EpicNodeClient,
  wallet: EpicWalletClient,
): void {
  addTool(
    server,
    config,
    'epic_health_check',
    {
      title: 'Epic health check',
      description:
        'Bundles node status, version, tip, pool sizes and peer count into one response. ' +
        'Individual failures are reported per section instead of failing the whole call.',
      annotations: NETWORK_READ,
    },
    { includeWallet: z.boolean().optional().describe('Also include wallet info') },
    async ({ includeWallet }) => {
      const sections: Record<string, unknown> = {};
      const results = await Promise.allSettled([
        node.getStatus(),
        node.getVersion(),
        node.getTip(),
        node.getPoolSize(),
        node.getStemPoolSize(),
        node.getConnectedPeers(),
        includeWallet ? wallet.run('info') : Promise.resolve(undefined),
      ]);
      const keys = ['status', 'version', 'tip', 'poolSize', 'stempoolSize', 'peers'];
      results.slice(0, 6).forEach((result, index) => {
        const key = keys[index]!;
        sections[key] =
          result.status === 'fulfilled'
            ? result.value
            : { error: String(result.reason instanceof Error ? result.reason.message : result.reason) };
      });
      const walletResult = results[6];
      if (walletResult?.status === 'fulfilled' && walletResult.value) {
        sections.wallet = cliText(walletResult.value, config);
      } else if (walletResult?.status === 'rejected') {
        sections.wallet = {
          error: String(
            walletResult.reason instanceof Error
              ? walletResult.reason.message
              : walletResult.reason,
          ),
        };
      }
      return jsonText(sections, config);
    },
  );

  addTool(
    server,
    config,
    'epic_wallet_report',
    {
      title: 'Wallet report',
      description:
        'Bundles balance, recent transactions and outputs into a single readable report.',
      annotations: READ,
    },
    {
      txLimit: z.number().int().positive().max(100).default(20),
      outputLimit: z.number().int().positive().max(200).default(50),
    },
    async ({ txLimit, outputLimit }) => {
      const [info, txs, outputs] = await Promise.all([
        wallet.run('info'),
        wallet.run('txs', ['-l', String(txLimit)]),
        wallet.run('outputs', ['-l', String(outputLimit)]),
      ]);
      return [
        '=== BALANCE ===',
        cliText(info, config),
        '',
        `=== LAST ${txLimit} TRANSACTIONS ===`,
        cliText(txs, config),
        '',
        `=== LAST ${outputLimit} OUTPUTS ===`,
        cliText(outputs, config),
      ].join('\n');
    },
  );
}
