import { useEffect, useState, useCallback, useMemo } from 'react';
import MCPToolPanel from './MCPToolPanel';
import MCPPromptPanel from './MCPPromptPanel';
import MCPResourcePanel from './MCPResourcePanel';
import { MCPTool, MCPResource, MCPPrompt } from '../utils/mcp-client';
import { useAppContext } from '../utils/app.context';
import { MCPManager } from '../utils/mcp-client';
import { XCloseButton } from '../utils/common';
import { CanvasType } from '../utils/types';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';

const BASE_URL = 'http://localhost:8000';

// API 엔드포인트 상수화
const API_ENDPOINTS = {
  CONFIG: `${BASE_URL}/config`,
  STATUS: `${BASE_URL}/status`,
  SERVER_CONTROL: `${BASE_URL}/servers/control`,
  TOOLS_CALL: `${BASE_URL}/tools/call`,
  getTools: (serverId: string) => `${BASE_URL}/tools/${encodeURIComponent(serverId)}`,
  getResources: (serverId: string) => `${BASE_URL}/resources/${encodeURIComponent(serverId)}`,
  getPrompts: (serverId: string) => `${BASE_URL}/prompts/${encodeURIComponent(serverId)}`,
} as const;

interface McpServer {
  name: string;
  description: string;
  command: string | string[] | Record<string, any>;
  args: string[];
  env: Record<string, string>;
  auto_start: boolean;
}

interface McpConfig {
  servers: Record<string, McpServer>;
}

interface ServerStatus {
  server_id: string;
  status: string;
  pid?: number;
  started_at?: string;
  last_error?: string;
  tools_count: number;
  resources_count: number;
  prompts_count: number;
}

type TabType = 'tools' | 'resources' | 'prompts';
type LoadingStates = Record<string, boolean>;

