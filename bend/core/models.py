"""
MCP 관련 데이터 모델 정의
"""

from datetime import datetime
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass
from pydantic import BaseModel


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
