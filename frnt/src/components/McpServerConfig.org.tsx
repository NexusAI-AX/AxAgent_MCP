import { useEffect, useState, useCallback } from 'react';
import MCPToolPanel from './MCPToolPanel';
// MCPPromptPanel 컴포넌트 임포트
import MCPPromptPanel from './MCPPromptPanel';
import MCPResourcePanel from './MCPResourcePanel';
import { MCPTool, MCPResource, MCPPrompt } from '../utils/mcp-client';
import { useAppContext } from '../utils/app.context';
import { MCPManager } from '../utils/mcp-client';
import { XCloseButton } from '../utils/common';
import { CanvasType } from '../utils/types';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';

const BASE_URL = 'http://localhost:8000';

interface McpServer {
  name: string;
  description: string;
  command: string | string[] | any; // command가 문자열 또는 배열 형태로 올 수 있음
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

export default function McpServerConfig() {
  const { canvasData, setCanvasData } = useAppContext();
  const mcpManager = new MCPManager();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<MCPTool[]>([]);
  const [serverResources, setServerResources] = useState<MCPResource[]>([]);
  const [serverPrompts, setServerPrompts] = useState<MCPPrompt[]>([]);
  const [activeTab, setActiveTab] = useState<'tools' | 'resources' | 'prompts'>('tools'); // 'tools', 'resources', 'prompts'
  const [autoExecutePrompt, setAutoExecutePrompt] = useState<string | null>(null); // 자동 실행할 프롬프트 이름
  const [hasAutoExecuted, setHasAutoExecuted] = useState<boolean>(false); // 자동 실행 여부 플래그
  const [config, setConfig] = useState<McpConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningServers, setRunningServers] = useState<Record<string, boolean>>({});
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});
  
  // 탭 변경 시 프롬프트 자동 실행 함수 - 2단계 호출 구조 유지
  const executePromptOnTabChange = useCallback(async (serverId: string, promptName: string, args: Record<string, any> = {}) => {
    try {
      // 1단계: 프롬프트 정보 확인 (이미 가져온 목록에서 확인)
      console.log(`탭 변경으로 프롬프트 자동 실행 준비 (${promptName})`);
      
      // 2단계: 실제 프롬프트 실행 API 호출
      const result = await mcpManager.executePrompt(serverId, promptName, args);
      console.log(`탭 변경으로 프롬프트 자동 실행 결과 (${promptName}):`, result);
      
      // 프롬프트 정보 업데이트 (상세 정보 추가)
      setServerPrompts(prev => 
        prev.map(p => p.name === promptName && p.server_id === serverId ? { ...p, details: result } : p)
      );
      
      return result;
    } catch (error) {
      console.error(`프롬프트 자동 실행 오류 (${promptName}):`, error);
      return null;
    }
  }, [mcpManager, setServerPrompts]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/config`, {
        headers: {
          'accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setConfig(data);
      
      // 설정을 가져온 후 서버 상태도 가져옵니다
      await fetchServerStatuses();
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };
  
  // 모든 서버의 상태를 가져오는 함수
  // 서버 선택 핸들러
  const handleServerSelect = async (serverId: string) => {
    // 이미 선택된 서버를 다시 클릭하면 선택 해제
    if (selectedServerId === serverId) {
      setSelectedServerId(null);
      setServerTools([]);
      setServerResources([]);
      setServerPrompts([]);
      return;
    }
    
    console.log(`서버 선택: ${serverId}, 서버 상태:`, serverStatuses);
    setSelectedServerId(serverId);
    
    // 서버 상태 확인 - 실행 중인지 확인
    // 서버 ID로 직접 접근
    const serverStatus = serverStatuses[serverId];
    const isRunning = serverStatus && serverStatus.status === 'running';
    
    console.log(`서버 ${serverId} 상태:`, serverStatus);
    console.log(`서버 ${serverId} 실행 상태:`, isRunning);
    
    if (!isRunning) {
      console.log(`서버 ${serverId}가 실행 중이 아니므로 데이터를 가져오지 않습니다.`);
      setServerTools([]);
      setServerResources([]);
      setServerPrompts([]);
      return;
    }
    
    // 서버 데이터 가져오기 (도구, 리소스, 프롬프트)
    try {
      console.log(`서버 ${serverId}의 데이터를 가져오기 시작...`);
      
      // 로딩 상태 설정
      setLoading(true);
      
      // 병렬로 모든 데이터 가져오기
      const toolsUrl = `${BASE_URL}/tools/${encodeURIComponent(serverId)}`;
      const resourcesUrl = `${BASE_URL}/resources/${encodeURIComponent(serverId)}`;
      const promptsUrl = `${BASE_URL}/prompts/${encodeURIComponent(serverId)}`;
      
      console.log('요청 URL:', { toolsUrl, resourcesUrl, promptsUrl });
      
      const [toolsResponse, resourcesResponse, promptsResponse] = await Promise.all([
        fetch(toolsUrl, {
          headers: { 'accept': 'application/json' }
        }),
        fetch(resourcesUrl, {
          headers: { 'accept': 'application/json' }
        }),
        fetch(promptsUrl, {
          headers: { 'accept': 'application/json' }
        })
      ]);
      
      console.log('응답 상태:', { 
        tools: toolsResponse.status, 
        resources: resourcesResponse.status, 
        prompts: promptsResponse.status 
      });
      
      // 1. 도구 처리 - 도구 목록만 가져와서 저장
      if (toolsResponse.ok) {
        const tools = await toolsResponse.json();  // 도구 목록 JSON 파싱
        console.log(`도구 가져오기 성공: ${tools.length}개 도구`);
        setServerTools(tools);  // 도구 목록 상태 저장
      } else {
        const errorText = await toolsResponse.text();
        console.error(`도구 가져오기 실패: ${toolsResponse.status}`, errorText);
        setServerTools([]);  // 오류 시 빈 배열로 초기화
      }
      
      // 2. 리소스 처리 - 리소스 목록 및 내용 가져오기
      if (resourcesResponse.ok) {
        const resources = await resourcesResponse.json();  // 리소스 목록 JSON 파싱
        console.log(`리소스 가져오기 성공: ${resources.length}개 리소스`);
        
        // 2-1. 리소스 상세 내용도 미리 가져오기 (병렬 처리)
        const resourcesWithContent = await Promise.all(
          resources.map(async (resource: MCPResource) => {
            try {
              // 각 리소스의 상세 내용 가져오기 (readResource API 호출)
              const content = await mcpManager.readResource(serverId, resource.uri);
              console.log(`리소스 상세 정보 가져오기 성공: ${resource.uri}`);
              return { ...resource, content };  // 리소스 객체에 content 추가
            } catch (error) {
              console.error(`리소스 상세 정보 가져오기 실패: ${resource.uri}`, error);
              return resource;  // 실패 시 원본 리소스 반환 (content 없음)
            }
          })
        );
        
        setServerResources(resourcesWithContent);  // 리소스 목록 및 내용 저장
      } else {
        const errorText = await resourcesResponse.text();
        console.error(`리소스 가져오기 실패: ${resourcesResponse.status}`, errorText);
        setServerResources([]);  // 오류 시 빈 배열로 초기화
      }
      
      // 3. 프롬프트 처리 - 1단계: 프롬프트 목록만 가져오기
      if (promptsResponse.ok) {
        const prompts = await promptsResponse.json();  // 프롬프트 목록 JSON 파싱
        console.log(`프롬프트 가져오기 성공: ${prompts.length}개 프롬프트`);
        
        // 3-1. 프롬프트 목록만 가져오기 (상세 정보는 나중에 필요할 때 가져옴)
        console.log(`프롬프트 목록 가져오기 성공 (${prompts.length}개 프롬프트)`);

        console.log(`여기서 ${prompts}`);
        
        // 3-2. 프롬프트 목록에 서버 ID 추가하여 저장 준비
        const promptsWithServerId = prompts.map((prompt: MCPPrompt) => {
          return { 
            ...prompt,                // 기존 프롬프트 정보 유지
            server_id: serverId,      // 서버 ID 추가
            details: null             // 상세 정보는 null로 초기화 (2단계 호출 시 채워짐)
          };
        });
        
        setServerPrompts(promptsWithServerId);  // 프롬프트 목록 저장
      } else {
        const errorText = await promptsResponse.text();
        console.error(`프롬프트 가져오기 실패: ${promptsResponse.status}`, errorText);
        setServerPrompts([]);  // 오류 시 빈 배열로 초기화
      }
      
    } catch (err) {
      console.error('서버 데이터 가져오기 오류:', err);
      setError(err instanceof Error ? err.message : '서버 데이터를 가져오는 중 오류가 발생했습니다.');
      setServerTools([]);
      setServerResources([]);
      setServerPrompts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchServerStatuses = async () => {
    try {
      const response = await fetch(`${BASE_URL}/status`, {
        headers: {
          'accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`서버 상태 가져오기 실패: ${response.status}`);
      }
      
      const statusData = await response.json();
      console.log('서버 상태 데이터:', statusData);
      
      // 상태 데이터를 서버 ID를 키로 하는 객체로 변환
      const statusMap: Record<string, ServerStatus> = {};
      
      // statusData가 servers 키를 가진 객체인지 확인
      if (statusData && typeof statusData === 'object' && 'servers' in statusData) {
        // servers 객체에서 각 서버 상태 가져오기
        const servers = statusData.servers as Record<string, any>;
        
        Object.entries(servers).forEach(([serverId, serverData]) => {
          if (typeof serverData === 'object' && serverData !== null) {
            statusMap[serverId] = {
              ...serverData,
              server_id: serverId
            } as ServerStatus;
            
            // 실행 중인 서버 상태도 업데이트
            setRunningServers(prev => ({
              ...prev,
              [serverId]: serverData.status === 'running'
            }));
          }
        });
      } else if (Array.isArray(statusData)) {
        // 배열 형태일 경우
        statusData.forEach((status: ServerStatus) => {
          statusMap[status.server_id] = status;
          
          // 실행 중인 서버 상태도 업데이트
          setRunningServers(prev => ({
            ...prev,
            [status.server_id]: status.status === 'running'
          }));
        });
      } else if (typeof statusData === 'object' && statusData !== null) {
        // 객체 형태일 경우 - 키가 서버 ID인 객체
        Object.entries(statusData).forEach(([serverId, status]) => {
          if (typeof status === 'object' && status !== null) {
            const serverStatus = status as unknown as ServerStatus;
            statusMap[serverId] = {
              ...serverStatus,
              server_id: serverId
            };
            
            // 실행 중인 서버 상태도 업데이트
            setRunningServers(prev => ({
              ...prev,
              [serverId]: serverStatus.status === 'running'
            }));
          }
        });
      }
      
      console.log('처리된 서버 상태:', statusMap);
      setServerStatuses(statusMap);
    } catch (err) {
      console.error('서버 상태 가져오기 오류:', err);
    }
  };

  const startServer = async (serverName: string) => {
    try {
      setRunningServers(prev => ({ ...prev, [serverName]: true }));
      
      // 실제 API 호출 구현
      const response = await fetch(`${BASE_URL}/servers/control`, {
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
      if (!data.success) {
        throw new Error('서버 시작에 실패했습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '서버 시작 중 오류가 발생했습니다.');
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const stopServer = async (serverName: string) => {
    try {
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
      
      // 실제 API 호출 구현
      const response = await fetch(`${BASE_URL}/servers/control`, {
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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `서버 중지 실패: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error('서버 중지에 실패했습니다.');
        setRunningServers(prev => ({ ...prev, [serverName]: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '서버 중지 중 오류가 발생했습니다.');
      setRunningServers(prev => ({ ...prev, [serverName]: true }));
    }
  };

  // 컴포넌트 마운트 시 설정 불러오기
  useEffect(() => {
    fetchConfig();
    
    // 컴포넌트가 표시될 때 적절한 타입으로 설정 (기존 PY_INTERPRETER 타입 유지)
    if (!canvasData || canvasData.type !== CanvasType.PY_INTERPRETER) {
      setCanvasData({
        type: CanvasType.PY_INTERPRETER,
        content: ''
      });
    }
    
  //   // 주기적으로 서버 상태 업데이트 (5초마다)
  //   const statusInterval = setInterval(() => {
  //     fetchServerStatuses();
  //   }, 50000);
    
    // 컴포넌트 언마운트 시 클리어
    // return () => clearInterval(statusInterval);
  }, []);
  
  // // 탭이 변경되었을 때 프롬프트 자동 실행 처리 - 2단계 호출 구조
  // useEffect(() => {
  //   // 1. 자동 실행 조건 확인
  //   // - 프롬프트 탭이 선택되어 있고
  //   // - 서버가 선택되어 있고
  //   // - 프롬프트 목록이 있고
  //   // - 아직 자동 실행이 되지 않았을 때
  //   if (activeTab === 'prompts' && selectedServerId && serverPrompts.length > 0 && !hasAutoExecuted) {
  //     // 2. 자동 실행할 프롬프트 선택
  //     // - 이전에 자동 실행한 프롬프트가 있는지 확인
  //     const autoPrompt = serverPrompts.find(p => p.name === autoExecutePrompt);
      
  //     // - 이전 프롬프트가 없으면 첫 번째 프롬프트 사용
  //     const promptToExecute = autoPrompt || serverPrompts[0];
      
  //     if (promptToExecute) {
  //       console.log(`탭 변경으로 프롬프트 자동 실행 시작: ${promptToExecute.name}`);
        
  //       // 3. 프롬프트 자동 실행 (2단계 호출 - API 호출 수행)
  //       // - 빈 인자로 프롬프트 실행 (/prompts/get API 호출)
  //       executePromptOnTabChange(selectedServerId, promptToExecute.name, {});
        
  //       // 4. 자동 실행 상태 관리
  //       // - 다음번 자동 실행을 위해 프롬프트 이름 저장
  //       setAutoExecutePrompt(promptToExecute.name);
        
  //       // - 자동 실행 완료 플래그 설정 (중복 실행 방지)
  //       setHasAutoExecuted(true);
  //     }
  //   }
  // }, [activeTab, selectedServerId, serverPrompts, hasAutoExecuted, executePromptOnTabChange]);

  
  // // 도구 실행 핸들러

  // // 리소스 조회 핸들러
  // const handleViewResource = async (serverId: string, uri: string) => {
  //   try {
  //     // 이미 가져온 리소스 중에서 찾기
  //     const existingResource = serverResources.find(r => r.uri === uri && r.server_id === serverId);
      
  //     // 이미 상세 정보가 있으면 그대로 반환
  //     if (existingResource && existingResource.content) {
  //       console.log(`캐시된 리소스 사용 (${uri}):`, existingResource.content);
  //       return existingResource.content;
  //     }
      
  //     // 없으면 새로 가져오기
  //     const result = await mcpManager.readResource(serverId, uri);
  //     console.log(`리소스 조회 결과 (${uri}):`, result);
      
  //     // 리소스 목록 업데이트 (상세 정보 추가)
  //     setServerResources(prev => 
  //       prev.map(r => r.uri === uri && r.server_id === serverId ? { ...r, content: result } : r)
  //     );
      
  //     return result;
  //   } catch (error) {
  //     console.error(`리소스 조회 오류 (${uri}):`, error);
  //     throw error;
  //   }
  // };

  // // 프롬프트 실행 핸들러 - 2단계 호출 구조 유지
  // const handleExecutePrompt = async (serverId: string, promptName: string, args: Record<string, any>) => {
  //   try {
  //     // 1단계: 프롬프트 정보 확인 (이미 가져온 목록에서 확인)
  //     const existingPrompt = serverPrompts.find(p => p.name === promptName && p.server_id === serverId);
  //     console.log(`프롬프트 실행 준비 (${promptName})`, existingPrompt ? '프롬프트 정보 확인 성공' : '프롬프트 정보 없음');
      
  //     // 2단계: 실제 프롬프트 실행 API 호출
  //     console.log(`프롬프트 실행 중 (${promptName}), 인자:`, args);
  //     const result = await mcpManager.executePrompt(serverId, promptName, args);
  //     console.log(`프롬프트 실행 결과 (${promptName}):`, result);
      
  //     // 프롬프트 정보 업데이트 (상세 정보 추가)
  //     setServerPrompts(prev => 
  //       prev.map(p => p.name === promptName && p.server_id === serverId ? { ...p, details: result } : p)
  //     );
      
  //     return result;
  //   } catch (error) {
  //     console.error(`프롬프트 실행 오류 (${promptName}):`, error);
  //     throw error;
  //   }
  // };

  // const handleExecuteTool = async (serverId: string, toolName: string, args: Record<string, any>) => {
  //   try {
  //     const response = await fetch(`${BASE_URL}/tools/call`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Accept': 'application/json'
  //       },
  //       body: JSON.stringify({
  //         server_id: serverId,
  //         tool_name: toolName,
  //         arguments: args
  //       })
  //     });
      
  //     if (!response.ok) {
  //       throw new Error(`도구 실행 실패: ${response.status}`);
  //     }
      
  //     const result = await response.json();
  //     console.log('도구 실행 결과:', result);
  //     // 여기서 결과를 처리하거나 표시할 수 있습니다
  //   } catch (err) {
  //     console.error('도구 실행 오류:', err);
  //   }
  // };

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
                  // 해당 서버의 상태 가져오기
                  const serverStatus = serverStatuses[key];
                  
                  // 상태에 따른 배지 색상 설정
                  let statusBadgeClass = "badge";
                  if (!serverStatus) {
                    statusBadgeClass += " badge-ghost";
                  } else if (serverStatus.status === "running") {
                    statusBadgeClass += " badge-success";
                  } else if (serverStatus.status === "error") {
                    statusBadgeClass += " badge-error";
                  } else {
                    statusBadgeClass += " badge-warning";
                  }
                  
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
                        </div>
                        {serverStatus?.pid && (
                          <div className="text-xs text-gray-500 mt-1 ml-5">
                            PID: {serverStatus.pid}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="text-xs font-mono">
                          {typeof server.command === 'string' 
                            ? server.command 
                            : Array.isArray(server.command) 
                              ? server.command.join(' ') 
                              : String(server.command)}
                          {server.args && Array.isArray(server.args) && server.args.length > 0 
                            ? ' ' + server.args.join(' ') 
                            : ''}
                        </div>
                      </td>
                      <td>{server.auto_start ? '예' : '아니오'}</td>
                      <td>
                        {runningServers[key] ? (
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
            
            {/* 직접 구현한 탭 컴포넌트 */}
            {runningServers[selectedServerId] && (
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
