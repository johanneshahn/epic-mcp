/** Error type that is safe to surface to an MCP client. */
export class EpicMcpError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'EpicMcpError';
  }
}

export function fail(message: string, details?: unknown): never {
  throw new EpicMcpError(message, details);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
