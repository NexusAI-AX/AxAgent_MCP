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

  // 이벤트 배경색 결정
  const getEventBgColor = useCallback((level: 'info' | 'success' | 'warning' | 'error') => {
    switch (level) {
      case 'success': return 'border-success bg-success/10';
      case 'error': return 'border-error bg-error/10';
      case 'warning': return 'border-warning bg-warning/10';
      default: return 'border-info bg-info/10';
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
        return <CheckCircle className={`${iconClass} text-success`} />;
      case 'error':
        return <XCircle className={`${iconClass} text-error`} />;
      case 'warning':
        return <AlertCircle className={`${iconClass} text-warning`} />;
      default:
        return <Info className={`${iconClass} text-info`} />;
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

  // 필터 초기화
  const resetFilters = useCallback(() => {
    setFilter({
      types: new Set(),
      servers: new Set(),
      levels: new Set(),
      searchQuery: ''
    });
  }, []);

  // 이벤트 목록 스크롤 핸들러
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 5;
    setIsAutoScroll(isAtBottom);
  }, []);

  // 타임스탬프 포맷
  const formatTimestamp = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }, []);

  // 이벤트 데이터 포맷
  const formatEventData = useCallback((event: MCPEvent) => {
    return JSON.stringify(event.data, null, 2);
  }, []);

  return (
    <div className={`flex flex-col h-full bg-base-100 ${className || ''}`}>
      {/* 헤더 */}
      <div className="p-4 border-b bg-base-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-base-content">이벤트 스트림</h3>
          <div className="flex items-center space-x-2">
            <span className={`badge ${isConnected ? 'badge-success' : 'badge-error'} gap-1`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success-content' : 'bg-error-content'}`}></span>
              {isConnected ? '연결됨' : '연결 끊김'}
            </span>
            <span className="text-sm text-base-content/70">
              {displayedEvents.length}개 이벤트
            </span>
          </div>
        </div>

        {/* 제어 버튼 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`btn btn-xs ${isPaused ? 'btn-warning' : 'btn-ghost'} gap-1`}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span>{isPaused ? '재개' : '일시정지'}</span>
            </button>
            
            <button
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className={`btn btn-xs ${isAutoScroll ? 'btn-primary' : 'btn-ghost'} gap-1`}
            >
              {isAutoScroll ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>자동스크롤</span>
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn btn-xs ${showFilters ? 'btn-secondary' : 'btn-ghost'} gap-1`}
            >
              <Filter className="w-3 h-3" />
              <span>필터</span>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={exportEvents}
              className="btn btn-ghost btn-xs btn-square"
              title="이벤트 내보내기"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={clearEvents}
              className="btn btn-ghost btn-xs btn-square text-error"
              title="이벤트 지우기"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 필터 패널 */}
        {showFilters && (
          <div className="mt-4 p-3 bg-base-200 border rounded-lg space-y-3">
            {/* 검색 */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="이벤트 검색..."
                value={filter.searchQuery}
                onChange={(e) => setFilter(prev => ({ ...prev, searchQuery: e.target.value }))}
                className="flex-1 input input-bordered input-sm"
              />
              {filter.searchQuery && (
                <button
                  onClick={() => setFilter(prev => ({ ...prev, searchQuery: '' }))}
                  className="btn btn-ghost btn-xs btn-square"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 이벤트 타입 */}
            <div>
              <h4 className="text-xs font-medium text-base-content mb-2">이벤트 타입</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {uniqueTypes.map(type => (
                  <label key={type} className="flex items-center space-x-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filter.types.has(type)}
                      onChange={() => setFilter(prev => ({
                        ...prev,
                        types: toggleFilter(prev.types, type)
                      }))}
                      className="checkbox checkbox-xs checkbox-primary"
                    />
                    <span className="text-base-content/80">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 서버 */}
            {uniqueServers.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-base-content mb-2">서버</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {uniqueServers.map(server => (
                    <label key={server} className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filter.servers.has(server)}
                        onChange={() => setFilter(prev => ({
                          ...prev,
                          servers: toggleFilter(prev.servers, server)
                        }))}
                        className="checkbox checkbox-xs checkbox-primary"
                      />
                      <span className="text-base-content/80">{server}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 레벨 */}
            <div>
              <h4 className="text-xs font-medium text-base-content mb-2">레벨</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(['info', 'success', 'warning', 'error'] as const).map(level => (
                  <label key={level} className="flex items-center space-x-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filter.levels.has(level)}
                      onChange={() => setFilter(prev => ({
                        ...prev,
                        levels: toggleFilter(prev.levels, level)
                      }))}
                      className="checkbox checkbox-xs checkbox-primary"
                    />
                    <span className="text-base-content/80">{level}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 필터 초기화 버튼 */}
            <div className="flex justify-end">
              <button
                onClick={resetFilters}
                className="btn btn-ghost btn-xs"
              >
                필터 초기화
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 이벤트 목록 */}
      <div 
        ref={eventContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
        onScroll={handleScroll}
      >
        {displayedEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-base-content/70">
            <div className="text-center">
              <Activity className="w-12 h-12 mx-auto mb-2 text-base-content/30" />
              <p>이벤트가 없습니다</p>
            </div>
          </div>
        ) : (
          displayedEvents.map((event, index) => {
            const level = getEventLevel(event);
            return (
              <div 
                key={`${event.timestamp}-${index}`} 
                className={`card card-compact card-bordered ${getEventBgColor(level)}`}
              >
                <div className="card-body p-3">
                  <div className="flex items-start">
                    <div className="mr-3 mt-0.5">
                      {getEventIcon(event)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center mb-1">
                        <span className="font-medium text-sm">{event.type}</span>
                        {event.data?.server_id && (
                          <span className="ml-2 badge badge-sm badge-ghost">
                            {event.data.server_id}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-base-content/60">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap overflow-x-auto bg-base-200 p-2 rounded">
                        {formatEventData(event)}
                      </pre>
                    </div>
                  </div>
                </div>
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