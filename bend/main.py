"""
FastAPI 메인 애플리케이션
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# FastAPI 앱 생성
app = FastAPI(
    title="MCP 관리 서버",
    description="Model Context Protocol 서버 관리 API",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
