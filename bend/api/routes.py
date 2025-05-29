"""
FastAPI 라우트 정의
"""

import asyncio
import json
import logging
from datetime import datetime
from dataclasses import asdict
from typing import AsyncGenerator, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from core.manager import MCPClientManager
from core.models import (
    ServerControlRequest,
    ToolCallRequest,
    ResourceReadRequest,
    PromptGetRequest
)

# 로깅 설정
logger = logging.getLogger(__name__)

# 라우터 생성
router = APIRouter()

# WebSocket 관리자
class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections.copy():
            try:
                await connection.send_json(message)
            except:
                self.disconnect(connection)

websocket_manager = WebSocketManager()

# MCP 관리자 인스턴스 (전역)
mcp_manager = MCPClientManager()

# ===== 의존성 =====
def get_mcp_manager() -> MCPClientManager:
    return mcp_manager

# ===== API 엔드포인트 =====

@router.get("/")
async def root():
    return {"message": "MCP 관리 서버가 실행 중입니다"}

@router.get("/config")
async def get_config(manager: MCPClientManager = Depends(get_mcp_manager)):
    """MCP 설정 정보 조회"""
    return {
        "servers": {
            server_id: asdict(config) 
            for server_id, config in manager.servers.items()
        }
    }

@router.post("/config/reload")
async def reload_config(manager: MCPClientManager = Depends(get_mcp_manager)):
    """MCP 설정 다시 로드"""
    manager.load_config()
    return {"message": "설정이 다시 로드되었습니다"}

