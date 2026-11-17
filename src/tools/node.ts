import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { EpicNodeClient } from '../adapters/node.js';
import { jsonText } from '../util/output.js';
import { addTool, DESTRUCTIVE, NETWORK_READ, READ, WRITE } from './shared.js';

const hex = z.string().regex(/^[0-9a-fA-F]+$/, 'Expected a hex string');
const selector = {
  height: z.number().int().nonnegative().optional().describe('Block height'),
  hash: z.string().optional().describe('Block hash (hex)'),
  commit: hex.optional().describe('Block commitment (hex)'),
};

export function registerNodeTools(server: McpServer, config: Config, node: EpicNodeClient): void {
  addTool(
    server,
    config,
    'node_get_status',
    {
      title: 'Node status',
      description: 'Protocol version, user agent, connections, chain height and tip hashes.',
      annotations: NETWORK_READ,
    },
    {},
    async () => jsonText(await node.getStatus(), config),
  );

  addTool(
    server,
    config,
    'node_get_tip',
    {
      title: 'Chain tip',
      description: 'Current chain tip: height, last block hash, total difficulty.',
      annotations: NETWORK_READ,
    },
    {},
    async () => jsonText(await node.getTip(), config),
  );

  addTool(
    server,
    config,
    'node_get_version',
    {
      title: 'Node version',
      description: 'Node version reported by the foreign API.',
      annotations: NETWORK_READ,
    },
    {},
    async () => jsonText(await node.getVersion(), config),
  );

  addTool(
    server,
    config,
    'node_get_block',
    {
      title: 'Get block',
      description: 'Fetch a full block by height, hash or commitment. Can be large.',
      annotations: NETWORK_READ,
    },
    selector,
    async ({ height, hash, commit }) => jsonText(await node.getBlock(height, hash, commit), config),
  );

  addTool(
    server,
    config,
    'node_get_blocks',
    {
      title: 'Get block range',
      description: 'Fetch an inclusive range of blocks. Keep the range small.',
      annotations: NETWORK_READ,
    },
    {
      startHeight: z.number().int().nonnegative().describe('First height'),
      endHeight: z.number().int().nonnegative().describe('Last height (inclusive)'),
    },
    async ({ startHeight, endHeight }) =>
      jsonText(await node.getBlocks(startHeight, endHeight), config),
  );

  addTool(
    server,
    config,
    'node_get_header',
    {
      title: 'Get block header',
      description: 'Fetch a block header by height, hash or commitment.',
      annotations: NETWORK_READ,
    },
    selector,
    async ({ height, hash, commit }) =>
      jsonText(await node.getHeader(height, hash, commit), config),
  );

  addTool(
    server,
    config,
    'node_get_kernel',
    {
      title: 'Get kernel',
      description: 'Look up a transaction kernel by its excess value.',
      annotations: NETWORK_READ,
    },
    {
      excess: hex.describe('Kernel excess (hex)'),
      minHeight: z.number().int().nonnegative().optional(),
      maxHeight: z.number().int().nonnegative().optional(),
    },
    async ({ excess, minHeight, maxHeight }) =>
      jsonText(await node.getKernel(excess, minHeight, maxHeight), config),
  );

  addTool(
    server,
    config,
    'node_get_last_kernels',
    {
      title: 'Recent kernels',
      description: 'Return the last N transaction kernels.',
      annotations: NETWORK_READ,
    },
    { distance: z.number().int().positive().max(1000).describe('Number of kernels') },
    async ({ distance }) => jsonText(await node.getLastNKernels(distance), config),
  );

  addTool(
    server,
    config,
    'node_get_outputs',
    {
      title: 'Get outputs',
      description: 'Look up outputs by commitment or by block height range.',
      annotations: NETWORK_READ,
    },
    {
      commits: z.array(hex).optional().describe('Output commitments (hex)'),
      startHeight: z.number().int().nonnegative().optional(),
      endHeight: z.number().int().nonnegative().optional(),
      includeProof: z.boolean().optional(),
      includeMerkleProof: z.boolean().optional(),
    },
    async (params) => jsonText(await node.getOutputs(params), config),
  );

  addTool(
    server,
    config,
    'node_get_unspent_outputs',
    {
      title: 'Unspent outputs',
      description: 'List unspent outputs in a height range (large on mainnet).',
      annotations: NETWORK_READ,
    },
    {
      startHeight: z.number().int().nonnegative().optional(),
      endHeight: z.number().int().nonnegative().optional(),
      includeProof: z.boolean().optional(),
    },
    async ({ startHeight, endHeight, includeProof }) =>
      jsonText(await node.getUnspentOutputs(startHeight, endHeight, includeProof), config),
  );

  addTool(
    server,
    config,
    'node_get_pool',
    {
      title: 'Transaction pool',
      description: 'Pool size, stempool size and currently unconfirmed transactions.',
      annotations: NETWORK_READ,
    },
    {},
    async () => {
      const [pool, stem, unconfirmed] = await Promise.all([
        node.getPoolSize(),
        node.getStemPoolSize(),
        node.getUnconfirmedTransactions(),
      ]);
      return jsonText({ poolSize: pool, stempoolSize: stem, unconfirmed }, config);
    },
  );

  addTool(
    server,
    config,
    'node_get_peers',
    {
      title: 'Peers',
      description: 'Connected peers, all known peers, or Tor onion addresses.',
      annotations: NETWORK_READ,
    },
    {
      scope: z.enum(['connected', 'all', 'onion']).default('connected'),
      addr: z.string().optional().describe('Optional peer address filter for scope=all'),
    },
    async ({ scope, addr }) => {
      if (scope === 'onion') return jsonText(await node.getOnionAddresses(), config);
      if (scope === 'all') return jsonText(await node.getPeers(addr), config);
      return jsonText(await node.getConnectedPeers(), config);
    },
  );

  addTool(
    server,
    config,
    'node_validate_chain',
    {
      title: 'Validate chain',
      description: 'Runs the node chain validation. Read-only but can take a while.',
      annotations: READ,
    },
    {},
    async () => jsonText(await node.validateChain(), config),
  );

  addTool(
    server,
    config,
    'node_get_block_template',
    {
      title: 'Block template',
      description: 'Current mining block template.',
      annotations: NETWORK_READ,
    },
    {},
    async () => jsonText(await node.getBlockTemplate(), config),
  );

  addTool(
    server,
    config,
    'node_ban_peer',
    {
      title: 'Ban peer',
      description: 'Ban a peer by "ip:port".',
      annotations: WRITE,
    },
    { peer: z.string().describe('Peer address, e.g. 10.12.12.13:13414') },
    async ({ peer }) => jsonText(await node.banPeer(peer), config),
  );

  addTool(
    server,
    config,
    'node_unban_peer',
    {
      title: 'Unban peer',
      description: 'Remove a peer ban.',
      annotations: WRITE,
    },
    { peer: z.string().describe('Peer address, e.g. 10.12.12.13:13414') },
    async ({ peer }) => jsonText(await node.unbanPeer(peer), config),
  );

  addTool(
    server,
    config,
    'node_push_transaction',
    {
      title: 'Push transaction',
      description: 'Submit a fully built transaction object to the node.',
      annotations: WRITE,
    },
    {
      tx: z.record(z.string(), z.unknown()).describe('Serialized transaction object'),
      fluff: z.boolean().optional().describe('Ignore Dandelion relay protocol'),
    },
    async ({ tx, fluff }) => jsonText(await node.pushTransaction(tx, fluff), config),
  );

  addTool(
    server,
    config,
    'node_submit_block',
    {
      title: 'Submit block',
      description: 'Submit a solved block to the node.',
      annotations: WRITE,
    },
    { block: z.record(z.string(), z.unknown()).describe('Solved block object') },
    async ({ block }) => jsonText(await node.submitBlock(block), config),
  );

  addTool(
    server,
    config,
    'node_compact_chain',
    {
      title: 'Compact chain',
      description: 'Run chain compaction. Destructive maintenance operation.',
      annotations: DESTRUCTIVE,
    },
    {},
    async () => jsonText(await node.compactChain(), config),
  );
}