export default function McpServerConfig() {
  const { canvasData, setCanvasData } = useAppContext();
  
  // MCPManager 인스턴스 최적화
  const mcpManager = useMemo(() => new MCPManager(), []);
  
  // 상태 관리
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<MCPTool[]>([]);
  const [serverResources, setServerResources] = useState<MCPResource[]>([]);
  const [serverPrompts, setServerPrompts] = useState<MCPPrompt[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('tools');
  const [config, setConfig] = useState<McpConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningServers, setRunningServers] = useState<Record<string, boolean>>({});
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});
  const [serverLoadingStates, setServerLoadingStates] = useState<LoadingStates>({});

  // 에러 처리 헬퍼 함수
  const handleError = useCallback((err: unknown, context: string) => {
    const errorMessage = err instanceof Error ? err.message : `${context} 중 알 수 없는 오류가 발생했습니다.`;
    setError(errorMessage);
    console.error(`${context} 실패:`, err);
  }, []);

  // 설정 가져오기
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(API_ENDPOINTS.CONFIG, {
        headers: { 'accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setConfig(data);
      
      await fetchServerStatuses();
    } catch (err) {
      handleError(err, '설정 가져오기');
    } finally {
      setLoading(false);
    }
  }, []);

  // 서버 상태 가져오기
  const fetchServerStatuses = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.STATUS, {
        headers: { 'accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`서버 상태 가져오기 실패: ${response.status}`);
      }
      
      const statusData = await response.json();
      console.log('서버 상태 데이터:', statusData);
      
      const statusMap: Record<string, ServerStatus> = {};
      const runningMap: Record<string, boolean> = {};
      const newLoadingStates: Record<string, boolean> = {};
      
      if (statusData && typeof statusData === 'object' && 'servers' in statusData) {
        const servers = statusData.servers as Record<string, any>;
        
        Object.entries(servers).forEach(([serverId, serverData]) => {
          if (typeof serverData === 'object' && serverData !== null) {
            statusMap[serverId] = {
              ...serverData,
              server_id: serverId
            } as ServerStatus;
            
            runningMap[serverId] = serverData.status === 'running';
            
            // 서버가 실행 중이면 로딩 상태 해제
            if (serverData.status === 'running' || serverData.status === 'error') {
              newLoadingStates[serverId] = false;
            }
          }
        });
      } else if (Array.isArray(statusData)) {
        statusData.forEach((status: ServerStatus) => {
          statusMap[status.server_id] = status;
          runningMap[status.server_id] = status.status === 'running';
          
          // 서버가 실행 중이면 로딩 상태 해제
          if (status.status === 'running' || status.status === 'error') {
            newLoadingStates[status.server_id] = false;
          }
        });
      } else if (typeof statusData === 'object' && statusData !== null) {
        Object.entries(statusData).forEach(([serverId, status]) => {
          if (typeof status === 'object' && status !== null) {
            const serverStatus = status as unknown as ServerStatus;
            statusMap[serverId] = {
              ...serverStatus,
              server_id: serverId
            };
            
            runningMap[serverId] = serverStatus.status === 'running';
            
            // 서버가 실행 중이면 로딩 상태 해제
            if (serverStatus.status === 'running' || serverStatus.status === 'error') {
              newLoadingStates[serverId] = false;
            }
          }
        });
      }
      
      console.log('처리된 서버 상태:', statusMap);
      setServerStatuses(statusMap);
      setRunningServers(runningMap);
      
      // 로딩 상태 업데이트
      setServerLoadingStates(prev => ({
        ...prev,
        ...newLoadingStates
      }));
    } catch (err) {
      console.error('서버 상태 가져오기 오류:', err);
    }
  }, []);

  // 서버 선택 핸들러
  const handleServerSelect = useCallback(async (serverId: string) => {
    if (selectedServerId === serverId) {
      setSelectedServerId(null);
      setServerTools([]);
      setServerResources([]);
      setServerPrompts([]);
      return;
    }
    
    console.log(`서버 선택: ${serverId}`);
    setSelectedServerId(serverId);
    
    const serverStatus = serverStatuses[serverId];
    const isRunning = serverStatus && serverStatus.status === 'running';
    
    if (!isRunning) {
      console.log(`서버 ${serverId}가 실행 중이 아니므로 데이터를 가져오지 않습니다.`);
      setServerTools([]);
      setServerResources([]);
      setServerPrompts([]);
      return;
    }
    
    // 서버별 로딩 상태 설정
    setServerLoadingStates(prev => ({ ...prev, [serverId]: true }));
    
    try {
      console.log(`서버 ${serverId}의 데이터를 가져오기 시작...`);
      
      const [toolsResponse, resourcesResponse, promptsResponse] = await Promise.all([
        fetch(API_ENDPOINTS.getTools(serverId), {
          headers: { 'accept': 'application/json' }
        }),
        fetch(API_ENDPOINTS.getResources(serverId), {
          headers: { 'accept': 'application/json' }
        }),
        fetch(API_ENDPOINTS.getPrompts(serverId), {
          headers: { 'accept': 'application/json' }
        })
      ]);
      
      // 도구 처리
      if (toolsResponse.ok) {
        const toolsData = await toolsResponse.json();
        console.log('도구 응답 데이터:', toolsData);
        
        // 응답 구조 확인 및 처리
        let tools = [];
        if (Array.isArray(toolsData)) {
          tools = toolsData;
        } else if (toolsData.tools && Array.isArray(toolsData.tools)) {
          tools = toolsData.tools;
        } else if (typeof toolsData === 'object') {
          // 객체 형태인 경우 배열로 변환
          console.log('도구 데이터가 객체 형태입니다. 구조 확인:', toolsData);
          tools = Object.values(toolsData).filter(item => typeof item === 'object');
        }
        
        console.log(`도구 가져오기 성공: ${tools.length}개 도구`);
        
        // 서버 ID 추가
        const toolsWithServerId = tools.map((tool: any) => ({
          ...tool,
          server_id: serverId
        }));
        
        setServerTools(toolsWithServerId);
      } else {
        console.error(`도구 가져오기 실패: ${toolsResponse.status}`);
        setServerTools([]);
      }
      
      // 리소스 처리
      if (resourcesResponse.ok) {
        const resourcesData = await resourcesResponse.json();
        console.log('리소스 응답 데이터:', resourcesData);
        
        // 응답 구조 확인 및 처리
        let resources = [];
        if (Array.isArray(resourcesData)) {
          resources = resourcesData;
        } else if (resourcesData.resources && Array.isArray(resourcesData.resources)) {
          resources = resourcesData.resources;
        } else if (typeof resourcesData === 'object') {
          // 객체 형태인 경우 배열로 변환
          console.log('리소스 데이터가 객체 형태입니다. 구조 확인:', resourcesData);
          resources = Object.values(resourcesData).filter(item => typeof item === 'object');
        }
        
        console.log(`리소스 가져오기 성공: ${resources.length}개 리소스`);
        
        // 서버 ID 추가 및 내용 가져오기
        const resourcesWithServerId = resources.map((resource: any) => ({
          ...resource,
          server_id: serverId
        }));
        
        const resourcesWithContent = await Promise.all(
          resourcesWithServerId.map(async (resource: MCPResource) => {
            try {
              if (resource.uri) {
                const content = await mcpManager.readResource(serverId, resource.uri);
                return { ...resource, content };
              }
              return resource;
            } catch (error) {
              console.error(`리소스 상세 정보 가져오기 실패: ${resource.uri}`, error);
              return resource;
            }
          })
        );
        
        setServerResources(resourcesWithContent);
      } else {
        console.error(`리소스 가져오기 실패: ${resourcesResponse.status}`);
        setServerResources([]);
      }
      
      // 프롬프트 처리
      if (promptsResponse.ok) {
        const promptsData = await promptsResponse.json();
        console.log('프롬프트 응답 데이터:', promptsData);
        
        // 응답 구조 확인 및 처리
        let prompts = [];
        if (Array.isArray(promptsData)) {
          prompts = promptsData;
        } else if (promptsData.prompts && Array.isArray(promptsData.prompts)) {
          prompts = promptsData.prompts;
        } else if (typeof promptsData === 'object') {
          // 객체 형태인 경우 배열로 변환
          console.log('프롬프트 데이터가 객체 형태입니다. 구조 확인:', promptsData);
          prompts = Object.values(promptsData).filter(item => typeof item === 'object');
        }
        
        console.log(`프롬프트 가져오기 성공: ${prompts.length}개 프롬프트`);
        
        // 서버 ID 추가
        const promptsWithServerId = prompts.map((prompt: any) => ({
          ...prompt,
          server_id: serverId,
          details: null,
          arguments: prompt.arguments || []
        }));
        
        setServerPrompts(promptsWithServerId);
      } else {
        console.error(`프롬프트 가져오기 실패: ${promptsResponse.status}`);
        setServerPrompts([]);
      }
      
    } catch (err) {
      handleError(err, '서버 데이터 가져오기');
      setServerTools([]);
      setServerResources([]);
      setServerPrompts([]);
    } finally {
      setServerLoadingStates(prev => ({ ...prev, [serverId]: false }));
    }
  }, [selectedServerId, serverStatuses, mcpManager, handleError]);

  // 서버 시작
  const startServer = useCallback(async (serverName: string) => {
    setServerLoadingStates(prev => ({ ...prev, [serverName]: true }));
    
    try {
      setRunningServers(prev => ({ ...prev, [serverName]: true }));
      
      const response = await fetch(API_ENDPOINTS.SERVER_CONTROL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          server_id: serverName,
          action: 'start'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `서버 시작 실패: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('서버 시작 응답:', data);
      
      // 응답에 message 필드가 있으면 성공으로 간주
      // 백엔드에서는 success 필드가 아닌 message 필드를 반환함
      if (!data.message && !data.success) {
        throw new Error('서버 시작에 실패했습니다.');
      }
      
      // 서버 상태를 즉시 확인
      await fetchServerStatuses();
      
      // 서버 상태 확인
      let currentStatus = serverStatuses[serverName];
      if (currentStatus && currentStatus.status === 'running') {
        // 서버가 이미 실행 중이면 로딩 상태 즉시 해제
        setServerLoadingStates(prev => ({ ...prev, [serverName]: false }));
        return;
      }
      
      // 서버 시작 후 상태를 여러번 확인하여 로딩 상태 업데이트
      // 서버가 완전히 시작될 때까지 여러번 확인 (500ms 간격으로 더 자주 확인)
      const checkInterval = setInterval(async () => {
        await fetchServerStatuses();
        
        // 서버 상태 확인
        currentStatus = serverStatuses[serverName];
        console.log(`서버 ${serverName} 상태 확인:`, currentStatus);
        
        if (currentStatus && currentStatus.status === 'running') {
          // 서버가 실행 중이면 로딩 상태 해제 및 인터벌 중지
          console.log(`서버 ${serverName} 실행 중 확인됨, 로딩 상태 해제`);
          setServerLoadingStates(prev => ({ ...prev, [serverName]: false }));
          clearInterval(checkInterval);
        }
      }, 500); // 0.5초마다 확인
      
      // 5초 후에는 무조건 인터벌 중지 (안전장치)
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log(`서버 ${serverName} 로딩 타임아웃, 로딩 상태 해제`);
        setServerLoadingStates(prev => ({ ...prev, [serverName]: false }));
      }, 5000);
      
    } catch (err) {
      handleError(err, '서버 시작');
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
      setServerLoadingStates(prev => ({ ...prev, [serverName]: false }));
    }
  }, [handleError, fetchServerStatuses, serverStatuses]);

  // 서버 중지
  const stopServer = useCallback(async (serverName: string) => {
    setServerLoadingStates(prev => ({ ...prev, [serverName]: true }));
    
    try {
      // 서버 상태 확인
      const currentStatus = serverStatuses[serverName];
      if (!currentStatus || currentStatus.status !== 'running') {
        console.log(`서버 ${serverName}은 이미 중지되었거나 실행 중이 아닙니다.`);
        setRunningServers(prev => ({ ...prev, [serverName]: false }));
        return;
      }
      
      // 서버 중지 API 호출
      console.log(`서버 ${serverName} 중지 요청 전송...`);
      const response = await fetch(API_ENDPOINTS.SERVER_CONTROL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          server_id: serverName,
          action: 'stop'
        })
      });
      
      // 응답 처리
      let responseData;
      try {
        // 응답이 JSON인지 확인
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          // JSON이 아닌 경우 텍스트로 처리
          const textData = await response.text();
          responseData = { message: textData };
        }
      } catch (parseError) {
        console.warn('응답 파싱 오류:', parseError);
        responseData = { message: '응답 파싱 오류' };
      }
      
      // 오류 처리
      if (!response.ok) {
        console.error(`서버 중지 API 오류:`, responseData);
        // 서버가 이미 중지되었을 수 있으므로 무시하고 계속 진행
      }
      
      // 서버 상태 업데이트
      console.log(`서버 ${serverName} 중지 요청 처리 완료`);
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
      
      // 서버 상태 다시 가져오기
      await fetchServerStatuses();
      
      // 서버 상태 확인 폴링
      const checkInterval = setInterval(async () => {
        await fetchServerStatuses();
        const updatedStatus = serverStatuses[serverName];
        if (!updatedStatus || updatedStatus.status !== 'running') {
          clearInterval(checkInterval);
        }
      }, 1000);
      
      // 5초 후 폴링 중지
      setTimeout(() => clearInterval(checkInterval), 5000);
      
    } catch (err) {
      console.error(`서버 중지 오류:`, err);
      // 오류가 발생해도 서버가 중지되었을 수 있으므로 상태 업데이트
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
    } finally {
      setServerLoadingStates(prev => ({ ...prev, [serverName]: false }));
    }
  }, [handleError, fetchServerStatuses, serverStatuses]);

  // 도구 실행 핸들러
  const handleExecuteTool = useCallback(async (serverId: string, toolName: string, args: Record<string, any>) => {
    try {
      const response = await fetch(API_ENDPOINTS.TOOLS_CALL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          server_id: serverId,
          tool_name: toolName,
          arguments: args
        })
      });
      
      if (!response.ok) {
        throw new Error(`도구 실행 실패: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('도구 실행 결과:', result);
      return result;
    } catch (err) {
      handleError(err, '도구 실행');
      throw err;
    }
  }, [handleError]);

  // 리소스 조회 핸들러
  const handleViewResource = useCallback(async (serverId: string, uri: string) => {
    try {
      const existingResource = serverResources.find(r => r.uri === uri && r.server_id === serverId);
      
      if (existingResource && existingResource.content) {
        console.log(`캐시된 리소스 사용 (${uri}):`, existingResource.content);
        return existingResource.content;
      }
      
      const result = await mcpManager.readResource(serverId, uri);
      console.log(`리소스 조회 결과 (${uri}):`, result);
      
      setServerResources(prev => 
        prev.map(r => r.uri === uri && r.server_id === serverId ? { ...r, content: result } : r)
      );
      
      return result;
    } catch (error) {
      handleError(error, '리소스 조회');
      throw error;
    }
  }, [serverResources, mcpManager, handleError]);

  // 프롬프트 실행 핸들러
  const handleExecutePrompt = useCallback(async (serverId: string, promptName: string, args: Record<string, any>) => {
    try {
      console.log(`프롬프트 실행 중 (${promptName}), 인자:`, args);
      const result = await mcpManager.executePrompt(serverId, promptName, args);
      console.log(`프롬프트 실행 결과 (${promptName}):`, result);
      
      setServerPrompts(prev => 
        prev.map(p => p.name === promptName && p.server_id === serverId ? { ...p, details: result } : p)
      );
      
      return result;
    } catch (error) {
      handleError(error, '프롬프트 실행');
      throw error;
    }
  }, [mcpManager, handleError]);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    fetchConfig();
    
    if (!canvasData || canvasData.type !== CanvasType.PY_INTERPRETER) {
      setCanvasData({
        type: CanvasType.PY_INTERPRETER,
        content: ''
      });
    }
  }, [fetchConfig, canvasData, setCanvasData]);

  // 명령어 문자열 변환 헬퍼
  const getCommandString = (command: string | string[] | Record<string, any>): string => {
    if (typeof command === 'string') {
      return command;
    } else if (Array.isArray(command)) {
      return command.join(' ');
    } else {
      return String(command);
    }
  };

  return (
    <div className="card bg-base-200 w-full h-full shadow-xl overflow-auto">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-bold">MCP 서버 설정</span>
          <XCloseButton
            className="bg-base-100"
            onClick={() => setCanvasData(null)}
          />
        </div>
        
        {loading && <div className="loading loading-spinner loading-md"></div>}
        
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
            <button className="btn btn-sm" onClick={fetchConfig}>다시 시도</button>
          </div>
        )}
        
        {config && (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>서버 이름</th>
                  <th>상태</th>
                  <th>명령어</th>
                  <th>자동 시작</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(config.servers).map(([key, server]) => {
                  const serverStatus = serverStatuses[key];
                  const isLoading = serverLoadingStates[key];
                  
                  return (
                    <tr key={key}>
                      <td>
                        <button 
                          className={`text-left font-medium hover:underline ${selectedServerId === key ? 'text-primary' : ''}`}
                          onClick={() => handleServerSelect(key)}
                        >
                          {server.name || key}
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${!serverStatus ? 'bg-gray-400' : 
                            serverStatus.status === 'running' ? 'bg-green-500' : 
                            serverStatus.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                          <span className="text-sm">
                            {!serverStatus ? '알 수 없음' : 
                             serverStatus.status === 'running' ? '실행 중' : 
                             serverStatus.status === 'error' ? '오류' : '중지됨'}
                          </span>
                        </div>
                        {serverStatus?.pid && (
                          <div className="text-xs text-gray-500 mt-1 ml-5">
                            PID: {serverStatus.pid}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="text-xs font-mono">
                          {getCommandString(server.command)}
                          {server.args && Array.isArray(server.args) && server.args.length > 0 
                            ? ' ' + server.args.join(' ') 
                            : ''}
                        </div>
                      </td>
                      <td>{server.auto_start ? '예' : '아니오'}</td>
                      <td>
                        {isLoading ? (
                          <div className="loading loading-spinner loading-sm"></div>
                        ) : runningServers[key] ? (
                          <button
                            className="btn btn-error btn-sm"
                            onClick={() => stopServer(key)}
                          >
                            <StopIcon className="h-4 w-4 mr-1" />
                            중지
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => startServer(key)}
                          >
                            <PlayIcon className="h-4 w-4 mr-1" />
                            시작
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* 선택된 서버의 데이터 표시 */}
        {selectedServerId && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-lg font-bold mb-4">
              {config?.servers[selectedServerId]?.name || selectedServerId} 서버 데이터
            </h3>
            
            {/* 서버가 실행 중이지 않은 경우 메시지 표시 */}
            {!runningServers[selectedServerId] && (
              <div className="alert alert-warning mb-4">
                <span>서버가 실행 중이지 않습니다. 서버를 시작하여 데이터를 불러오세요.</span>
              </div>
            )}
            
            {/* 서버별 로딩 상태 표시 */}
            {serverLoadingStates[selectedServerId] && (
              <div className="alert alert-info mb-4">
                <div className="loading loading-spinner loading-sm mr-2"></div>
                <span>서버 데이터를 불러오는 중...</span>
              </div>
            )}
            
            {/* 탭 컴포넌트 */}
            {runningServers[selectedServerId] && !serverLoadingStates[selectedServerId] && (
              <div className="w-full">
                {/* 탭 버튼 */}
                <div className="tabs tabs-bordered mb-4">
                  <button
                    className={`tab tab-bordered ${activeTab === 'tools' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('tools')}
                  >
                    도구 ({serverTools.length})
                  </button>
                  <button
                    className={`tab tab-bordered ${activeTab === 'resources' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('resources')}
                  >
                    리소스 ({serverResources.length})
                  </button>
                  <button
                    className={`tab tab-bordered ${activeTab === 'prompts' ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab('prompts')}
                  >
                    프롬프트 ({serverPrompts.length})
                  </button>
                </div>
                
                {/* 도구 탭 콘텐츠 */}
                {activeTab === 'tools' && (
                  <div className="mt-2">
                    {serverTools.length > 0 ? (
                      <MCPToolPanel 
                        tools={serverTools.map(tool => ({ ...tool, server_id: selectedServerId }))} 
                        onExecuteTool={handleExecuteTool}
                        isLoading={false}
                        className="bg-base-100 p-4 rounded-lg"
                      />
                    ) : (
                      <div className="alert alert-info">
                        <span>이 서버에 사용 가능한 도구가 없습니다.</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* 리소스 탭 콘텐츠 */}
                {activeTab === 'resources' && (
                  <div className="mt-2">
                    {serverResources.length > 0 ? (
                      <MCPResourcePanel 
                        resources={serverResources.map(resource => ({ ...resource, server_id: selectedServerId }))}
                        onViewResource={handleViewResource}
                        isLoading={false}
                        className="bg-base-100 p-4 rounded-lg"
                      />
                    ) : (
                      <div className="alert alert-info">
                        <span>이 서버에 사용 가능한 리소스가 없습니다.</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* 프롬프트 탭 콘텐츠 */}
                {activeTab === 'prompts' && (
                  <div className="mt-2">
                    {serverPrompts.length > 0 ? (
                      <MCPPromptPanel 
                        prompts={serverPrompts.map(prompt => ({ ...prompt, server_id: selectedServerId }))}
                        onExecutePrompt={handleExecutePrompt}
                        isLoading={false}
                        className="bg-base-100 p-4 rounded-lg"
                      />
                    ) : (
                      <div className="alert alert-info">
                        <span>이 서버에 사용 가능한 프롬프트가 없습니다.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="mt-4">
          <button 
            className="btn btn-sm bg-base-100"
            onClick={fetchConfig}
            disabled={loading}
          >
            설정 새로고침
          </button>
        </div>
      </div>
    </div>
  );
}