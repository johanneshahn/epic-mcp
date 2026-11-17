import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import { registerNodeTools } from '../src/tools/node.js';

type Handler = (params: Record<string, any>) => Promise<{
  isError?: boolean;
  content: { text: string }[];
}>;

function captureNodeTools(config: Config, node: Record<string, unknown>): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool(name: string, _meta: unknown, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerNodeTools(server, config, node as never);
  return handlers;
}

const config = (readOnly: boolean) =>
  loadConfig({
    chain: 'mainnet',
    nodeUrl: 'http://127.0.0.1:3413',
    apiSecret: 'secret',
    readOnly,
  });

describe('EPIC_MCP_READ_ONLY', () => {
  it('keeps full automation when the variable is not set', () => {
    expect(loadConfig().readOnly).toBe(false);
  });

  it('blocks every state-changing node tool', async () => {
    const calls: string[] = [];
    const node = new Proxy(
      {},
      {
        get: (_target, method: string) => () => {
          calls.push(method);
          return Promise.resolve({});
        },
      },
    );
    const handlers = captureNodeTools(config(true), node);

    const writeTools: [string, Record<string, unknown>][] = [
      ['node_ban_peer', { peer: '1.2.3.4:13414' }],
      ['node_unban_peer', { peer: '1.2.3.4:13414' }],
      ['node_push_transaction', { tx: {} }],
      ['node_submit_block', { block: {} }],
      ['node_compact_chain', {}],
    ];

    for (const [name, params] of writeTools) {
      const result = await handlers.get(name)!(params);
      expect(result.isError, name).toBe(true);
      expect(result.content[0].text, name).toContain('EPIC_MCP_READ_ONLY=true');
    }
    expect(calls).toEqual([]);
  });

  it('leaves read-only node tools usable', async () => {
    const getTip = vi.fn().mockResolvedValue({ height: 42 });
    const handlers = captureNodeTools(config(true), { getTip });
    const result = await handlers.get('node_get_tip')!({});
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('"height": 42');
    expect(getTip).toHaveBeenCalledOnce();
  });
});
