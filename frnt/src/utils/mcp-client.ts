// frnt/src/utils/mcp-client.ts

export interface MCPServerConfig {
  name: string;
  description: string;
  command: string[];
  args?: string[];
  env?: Record<string, string>;
  auto_start?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  server_id: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  server_id: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  server_id: string;
}

export interface MCPServerStatus {
  server_id: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  pid?: number;
  started_at?: string;
  last_error?: string;
  tools_count: number;
  resources_count: number;
  prompts_count: number;
}

export interface MCPEvent {
  timestamp: string;
  type: string;
  data: any;
}

export class MCPClient {
  private baseUrl: string;
  private timeout: number;
  private eventSource?: EventSource;
  private eventListeners: Map<string, Function[]> = new Map();
  private retryAttempts: number;
  private retryDelay: number;

  constructor(
    baseUrl = 'http://localhost:8000', 
    options: { 
      timeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
    } = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    let lastError: Error;
    
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...config,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.retryAttempts - 1) {
          await this.sleep(this.retryDelay * (attempt + 1));
          continue;
        }
      }
    }
    
    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== 기본 API 메서드들 =====

  async healthCheck(): Promise<{ status: string; timestamp: string; version: string }> {
    return this.request('/health');
  }

  async getConfig(): Promise<{ servers: Record<string, MCPServerConfig> }> {
    return this.request('/config');
  }

  async reloadConfig(): Promise<{ message: string }> {
    return this.request('/config/reload', { method: 'POST' });
  }

  async getStatus(): Promise<{ servers: Record<string, MCPServerStatus> }> {
    return this.request('/status');
  }

  async getServerStatus(serverId: string): Promise<MCPServerStatus> {
    return this.request(`/status/${encodeURIComponent(serverId)}`);
  }

  // ===== 서버 제어 =====

  async controlServer(
    serverId: string, 
    action: 'start' | 'stop' | 'restart'
  ): Promise<{ success: boolean; action: string }> {
    return this.request('/servers/control', {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
        action: action,
      }),
    });
  }

  async startServer(serverId: string): Promise<{ success: boolean; action: string }> {
    return this.controlServer(serverId, 'start');
  }

  async stopServer(serverId: string): Promise<{ success: boolean; action: string }> {
    return this.controlServer(serverId, 'stop');
  }

  async restartServer(serverId: string): Promise<{ success: boolean; action: string }> {
    return this.controlServer(serverId, 'restart');
  }

  async autoStartServers(): Promise<{ message: string; servers: string[] }> {
    return this.request('/auto-start', { method: 'POST' });
  }

  // ===== 도구 관련 =====

  async getAllTools(): Promise<Record<string, MCPTool[]>> {
    return this.request('/tools');
  }

  async getServerTools(serverId: string): Promise<MCPTool[]> {
    return this.request(`/tools/${encodeURIComponent(serverId)}`);
  }

  async callTool(
    serverId: string,
    toolName: string,
    arguments: Record<string, any> = {}
  ): Promise<{ success: boolean; result: any }> {
    return this.request('/tools/call', {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
        tool_name: toolName,
        arguments,
      }),
    });
  }

  // ===== 리소스 관련 =====

  async getAllResources(): Promise<Record<string, MCPResource[]>> {
    return this.request('/resources');
  }

  async getServerResources(serverId: string): Promise<MCPResource[]> {
    return this.request(`/resources/${encodeURIComponent(serverId)}`);
  }

  async readResource(
    serverId: string,
    uri: string
  ): Promise<{ success: boolean; content: string; uri: string }> {
    return this.request('/resources/read', {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
        uri,
      }),
    });
  }

  // ===== 프롬프트 관련 =====

  async getAllPrompts(): Promise<Record<string, MCPPrompt[]>> {
    return this.request('/prompts');
  }

  async getServerPrompts(serverId: string): Promise<MCPPrompt[]> {
    return this.request(`/prompts/${encodeURIComponent(serverId)}`);
  }

  async getPrompt(
    serverId: string,
    promptName: string,
    arguments: Record<string, any> = {}
  ): Promise<{ success: boolean; result: any }> {
    return this.request('/prompts/get', {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
        prompt_name: promptName,
        arguments,
      }),
    });
  }

  // ===== 이벤트 스트리밍 (SSE) =====

  startEventStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`${this.baseUrl}/events`);

    this.eventSource.onopen = () => {
      console.log('MCP 이벤트 스트림 연결됨');
      this.emit('stream_connected', null);
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data: MCPEvent = JSON.parse(event.data);
        this.emit('event', data);
        
        if (data.type) {
          this.emit(data.type, data.data);
        }
      } catch (error) {
        console.error('이벤트 파싱 오류:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('이벤트 스트림 오류:', error);
      this.emit('stream_error', error);
    };
  }

  stopEventStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
      this.emit('stream_disconnected', null);
    }
  }

  // ===== 이벤트 리스너 관리 =====

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`이벤트 리스너 오류 (${event}):`, error);
        }
      });
    }
  }

  disconnect(): void {
    this.stopEventStream();
    this.eventListeners.clear();
  }
}

// ===== 고수준 매니저 클래스 =====

export class MCPManager {
  public client: MCPClient;
  public servers: Map<string, MCPServerConfig & { status?: MCPServerStatus }> = new Map();
  public tools: Map<string, MCPTool[]> = new Map();
  public resources: Map<string, MCPResource[]> = new Map();
  public prompts: Map<string, MCPPrompt[]> = new Map();

