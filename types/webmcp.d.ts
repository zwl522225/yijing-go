export {};

declare global {
  type WebMcpTool = {
    name: string;
    title?: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute(input: unknown): unknown | Promise<unknown>;
    annotations?: {
      readOnlyHint?: boolean;
      untrustedContentHint?: boolean;
    };
  };

  interface ModelContext {
    registerTool(
      tool: WebMcpTool,
      options?: { signal?: AbortSignal },
    ): void | Promise<void>;
  }

  interface Document {
    readonly modelContext?: ModelContext;
  }
}
