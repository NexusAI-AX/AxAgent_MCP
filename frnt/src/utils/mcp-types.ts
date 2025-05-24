// frnt/src/utils/mcp-types.ts
// MCP 관련 추가 타입 정의

export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface MCPExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  timestamp: string;
  duration?: number;
}

export interface MCPToolArgument {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required: boolean;
  default?: any;
  enum?: any[];
}

export interface MCPToolSchema {
  name: string;
  description: string;
  arguments: MCPToolArgument[];
  server_id: string;
}

export interface MCPEventFilter {
  types: Set<string>;
  servers: Set<string>;
  levels: Set<'info' | 'success' | 'warning' | 'error'>;
  searchQuery: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export interface MCPConnectionConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  autoReconnect: boolean;
  reconnectInterval: number;
}

export interface MCPServerMetrics {
  server_id: string;
  uptime: number;
  requests_total: number;
  requests_success: number;
  requests_failed: number;
  average_response_time: number;
  last_activity: string;
}

export interface MCPSystemInfo {
  version: string;
  protocol_version: string;
  total_servers: number;
  running_servers: number;
  total_tools: number;
  total_resources: number;
  memory_usage: number;
  cpu_usage: number;
}

// 유틸리티 타입들
export type MCPEventType = 
  | 'server_started'
  | 'server_stopped' 
  | 'server_error'
  | 'tool_executed'
  | 'tool_error'
  | 'resource_read'
  | 'resource_error'
  | 'config_loaded'
  | 'config_error'
  | 'stream_connected'
  | 'stream_disconnected'
  | 'stream_error'
  | 'heartbeat';

export type MCPLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MCPLogEntry {
  timestamp: string;
  level: MCPLogLevel;
  message: string;
  server_id?: string;
  context?: Record<string, any>;
}

// React 컴포넌트 Props 타입들
export interface MCPComponentProps {
  className?: string;
  compact?: boolean;
  theme?: 'light' | 'dark';
}

export interface MCPPanelProps extends MCPComponentProps {
  onClose?: () => void;
  onMinimize?: () => void;
  resizable?: boolean;
}

// 커스텀 훅 옵션들
export interface UseMCPOptions {
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxEvents?: number;
  eventFilter?: Partial<MCPEventFilter>;
}

export interface UseMCPToolsOptions extends UseMCPOptions {
  autoExecute?: boolean;
  cacheResults?: boolean;
  maxCacheSize?: number;
}

export interface UseMCPEventsOptions extends UseMCPOptions {
  maxEvents?: number;
  filterByDefault?: boolean;
  autoScroll?: boolean;
}

// API 응답 타입들
export interface MCPApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  request_id?: string;
}

export interface MCPServerListResponse {
  servers: Record<string, {
    config: import('./mcp-client').MCPServerConfig;
    status: import('./mcp-client').MCPServerStatus;
  }>;
}

export interface MCPToolListResponse {
  tools: Record<string, import('./mcp-client').MCPTool[]>;
}

export interface MCPResourceListResponse {
  resources: Record<string, import('./mcp-client').MCPResource[]>;
}

// 오류 타입들
export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public server_id?: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class MCPConnectionError extends MCPError {
  constructor(message: string, server_id?: string) {
    super(message, 'CONNECTION_ERROR', server_id);
    this.name = 'MCPConnectionError';
  }
}

export class MCPTimeoutError extends MCPError {
  constructor(message: string, server_id?: string) {
    super(message, 'TIMEOUT_ERROR', server_id);
    this.name = 'MCPTimeoutError';
  }
}

export class MCPValidationError extends MCPError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', undefined, { field });
    this.name = 'MCPValidationError';
  }
}

// 상수들
export const MCP_CONSTANTS = {
  PROTOCOL_VERSION: '2024-11-05',
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_RETRY_ATTEMPTS: 3,
  DEFAULT_RETRY_DELAY: 1000,
  DEFAULT_RECONNECT_INTERVAL: 5000,
  MAX_EVENTS_DEFAULT: 1000,
  MAX_CACHE_SIZE: 100,
} as const;

export const MCP_EVENT_COLORS = {
  server_started: 'green',
  server_stopped: 'yellow', 
  server_error: 'red',
  tool_executed: 'blue',
  tool_error: 'red',
  resource_read: 'purple',
  resource_error: 'red',
  config_loaded: 'green',
  config_error: 'red',
  stream_connected: 'green',
  stream_disconnected: 'yellow',
  stream_error: 'red',
  heartbeat: 'gray'
} as const;

// 유틸리티 함수 타입들
export type MCPEventHandler<T = any> = (event: import('./mcp-client').MCPEvent & { data: T }) => void;
export type MCPErrorHandler = (error: MCPError) => void;
export type MCPStatusChangeHandler = (serverId: string, oldStatus: MCPServerStatus, newStatus: MCPServerStatus) => void;