@router.get("/status")
async def get_status(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버 상태 조회"""
    servers = {}
    for server_id, status in manager.server_status.items():
        status_dict = asdict(status)
        # datetime 객체를 문자열로 변환
        if status_dict.get('started_at'):
            status_dict['started_at'] = status_dict['started_at'].isoformat()
        servers[server_id] = status_dict
    
    return {"servers": servers}

@router.get("/status/{server_id}")
async def get_server_status(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버 상태 조회"""
    if server_id not in manager.server_status:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    status_dict = asdict(manager.server_status[server_id])
    # datetime 객체를 문자열로 변환
    if status_dict.get('started_at'):
        status_dict['started_at'] = status_dict['started_at'].isoformat()
    
    return status_dict

@router.post("/servers/control")
async def control_server(
    request: ServerControlRequest,
    background_tasks: BackgroundTasks,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """서버 제어 (시작/중지/재시작)"""
    if request.server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {request.server_id}")
    
    async def start_server_task():
        try:
            success = await manager.start_server(request.server_id)
            logger.info(f"백그라운드 서버 시작 {'성공' if success else '실패'}: {request.server_id}")
        except Exception as e:
            logger.error(f"백그라운드 서버 시작 오류 {request.server_id}: {e}")
    
    async def stop_server_task():
        try:
            success = await manager.stop_server(request.server_id)
            logger.info(f"백그라운드 서버 중지 {'성공' if success else '실패'}: {request.server_id}")
        except Exception as e:
            logger.error(f"백그라운드 서버 중지 오류 {request.server_id}: {e}")
    
    async def restart_server_task():
        try:
            await manager.stop_server(request.server_id)
            await asyncio.sleep(1)  # 잠시 대기
            success = await manager.start_server(request.server_id)
            logger.info(f"백그라운드 서버 재시작 {'성공' if success else '실패'}: {request.server_id}")
        except Exception as e:
            logger.error(f"백그라운드 서버 재시작 오류 {request.server_id}: {e}")
    
    if request.action == "start":
        background_tasks.add_task(start_server_task)
        return {"message": "서버 시작 요청이 처리되고 있습니다"}
    
    elif request.action == "stop":
        background_tasks.add_task(stop_server_task)
        return {"message": "서버 중지 요청이 처리되고 있습니다"}
    
    elif request.action == "restart":
        background_tasks.add_task(restart_server_task)
        return {"message": "서버 재시작 요청이 처리되고 있습니다"}
    
    else:
        raise HTTPException(400, f"알 수 없는 액션: {request.action}")

@router.get("/tools")
async def get_all_tools(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버의 도구 목록 조회"""
    all_tools = {}
    for server_id, tools in manager.tools.items():
        all_tools[server_id] = [asdict(tool) for tool in tools]
    return all_tools

@router.get("/tools/{server_id}")
async def get_server_tools(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버의 도구 목록 조회"""
    logger.info(f"도구 목록 요청: {server_id}")
    logger.info(f"등록된 서버들: {list(manager.servers.keys())}")
    logger.info(f"도구 데이터 키들: {list(manager.tools.keys())}")
    logger.info(f"서버 {server_id}의 도구 개수: {len(manager.tools.get(server_id, []))}")
    
    if server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    tools = manager.tools.get(server_id, [])
    logger.info(f"반환할 도구 목록: {[tool.name for tool in tools]}")
    
    return [asdict(tool) for tool in tools]

@router.post("/tools/call")
async def call_tool(
    request: ToolCallRequest,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """도구 실행"""
    try:
        result = await manager.call_tool(
            request.server_id,
            request.tool_name,
            request.arguments
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(500, f"도구 실행 실패: {str(e)}")

@router.get("/resources")
async def get_all_resources(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버의 리소스 목록 조회"""
    all_resources = {}
    for server_id, resources in manager.resources.items():
        all_resources[server_id] = [asdict(resource) for resource in resources]
    return all_resources

@router.get("/resources/{server_id}")
async def get_server_resources(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버의 리소스 목록 조회"""
    if server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    return [asdict(resource) for resource in manager.resources[server_id]]

@router.post("/resources/read")
async def read_resource(
    request: ResourceReadRequest,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """리소스 읽기"""
    try:
        content = await manager.read_resource(request.server_id, request.uri)
        return {"success": True, "content": content, "uri": request.uri}
    except Exception as e:
        raise HTTPException(500, f"리소스 읽기 실패: {str(e)}")

@router.get("/prompts")
async def get_all_prompts(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버의 프롬프트 목록 조회"""
    all_prompts = {}
    for server_id, prompts in manager.prompts.items():
        all_prompts[server_id] = [asdict(prompt) for prompt in prompts]
    return all_prompts

@router.get("/prompts/{server_id}")
async def get_server_prompts(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버의 프롬프트 목록 조회"""
    if server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    return [asdict(prompt) for prompt in manager.prompts[server_id]]

@router.post("/prompts/get")
async def get_prompt(
    request: PromptGetRequest,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """프롬프트 가져오기"""
    try:
        result = await manager.get_prompt(
            request.server_id,
            request.prompt_name,
            request.arguments
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(500, f"프롬프트 가져오기 실패: {str(e)}")

@router.get("/events")
async def stream_events(manager: MCPClientManager = Depends(get_mcp_manager)):
    """SSE를 통한 실시간 이벤트 스트리밍"""
    
    async def event_generator() -> AsyncGenerator[str, None]:
        while True:
            try:
                # 이벤트 큐에서 이벤트 가져오기 (1초 타임아웃)
                event = await asyncio.wait_for(manager.event_queue.get(), timeout=1.0)
                
                # SSE 형식으로 이벤트 전송
                event_data = json.dumps(event)
                yield f"data: {event_data}\n\n"
                
            except asyncio.TimeoutError:
                # 타임아웃 시 heartbeat 전송
                heartbeat = {
                    "timestamp": datetime.now().isoformat(),
                    "type": "heartbeat",
                    "data": {}
                }
                yield f"data: {json.dumps(heartbeat)}\n\n"
                
            except Exception as e:
                logger.error(f"SSE 이벤트 스트리밍 오류: {e}")
                error_event = {
                    "timestamp": datetime.now().isoformat(),
                    "type": "error",
                    "data": {"error": str(e)}
                }
                yield f"data: {json.dumps(error_event)}\n\n"
                break
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control"
        }
    )

@router.post("/auto-start")
async def auto_start_servers(
    background_tasks: BackgroundTasks,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """auto_start가 설정된 서버들 자동 시작"""
    started_servers = []
    
    for server_id, config in manager.servers.items():
        if config.auto_start:
            try:
                await manager.start_server(server_id)
                started_servers.append(server_id)
            except Exception as e:
                logger.error(f"자동 시작 실패 {server_id}: {e}")
    
    return {
        "message": f"{len(started_servers)}개 서버 자동 시작",
        "servers": started_servers
    }

@router.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 엔드포인트 (실시간 양방향 통신)"""
    await websocket_manager.connect(websocket)
    
    try:
        while True:
            # 클라이언트로부터 메시지 수신
            data = await websocket.receive_json()
            
            # 메시지 타입별 처리
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
            
            elif data.get("type") == "get_status":
                status = {
                    "type": "status_update",
                    "data": {
                        server_id: asdict(status)
                        for server_id, status in mcp_manager.server_status.items()
                    }
                }
                await websocket.send_json(status)
            
            elif data.get("type") == "call_tool":
                try:
                    result = await mcp_manager.call_tool(
                        data["server_id"],
                        data["tool_name"],
                        data.get("arguments", {})
                    )
                    await websocket.send_json({
                        "type": "tool_result",
                        "request_id": data.get("request_id"),
                        "success": True,
                        "result": result
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "tool_result", 
                        "request_id": data.get("request_id"),
                        "success": False,
                        "error": str(e)
                    })
            
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket 오류: {e}")
        websocket_manager.disconnect(websocket)
