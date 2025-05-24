import { useEffect, useState } from 'react';
import { useAppContext } from '../utils/app.context';
import { OpenInNewTab, XCloseButton } from '../utils/common';
import { CanvasType } from '../utils/types';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';

const BASE_URL = 'http://localhost:8000';

interface McpServer {
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  auto_start: boolean;
}

interface McpConfig {
  servers: Record<string, McpServer>;
}

export default function McpServerConfig() {
  const { canvasData, setCanvasData } = useAppContext();
  const [config, setConfig] = useState<McpConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningServers, setRunningServers] = useState<Record<string, boolean>>({});

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const startServer = async (serverName: string) => {
    try {
      setRunningServers(prev => ({ ...prev, [serverName]: true }));
      // 여기에 서버 시작 API 호출 로직 추가
      // 예: await fetch(`${BASE_URL}/start-server`, { method: 'POST', body: JSON.stringify({ server: serverName }) });
      
      // 임시 로직 (실제 API 구현 필요)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      setError(err instanceof Error ? err.message : '서버 시작 중 오류가 발생했습니다.');
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const stopServer = async (serverName: string) => {
    try {
      setRunningServers(prev => ({ ...prev, [serverName]: false }));
      // 여기에 서버 중지 API 호출 로직 추가
      // 예: await fetch(`${BASE_URL}/stop-server`, { method: 'POST', body: JSON.stringify({ server: serverName }) });
      
      // 임시 로직 (실제 API 구현 필요)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      setError(err instanceof Error ? err.message : '서버 중지 중 오류가 발생했습니다.');
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
  }, []);
  
  // 컴포넌트가 필요한 경우에만 렌더링 (기존 PY_INTERPRETER 타입 유지)
  if (canvasData?.type !== CanvasType.PY_INTERPRETER) {
    return null;
  }
  
  return (
    <div className="card bg-base-200 w-full h-full shadow-xl">
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
                  <th>설명</th>
                  <th>명령어</th>
                  <th>자동 시작</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(config.servers).map(([key, server]) => (
                  <tr key={key}>
                    <td>{server.name}</td>
                    <td>{server.description || '설명 없음'}</td>
                    <td>
                      <div className="text-xs font-mono">
                        {server.command} {server.args.join(' ')}
                      </div>
                    </td>
                    <td>{server.auto_start ? '예' : '아니오'}</td>
                    <td>
                      {runningServers[server.name] ? (
                        <button
                          className="btn btn-sm bg-base-100"
                          onClick={() => stopServer(server.name)}
                        >
                          <StopIcon className="h-4 w-4 mr-1" /> 중지
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm bg-base-100"
                          onClick={() => startServer(server.name)}
                        >
                          <PlayIcon className="h-4 w-4 mr-1" /> 시작
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <span className="grow text-right text-xs ml-2">
            <OpenInNewTab href="https://github.com/ggerganov/llama.cpp/issues/11762">
              버그 신고하기
            </OpenInNewTab>
          </span>
        </div>
      </div>
    </div>
  );
}
