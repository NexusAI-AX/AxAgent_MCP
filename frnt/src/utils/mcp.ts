export interface McpConfig {
  mcpServers: Record<string, { command: string; args: string[] }>;
}

import { getSSEStreamAsync } from './misc';

/** Load MCP configuration from local json file */
export async function loadMcpConfig(): Promise<McpConfig> {
  const res = await fetch('/mcp_config.json');
  if (!res.ok) {
    throw new Error('Failed to load mcp_config.json');
  }
  return (await res.json()) as McpConfig;
}

/**
 * Fetch list of resources using SSE
 */
export async function fetchResources(): Promise<string[]> {
  const res = await fetch('/mcp/resources', {
    headers: { Accept: 'text/event-stream' },
  });
  const result: string[] = [];
  for await (const chunk of getSSEStreamAsync(res)) {
    if (typeof chunk.resource === 'string') {
      result.push(chunk.resource);
    }
  }
  return result;
}

export async function fetchPrompts(): Promise<unknown> {
  const res = await fetch('/mcp/prompts', {
    headers: { Accept: 'text/event-stream' },
  });
  let last: unknown = null;
  for await (const chunk of getSSEStreamAsync(res)) {
    last = chunk;
  }
  return last;
}

export async function fetchTools(): Promise<unknown> {
  const res = await fetch('/mcp/tools', {
    headers: { Accept: 'text/event-stream' },
  });
  let last: unknown = null;
  for await (const chunk of getSSEStreamAsync(res)) {
    last = chunk;
  }
  return last;
}

