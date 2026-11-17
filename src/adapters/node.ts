import type { Config } from '../config.js';
import { EpicMcpError } from '../util/errors.js';

type RpcApi = 'foreign' | 'owner';

interface RpcEnvelope<T> {
  jsonrpc?: string;
  id?: number;
  result?: T | { Ok: T } | { Err: unknown };
  error?: { code: number; message: string; data?: unknown };
}

let rpcId = 0;

/** Client for the Epic node's JSON-RPC v2 endpoints and v1 REST routes. */
export class EpicNodeClient {
  constructor(private readonly config: Config) {}

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'epic-mcp/0.1',
    };
    if (this.config.apiSecret) {
      const token = Buffer.from(`epic:${this.config.apiSecret}`).toString('base64');
      headers.authorization = `Basic ${token}`;
    }
    return headers;
  }

  private async request<T>(api: RpcApi, method: string, params: unknown[] = []): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.config.nodeUrl}/v2/${api}`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
        signal: AbortSignal.timeout(this.config.httpTimeoutMs),
      });
    } catch (error) {
      throw new EpicMcpError(
        `Cannot reach Epic node at ${this.config.nodeUrl}: ${String(error)}`,
      );
    }

    if (!response.ok) {
      const body = (await response.text()).slice(0, 2000);
      throw new EpicMcpError(
        `Epic node returned HTTP ${response.status} for ${method}. Check EPIC_MCP_API_SECRET.`,
        body,
      );
    }

    let envelope: RpcEnvelope<T>;
    try {
      envelope = (await response.json()) as RpcEnvelope<T>;
    } catch {
      throw new EpicMcpError(`Epic node returned invalid JSON for ${method}.`);
    }

    if (envelope.error) {
      throw new EpicMcpError(`${method}: ${envelope.error.message}`, envelope.error.data);
    }
    const result = envelope.result;
    if (result && typeof result === 'object') {
      if ('Err' in result) {
        const err = (result as { Err: unknown }).Err;
        throw new EpicMcpError(`${method} failed: ${JSON.stringify(err)}`, err);
      }
      if ('Ok' in result) return (result as { Ok: T }).Ok;
    }
    return result as T;
  }

  /** Foreign API = chain data, pool and transaction submission. */
  foreign<T>(method: string, params: unknown[] = []): Promise<T> {
    return this.request<T>('foreign', method, params);
  }

  /** Owner API = node administration (status, peers, chain maintenance). */
  owner<T>(method: string, params: unknown[] = []): Promise<T> {
    return this.request<T>('owner', method, params);
  }

  async rest<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.nodeUrl}${path}`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(this.config.httpTimeoutMs),
    });
    if (!response.ok) {
      throw new EpicMcpError(`GET ${path} returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  getStatus() {
    return this.owner('get_status');
  }

  getVersion() {
    return this.foreign('get_version');
  }

  getTip() {
    return this.foreign('get_tip');
  }

  getBlock(height?: number, hash?: string, commit?: string) {
    return this.foreign('get_block', [height ?? null, hash ?? null, commit ?? null]);
  }

  getBlocks(startHeight: number, endHeight: number) {
    return this.foreign('get_blocks', [startHeight, endHeight, null, null]);
  }

  getHeader(height?: number, hash?: string, commit?: string) {
    return this.foreign('get_header', [height ?? null, hash ?? null, commit ?? null]);
  }

  getKernel(excess: string, minHeight?: number, maxHeight?: number) {
    return this.foreign('get_kernel', [excess, minHeight ?? null, maxHeight ?? null]);
  }

  getLastNKernels(distance: number) {
    return this.foreign('get_last_n_kernels', [distance]);
  }

  getOutputs(options: {
    commits?: string[];
    startHeight?: number;
    endHeight?: number;
    includeProof?: boolean;
    includeMerkleProof?: boolean;
  } = {}) {
    return this.foreign('get_outputs', [
      options.commits ?? null,
      options.startHeight ?? null,
      options.endHeight ?? null,
      options.includeProof ?? null,
      options.includeMerkleProof ?? null,
    ]);
  }

  getUnspentOutputs(startHeight?: number, endHeight?: number, includeProof?: boolean) {
    return this.foreign('get_unspent_outputs', [
      startHeight ?? null,
      endHeight ?? null,
      null,
      includeProof ?? null,
    ]);
  }

  getPoolSize() {
    return this.foreign<number>('get_pool_size');
  }

  getStemPoolSize() {
    return this.foreign<number>('get_stempool_size');
  }

  getUnconfirmedTransactions() {
    return this.foreign('get_unconfirmed_transactions');
  }

  getConnectedPeers() {
    return this.owner('get_connected_peers');
  }

  getPeers(addr?: string) {
    return this.owner('get_peers', [addr ?? null]);
  }

  getOnionAddresses() {
    return this.owner('get_onion_addresses');
  }

  validateChain() {
    return this.owner('validate_chain');
  }

  compactChain() {
    return this.owner('compact_chain');
  }

  banPeer(peer: string) {
    return this.owner('ban_peer', [peer]);
  }

  unbanPeer(peer: string) {
    return this.owner('unban_peer', [peer]);
  }

  pushTransaction(tx: unknown, fluff?: boolean) {
    return this.foreign('push_transaction', [tx, fluff ?? null]);
  }

  getBlockTemplate() {
    return this.foreign('get_block_template');
  }

  submitBlock(block: unknown) {
    return this.foreign('submit_block', [block]);
  }
}
