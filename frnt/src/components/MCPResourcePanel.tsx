// frnt/src/components/MCPResourcePanel.tsx
import React, { useState, useCallback } from 'react';
import { Search, Settings } from 'lucide-react';
import { MCPResource } from '../utils/mcp-client';

interface MCPResourcePanelProps {
  resources: MCPResource[];
  onViewResource?: (serverId: string, uri: string) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

const MCPResourcePanel: React.FC<MCPResourcePanelProps> = ({
  resources,
  onViewResource,
  isLoading = false,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // 리소스 검색 필터링
  const filteredResources = resources.filter(resource =>
    resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resource.uri.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (resource.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    resource.server_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 서버별 리소스 그룹화
  const resourcesByServer = filteredResources.reduce((acc, resource) => {
    if (!acc[resource.server_id]) {
      acc[resource.server_id] = [];
    }
    acc[resource.server_id].push(resource);
    return acc;
  }, {} as Record<string, MCPResource[]>);

  // 리소스 조회 처리
  const handleViewResource = useCallback(async (resource: MCPResource) => {
    if (!onViewResource) return;
    
    try {
      await onViewResource(resource.server_id, resource.uri);
    } catch (error) {
      console.error(`리소스 조회 오류 (${resource.uri}):`, error);
    }
  }, [onViewResource]);

  return (
    <div className={`flex flex-col h-full bg-white ${className || ''}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">MCP 리소스</h3>
          <span className="text-sm text-gray-500">
            {filteredResources.length}개 리소스
          </span>
        </div>
        
        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="리소스 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 리소스 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-sm">리소스 로딩 중...</p>
          </div>
        ) : (
          <>
            {Object.entries(resourcesByServer).map(([serverId, serverResources]) => (
              <div key={serverId} className="border-b">
                {/* 서버 헤더 */}
                <div className="px-4 py-2 bg-gray-100 border-b">
                  <h4 className="font-medium text-sm text-gray-700">
                    {serverId} ({serverResources.length}개 리소스)
                  </h4>
                </div>

                {/* 리소스 테이블 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">이름</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">URI</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">설명</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">MIME 타입</th>
                        {onViewResource && <th className="px-4 py-2 text-left font-medium text-gray-600">조회</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {serverResources.map((resource, index) => (
                        <tr 
                          key={`${resource.uri}-${index}`}
                          className="border-t hover:bg-gray-50"
                        >
                          <td className="px-4 py-3 font-medium">{resource.name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{resource.uri}</td>
                          <td className="px-4 py-3">{resource.description}</td>
                          <td className="px-4 py-3 font-mono text-xs">{resource.mimeType}</td>
                          {onViewResource && (
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleViewResource(resource)}
                                className="px-2 py-1 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600"
                              >
                                조회
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {filteredResources.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <Settings className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-sm">
                  {searchQuery ? '검색 결과가 없습니다.' : '사용 가능한 리소스가 없습니다.'}
                </p>
                {!searchQuery && (
                  <p className="text-xs mt-2">
                    MCP 서버를 시작하면 리소스들이 여기에 표시됩니다.
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

export default MCPResourcePanel;
