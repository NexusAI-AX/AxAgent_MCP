// frnt/src/components/MCPPromptPanel.tsx
import React, { useState, useCallback } from 'react';
import { Search, MessageSquare, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { MCPPrompt } from '../utils/mcp-client';

interface MCPPromptPanelProps {
  prompts: MCPPrompt[];
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
  }, {} as Record<string, MCPPrompt[]>);

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
  const handleExecutePrompt = useCallback(async (prompt: MCPPrompt) => {
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
      
      console.log(`프롬프트 실행 중 (${prompt.name}), 인자:`, args);
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
  const getPromptId = useCallback((prompt: MCPPrompt) => {
    return `${prompt.server_id}-${prompt.name}`;
  }, []);

  return (
    <div className={`flex flex-col h-full bg-white ${className || ''}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">MCP 프롬프트</h3>
          <span className="text-sm text-gray-500">
            {filteredPrompts.length}개 프롬프트
          </span>
        </div>
        
        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="프롬프트 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 프롬프트 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-sm">프롬프트 로딩 중...</p>
          </div>
        ) : (
          <>
            {Object.entries(promptsByServer).map(([serverId, serverPrompts]) => (
              <div key={serverId} className="border-b">
                {/* 서버 헤더 */}
                <div className="px-4 py-2 bg-gray-100 border-b">
                  <h4 className="font-medium text-sm text-gray-700">
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
                        className="border rounded-lg overflow-hidden bg-white"
                      >
                        {/* 프롬프트 헤더 */}
                        <div className="flex flex-col">
                          <div 
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                            onClick={() => togglePromptExpand(promptId)}
                          >
                            <div className="flex items-center space-x-2">
                              <MessageSquare className="w-5 h-5 text-blue-500" />
                              <h4 className="font-medium">{prompt.name}</h4>
                            </div>
                            <div className="flex items-center space-x-2">
                              {isExecuting && (
                                <span className="text-xs text-gray-500">실행 중...</span>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                          </div>
                          
                          {/* 프롬프트 실행 결과 간략히 표시 (헤더에) */}
                          {!isExpanded && promptResults[promptId] && (
                            <div className="px-3 pb-2 text-xs">
                              <div className="flex items-center">
                                <span className="font-medium text-gray-700">결과:</span>
                                <div className="ml-2 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] text-gray-600">
                                  {promptResults[promptId].error ? (
                                    <span className="text-red-500">오류 발생</span>
                                  ) : (
                                    <span>응답 받음</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* 프롬프트 상세 */}
                        {isExpanded && (
                          <div className="p-3 border-t bg-gray-50">
                            {/* 설명 */}
                            <p className="text-sm text-gray-600 mb-4">{prompt.description}</p>
                            
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
                                        {arg.required && <span className="text-red-500 ml-1">*</span>}
                                        {arg.description && (
                                          <span className="text-xs text-gray-500 ml-2">
                                            - {arg.description}
                                          </span>
                                        )}
                                      </label>
                                      <input
                                        type="text"
                                        value={argValue || ''}
                                        onChange={(e) => handleArgumentChange(promptId, arg.name, e.target.value)}
                                        className="w-full p-2 border rounded-md text-sm"
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
                                className="flex items-center space-x-1 px-3 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Play className="w-4 h-4" />
                                <span>프롬프트 실행</span>
                              </button>
                              
                              {/* 실행 결과 표시 */}
                              {promptResults[promptId] && (
                                <div className="mt-4 border rounded-md p-3 bg-gray-100">
                                  <h6 className="font-medium text-sm mb-2">실행 결과:</h6>
                                  {promptResults[promptId].error ? (
                                    <div className="text-red-500 text-sm">
                                      <p>오류: {promptResults[promptId].error}</p>
                                    </div>
                                  ) : (
                                    <div className="overflow-auto max-h-60">
                                      <pre className="text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border">
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
              <div className="p-8 text-center text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
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
