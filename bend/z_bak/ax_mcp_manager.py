"""
MCP (Model Context Protocol) 클라이언트 관리자
FastAPI 기반 MCP 서버 관리 시스템

이 파일은 이제 레거시 호환성을 위해 유지되며,
실제 구현은 core 및 api 모듈로 분리되었습니다.

새로운 구조:
- core/models.py: 데이터 모델
- core/manager.py: MCPClientManager 클래스
- api/routes.py: FastAPI 라우트
- main.py: 메인 애플리케이션
"""

# 새로운 구조에서 가져오기
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

# 하위 호환성을 위한 re-export
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

# 레거시 지원을 위한 인스턴스 생성
mcp_manager = MCPClientManager()

if __name__ == "__main__":
    import uvicorn
    from main import app
    
    print("MCP 관리 서버를 시작합니다...")
    print("새로운 구조로 리팩토링되었습니다:")
    print("- core/models.py: 데이터 모델")
    print("- core/manager.py: MCPClientManager 클래스")
    print("- api/routes.py: FastAPI 라우트")
    print("- main.py: 메인 애플리케이션")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
