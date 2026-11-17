import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Chain = 'mainnet' | 'floonet' | 'usernet';

const CHAIN_DEFAULTS: Record<Chain, { port: number; home: string; flag: string | null }> = {
  mainnet: { port: 3413, home: 'main', flag: null },
  floonet: { port: 13413, home: 'floonet', flag: '--floonet' },
  usernet: { port: 23413, home: 'usernet', flag: '--usernet' },
};

export interface Config {
  chain: Chain;
  chainFlag: string | null;
  nodeBin: string;
  nodeUrl: string;
  apiSecret?: string;
  walletBin: string;
  walletPassword?: string;
  walletAccount: string;
  walletNodeUrl?: string;
  walletDir?: string;
  walletCurrentDir?: string;
  readOnly: boolean;
  maxSendAmount?: number;
  cliTimeoutMs: number;
  httpTimeoutMs: number;
  maxOutputChars: number;
  /** Raw sensitive values that must never appear in tool output. */
  secrets: string[];
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return parsed;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be a boolean, got "${raw}"`);
}

function parseChainType(raw: string, path: string): Chain {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'mainnet' || normalized === 'floonet' || normalized === 'usernet') {
    return normalized;
  }
  throw new Error(
    `EPIC_MCP_NODE_CONFIG at ${path} has unsupported chain_type "${raw}"`,
  );
}

function readApiSecret(chain: Chain): string | undefined {
  try {
    const path = join(homedir(), '.epic', CHAIN_DEFAULTS[chain].home, '.api_secret');
    const firstLine = readFileSync(path, 'utf8').split(/\r?\n/, 1)[0]?.trim();
    return firstLine || undefined;
  } catch {
    return undefined;
  }
}

interface EpicNodeConfig {
  apiHttpAddr: string;
  chainType?: Chain;
}

/** The node config is the source of truth for both endpoint and network. */
function readNodeConfig(path: string): EpicNodeConfig {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read EPIC_MCP_NODE_CONFIG at ${path}: ${String(error)}`);
  }

  let rawAddr: string | undefined;
  let rawChainType: string | undefined;
  let inServer = false;
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inServer = trimmed === '[server]';
      continue;
    }
    if (!inServer || trimmed.startsWith('#')) continue;
    let match = /^api_http_addr\s*=\s*["']([^"']+)["']/.exec(trimmed);
    if (match) {
      rawAddr = match[1].trim();
      continue;
    }
    match = /^chain_type\s*=\s*["']([^"']+)["']/.exec(trimmed);
    if (match) rawChainType = match[1].trim();
  }

  if (rawAddr === undefined) {
    throw new Error(`EPIC_MCP_NODE_CONFIG at ${path} has no api_http_addr entry in [server]`);
  }
  const url = /^https?:\/\//i.test(rawAddr) ? rawAddr : `http://${rawAddr}`;
  return {
    apiHttpAddr: url.replace(/^https?:\/\/0\.0\.0\.0(?=[:/]|$)/i, (prefix) =>
      prefix.replace('0.0.0.0', '127.0.0.1'),
    ),
    chainType: rawChainType === undefined ? undefined : parseChainType(rawChainType, path),
  };
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const nodeConfigPath = env('EPIC_MCP_NODE_CONFIG');
  const nodeConfig = nodeConfigPath === undefined ? undefined : readNodeConfig(nodeConfigPath);
  const chain = overrides.chain ?? nodeConfig?.chainType ?? 'mainnet';
  const defaults = CHAIN_DEFAULTS[chain];
  const nodeUrl =
    overrides.nodeUrl ?? env('EPIC_MCP_NODE_URL') ?? nodeConfig?.apiHttpAddr ?? `http://127.0.0.1:${defaults.port}`;
  const apiSecret = overrides.apiSecret ?? env('EPIC_MCP_API_SECRET') ?? readApiSecret(chain);
  const walletPassword = overrides.walletPassword ?? env('EPIC_MCP_WALLET_PASSWORD');
  const maxSendRaw = env('EPIC_MCP_MAX_SEND_AMOUNT');

  const config: Config = {
    chain,
    chainFlag: defaults.flag,
    nodeBin: overrides.nodeBin ?? env('EPIC_MCP_NODE_BIN') ?? 'epic',
    nodeUrl: nodeUrl.replace(/\/+$/, ''),
    apiSecret,
    walletBin: overrides.walletBin ?? env('EPIC_MCP_WALLET_BIN') ?? 'epic-wallet',
    walletPassword,
    walletAccount: overrides.walletAccount ?? env('EPIC_MCP_WALLET_ACCOUNT') ?? 'default',
    walletNodeUrl: overrides.walletNodeUrl ?? env('EPIC_MCP_WALLET_NODE_URL'),
    walletDir: overrides.walletDir ?? env('EPIC_MCP_WALLET_DIR'),
    walletCurrentDir: overrides.walletCurrentDir ?? env('EPIC_MCP_WALLET_CURRENT_DIR'),
    readOnly: overrides.readOnly ?? envBool('EPIC_MCP_READ_ONLY', true),
    maxSendAmount:
      overrides.maxSendAmount ?? (maxSendRaw === undefined ? undefined : Number(maxSendRaw)),
    cliTimeoutMs: overrides.cliTimeoutMs ?? envInt('EPIC_MCP_CLI_TIMEOUT_MS', 60_000),
    httpTimeoutMs: overrides.httpTimeoutMs ?? envInt('EPIC_MCP_HTTP_TIMEOUT_MS', 20_000),
    maxOutputChars: overrides.maxOutputChars ?? envInt('EPIC_MCP_MAX_OUTPUT_CHARS', 60_000),
    secrets: [],
  };

  if (config.maxSendAmount !== undefined && !Number.isFinite(config.maxSendAmount)) {
    throw new Error('EPIC_MCP_MAX_SEND_AMOUNT must be a number');
  }

  config.secrets = [apiSecret, walletPassword].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return config;
}
