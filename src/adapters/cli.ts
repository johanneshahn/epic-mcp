import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Config } from '../config.js';
import { EpicMcpError } from '../util/errors.js';
import { stripAnsi, type CliResult } from '../util/output.js';

const execFileAsync = promisify(execFile);

/** Execute a binary with an argument array (no shell, no injection surface). */
export async function runCli(
  bin: string,
  args: string[],
  config: Config,
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: config.cliTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env },
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      throw new EpicMcpError(
        `Binary "${bin}" was not found or is not executable. ` +
          `Check EPIC_MCP_NODE_BIN / EPIC_MCP_WALLET_BIN or your PATH.`,
      );
    }
    if (err.killed || err.code === 'ETIMEDOUT') {
      throw new EpicMcpError(
        `${bin} did not respond within ${config.cliTimeoutMs}ms. ` +
          `Is the node running and is the wallet password correct?`,
      );
    }
    const result: CliResult = {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      code: typeof err.code === 'number' ? err.code : 1,
    };
    if (result.code !== 0) {
      const detail = stripAnsi(result.stderr.trim() || result.stdout.trim()).slice(0, 2000);
      throw new EpicMcpError(
        `${bin} exited with code ${result.code}${detail ? `: ${detail}` : ''}`,
        result,
      );
    }
    return result;
  }
}

/** Remove undefined/null arguments and flatten one nesting level. */
export function args(...values: Array<string | number | boolean | undefined | null | string[]>): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (value === undefined || value === null || value === false) continue;
    if (Array.isArray(value)) {
      result.push(...value);
    } else {
      result.push(String(value));
    }
  }
  return result;
}

/** Validate an EPIC amount before it is passed to the wallet CLI. */
export function amountArg(amount: number | string): string {
  const text = String(amount);
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new EpicMcpError(`Invalid amount "${text}". Use a positive decimal number, e.g. 1.25.`);
  }
  return text;
}
