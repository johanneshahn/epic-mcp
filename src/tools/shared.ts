import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { Config } from '../config.js';
import { ok, toolError } from '../util/output.js';

type Params = Record<string, any>;

export const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const NETWORK_READ: ToolAnnotations = { ...READ, openWorldHint: true };

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export function addTool(
  server: McpServer,
  config: Config,
  name: string,
  meta: { title: string; description: string; annotations: ToolAnnotations },
  inputSchema: ZodRawShape,
  handler: (params: Params) => Promise<string>,
): void {
  server.registerTool(name, { ...meta, inputSchema }, async (params: Params) => {
    try {
      return ok(await handler(params));
    } catch (error) {
      return toolError(error, config);
    }
  });
}
