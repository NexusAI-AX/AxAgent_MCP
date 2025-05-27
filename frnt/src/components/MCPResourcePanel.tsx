// frnt/src/components/MCPResourcePanel.tsx
import React, { useState, useCallback } from 'react';
import { Search, Settings } from 'lucide-react';
import { MCPResource } from '../utils/mcp-client';

interface MCPResourcePanelProps {
  resources: MCPResource[];
  onViewResource?: (serverId: string, uri: string) => Promise<any>;
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
    // 이미 content가 있는지 확인
    if (resource.content) {
      // 이미 가져온 데이터 사용
      console.log(`이미 가져온 리소스 내용 사용: ${resource.uri}`);
      alert(JSON.stringify(resource.content, null, 2));
      return;
    }
    
    // 데이터가 없는 경우에만 API 호출
    if (!onViewResource) return;
    
    try {
      const result = await onViewResource(resource.server_id, resource.uri);
      alert(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`리소스 조회 오류 (${resource.uri}):`, error);
    }
  }, [onViewResource]);

  return (
    <div className={`flex flex-col h-full bg-base-100 ${className || ''}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-base-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-base-content">MCP 리소스</h3>
          <span className="text-sm text-base-content/70">
            {filteredResources.length}개 리소스
          </span>
        </div>
        
        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
          <input
            type="text"
            placeholder="리소스 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 input input-bordered input-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* 리소스 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-base-content/70">
            <div className="loading loading-spinner loading-md mx-auto mb-4"></div>
            <p className="text-sm">리소스 로딩 중...</p>
          </div>
        ) : (
          <>
            {Object.entries(resourcesByServer).map(([serverId, serverResources]) => (
              <div key={serverId} className="border-b">
                {/* 서버 헤더 */}
                <div className="px-4 py-2 bg-base-200 border-b">
                  <h4 className="font-medium text-sm text-base-content">
                    {serverId} ({serverResources.length}개 리소스)
                  </h4>
                </div>

                {/* 리소스 테이블 */}
                <div className="overflow-x-auto">
                  <table className="table table-zebra w-full text-sm">
                    <thead className="bg-base-200">
                      <tr>
                        <th className="text-left font-medium">이름</th>
                        <th className="text-left font-medium">URI</th>
                        <th className="text-left font-medium">설명</th>
                        <th className="text-left font-medium">MIME 타입</th>
                        {onViewResource && <th className="text-left font-medium">조회</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {serverResources.map((resource, index) => (
                        <tr 
                          key={`${resource.uri}-${index}`}
                          className="hover"
                        >
                          <td className="font-medium">{resource.name}</td>
                          <td className="font-mono text-xs">{resource.uri}</td>
                          <td>{resource.description}</td>
                          <td className="font-mono text-xs">{resource.mimeType}</td>
                          {onViewResource && (
                            <td>
                              <button
                                onClick={() => handleViewResource(resource)}
                                className="btn btn-primary btn-xs"
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
              <div className="p-8 text-center text-base-content/70">
                <Settings className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
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