  constructor(baseUrl?: string, options?: { timeout?: number; retryAttempts?: number }) {
    this.client = new MCPClient(baseUrl, options);
  }

  async initialize(): Promise<boolean> {
    try {
      const [config, status] = await Promise.all([
        this.client.getConfig(),
        this.client.getStatus(),
      ]);

      // 서버 정보 저장
      this.servers.clear();
      for (const [serverId, serverConfig] of Object.entries(config.servers)) {
        this.servers.set(serverId, {
          ...serverConfig,
          status: status.servers[serverId],
        });
      }

      // 기능 로드
      await this.loadCapabilities();

      // 이벤트 스트리밍 시작
      this.client.startEventStream();

      console.log('MCP 매니저 초기화 완료');
      return true;
    } catch (error) {
      console.error('MCP 매니저 초기화 실패:', error);
      return false;
    }
  }

  async loadCapabilities(): Promise<void> {
    try {
      const [allTools, allResources, allPrompts] = await Promise.allSettled([
        this.client.getAllTools(),
        this.client.getAllResources(),
        this.client.getAllPrompts(),
      ]);

      // 도구 저장
      this.tools.clear();
      if (allTools.status === 'fulfilled') {
        for (const [serverId, tools] of Object.entries(allTools.value)) {
          this.tools.set(serverId, tools);
        }
      }

      // 리소스 저장
      this.resources.clear();
      if (allResources.status === 'fulfilled') {
        for (const [serverId, resources] of Object.entries(allResources.value)) {
          this.resources.set(serverId, resources);
        }
      }

      // 프롬프트 저장
      this.prompts.clear();
      if (allPrompts.status === 'fulfilled') {
        for (const [serverId, prompts] of Object.entries(allPrompts.value)) {
          this.prompts.set(serverId, prompts);
        }
      }
    } catch (error) {
      console.error('서버 기능 로드 실패:', error);
    }
  }

  // ===== 편의 메서드들 =====

  getToolsByServer(serverId: string): MCPTool[] {
    return this.tools.get(serverId) || [];
  }

  getAllToolsFlat(): (MCPTool & { server_id: string })[] {
    const allTools: (MCPTool & { server_id: string })[] = [];
    for (const [serverId, tools] of this.tools.entries()) {
      allTools.push(...tools.map(tool => ({ ...tool, server_id: serverId })));
    }
    return allTools;
  }

  searchTools(query: string): (MCPTool & { server_id: string })[] {
    const allTools = this.getAllToolsFlat();
    const lowercaseQuery = query.toLowerCase();
    
    return allTools.filter(tool => 
      tool.name.toLowerCase().includes(lowercaseQuery) ||
      tool.description.toLowerCase().includes(lowercaseQuery)
    );
  }

  getResourcesByServer(serverId: string): MCPResource[] {
    return this.resources.get(serverId) || [];
  }

  getAllResourcesFlat(): (MCPResource & { server_id: string })[] {
    const allResources: (MCPResource & { server_id: string })[] = [];
    for (const [serverId, resources] of this.resources.entries()) {
      allResources.push(...resources.map(resource => ({ ...resource, server_id: serverId })));
    }
    return allResources;
  }

  searchResources(query: string): (MCPResource & { server_id: string })[] {
    const allResources = this.getAllResourcesFlat();
    const lowercaseQuery = query.toLowerCase();
    
    return allResources.filter(resource => 
      resource.name.toLowerCase().includes(lowercaseQuery) ||
      resource.uri.toLowerCase().includes(lowercaseQuery) ||
      resource.description.toLowerCase().includes(lowercaseQuery)
    );
  }

  // 오버로드된 도구 실행 메서드
  async executeTool(toolName: string, args?: Record<string, any>): Promise<any>;
  async executeTool(serverId: string, toolName: string, args?: Record<string, any>): Promise<any>;
  async executeTool(
    serverIdOrToolName: string,
    toolNameOrArgs?: string | Record<string, any>,
    args?: Record<string, any>
  ): Promise<any> {
    let serverId: string;
    let toolName: string;
    let arguments: Record<string, any>;

    if (typeof toolNameOrArgs === 'string') {
      // executeTool(serverId, toolName, args)
      serverId = serverIdOrToolName;
      toolName = toolNameOrArgs;
      arguments = args || {};
    } else {
      // executeTool(toolName, args)
      toolName = serverIdOrToolName;
      arguments = toolNameOrArgs || {};
      
      // 도구를 가진 서버 찾기
      for (const [sid, tools] of this.tools.entries()) {
        if (tools.some(tool => tool.name === toolName)) {
          serverId = sid;
          break;
        }
      }
      
      if (!serverId!) {
        throw new Error(`도구를 찾을 수 없습니다: ${toolName}`);
      }
    }

    const result = await this.client.callTool(serverId, toolName, arguments);
    return result.result;
  }

  destroy(): void {
    this.client.disconnect();
    this.servers.clear();
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
  }
}

// ===== 팩토리 및 유틸리티 =====

export class MCPClientFactory {
  static create(baseUrl = 'http://localhost:8000', options = {}): MCPClient {
    return new MCPClient(baseUrl, options);
  }
  
  static createManager(baseUrl = 'http://localhost:8000', options = {}): MCPManager {
    return new MCPManager(baseUrl, options);
  }
}

// 전역 인스턴스 (싱글톤)
let globalMCPManager: MCPManager | null = null;

export function getGlobalMCP(baseUrl = 'http://localhost:8000', options = {}): MCPManager {
  if (!globalMCPManager) {
    globalMCPManager = new MCPManager(baseUrl, options);
  }
  return globalMCPManager;
}