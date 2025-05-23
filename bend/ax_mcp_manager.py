#!/usr/bin/env python3
"""
FastAPI MCP 관리 서버
- mcp_config.json 읽기 및 관리
- MCP 서버들과 stdio 통신
- SSE를 통한 실시간 상태 전송
- 리소스, 프롬프트, 도구 통합 관리
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, AsyncGenerator
from dataclasses import dataclass, asdict
from subprocess import Popen, PIPE
from collections import defaultdict

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===== 데이터 모델 =====

@dataclass
class MCPServerConfig:
    name: str
    description: str
    command: Union[str, List[str]]
    args: Union[str, List[str]] = None
    env: Dict[str, str] = None
    auto_start: bool = False

@dataclass
class MCPTool:
    name: str
    description: str
    inputSchema: Dict[str, Any]
    server_id: str

@dataclass
class MCPResource:
    uri: str
    name: str
    description: str
    mimeType: str
    server_id: str

@dataclass
class MCPPrompt:
    name: str
    description: str
    arguments: List[Dict[str, Any]]
    server_id: str

@dataclass
class MCPServerStatus:
    server_id: str
    status: str  # "stopped", "starting", "running", "error"
    pid: Optional[int] = None
    started_at: Optional[datetime] = None
    last_error: Optional[str] = None
    tools_count: int = 0
    resources_count: int = 0
    prompts_count: int = 0

# ===== Pydantic 모델 =====

class ToolCallRequest(BaseModel):
    server_id: str
    tool_name: str
    arguments: Dict[str, Any] = {}

class ResourceReadRequest(BaseModel):
    server_id: str
    uri: str

class PromptGetRequest(BaseModel):
    server_id: str
    prompt_name: str
    arguments: Dict[str, Any] = {}

class ServerControlRequest(BaseModel):
    server_id: str
    action: str  # "start", "stop", "restart"

# ===== MCP 클라이언트 관리자 =====

class MCPClientManager:
    def __init__(self, config_path: str = "./mcp_config.json"):
        self.config_path = config_path
        self.servers: Dict[str, MCPServerConfig] = {}
        self.processes: Dict[str, Popen] = {}
        self.tools: Dict[str, List[MCPTool]] = defaultdict(list)
        self.resources: Dict[str, List[MCPResource]] = defaultdict(list)
        self.prompts: Dict[str, List[MCPPrompt]] = defaultdict(list)
        self.server_status: Dict[str, MCPServerStatus] = {}
        self.request_counters: Dict[str, int] = defaultdict(int)
        self.pending_requests: Dict[str, Dict[int, asyncio.Future]] = defaultdict(dict)
        self.event_queue: asyncio.Queue = asyncio.Queue()
        
        # 초기화
        self.load_config()
        
    def load_config(self):
        """MCP 설정 파일 로드"""
        try:
            if not os.path.exists(self.config_path):
                logger.warning(f"설정 파일을 찾을 수 없습니다: {self.config_path}")
                return
                
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
                
            self.servers = {}
            for server_id, server_config in config_data.get('mcpServers', {}).items():
                # 디버깅 로그 추가
                logger.info(f"[{server_id}] 원본 설정: {server_config}")
                
                # command와 args 가져오기 - 이제 MCPServerConfig가 문자열 또는 리스트를 모두 허용
                command = server_config.get('command', [])
                args = server_config.get('args', [])
                
                logger.info(f"[{server_id}] command 타입: {type(command)}, 값: {command}")
                logger.info(f"[{server_id}] args 타입: {type(args)}, 값: {args}")
                
                self.servers[server_id] = MCPServerConfig(
                    name=server_config.get('name', server_id),
                    description=server_config.get('description', ''),
                    command=command,
                    args=args,
                    env=server_config.get('env', {}),
                    auto_start=server_config.get('auto_start', False)
                )
                
                # 서버 상태 초기화
                self.server_status[server_id] = MCPServerStatus(
                    server_id=server_id,
                    status="stopped"
                )
                
            logger.info(f"MCP 설정 로드 완료: {len(self.servers)}개 서버")
            self._send_event("config_loaded", {"servers": list(self.servers.keys())})
            
        except Exception as e:
            logger.error(f"설정 파일 로드 실패: {e}")
            self._send_event("config_error", {"error": str(e)})
    
    def _send_event(self, event_type: str, data: Dict[str, Any]):
        """SSE 이벤트 큐에 이벤트 추가"""
        event = {
            "timestamp": datetime.now().isoformat(),
            "type": event_type,
            "data": data
        }
        try:
            self.event_queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("이벤트 큐가 가득참")
    
    async def start_server(self, server_id: str) -> bool:
        """MCP 서버 시작"""
        if server_id not in self.servers:
            raise ValueError(f"알 수 없는 서버: {server_id}")
            
        if server_id in self.processes:
            logger.warning(f"서버가 이미 실행 중입니다: {server_id}")
            return True
            
        try:
            config = self.servers[server_id]
            self.server_status[server_id].status = "starting"
            self._send_event("server_starting", {"server_id": server_id})
            
            # 환경 변수 설정
            env = os.environ.copy()
            if config.env:
                env.update(config.env)
            
            # 디버깅 로그 추가
            logger.info(f"command 타입: {type(config.command)}, 값: {config.command}")
            logger.info(f"args 타입: {type(config.args)}, 값: {config.args}")
            
            # 명령어 구성 - command 처리
            if isinstance(config.command, list):
                logger.info("command는 리스트입니다.")
                command_list = config.command
            else:
                logger.info("command는 문자열입니다.")
                command_list = [config.command]
            
            # args 처리
            if config.args is None:
                args_list = []
            elif isinstance(config.args, list):
                logger.info("args는 리스트입니다.")
                args_list = config.args
            else:
                logger.info("args는 문자열입니다.")
                args_list = [config.args]
            
            # 최종 명령어 구성
            cmd = command_list + args_list
            logger.info(f"최종 명령어: {cmd}")
            
            # 프로세스 시작
            process = Popen(
                cmd,
                stdin=PIPE,
                stdout=PIPE,
                stderr=PIPE,
                env=env,
                text=True,
                bufsize=0
            )
            
            self.processes[server_id] = process
            self.server_status[server_id].status = "running"
            self.server_status[server_id].pid = process.pid
            self.server_status[server_id].started_at = datetime.now()
            
            logger.info(f"MCP 서버 시작됨: {server_id} (PID: {process.pid})")
            self._send_event("server_started", {"server_id": server_id, "pid": process.pid})
            
            # 백그라운드에서 출력 모니터링
            asyncio.create_task(self._monitor_server_output(server_id))
            
            # 초기화 시작
            await self._initialize_server(server_id)
            
            return True
            
        except Exception as e:
            logger.error(f"서버 시작 실패 {server_id}: {e}")
            self.server_status[server_id].status = "error"
            self.server_status[server_id].last_error = str(e)
            self._send_event("server_error", {"server_id": server_id, "error": str(e)})
            return False
    
    async def stop_server(self, server_id: str) -> bool:
        """MCP 서버 중지"""
        if server_id not in self.processes:
            logger.warning(f"실행 중인 서버를 찾을 수 없습니다: {server_id}")
            return False
            
        try:
            process = self.processes[server_id]
            process.terminate()
            
            # 종료 대기 (최대 5초)
            try:
                process.wait(timeout=5)
            except:
                process.kill()  # 강제 종료
                
            del self.processes[server_id]
            
            # 상태 업데이트
            self.server_status[server_id].status = "stopped"
            self.server_status[server_id].pid = None
            self.server_status[server_id].started_at = None
            
            # 데이터 정리
            self.tools[server_id].clear()
            self.resources[server_id].clear() 
            self.prompts[server_id].clear()
            
            logger.info(f"MCP 서버 중지됨: {server_id}")
            self._send_event("server_stopped", {"server_id": server_id})
            
            return True
            
        except Exception as e:
            logger.error(f"서버 중지 실패 {server_id}: {e}")
            self._send_event("server_error", {"server_id": server_id, "error": str(e)})
            return False
    
    async def _monitor_server_output(self, server_id: str):
        """서버 출력 모니터링 (백그라운드 태스크)"""
        process = self.processes.get(server_id)
        if not process:
            return
            
        try:
            # stdout 읽기 태스크
            async def read_stdout():
                while process.poll() is None:
                    try:
                        line = await asyncio.get_event_loop().run_in_executor(
                            None, process.stdout.readline
                        )
                        if line:
                            await self._handle_server_message(server_id, line.strip())
                    except Exception as e:
                        logger.error(f"stdout 읽기 오류 {server_id}: {e}")
                        break
            
            # stderr 읽기 태스크  
            async def read_stderr():
                while process.poll() is None:
                    try:
                        line = await asyncio.get_event_loop().run_in_executor(
                            None, process.stderr.readline
                        )
                        if line:
                            logger.warning(f"MCP {server_id} stderr: {line.strip()}")
                            self._send_event("server_stderr", {
                                "server_id": server_id, 
                                "message": line.strip()
                            })
                    except Exception as e:
                        logger.error(f"stderr 읽기 오류 {server_id}: {e}")
                        break
            
            # 동시 실행
            await asyncio.gather(read_stdout(), read_stderr())
            
        except Exception as e:
            logger.error(f"서버 출력 모니터링 오류 {server_id}: {e}")
        finally:
            # 프로세스 종료 시 정리
            if server_id in self.processes:
                await self.stop_server(server_id)
    
    async def _handle_server_message(self, server_id: str, message: str):
        """서버로부터 받은 메시지 처리"""
        try:
            if not message.strip():
                return
                
            data = json.loads(message)
            
            # 응답 메시지인 경우
            if "id" in data and data["id"] in self.pending_requests[server_id]:
                future = self.pending_requests[server_id].pop(data["id"])
                if not future.done():
                    future.set_result(data)
            
            # 알림 메시지 처리 (필요한 경우)
            elif "method" in data:
                logger.info(f"MCP {server_id} 알림: {data['method']}")
                
        except json.JSONDecodeError:
            logger.warning(f"MCP {server_id} 비-JSON 메시지: {message}")
        except Exception as e:
            logger.error(f"메시지 처리 오류 {server_id}: {e}")
    
    async def _send_message(self, server_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """MCP 서버에 메시지 전송 및 응답 대기"""
        if server_id not in self.processes:
            raise RuntimeError(f"서버가 실행되지 않음: {server_id}")
            
        process = self.processes[server_id]
        if process.poll() is not None:
            raise RuntimeError(f"서버 프로세스가 종료됨: {server_id}")
        
        # 요청 ID 생성
        if "id" not in message:
            self.request_counters[server_id] += 1
            message["id"] = self.request_counters[server_id]
            
        # 응답 대기용 Future 생성
        future = asyncio.Future()
        self.pending_requests[server_id][message["id"]] = future
        
        try:
            # 메시지 전송
            message_str = json.dumps(message) + "\n"
            await asyncio.get_event_loop().run_in_executor(
                None, process.stdin.write, message_str
            )
            await asyncio.get_event_loop().run_in_executor(
                None, process.stdin.flush
            )
            
            # 응답 대기 (타임아웃 30초)
            response = await asyncio.wait_for(future, timeout=30.0)
            return response
            
        except asyncio.TimeoutError:
            # 타임아웃 시 Future 정리
            if message["id"] in self.pending_requests[server_id]:
                del self.pending_requests[server_id][message["id"]]
            raise RuntimeError(f"요청 타임아웃: {server_id}")
        except Exception as e:
            # 오류 시 Future 정리
            if message["id"] in self.pending_requests[server_id]:
                del self.pending_requests[server_id][message["id"]]
            raise
    
    async def _initialize_server(self, server_id: str):
        """서버 초기화"""
        try:
            # initialize 메시지 전송
            init_message = {
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "roots": {"listChanged": True},
                        "sampling": {}
                    },
                    "clientInfo": {
                        "name": "fastapi-mcp-manager",
                        "version": "1.0.0"
                    }
                }
            }
            
            response = await self._send_message(server_id, init_message)
            
            if "error" in response:
                raise RuntimeError(f"초기화 실패: {response['error']}")
            
            # initialized 알림 전송
            await self._send_message(server_id, {
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            })
            
            logger.info(f"MCP 서버 초기화 완료: {server_id}")
            self._send_event("server_initialized", {"server_id": server_id})
            
            # 도구, 리소스, 프롬프트 로드
            await self._load_server_capabilities(server_id)
            
        except Exception as e:
            logger.error(f"서버 초기화 실패 {server_id}: {e}")
            self.server_status[server_id].status = "error"
            self.server_status[server_id].last_error = str(e)
            self._send_event("server_init_error", {"server_id": server_id, "error": str(e)})
    
    async def _load_server_capabilities(self, server_id: str):
        """서버 기능 로드 (도구, 리소스, 프롬프트)"""
        try:
            # 도구 로드
            await self._load_tools(server_id)
            
            # 리소스 로드  
            await self._load_resources(server_id)
            
            # 프롬프트 로드
            await self._load_prompts(server_id)
            
            # 상태 업데이트
            status = self.server_status[server_id]
            status.tools_count = len(self.tools[server_id])
            status.resources_count = len(self.resources[server_id])
            status.prompts_count = len(self.prompts[server_id])
            
            self._send_event("server_capabilities_loaded", {
                "server_id": server_id,
                "tools": status.tools_count,
                "resources": status.resources_count,
                "prompts": status.prompts_count
            })
            
        except Exception as e:
            logger.error(f"서버 기능 로드 실패 {server_id}: {e}")
    
    async def _load_tools(self, server_id: str):
        """도구 목록 로드"""
        try:
            response = await self._send_message(server_id, {
                "jsonrpc": "2.0",
                "method": "tools/list"
            })
            
            if "error" in response:
                logger.warning(f"도구 로드 오류 {server_id}: {response['error']}")
                return
                
            tools_data = response.get("result", {}).get("tools", [])
            self.tools[server_id] = [
                MCPTool(
                    name=tool["name"],
                    description=tool.get("description", ""),
                    inputSchema=tool.get("inputSchema", {}),
                    server_id=server_id
                )
                for tool in tools_data
            ]
            
            logger.info(f"도구 로드 완료 {server_id}: {len(self.tools[server_id])}개")
            
        except Exception as e:
            logger.error(f"도구 로드 실패 {server_id}: {e}")
    
    async def _load_resources(self, server_id: str):
        """리소스 목록 로드"""
        try:
            response = await self._send_message(server_id, {
                "jsonrpc": "2.0", 
                "method": "resources/list"
            })
            
            if "error" in response:
                logger.warning(f"리소스 로드 오류 {server_id}: {response['error']}")
                return
                
            resources_data = response.get("result", {}).get("resources", [])
            self.resources[server_id] = [
                MCPResource(
                    uri=resource["uri"],
                    name=resource.get("name", resource["uri"]),
                    description=resource.get("description", ""),
                    mimeType=resource.get("mimeType", ""),
                    server_id=server_id
                )
                for resource in resources_data
            ]
            
            logger.info(f"리소스 로드 완료 {server_id}: {len(self.resources[server_id])}개")
            
        except Exception as e:
            logger.error(f"리소스 로드 실패 {server_id}: {e}")
    
    async def _load_prompts(self, server_id: str):
        """프롬프트 목록 로드"""
        try:
            response = await self._send_message(server_id, {
                "jsonrpc": "2.0",
                "method": "prompts/list" 
            })
            
            if "error" in response:
                logger.warning(f"프롬프트 로드 오류 {server_id}: {response['error']}")
                return
                
            prompts_data = response.get("result", {}).get("prompts", [])
            self.prompts[server_id] = [
                MCPPrompt(
                    name=prompt["name"],
                    description=prompt.get("description", ""),
                    arguments=prompt.get("arguments", []),
                    server_id=server_id
                )
                for prompt in prompts_data
            ]
            
            logger.info(f"프롬프트 로드 완료 {server_id}: {len(self.prompts[server_id])}개")
            
        except Exception as e:
            logger.error(f"프롬프트 로드 실패 {server_id}: {e}")
    
    async def call_tool(self, server_id: str, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """도구 실행"""
        try:
            response = await self._send_message(server_id, {
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments
                }
            })
            
            if "error" in response:
                raise RuntimeError(f"도구 실행 오류: {response['error']}")
                
            result = response.get("result", {})
            
            self._send_event("tool_executed", {
                "server_id": server_id,
                "tool_name": tool_name,
                "arguments": arguments,
                "result": result
            })
            
            return result
            
        except Exception as e:
            logger.error(f"도구 실행 실패 {server_id}/{tool_name}: {e}")
            self._send_event("tool_error", {
                "server_id": server_id,
                "tool_name": tool_name,
                "error": str(e)
            })
            raise
    
    async def read_resource(self, server_id: str, uri: str) -> str:
        """리소스 읽기"""
        try:
            response = await self._send_message(server_id, {
                "jsonrpc": "2.0",
                "method": "resources/read",
                "params": {"uri": uri}
            })
            
            if "error" in response:
                raise RuntimeError(f"리소스 읽기 오류: {response['error']}")
                
            contents = response.get("result", {}).get("contents", [])
            if contents:
                content = contents[0].get("text", "")
                
                self._send_event("resource_read", {
                    "server_id": server_id,
                    "uri": uri,
                    "length": len(content)
                })
                
                return content
            
            return ""
            
        except Exception as e:
            logger.error(f"리소스 읽기 실패 {server_id}/{uri}: {e}")
            self._send_event("resource_error", {
                "server_id": server_id,
                "uri": uri,
                "error": str(e)
            })
            raise
    
    async def get_prompt(self, server_id: str, prompt_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """프롬프트 가져오기"""
        try:
            response = await self._send_message(server_id, {
                "jsonrpc": "2.0",
                "method": "prompts/get",
                "params": {
                    "name": prompt_name,
                    "arguments": arguments
                }
            })
            
            if "error" in response:
                raise RuntimeError(f"프롬프트 가져오기 오류: {response['error']}")
                
            result = response.get("result", {})
            
            self._send_event("prompt_retrieved", {
                "server_id": server_id,
                "prompt_name": prompt_name,
                "arguments": arguments
            })
            
            return result
            
        except Exception as e:
            logger.error(f"프롬프트 가져오기 실패 {server_id}/{prompt_name}: {e}")
            self._send_event("prompt_error", {
                "server_id": server_id,
                "prompt_name": prompt_name,
                "error": str(e)
            })
            raise

# ===== 전역 인스턴스 =====
mcp_manager = MCPClientManager()

# ===== Lifespan 이벤트 핸들러 =====
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 생명주기 관리"""
    # 시작 시 실행
    logger.info("MCP 관리 서버 시작됨")
    
    # 자동 시작 서버들 시작
    auto_start_count = 0
    for server_id, config in mcp_manager.servers.items():
        if config.auto_start:
            try:
                await mcp_manager.start_server(server_id)
                auto_start_count += 1
            except Exception as e:
                logger.error(f"자동 시작 실패 {server_id}: {e}")
    
    if auto_start_count > 0:
        logger.info(f"{auto_start_count}개 서버 자동 시작됨")
    
    yield  # 여기서 앱이 실행됨
    
    # 종료 시 실행
    logger.info("MCP 관리 서버 종료 중...")
    
    # 모든 MCP 서버 중지
    for server_id in list(mcp_manager.processes.keys()):
        try:
            await mcp_manager.stop_server(server_id)
        except Exception as e:
            logger.error(f"서버 종료 실패 {server_id}: {e}")
    
    logger.info("MCP 관리 서버 종료됨")

