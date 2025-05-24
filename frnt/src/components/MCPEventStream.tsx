// frnt/src/components/MCPEventStream.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Activity, 
  Pause, 
  Play, 
  Trash2, 
  Filter, 
  Download, 
  Eye, 
  EyeOff,
  AlertCircle,
  CheckCircle,
  Info,
  XCircle
} from 'lucide-react';
import { MCPEvent } from '../utils/mcp-client';

interface MCPEventStreamProps {
  events: MCPEvent[];
  isConnected: boolean;
  className?: string;
}

interface EventFilter {
  types: Set<string>;
  servers: Set<string>;
  levels: Set<'info' | 'success' | 'warning' | 'error'>;
  searchQuery: string;
}

const MCPEventStream: React.FC<MCPEventStreamProps> = ({
  events,
  isConnected,
  className
}) => {
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<EventFilter>({
    types: new Set(),
    servers: new Set(),
    levels: new Set(),
    searchQuery: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [displayedEvents, setDisplayedEvents] = useState<MCPEvent[]>([]);
  
  const eventContainerRef = useRef<HTMLDivElement>(null);
  const lastEventCountRef = useRef<number>(0);

  // 이벤트 레벨 결정
  const getEventLevel = useCallback((event: MCPEvent): 'info' | 'success' | 'warning' | 'error' => {
    const type = event.type.toLowerCase();
    
    if (type.includes('error') || type.includes('failed') || type.includes('disconnect')) {
      return 'error';
    } else if (type.includes('success') || type.includes('completed') || type.includes('started')) {
      return 'success';
    } else if (type.includes('warning') || type.includes('timeout') || type.includes('retry')) {
      return 'warning';
    } else {
      return 'info';
    }
  }, []);

  // 이벤트 필터링
  const filteredEvents = useCallback(() => {
    return events.filter(event => {
      // 타입 필터
      if (filter.types.size > 0 && !filter.types.has(event.type)) {
        return false;
      }

      // 서버 필터
      const serverId = event.data?.server_id;
      if (filter.servers.size > 0 && serverId && !filter.servers.has(serverId)) {
        return false;
      }

      // 레벨 필터
      const level = getEventLevel(event);
      if (filter.levels.size > 0 && !filter.levels.has(level)) {
        return false;
      }

      // 검색 쿼리
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        const searchText = `${event.type} ${JSON.stringify(event.data)}`.toLowerCase();
        if (!searchText.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [events, filter, getEventLevel]);

  // 표시할 이벤트 업데이트
  useEffect(() => {
    if (!isPaused) {
      setDisplayedEvents(filteredEvents());
    }
  }, [isPaused, filteredEvents]);

  // 자동 스크롤
  useEffect(() => {
    if (isAutoScroll && eventContainerRef.current && events.length > lastEventCountRef.current) {
      eventContainerRef.current.scrollTop = eventContainerRef.current.scrollHeight;
    }
    lastEventCountRef.current = events.length;
  }, [displayedEvents, isAutoScroll, events.length]);

  // 고유한 타입과 서버 목록 추출
  const uniqueTypes = [...new Set(events.map(e => e.type))].sort();
  const uniqueServers = [...new Set(events.map(e => e.data?.server_id).filter(Boolean))].sort();

  // 필터 토글
  const toggleFilter = useCallback(<T,>(set: Set<T>, item: T) => {
    const newSet = new Set(set);
    if (newSet.has(item)) {
      newSet.delete(item);
    } else {
      newSet.add(item);
    }
    return newSet;
  }, []);

  // 이벤트 아이콘
  const getEventIcon = useCallback((event: MCPEvent) => {
    const level = getEventLevel(event);
    const iconClass = "w-4 h-4";
    
    switch (level) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case 'error':
        return <XCircle className={`${iconClass} text-red-500`} />;
      case 'warning':
        return <AlertCircle className={`${iconClass} text-yellow-500`} />;
      default:
        return <Info className={`${iconClass} text-blue-500`} />;
    }
  }, [getEventLevel]);

  // 이벤트 내보내기
  const exportEvents = useCallback(() => {
    const data = JSON.stringify(displayedEvents, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-events-${new Date().toISOString().slice(0, 19)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [displayedEvents]);

  // 이벤트 지우기
  const clearEvents = useCallback(() => {
    if (confirm('모든 이벤트를 지우시겠습니까?')) {
      setDisplayedEvents([]);
    }
  }, []);

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <h3 className="text-lg font-semibold">이벤트 스트림</h3>
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isConnected ? '🟢 연결됨' : '🔴 연결 안됨'}
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-500">
              {displayedEvents.length}/{events.length}
            </span>
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`px-3 py-1 text-xs font-medium rounded flex items-center space-x-1 ${
                isPaused 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span>{isPaused ? '재개' : '일시정지'}</span>
            </button>
            
            <button
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className={`px-3 py-1 text-xs font-medium rounded flex items-center space-x-1 ${
                isAutoScroll 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {isAutoScroll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>자동스크롤</span>
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1 text-xs font-medium rounded flex items-center space-x-1 ${
                showFilters 
                  ? 'bg-purple-100 text-purple-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>필터</span>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={exportEvents}
              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="이벤트 내보내기"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={clearEvents}
              className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
              title="이벤트 지우기"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 필터 패널 */}
        {showFilters && (
          <div className="mt-4 p-3 bg-white border rounded-lg space-y-3">
            {/* 검색 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">검색</label>
              <input
                type="text"
                placeholder="이벤트 검색..."
                value={filter.searchQuery}
                onChange={(e) => setFilter(prev => ({ ...prev, searchQuery: e.target.value }))}
                className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* 이벤트 타입 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">이벤트 타입</label>
              <div className="flex flex-wrap gap-1">
                {uniqueTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => setFilter(prev => ({ 
                      ...prev, 
                      types: toggleFilter(prev.types, type) 
                    }))}
                    className={`px-2 py-1 text-xs rounded ${
                      filter.types.has(type)
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* 서버 */}
            {uniqueServers.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">서버</label>
                <div className="flex flex-wrap gap-1">
                  {uniqueServers.map(server => (
                    <button
                      key={server}
                      onClick={() => setFilter(prev => ({ 
                        ...prev, 
                        servers: toggleFilter(prev.servers, server) 
                      }))}
                      className={`px-2 py-1 text-xs rounded ${
                        filter.servers.has(server)
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {server}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 레벨 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">레벨</label>
              <div className="flex flex-wrap gap-1">
                {(['info', 'success', 'warning', 'error'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setFilter(prev => ({ 
                      ...prev, 
                      levels: toggleFilter(prev.levels, level) 
                    }))}
                    className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                      filter.levels.has(level)
                        ? `bg-${level === 'info' ? 'blue' : level === 'success' ? 'green' : level === 'warning' ? 'yellow' : 'red'}-100 text-${level === 'info' ? 'blue' : level === 'success' ? 'green' : level === 'warning' ? 'yellow' : 'red'}-800`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{level}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setFilter({
                types: new Set(),
                servers: new Set(),
                levels: new Set(),
                searchQuery: ''
              })}
              className="w-full px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>

      {/* 이벤트 목록 */}
      <div 
        ref={eventContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 5;
          setIsAutoScroll(isAtBottom);
        }}
      >
        {displayedEvents.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">
              {events.length === 0 ? '이벤트가 없습니다.' : '필터 조건에 맞는 이벤트가 없습니다.'}
            </p>
            {!isConnected && (
              <p className="text-xs mt-2 text-red-500">
                이벤트 스트림에 연결되지 않았습니다.
              </p>
            )}
          </div>
        ) : (
          displayedEvents.map((event, index) => {
            const level = getEventLevel(event);
            const timestamp = new Date(event.timestamp);
            
            return (
              <div
                key={index}
                className={`p-3 rounded-lg border-l-4 ${
                  level === 'error' ? 'border-red-500 bg-red-50' :
                  level === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                  level === 'success' ? 'border-green-500 bg-green-50' :
                  'border-blue-500 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getEventIcon(event)}
                    <span className="font-medium text-sm">{event.type}</span>
                    {event.data?.server_id && (
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                        {event.data.server_id}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {timestamp.toLocaleTimeString()}
                  </span>
                </div>
                
                {event.data && Object.keys(event.data).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">
                      데이터 보기
                    </summary>
                    <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto border">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })
        )}

        {/* 스크롤 하단 감지용 마커 */}
        <div className="h-1" />
      </div>

      {/* 하단 상태 바 */}
      <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <div>
            {isPaused && (
              <span className="text-yellow-600 font-medium">
                ⏸️ 일시정지됨 - 새 이벤트가 표시되지 않습니다
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span>총 {events.length}개 이벤트</span>
            <span>표시 중 {displayedEvents.length}개</span>
            {filter.searchQuery && (
              <span className="text-blue-600">
                "{filter.searchQuery}" 검색 중
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCPEventStream;