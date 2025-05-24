// frnt/src/hooks/useMCP.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MCPManager, 
  MCPServerConfig, 
  MCPServerStatus, 
  MCPTool, 
  MCPResource, 
  MCPPrompt,
  MCPEvent 
} from '../utils/mcp-client';

interface UseMCPOptions {
  timeout?: number;
  retryAttempts?: number;
  autoConnect?: boolean;
  reconnectInterval?: number;
}

interface UseMCPReturn {
  // 상태
  manager: MCPManager | null;
  isConnected: boolean;
  servers: Map<string, MCPServerConfig & { status?: MCPServerStatus }>;
  tools: Map<string, MCPTool[]>;
  resources: Map<string, MCPResource[]>;
  prompts: Map<string, MCPPrompt[]>;
  events: MCPEvent[];
  isLoading: boolean;
  error: string | null;
  connectionAttempts: number;
  
  // 편의 함수들
  startServer: (serverId: string) => Promise<boolean>;
  stopServer: (serverId: string) => Promise<boolean>;
  restartServer: (serverId: string) => Promise<boolean>;
  callTool: (serverId: string, toolName: string, args?: Record<string, any>) => Promise<any>;
  readResource: (serverId: string, uri: string) => Promise<string>;
  getPrompt: (serverId: string, promptName: string, args?: Record<string, any>) => Promise<any>;
  searchTools: (query: string) => MCPTool[];
  searchResources: (query: string) => MCPResource[];
  refreshStatus: () => Promise<void>;
  clearError: () => void;
  reconnect: () => Promise<void>;
  
  // 통계
  stats: {
    totalServers: number;
    runningServers: number;
    totalTools: number;
    totalResources: number;
    totalPrompts: number;
    totalEvents: number;
  };
}