# ===== FastAPI 앱 =====
app = FastAPI(
    title="MCP 관리 서버",
    description="Model Context Protocol 서버들을 관리하는 FastAPI 서버",
    version="1.0.0",
    lifespan=lifespan  # lifespan 핸들러 등록
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 의존성 =====
def get_mcp_manager() -> MCPClientManager:
    return mcp_manager

# ===== API 엔드포인트 =====

@app.get("/")
async def root():
    return {"message": "MCP 관리 서버가 실행 중입니다"}

@app.get("/config")
async def get_config(manager: MCPClientManager = Depends(get_mcp_manager)):
    """MCP 설정 정보 조회"""
    return {
        "servers": {
            server_id: asdict(config) 
            for server_id, config in manager.servers.items()
        }
    }

@app.post("/config/reload")
async def reload_config(manager: MCPClientManager = Depends(get_mcp_manager)):
    """MCP 설정 다시 로드"""
    manager.load_config()
    return {"message": "설정이 다시 로드되었습니다"}

@app.get("/status")
async def get_status(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버 상태 조회"""
    return {
        "servers": {
            server_id: asdict(status)
            for server_id, status in manager.server_status.items()
        }
    }

@app.get("/status/{server_id}")
async def get_server_status(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버 상태 조회"""
    if server_id not in manager.server_status:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    return asdict(manager.server_status[server_id])

@app.post("/servers/control")
async def control_server(
    request: ServerControlRequest,
    background_tasks: BackgroundTasks,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """서버 제어 (시작/중지/재시작)"""
    if request.server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {request.server_id}")
    
    if request.action == "start":
        success = await manager.start_server(request.server_id)
        return {"success": success, "action": "start"}
    
    elif request.action == "stop":
        success = await manager.stop_server(request.server_id)
        return {"success": success, "action": "stop"}
    
    elif request.action == "restart":
        await manager.stop_server(request.server_id)
        await asyncio.sleep(1)  # 잠시 대기
        success = await manager.start_server(request.server_id)
        return {"success": success, "action": "restart"}
    
    else:
        raise HTTPException(400, f"알 수 없는 액션: {request.action}")

@app.get("/tools")
async def get_all_tools(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버의 도구 목록 조회"""
    all_tools = {}
    for server_id, tools in manager.tools.items():
        all_tools[server_id] = [asdict(tool) for tool in tools]
    return all_tools

@app.get("/tools/{server_id}")
async def get_server_tools(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버의 도구 목록 조회"""
    if server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    return [asdict(tool) for tool in manager.tools[server_id]]

@app.post("/tools/call")
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

@app.get("/resources")
async def get_all_resources(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버의 리소스 목록 조회"""
    all_resources = {}
    for server_id, resources in manager.resources.items():
        all_resources[server_id] = [asdict(resource) for resource in resources]
    return all_resources

@app.get("/resources/{server_id}")
async def get_server_resources(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버의 리소스 목록 조회"""
    if server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    return [asdict(resource) for resource in manager.resources[server_id]]

@app.post("/resources/read")
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

@app.get("/prompts")
async def get_all_prompts(manager: MCPClientManager = Depends(get_mcp_manager)):
    """모든 서버의 프롬프트 목록 조회"""
    all_prompts = {}
    for server_id, prompts in manager.prompts.items():
        all_prompts[server_id] = [asdict(prompt) for prompt in prompts]
    return all_prompts

@app.get("/prompts/{server_id}")
async def get_server_prompts(
    server_id: str,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """특정 서버의 프롬프트 목록 조회"""
    if server_id not in manager.servers:
        raise HTTPException(404, f"서버를 찾을 수 없습니다: {server_id}")
    
    return [asdict(prompt) for prompt in manager.prompts[server_id]]

@app.post("/prompts/get")
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

@app.get("/events")
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

@app.post("/auto-start")
async def auto_start_servers(
    background_tasks: BackgroundTasks,
    manager: MCPClientManager = Depends(get_mcp_manager)
):
    """auto_start가 설정된 서버들 자동 시작"""
    started_servers = []
    
    for server_id, config in manager.servers.items():
        if config.auto_start:
            try:
                success = await manager.start_server(server_id)
                if success:
                    started_servers.append(server_id)
            except Exception as e:
                logger.error(f"자동 시작 실패 {server_id}: {e}")
    
    return {
        "message": f"{len(started_servers)}개 서버 자동 시작",
        "servers": started_servers
    }

@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

# ===== 웹소켓 지원 (선택사항) =====
from fastapi import WebSocket, WebSocketDisconnect

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

@app.websocket("/ws")
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

# ===== 메인 실행 =====
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="MCP 관리 서버")
    parser.add_argument("--host", default="0.0.0.0", help="서버 호스트")
    parser.add_argument("--port", type=int, default=8000, help="서버 포트") 
    parser.add_argument("--config", default="./mcp_config.json", help="MCP 설정 파일 경로")
    parser.add_argument("--reload", action="store_true", help="개발 모드 (자동 리로드)")
    
    args = parser.parse_args()
    
    # 설정 파일 경로 설정
    mcp_manager.config_path = args.config
    mcp_manager.load_config()
    
    # 서버 실행
    uvicorn.run(
        "ax_mcp_manager:app" if args.reload else app,
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )