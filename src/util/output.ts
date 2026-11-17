import type { Config } from '../config.js';
import { EpicMcpError } from './errors.js';

const ANSI_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:\d{1,4}(?:[;,]\d{0,4})*)?[A-Za-z]|\u0007)/g;
const SENSITIVE_LINE =
  /(recovery phrase|wallet seed|seed file|passphrase|password|api[ _-]?secret|private key)/i;

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/** Remove secrets and sensitive lines before anything reaches the LLM context. */
export function redact(text: string, config: Config): string {
  let result = text;
  for (const secret of config.secrets) {
    result = result.split(secret).join('[REDACTED]');
  }
  return result
    .split('\n')
    .filter((line) => !SENSITIVE_LINE.test(line))
    .join('\n');
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [truncated: ${text.length - maxChars} more characters]`;
}

export function cliText(result: CliResult, config: Config): string {
  const stdout = stripAnsi(result.stdout).trim();
  const stderr = stripAnsi(result.stderr).trim();
  const parts: string[] = [];
  if (stdout) parts.push(stdout);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  if (result.code !== 0) parts.push(`exit code: ${result.code}`);
  const text = parts.join('\n') || `Command finished with exit code ${result.code} and no output.`;
  return truncate(redact(text, config), config.maxOutputChars);
}

export function jsonText(value: unknown, config: Config): string {
  return truncate(redact(JSON.stringify(value, null, 2) ?? 'null', config), config.maxOutputChars);
}

export function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function toolError(error: unknown, config: Config) {
  const message = error instanceof EpicMcpError ? error.message : String(error);
  const detail = error instanceof EpicMcpError && error.details !== undefined
    ? `\n${jsonText(error.details, config)}`
    : '';
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: redact(message, config) + detail }],
  };
}

export function assertNotReadOnly(config: Config): void {
  if (config.readOnly) {
    throw new EpicMcpError('This tool is disabled because EPIC_MCP_READ_ONLY=true.');
  }
}

export function requireWalletPassword(config: Config): void {
  if (!config.walletPassword) {
    throw new EpicMcpError(
      'EPIC_MCP_WALLET_PASSWORD is not set. Unattended wallet calls need the password ' +
        'because epic-wallet only accepts -p or an interactive prompt.',
    );
  }
}

export function assertSendAmount(amount: number, config: Config, tool: string): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new EpicMcpError(`${tool}: amount must be a positive number of EPIC.`);
  }
  if (config.maxSendAmount !== undefined && amount > config.maxSendAmount) {
    throw new EpicMcpError(
      `${tool}: amount ${amount} exceeds EPIC_MCP_MAX_SEND_AMOUNT (${config.maxSendAmount}).`,
    );
  }
}
