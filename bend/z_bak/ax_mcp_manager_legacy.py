"""
레거시 MCP 관리자 파일 (백업용)
새로운 구조로 리팩토링되어 이 파일은 더 이상 사용되지 않습니다.

새로운 구조:
- core/models.py: 데이터 모델
- core/manager.py: MCPClientManager 클래스  
- api/routes.py: FastAPI 라우트
- main.py: 메인 애플리케이션
"""

# 하위 호환성을 위한 re-export
from core.manager import MCPClientManager
from core.models import (
    MCPServerConfig,
    MCPTool,
    MCPResource,
    MCPPrompt,
    MCPServerStatus,
    ToolCallRequest,
    ResourceReadRequest,
    PromptGetRequest,
    ServerControlRequest
)

__all__ = [
    'MCPClientManager',
    'MCPServerConfig',
    'MCPTool',
    'MCPResource',
    'MCPPrompt',
    'MCPServerStatus',
    'ToolCallRequest',
    'ResourceReadRequest',
    'PromptGetRequest',
    'ServerControlRequest'
]

# 레거시 지원을 위한 인스턴스
mcp_manager = MCPClientManager()

if __name__ == "__main__":
    print("이 파일은 레거시 호환성을 위해 유지됩니다.")
    print("새로운 구조를 사용하려면 main.py를 실행하세요:")
    print("python main.py")
