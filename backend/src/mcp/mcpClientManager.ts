import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabasePath } from '../database/connection.js';

interface McpServerConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  toolNames: Set<string>;
}

export interface McpToolResult {
  server: string;
  tool: string;
  isError: boolean;
  content: unknown;
  structuredContent: unknown;
}

export class McpTimeoutError extends Error {}
export class McpConnectionError extends Error {}

export class McpClientManager {
  private readonly connections = new Map<string, McpServerConnection>();
  private readonly toolOwners = new Map<string, string>();
  private readonly timeoutMs: number;
  private readonly databaseUrl?: string;

  constructor(options?: { timeoutMs?: number; databaseUrl?: string }) {
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.databaseUrl = options?.databaseUrl ?? process.env.DATABASE_URL;
  }

  async connectServer(
    name: string,
    serverDirectory: string,
  ): Promise<{ name: string; tools: string[] }> {
    try {
      const databasePath = resolveDatabasePath(this.databaseUrl);
      const production = process.env.NODE_ENV === 'production';
      const transport = new StdioClientTransport({
        command: production ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: production
          ? [path.resolve(serverDirectory, 'dist/index.js')]
          : ['--yes', 'tsx', 'src/index.ts'],
        cwd: serverDirectory,
        stderr: 'inherit',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
          DATABASE_URL: `file:${databasePath}`,
        },
      });
      const client = new Client(
        { name: 'easy-rent-backend-mcp-client', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);

      const listed = await client.listTools();
      const toolNames = new Set(listed.tools.map((tool) => tool.name));
      for (const toolName of toolNames) {
        const existing = this.toolOwners.get(toolName);
        if (existing) {
          throw new Error(`Tool ${toolName} is owned by both ${existing} and ${name}`);
        }
        this.toolOwners.set(toolName, name);
      }
      this.connections.set(name, {
        name,
        client,
        transport,
        toolNames,
      });

      return { name, tools: [...toolNames].sort() };
    } catch (error) {
      throw new McpConnectionError(
        `Unable to connect to MCP server ${name}: ${
          error instanceof Error ? error.message : 'Unknown connection error'
        }`,
      );
    }
  }

  async connectDefaultServers(): Promise<{ name: string; tools: string[] }[]> {
    const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
    const repositoryRoot = path.resolve(backendDirectory, '../../..');
    return Promise.all([
      this.connectServer('inventory', path.join(repositoryRoot, 'mcp-servers/inventory-server')),
      this.connectServer('booking', path.join(repositoryRoot, 'mcp-servers/booking-server')),
    ]);
  }

  async getOpenRouterTools(): Promise<ChatCompletionTool[]> {
    const tools: ChatCompletionTool[] = [];
    for (const connection of this.connections.values()) {
      const listed = await connection.client.listTools();
      for (const tool of listed.tools) {
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>,
          },
        });
      }
    }
    return tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const owner = this.toolOwners.get(toolName);
    if (!owner) throw new Error(`Unknown MCP tool name: ${toolName}`);
    const connection = this.connections.get(owner);
    if (!connection) throw new McpConnectionError(`MCP server ${owner} is disconnected`);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const call = connection.client.callTool({
        name: toolName,
        arguments: args,
      });
      const result = await Promise.race([
        call,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new McpTimeoutError(`MCP tool ${toolName} timed out`)),
            this.timeoutMs,
          );
        }),
      ]);

      return {
        server: owner,
        tool: toolName,
        isError: Boolean(result.isError),
        content: result.content,
        structuredContent: result.structuredContent,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  getStatus() {
    return {
      inventory:
        this.connections.has('inventory') && this.connections.get('inventory')!.toolNames.size > 0,
      booking:
        this.connections.has('booking') && this.connections.get('booking')!.toolNames.size > 0,
      toolCount: this.toolOwners.size,
    };
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.connections.values()].map((connection) =>
        connection.client.close().catch(() => undefined),
      ),
    );
    this.connections.clear();
    this.toolOwners.clear();
  }
}
