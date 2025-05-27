// frnt/src/components/MCPToolPanel.tsx
import React, { useState, useCallback } from 'react';
import { Play, Settings, Search, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { MCPTool } from '../utils/mcp-client';

interface MCPToolPanelProps {
  tools: MCPTool[];
  onExecuteTool: (serverId: string, toolName: string, args: Record<string, any>) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

interface ToolArgument {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value: any;
}

const MCPToolPanel: React.FC<MCPToolPanelProps> = ({
  tools,
  onExecuteTool,
  isLoading = false,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [toolArguments, setToolArguments] = useState<Record<string, Record<string, any>>>({});
  const [executingTool, setExecutingTool] = useState<string | null>(null);

  // 도구 검색 필터링
  const filteredTools = tools.filter(tool =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.server_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 서버별 도구 그룹화
  const toolsByServer = filteredTools.reduce((acc, tool) => {
    if (!acc[tool.server_id]) {
      acc[tool.server_id] = [];
    }
    acc[tool.server_id].push(tool);
    return acc;
  }, {} as Record<string, MCPTool[]>);

  // 도구 확장/축소 토글
  const toggleToolExpansion = useCallback((toolId: string) => {
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  }, []);

  // 도구 인수 값 변경
  const updateToolArgument = useCallback((toolId: string, argName: string, value: any) => {
    setToolArguments(prev => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        [argName]: value
      }
    }));
  }, []);

  // 도구 스키마에서 인수 파싱
  const parseToolArguments = useCallback((tool: MCPTool): ToolArgument[] => {
    const schema = tool.inputSchema;
    if (!schema || !schema.properties) return [];

    return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
      name,
      type: prop.type || 'string',
      description: prop.description,
      required: schema.required?.includes(name) || false,
      value: toolArguments[`${tool.server_id}-${tool.name}`]?.[name] || getDefaultValue(prop.type)
    }));
  }, [toolArguments]);

  // 기본값 생성
  const getDefaultValue = (type: string) => {
    switch (type) {
      case 'number': return 0;
      case 'boolean': return false;
      case 'array': return [];
      case 'object': return {};
      default: return '';
    }
  };

  // 도구 실행
  const handleExecuteTool = useCallback(async (tool: MCPTool) => {
    const toolId = `${tool.server_id}-${tool.name}`;
    const args = toolArguments[toolId] || {};
    
    // 필수 인수 검증
    const toolArgs = parseToolArguments(tool);
    const missingRequired = toolArgs
      .filter(arg => arg.required && (!args[arg.name] || args[arg.name] === ''))
      .map(arg => arg.name);

    if (missingRequired.length > 0) {
      alert(`필수 인수가 누락되었습니다: ${missingRequired.join(', ')}`);
      return;
    }

    try {
      setExecutingTool(toolId);
      await onExecuteTool(tool.server_id, tool.name, args);
    } catch (error) {
      console.error(`도구 실행 오류 (${tool.name}):`, error);
    } finally {
      setExecutingTool(null);
    }
  }, [toolArguments, parseToolArguments, onExecuteTool]);

  // JSON으로 인수 복사
  const copyToolArgsAsJSON = useCallback((tool: MCPTool) => {
    const toolId = `${tool.server_id}-${tool.name}`;
    const args = toolArguments[toolId] || {};
    navigator.clipboard.writeText(JSON.stringify(args, null, 2));
  }, [toolArguments]);

  // 인수 입력 컴포넌트 렌더링
  const renderArgumentInput = useCallback((tool: MCPTool, arg: ToolArgument) => {
    const toolId = `${tool.server_id}-${tool.name}`;
    const value = arg.value;

    const commonProps = {
      id: `${toolId}-${arg.name}`,
      value: value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        let newValue: any = e.target.value;
        
        // 타입별 변환
        if (arg.type === 'number') {
          newValue = parseFloat(newValue) || 0;
        } else if (arg.type === 'boolean') {
          newValue = (e.target as HTMLInputElement).checked;
        }
        
        updateToolArgument(toolId, arg.name, newValue);
      },
      className: "w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    };

    switch (arg.type) {
      case 'boolean':
        return (
          <input
            type="checkbox"
            {...commonProps}
            checked={value}
            onChange={(e) => updateToolArgument(toolId, arg.name, e.target.checked)}
            className="rounded"
          />
        );
      
      case 'number':
        return (
          <input
            type="number"
            {...commonProps}
            step="any"
          />
        );
      
      case 'array':
      case 'object':
        return (
          <textarea
            {...commonProps}
            rows={3}
            placeholder={arg.type === 'array' ? '["item1", "item2"]' : '{"key": "value"}'}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value || (arg.type === 'array' ? '[]' : '{}'));
                updateToolArgument(toolId, arg.name, parsed);
              } catch {
                // JSON 파싱 실패 시 문자열로 저장
                updateToolArgument(toolId, arg.name, e.target.value);
              }
            }}
            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
          />
        );
      
      default:
        return (
          <input
            type="text"
            {...commonProps}
            placeholder={arg.description || `${arg.name} 입력...`}
          />
        );
    }
  }, [updateToolArgument]);

  return (
    <div className={`flex flex-col h-full bg-base-100 ${className || ''}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-base-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-base-content">MCP 도구</h3>
          <span className="text-sm text-base-content/70">
            {filteredTools.length}개 도구
          </span>
        </div>
        
        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
          <input
            type="text"
            placeholder="도구 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 input input-bordered input-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* 도구 목록 */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(toolsByServer).map(([serverId, serverTools]) => (
          <div key={serverId} className="border-b">
            {/* 서버 헤더 */}
            <div className="px-4 py-2 bg-base-200 border-b">
              <h4 className="font-medium text-sm text-base-content">
                {serverId} ({serverTools.length}개 도구)
              </h4>
            </div>

            {/* 서버의 도구들 */}
            {serverTools.map((tool) => {
              const toolId = `${tool.server_id}-${tool.name}`;
              const isExpanded = expandedTools.has(toolId);
              const isExecuting = executingTool === toolId;
              const toolArgs = parseToolArguments(tool);

              return (
                <div key={toolId} className="border-b last:border-b-0">
                  {/* 도구 헤더 */}
                  <div 
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-base-200"
                    onClick={() => toggleToolExpansion(toolId)}
                  >
                    <div className="flex-1">
                      <h5 className="font-medium text-base-content">{tool.name}</h5>
                      <p className="text-xs text-base-content/70 mt-1">{tool.description || '설명 없음'}</p>
                    </div>
                    <div className="flex items-center">
                      {isExpanded ? 
                        <ChevronDown className="w-5 h-5 text-base-content/50" /> : 
                        <ChevronRight className="w-5 h-5 text-base-content/50" />
                      }
                    </div>
                  </div>

                  {/* 도구 상세 정보 (확장 시) */}
                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {toolArgs.length > 0 ? (
                        <div className="space-y-3">
                          <h6 className="text-sm font-medium text-base-content">인수:</h6>
                          {toolArgs.map((arg) => (
                            <div key={arg.name} className="mb-3 last:mb-0">
                              <label className="block text-sm mb-1">
                                <span className="font-mono">{arg.name}</span>
                                {arg.required && <span className="text-error ml-1">*</span>}
                                {arg.description && (
                                  <span className="text-xs text-base-content/70 ml-2">
                                    - {arg.description}
                                  </span>
                                )}
                              </label>
                              {renderArgumentInput(tool, arg)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-base-content/70">이 도구는 인수가 필요하지 않습니다.</p>
                      )}

                      {/* 스키마 정보 */}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-base-content/70 hover:text-base-content">
                          스키마 보기
                        </summary>
                        <pre className="mt-2 p-2 bg-base-200 rounded text-xs overflow-x-auto">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </details>

                      {/* 도구 실행 버튼 */}
                      <div className="flex items-center justify-between mt-4">
                        <button 
                          onClick={() => copyToolArgsAsJSON(tool)}
                          className="btn btn-ghost btn-xs flex items-center gap-1 text-xs"
                        >
                          <Copy className="w-3 h-3" />
                          <span>JSON으로 복사</span>
                        </button>
                        <button
                          onClick={() => handleExecuteTool(tool)}
                          disabled={isExecuting || isLoading}
                          className={`btn btn-sm ${isExecuting || isLoading ? 'btn-disabled' : 'btn-primary'}`}
                        >
                          {isExecuting ? (
                            <>
                              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block mr-1" />
                              실행 중
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 inline mr-1" />
                              실행
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {filteredTools.length === 0 && (
          <div className="p-8 text-center text-base-content/70">
            <Settings className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
            <p className="text-sm">
              {searchQuery ? '검색 결과가 없습니다.' : '사용 가능한 도구가 없습니다.'}
            </p>
            {!searchQuery && (
              <p className="text-xs mt-2">
                MCP 서버를 시작하면 도구들이 여기에 표시됩니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPToolPanel;