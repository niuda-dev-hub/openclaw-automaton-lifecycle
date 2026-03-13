export interface OpenClawPluginApi {
  logger?: {
    info?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
    debug?: (...args: unknown[]) => void
  }
  registerTool: (tool: unknown, options: { name: string }) => void
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  pluginConfig?: Record<string, unknown>
  config?: {
    agents?: {
      defaults?: {
        workspace?: string
      }
    }
  }
  getConfig?: () => unknown
  getWorkspaceDir?: () => string
}

export type AnyAgentTool = {
  name: string
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown> | unknown
}
