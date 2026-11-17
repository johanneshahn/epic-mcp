import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { args, amountArg } from '../src/adapters/cli.js';

const KEYS = [
  'EPIC_MCP_CHAIN',
  'EPIC_MCP_NODE_URL',
  'EPIC_MCP_NODE_CONFIG',
  'EPIC_MCP_API_SECRET',
  'EPIC_MCP_WALLET_PASSWORD',
  'EPIC_MCP_READ_ONLY',
  'EPIC_MCP_MAX_SEND_AMOUNT',
];

function withNodeConfig(contents: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'epic-mcp-config-'));
  const path = join(dir, 'epic-server.toml');
  writeFileSync(path, contents);
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadConfig', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('defaults to mainnet with port 3413 when no config is present', () => {
    const config = loadConfig();
    expect(config.chain).toBe('mainnet');
    expect(config.nodeUrl).toBe('http://127.0.0.1:3413');
    expect(config.chainFlag).toBeNull();
    expect(config.readOnly).toBe(false);
  });

  it('ignores EPIC_MCP_CHAIN', () => {
    process.env.EPIC_MCP_CHAIN = 'floonet';
    const config = loadConfig();
    expect(config.chain).toBe('mainnet');
    expect(config.nodeUrl).toBe('http://127.0.0.1:3413');
    expect(config.chainFlag).toBeNull();
  });

  it('keeps mainnet defaults when only EPIC_MCP_NODE_URL is set', () => {
    process.env.EPIC_MCP_NODE_URL = 'http://node.example:9999';
    const config = loadConfig();
    expect(config.chain).toBe('mainnet');
    expect(config.chainFlag).toBeNull();
    expect(config.nodeUrl).toBe('http://node.example:9999');
  });

  it('applies explicit safety overrides', () => {
    process.env.EPIC_MCP_READ_ONLY = 'true';
    process.env.EPIC_MCP_MAX_SEND_AMOUNT = '25.5';
    const config = loadConfig();
    expect(config.readOnly).toBe(true);
    expect(config.maxSendAmount).toBe(25.5);
  });

  it('derives floonet from chain_type in the node config', () => {
    withNodeConfig(
      '[server]\nchain_type = "Floonet"\napi_http_addr = "127.0.0.1:25000"\n',
      (path) => {
        process.env.EPIC_MCP_NODE_CONFIG = path;
        const config = loadConfig();
        expect(config.chain).toBe('floonet');
        expect(config.chainFlag).toBe('--floonet');
        expect(config.nodeUrl).toBe('http://127.0.0.1:25000');
      },
    );
  });

  it('derives usernet from chain_type in the node config', () => {
    withNodeConfig(
      '[server]\nchain_type = "Usernet"\napi_http_addr = "127.0.0.1:25000"\n',
      (path) => {
        process.env.EPIC_MCP_NODE_CONFIG = path;
        const config = loadConfig();
        expect(config.chain).toBe('usernet');
        expect(config.chainFlag).toBe('--usernet');
      },
    );
  });

  it('derives mainnet from chain_type in the node config', () => {
    withNodeConfig(
      '[server]\nchain_type = "Mainnet"\napi_http_addr = "127.0.0.1:3502"\n',
      (path) => {
        process.env.EPIC_MCP_NODE_CONFIG = path;
        const config = loadConfig();
        expect(config.chain).toBe('mainnet');
        expect(config.chainFlag).toBeNull();
      },
    );
  });

  it('rejects an unknown chain_type from the node config', () => {
    withNodeConfig(
      '[server]\nchain_type = "Wrongnet"\napi_http_addr = "127.0.0.1:3502"\n',
      (path) => {
        process.env.EPIC_MCP_NODE_CONFIG = path;
        expect(() => loadConfig()).toThrow(/chain_type/);
      },
    );
  });

  it('reads the node URL from the epic-server.toml named by EPIC_MCP_NODE_CONFIG', () => {
    withNodeConfig('[server]\napi_http_addr = "127.0.0.1:3502"\n', (path) => {
      process.env.EPIC_MCP_NODE_CONFIG = path;
      expect(loadConfig().nodeUrl).toBe('http://127.0.0.1:3502');
    });
  });

  it('prefers EPIC_MCP_NODE_URL over EPIC_MCP_NODE_CONFIG', () => {
    withNodeConfig('[server]\napi_http_addr = "127.0.0.1:3502"\n', (path) => {
      process.env.EPIC_MCP_NODE_CONFIG = path;
      process.env.EPIC_MCP_NODE_URL = 'http://example.invalid:9999';
      expect(loadConfig().nodeUrl).toBe('http://example.invalid:9999');
    });
  });

  it('reports a missing EPIC_MCP_NODE_CONFIG file instead of falling back to a chain default', () => {
    process.env.EPIC_MCP_NODE_CONFIG = '/does/not/exist/epic-server.toml';
    expect(() => loadConfig()).toThrow(/EPIC_MCP_NODE_CONFIG/);
  });

  it('reports a config without an api_http_addr entry', () => {
    withNodeConfig('[server]\n# api_http_addr = "127.0.0.1:3413"\n', (path) => {
      process.env.EPIC_MCP_NODE_CONFIG = path;
      expect(() => loadConfig()).toThrow(/api_http_addr/);
    });
  });

  it('maps a wildcard bind address to localhost', () => {
    withNodeConfig('[server]\napi_http_addr = "0.0.0.0:3502"\n', (path) => {
      process.env.EPIC_MCP_NODE_CONFIG = path;
      expect(loadConfig().nodeUrl).toBe('http://127.0.0.1:3502');
    });
  });

  it('keeps an explicit scheme from api_http_addr', () => {
    withNodeConfig('[server]\napi_http_addr = "https://node.example:443"\n', (path) => {
      process.env.EPIC_MCP_NODE_CONFIG = path;
      expect(loadConfig().nodeUrl).toBe('https://node.example:443');
    });
  });
});

describe('cli helpers', () => {
  it('filters empty arguments and flattens arrays', () => {
    expect(args('--floonet', undefined, ['-a', 'default'], null, false, 3)).toEqual([
      '--floonet',
      '-a',
      'default',
      '3',
    ]);
  });

  it('validates amounts strictly', () => {
    expect(amountArg('12.345')).toBe('12.345');
    expect(() => amountArg('-5')).toThrow(/Invalid amount/);
    expect(() => amountArg('1;rm -rf')).toThrow(/Invalid amount/);
  });
});
