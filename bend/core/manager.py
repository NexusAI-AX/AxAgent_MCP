"""
MCP 클라이언트 관리자 클래스
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from subprocess import Popen, PIPE
from collections import defaultdict

from .models import (
    MCPServerConfig,
    MCPTool,
    MCPResource,
    MCPPrompt,
    MCPServerStatus
)

# 로깅 설정
logger = logging.getLogger(__name__)


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
            
            # 기존 데이터 완전 초기화
            self.tools[server_id].clear()
            self.resources[server_id].clear()
            self.prompts[server_id].clear()
            self.server_status[server_id].tools_count = 0
            self.server_status[server_id].resources_count = 0
            self.server_status[server_id].prompts_count = 0
            logger.info(f"서버 데이터 초기화 완료: {server_id}")
            
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
            
            # Node.js 관련 명령어 확인 (Windows 환경 대응)
            nodejs_commands = ['npx', 'npm', 'node', 'yarn']
            use_shell = any(cmd_part in nodejs_commands for cmd_part in cmd if isinstance(cmd_part, str))
            
            if use_shell:
                # Windows에서 Node.js 명령어는 shell=True로 실행
                cmd_str = ' '.join(cmd)
                logger.info(f"Node.js 명령어 감지, shell=True로 실행: {cmd_str}")
                
                # 프로세스 시작 - Node.js 명령어용
                process = Popen(
                    cmd_str,
                    stdin=PIPE,
                    stdout=PIPE,
                    stderr=PIPE,
                    env=env,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    bufsize=0,
                    shell=True
                )
            else:
                # 일반 명령어
                # 프로세스 시작 - 인코딩 문제 해결
                process = Popen(
                    cmd,
                    stdin=PIPE,
                    stdout=PIPE,
                    stderr=PIPE,
                    env=env,
                    text=True,
                    encoding='utf-8',  # 명시적 UTF-8 인코딩
                    errors='replace',  # 인코딩 오류 시 대체 문자 사용
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
                            # 인코딩 문제가 있는 문자 제거
                            clean_line = line.strip()
                            # DOSKEY 관련 오류 무시
                            if 'DOSKEY' not in clean_line and clean_line:
                                await self._handle_server_message(server_id, clean_line)
                    except UnicodeDecodeError as e:
                        logger.warning(f"인코딩 오류 무시 {server_id}: {e}")
                        continue
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
                            clean_line = line.strip()
                            # DOSKEY 관련 오류 무시
                            if 'DOSKEY' not in clean_line and clean_line:
                                logger.warning(f"MCP {server_id} stderr: {clean_line}")
                                self._send_event("server_stderr", {
                                    "server_id": server_id, 
                                    "message": clean_line
                                })
                    except UnicodeDecodeError as e:
                        logger.warning(f"stderr 인코딩 오류 무시 {server_id}: {e}")
                        continue
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
            
        logger.info(f"메시지 전송 시작 {server_id}: {message.get('method', 'unknown')} (ID: {message['id']})")
        
        # 응답 대기용 Future 생성
        future = asyncio.Future()
        self.pending_requests[server_id][message["id"]] = future
        
        try:
            # 메시지 전송
            message_str = json.dumps(message) + "\n"
            logger.debug(f"전송할 메시지: {message_str.strip()}")
            
            await asyncio.get_event_loop().run_in_executor(
                None, process.stdin.write, message_str
            )
            await asyncio.get_event_loop().run_in_executor(
                None, process.stdin.flush
            )
            
            logger.info(f"메시지 전송 완료, 응답 대기 중... {server_id}")
            
            # 응답 대기 (타임아웃 10초로 단축하여 빠른 피드백)
            response = await asyncio.wait_for(future, timeout=10.0)
            logger.info(f"응답 수신 완료 {server_id}: {response.get('result', {}).get('tools', [])[:3] if 'result' in response else 'no result'}")
            return response
            
        except asyncio.TimeoutError:
            # 타임아웃 시 Future 정리
            if message["id"] in self.pending_requests[server_id]:
                del self.pending_requests[server_id][message["id"]]
            logger.error(f"요청 타임아웃 {server_id}: {message.get('method', 'unknown')} (10초)")
            raise RuntimeError(f"요청 타임아웃: {server_id}")
        except Exception as e:
            # 오류 시 Future 정리
            if message["id"] in self.pending_requests[server_id]:
                del self.pending_requests[server_id][message["id"]]
            logger.error(f"메시지 전송 오류 {server_id}: {e}")
            raise
    
    async def _initialize_server(self, server_id: str):
        """서버 초기화"""
        try:
            logger.info(f"서버 초기화 시작: {server_id}")
            
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
            
            logger.info(f"initialize 메시지 전송 중: {server_id}")
            response = await self._send_message(server_id, init_message)
            
            if "error" in response:
                raise RuntimeError(f"초기화 실패: {response['error']}")
            
            logger.info(f"initialize 응답 수신: {server_id}")
            
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
            # 초기화 실패 시 프로세스 정리
            if server_id in self.processes:
                try:
                    self.processes[server_id].terminate()
                    del self.processes[server_id]
                except:
                    pass
    
    async def _load_server_capabilities(self, server_id: str):
        """서버 기능 로드 (도구, 리소스, 프롬프트)"""
        try:
            # 각 기능을 개별적으로 로드하여 부분 실패 허용
            try:
                await self._load_tools(server_id)
            except Exception as e:
                logger.warning(f"도구 로드 실패 {server_id}: {e}")
            
            try:
                await self._load_resources(server_id)
            except Exception as e:
                logger.warning(f"리소스 로드 실패 {server_id}: {e}")
            
            try:
                await self._load_prompts(server_id)
            except Exception as e:
                logger.warning(f"프롬프트 로드 실패 {server_id}: {e}")
            
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
