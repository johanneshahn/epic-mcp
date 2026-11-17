import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpicNodeClient } from '../src/adapters/node.js';
import { loadConfig } from '../src/config.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('EpicNodeClient JSON-RPC', () => {
  afterEach(() => vi.unstubAllGlobals());

  const config = () =>
    loadConfig({ chain: 'floonet', nodeUrl: 'http://127.0.0.1:13413', apiSecret: 'secret' });

  it('unwraps a successful Ok envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: { Ok: { height: 42 } } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const tip = await new EpicNodeClient(config()).getTip();
    expect(tip).toEqual({ height: 42 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:13413/v2/foreign');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('epic:secret').toString('base64')}`,
    );
  });

  it('throws on an Err envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ result: { Err: 'boom' } })),
    );
    await expect(new EpicNodeClient(config()).getStatus()).rejects.toThrow(/boom/);
  });

  it('reports non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(new EpicNodeClient(config()).getStatus()).rejects.toThrow(/HTTP 401/);
  });
});