export function useMCP(
  baseUrl = 'http://localhost:8000',
  options: UseMCPOptions = {}
): UseMCPReturn {
  const {
    timeout = 30000,
    retryAttempts = 3,
    autoConnect = true,
    reconnectInterval = 5000
  } = options;
  
  // 상태 관리
  const [manager, setManager] = useState<MCPManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [servers, setServers] = useState<Map<string, MCPServerConfig & { status?: MCPServerStatus }>>(new Map());
  const [tools, setTools] = useState<Map<string, MCPTool[]>>(new Map());
  const [resources, setResources] = useState<Map<string, MCPResource[]>>(new Map());
  const [prompts, setPrompts] = useState<Map<string, MCPPrompt[]>>(new Map());
  const [events, setEvents] = useState<MCPEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  // Refs
  const managerRef = useRef<MCPManager | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxEvents = 1000; // 최대 이벤트 수

  // 매니저 초기화
  const initializeManager = useCallback(async (attempt = 1) => {
    if (!autoConnect && attempt === 1) return;

    setIsLoading(true);
    setConnectionAttempts(attempt);
    
    try {
      // 기존 매니저 정리
      if (managerRef.current) {
        managerRef.current.destroy();
      }

      const mcpManager = new MCPManager(baseUrl, { timeout, retryAttempts });
      managerRef.current = mcpManager;

      // 이벤트 리스너 등록
      mcpManager.client.on('stream_connected', () => {
        setIsConnected(true);
        setError(null);
        setConnectionAttempts(0);
        console.log('MCP 스트림 연결됨');
      });

      mcpManager.client.on('stream_disconnected', () => {
        setIsConnected(false);
        console.log('MCP 스트림 연결 해제됨');
      });

      mcpManager.client.on('stream_error', (error) => {
        setIsConnected(false);
        const errorMessage = error?.message || '스트림 연결 오류';
        setError(errorMessage);
        console.error('MCP 스트림 오류:', errorMessage);
        
        // 자동 재연결 시도
        if (attempt < 5) {
          reconnectTimeoutRef.current = setTimeout(() => {
            initializeManager(attempt + 1);
          }, reconnectInterval * attempt);
        }
      });

      mcpManager.client.on('event', (event: MCPEvent) => {
        setEvents(prev => {
          const newEvents = [...prev, event];
          return newEvents.slice(-maxEvents); // 최근 이벤트만 유지
        });
      });

      // 서버 상태 변경 이벤트들
      mcpManager.client.on('server_started', () => {
        console.log('서버 시작 이벤트 수신');
        setTimeout(refreshServerData, 1000);
      });
      
      mcpManager.client.on('server_stopped', () => {
        console.log('서버 중지 이벤트 수신');
        setTimeout(refreshServerData, 1000);
      });
      
      mcpManager.client.on('server_capabilities_loaded', () => {
        console.log('서버 기능 로드 이벤트 수신');
        setTimeout(refreshServerData, 500);
      });

      // 초기화 실행
      const success = await mcpManager.initialize();
      if (success) {
        setManager(mcpManager);
        await updateAllData(mcpManager);
        setError(null);
        console.log('MCP 매니저 초기화 성공');
      } else {
        throw new Error('MCP 매니저 초기화 실패');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
      console.error('MCP 초기화 오류:', err);
      
      // 자동 재연결 시도
      if (attempt < 3) {
        reconnectTimeoutRef.current = setTimeout(() => {
          initializeManager(attempt + 1);
        }, reconnectInterval * attempt);
      }
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, timeout, retryAttempts, autoConnect, reconnectInterval]);

  // 모든 데이터 업데이트
  const updateAllData = useCallback(async (mcpManager: MCPManager) => {
    try {
      // 서버 상태 새로고침
      const status = await mcpManager.client.getStatus();
      
      // 서버 정보 업데이트
      const updatedServers = new Map(mcpManager.servers);
      for (const [serverId, serverStatus] of Object.entries(status.servers)) {
        const existingServer = updatedServers.get(serverId);
        if (existingServer) {
          updatedServers.set(serverId, { ...existingServer, status: serverStatus });
        }
      }
      
      setServers(updatedServers);
      setTools(new Map(mcpManager.tools));
      setResources(new Map(mcpManager.resources));
      setPrompts(new Map(mcpManager.prompts));
    } catch (err) {
      console.error('데이터 업데이트 오류:', err);
    }
  }, []);

  // 서버 데이터 새로고침
  const refreshServerData = useCallback(async () => {
    if (!managerRef.current) return;

    try {
      await managerRef.current.loadCapabilities();
      await updateAllData(managerRef.current);
    } catch (err) {
      console.error('서버 데이터 새로고침 오류:', err);
    }
  }, [updateAllData]);

  // 컴포넌트 마운트/언마운트
  useEffect(() => {
    initializeManager();

    return () => {
      // 정리
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, [initializeManager]);

  // 편의 함수들
  const startServer = useCallback(async (serverId: string): Promise<boolean> => {
    if (!manager) {
      setError('MCP 매니저가 초기화되지 않았습니다');
      return false;
    }
    
    try {
      const result = await manager.client.startServer(serverId);
      if (result.success) {
        setTimeout(refreshServerData, 2000);
      }
      return result.success;
    } catch (err) {
      const errorMessage = `서버 시작 오류 (${serverId}): ${err}`;
      setError(errorMessage);
      console.error(errorMessage);
      return false;
    }
  }, [manager, refreshServerData]);

  const stopServer = useCallback(async (serverId: string): Promise<boolean> => {
    if (!manager) {
      setError('MCP 매니저가 초기화되지 않았습니다');
      return false;
    }
    
    try {
      const result = await manager.client.stopServer(serverId);
      if (result.success) {
        setTimeout(refreshServerData, 1000);
      }
      return result.success;
    } catch (err) {
      const errorMessage = `서버 중지 오류 (${serverId}): ${err}`;
      setError(errorMessage);
      console.error(errorMessage);
      return false;
    }
  }, [manager, refreshServerData]);

  const restartServer = useCallback(async (serverId: string): Promise<boolean> => {
    if (!manager) {
      setError('MCP 매니저가 초기화되지 않았습니다');
      return false;
    }
    
    try {
      const result = await manager.client.restartServer(serverId);
      if (result.success) {
        setTimeout(refreshServerData, 3000);
      }
      return result.success;
    } catch (err) {
      const errorMessage = `서버 재시작 오류 (${serverId}): ${err}`;
      setError(errorMessage);
      console.error(errorMessage);
      return false;
    }
  }, [manager, refreshServerData]);

  const callTool = useCallback(async (
    serverId: string, 
    toolName: string, 
    args: Record<string, any> = {}
  ): Promise<any> => {
    if (!manager) {
      throw new Error('MCP 매니저가 초기화되지 않았습니다');
    }
    
    try {
      return await manager.executeTool(serverId, toolName, args);
    } catch (err) {
      const errorMessage = `도구 실행 오류 (${serverId}/${toolName}): ${err}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [manager]);

  const readResource = useCallback(async (serverId: string, uri: string): Promise<string> => {
    if (!manager) {
      throw new Error('MCP 매니저가 초기화되지 않았습니다');
    }
    
    try {
      const result = await manager.client.readResource(serverId, uri);
      return result.content;
    } catch (err) {
      const errorMessage = `리소스 읽기 오류 (${serverId}/${uri}): ${err}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [manager]);

  const getPrompt = useCallback(async (
    serverId: string, 
    promptName: string, 
    args: Record<string, any> = {}
  ): Promise<any> => {
    if (!manager) {
      throw new Error('MCP 매니저가 초기화되지 않았습니다');
    }
    
    try {
      const result = await manager.client.getPrompt(serverId, promptName, args);
      return result.result;
    } catch (err) {
      const errorMessage = `프롬프트 가져오기 오류 (${serverId}/${promptName}): ${err}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [manager]);

  const searchTools = useCallback((query: string): MCPTool[] => {
    if (!manager) return [];
    return manager.searchTools(query);
  }, [manager]);

  const searchResources = useCallback((query: string): MCPResource[] => {
    if (!manager) return [];
    return manager.searchResources(query);
  }, [manager]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    await refreshServerData();
  }, [refreshServerData]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reconnect = useCallback(async (): Promise<void> => {
    setError(null);
    await initializeManager();
  }, [initializeManager]);

  // 통계 계산
  const stats = React.useMemo(() => {
    const runningServers = Array.from(servers.values()).filter(
      server => server.status?.status === 'running'
    ).length;

    const totalTools = Array.from(tools.values()).reduce(
      (sum, toolList) => sum + toolList.length, 0
    );

    const totalResources = Array.from(resources.values()).reduce(
      (sum, resourceList) => sum + resourceList.length, 0
    );

    const totalPrompts = Array.from(prompts.values()).reduce(
      (sum, promptList) => sum + promptList.length, 0
    );

    return {
      totalServers: servers.size,
      runningServers,
      totalTools,
      totalResources,
      totalPrompts,
      totalEvents: events.length
    };
  }, [servers, tools, resources, prompts, events]);

  return {
    // 상태
    manager,
    isConnected,
    servers,
    tools,
    resources,
    prompts,
    events,
    isLoading,
    error,
    connectionAttempts,
    
    // 함수들
    startServer,
    stopServer,
    restartServer,
    callTool,
    readResource,
    getPrompt,
    searchTools,
    searchResources,
    refreshStatus,
    clearError,
    reconnect,
    
    // 통계
    stats
  };
}

// ===== 커스텀 Hook들 =====

/**
 * 특정 서버의 상태만 추적하는 Hook
 */
export function useServerStatus(serverId: string, baseUrl?: string) {
  const { servers, startServer, stopServer, restartServer } = useMCP(baseUrl);
  const server = servers.get(serverId);
  
  return {
    server,
    status: server?.status?.status || 'stopped',
    isRunning: server?.status?.status === 'running',
    startServer: () => startServer(serverId),
    stopServer: () => stopServer(serverId),
    restartServer: () => restartServer(serverId)
  };
}

/**
 * 도구 실행에 특화된 Hook
 */
export function useMCPTools(baseUrl?: string) {
  const { tools, callTool, searchTools, isConnected } = useMCP(baseUrl);
  
  const [executingTools, setExecutingTools] = useState<Set<string>>(new Set());
  const [toolResults, setToolResults] = useState<Map<string, any>>(new Map());

  const executeToolWithState = useCallback(async (
    serverId: string,
    toolName: string,
    args: Record<string, any> = {}
  ) => {
    const toolKey = `${serverId}:${toolName}`;
    setExecutingTools(prev => new Set(prev).add(toolKey));
    
    try {
      const result = await callTool(serverId, toolName, args);
      setToolResults(prev => new Map(prev).set(toolKey, result));
      return result;
    } finally {
      setExecutingTools(prev => {
        const newSet = new Set(prev);
        newSet.delete(toolKey);
        return newSet;
      });
    }
  }, [callTool]);

  const isToolExecuting = useCallback((serverId: string, toolName: string) => {
    return executingTools.has(`${serverId}:${toolName}`);
  }, [executingTools]);

  const getToolResult = useCallback((serverId: string, toolName: string) => {
    return toolResults.get(`${serverId}:${toolName}`);
  }, [toolResults]);

  return {
    tools,
    executeTool: executeToolWithState,
    isToolExecuting,
    getToolResult,
    searchTools,
    isConnected,
    clearResults: () => setToolResults(new Map())
  };
}

/**
 * 이벤트 스트림에 특화된 Hook
 */
export function useMCPEvents(baseUrl?: string, maxEvents = 100) {
  const { events, isConnected } = useMCP(baseUrl);
  const [filteredEvents, setFilteredEvents] = useState<MCPEvent[]>([]);
  const [eventFilter, setEventFilter] = useState<{
    types: string[];
    servers: string[];
    search: string;
  }>({
    types: [],
    servers: [],
    search: ''
  });

  // 이벤트 필터링
  React.useEffect(() => {
    let filtered = events.slice(-maxEvents);

    if (eventFilter.types.length > 0) {
      filtered = filtered.filter(event => eventFilter.types.includes(event.type));
    }

    if (eventFilter.servers.length > 0) {
      filtered = filtered.filter(event => 
        eventFilter.servers.includes(event.data?.server_id)
      );
    }

    if (eventFilter.search) {
      const searchLower = eventFilter.search.toLowerCase();
      filtered = filtered.filter(event =>
        event.type.toLowerCase().includes(searchLower) ||
        JSON.stringify(event.data).toLowerCase().includes(searchLower)
      );
    }

    setFilteredEvents(filtered);
  }, [events, eventFilter, maxEvents]);

  const uniqueTypes = React.useMemo(() => 
    [...new Set(events.map(e => e.type))].sort(),
    [events]
  );

  const uniqueServers = React.useMemo(() => 
    [...new Set(events.map(e => e.data?.server_id).filter(Boolean))].sort(),
    [events]
  );

  return {
    events: filteredEvents,
    allEvents: events,
    isConnected,
    filter: eventFilter,
    setFilter: setEventFilter,
    uniqueTypes,
    uniqueServers,
    clearEvents: () => setFilteredEvents([])
  };
}