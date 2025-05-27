// frnt/src/components/MCPPromptPanel.tsx
import React, { useState, useCallback } from 'react';
import { Search, MessageSquare, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { MCPPrompt } from '../utils/mcp-client';

// MCPPrompt 인터페이스를 확장하여 details 속성 추가
interface MCPPromptWithDetails extends MCPPrompt {
  details?: any;
}

interface MCPPromptPanelProps {
  prompts: MCPPromptWithDetails[];
  onExecutePrompt?: (serverId: string, promptName: string, args: Record<string, any>) => Promise<any>;
  isLoading?: boolean;
  className?: string;
}

const MCPPromptPanel: React.FC<MCPPromptPanelProps> = ({
  prompts,
  onExecutePrompt,
  isLoading = false,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
  const [promptArguments, setPromptArguments] = useState<Record<string, Record<string, any>>>({});
  const [executingPrompts, setExecutingPrompts] = useState<Record<string, boolean>>({});
  const [promptResults, setPromptResults] = useState<Record<string, any>>({});

  // 프롬프트 검색 필터링
  const filteredPrompts = prompts.filter(prompt =>
    prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (prompt.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    prompt.server_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 서버별 프롬프트 그룹화
  const promptsByServer = filteredPrompts.reduce((acc, prompt) => {
    if (!acc[prompt.server_id]) {
      acc[prompt.server_id] = [];
    }
    acc[prompt.server_id].push(prompt);
    return acc;
  }, {} as Record<string, MCPPromptWithDetails[]>);

  // 프롬프트 확장/축소 토글
  const togglePromptExpand = useCallback((promptId: string) => {
    setExpandedPrompts(prev => ({
      ...prev,
      [promptId]: !prev[promptId]
    }));
  }, []);

  // 프롬프트 인자 변경 처리
  const handleArgumentChange = useCallback((promptId: string, argName: string, value: any) => {
    setPromptArguments(prev => ({
      ...prev,
      [promptId]: {
        ...(prev[promptId] || {}),
        [argName]: value
      }
    }));
  }, []);

  // 프롬프트 실행 처리
  const handleExecutePrompt = useCallback(async (prompt: MCPPromptWithDetails) => {
    if (!onExecutePrompt) return;
    
    const promptId = `${prompt.server_id}-${prompt.name}`;
    const rawArgs = promptArguments[promptId] || {};
    
    // 모든 인자 값을 문자열로 변환
    const args: Record<string, string> = {};
    Object.keys(rawArgs).forEach(key => {
      args[key] = String(rawArgs[key]);
    });
    
    try {
      // 결과 초기화 및 실행 상태 설정
      setPromptResults(prev => ({ ...prev, [promptId]: null }));
      setExecutingPrompts(prev => ({ ...prev, [promptId]: true }));
      
      // 이미 상세 정보가 있는지 확인
      console.log(`프롬프트 실행 중 (${prompt.name}), 인자:`, args);
      console.log(`프롬프트 상세 정보:`, prompt.details ? '있음' : '없음');
      
      // 프롬프트 실행 API 호출
      const result = await onExecutePrompt(prompt.server_id, prompt.name, args);
      
      console.log(`프롬프트 실행 결과 (${prompt.name}):`, result);
      
      // 결과 저장
      setPromptResults(prev => ({ ...prev, [promptId]: result }));
      
      // 프롬프트 확장 (결과를 보여주기 위해)
      setExpandedPrompts(prev => ({ ...prev, [promptId]: true }));
      
      return result;
    } catch (error) {
      console.error(`프롬프트 실행 오류 (${prompt.name}):`, error);
      // 오류 저장
      setPromptResults(prev => ({ ...prev, [promptId]: { error: String(error) } }));
    } finally {
      setExecutingPrompts(prev => ({ ...prev, [promptId]: false }));
    }
  }, [onExecutePrompt, promptArguments]);

  // 프롬프트 ID 생성 헬퍼 함수
  const getPromptId = useCallback((prompt: MCPPromptWithDetails) => {
    return `${prompt.server_id}-${prompt.name}`;
  }, []);

  return (
    <div className={`flex flex-col h-full bg-base-100 ${className || ''}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-base-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-base-content">MCP 프롬프트</h3>
          <span className="text-sm text-base-content/70">
            {filteredPrompts.length}개 프롬프트
          </span>
        </div>
        
        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
          <input
            type="text"
            placeholder="프롬프트 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 input input-bordered input-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* 프롬프트 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-base-content/70">
            <div className="loading loading-spinner loading-md mx-auto mb-4"></div>
            <p className="text-sm">프롬프트 로딩 중...</p>
          </div>
        ) : (
          <>
            {Object.entries(promptsByServer).map(([serverId, serverPrompts]) => (
              <div key={serverId} className="border-b">
                {/* 서버 헤더 */}
                <div className="px-4 py-2 bg-base-200 border-b">
                  <h4 className="font-medium text-sm text-base-content">
                    {serverId} ({serverPrompts.length}개 프롬프트)
                  </h4>
                </div>

                {/* 프롬프트 목록 */}
                <div className="space-y-2 p-2">
                  {serverPrompts.map((prompt, index) => {
                    const promptId = getPromptId(prompt);
                    const isExpanded = !!expandedPrompts[promptId];
                    const isExecuting = !!executingPrompts[promptId];
                    
                    return (
                      <div 
                        key={`${prompt.name}-${index}`} 
                        className="card card-compact bg-base-100 shadow-sm"
                      >
                        {/* 프롬프트 헤더 */}
                        <div 
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-base-200"
                          onClick={() => togglePromptExpand(promptId)}
                        >
                          <div className="flex-1">
                            <h5 className="font-medium text-base-content">{prompt.name}</h5>
                            <p className="text-xs text-base-content/70 mt-1">{prompt.description || '설명 없음'}</p>
                          </div>
                          <div className="flex items-center">
                            {isExpanded ? 
                              <ChevronUp className="w-5 h-5 text-base-content/50" /> : 
                              <ChevronDown className="w-5 h-5 text-base-content/50" />
                            }
                          </div>
                        </div>
                        
                        {/* 프롬프트 내용 */}
                        {isExpanded && (
                          <div className="px-4 pb-4 bg-base-200">
                            <p className="text-sm text-base-content/80 mb-4">{prompt.description}</p>
                            
                            {/* 인자 */}
                            {prompt.arguments && prompt.arguments.length > 0 && (
                              <div className="space-y-3 mb-4">
                                <h5 className="font-medium text-sm">인자:</h5>
                                {prompt.arguments.map((arg, argIndex) => {
                                  const argValue = (promptArguments[promptId] || {})[arg.name];
                                  
                                  return (
                                    <div key={argIndex} className="space-y-1">
                                       <label className="block text-sm">
                                         <span className="font-mono">{arg.name}</span>
                                         {arg.required && <span className="text-error ml-1">*</span>}
                                         {arg.description && (
                                           <span className="text-xs text-base-content/70 ml-2">
                                             - {arg.description}
                                           </span>
                                         )}
                                       </label>
                                       <input
                                         type="text"
                                         value={argValue || ''}
                                         onChange={(e) => handleArgumentChange(promptId, arg.name, e.target.value)}
                                         className="w-full input input-bordered input-sm"
                                         placeholder={`${arg.name} 값 입력...`}
                                       />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            
                            {/* 실행 버튼 */}
                            <div className="flex flex-col space-y-3">
                              <button
                                onClick={() => handleExecutePrompt(prompt)}
                                disabled={isExecuting}
                                className="btn btn-primary btn-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Play className="w-4 h-4" />
                                <span>프롬프트 실행</span>
                              </button>
                              
                              {/* 실행 결과 표시 */}
                              {promptResults[promptId] && (
                                <div className="mt-4 border rounded-md p-3 bg-base-200">
                                  <h6 className="font-medium text-sm mb-2 text-base-content">실행 결과:</h6>
                                  {promptResults[promptId].error ? (
                                    <div className="text-error text-sm">
                                      <p>오류: {promptResults[promptId].error}</p>
                                    </div>
                                  ) : (
                                    <div className="overflow-auto max-h-60">
                                      <pre className="text-xs whitespace-pre-wrap bg-base-100 p-2 rounded border">
                                        {JSON.stringify(promptResults[promptId], null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

                {filteredPrompts.length === 0 && (
              <div className="p-8 text-center text-base-content/70">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
                <p className="text-sm">
                  {searchQuery ? '검색 결과가 없습니다.' : '사용 가능한 프롬프트가 없습니다.'}
                </p>
                {!searchQuery && (
                  <p className="text-xs mt-2">
                    MCP 서버를 시작하면 프롬프트들이 여기에 표시됩니다.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MCPPromptPanel;
