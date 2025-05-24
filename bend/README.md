# AxBuilder Backend (FastAPI)

FastAPI 기반의 백엔드 서버로, 외부 명령어 실행 및 스트리밍 출력을 제공합니다.

## 시작하기

### 1. 가상환경 설정

```bash
# 가상환경 생성 (Windows)
python -m venv venv
.\\venv\\Scripts\\activate

# 또는 Linux/macOS
python3 -m venv venv
source venv/bin/activate
```

### 2. 의존성 설치

```bash
pip install -r requirements.txt
```

### 3. 서버 실행

```bash
uvicorn main:app --reload
```

서버가 실행되면 다음 주소로 접속할 수 있습니다:
- API 문서: http://localhost:8000/docs
- 서버 상태: http://localhost:8000/

## API 엔드포인트

### POST /api/spawn

외부 명령어를 실행하고 결과를 스트리밍합니다.

**요청 본문 (JSON):**
```json
{
  "command": "명령어",
  "args": ["인자1", "인자2"],
  "cwd": "작업 디렉토리 경로 (선택사항)"
}
```

**응답 (EventStream):**
```
data: {"output": "실행 결과 라인"}

data: {"code": 0}  // 종료 코드
```

## 프론트엔드 연동 예시

```javascript
const eventSource = new EventSource(
  'http://localhost:8000/api/spawn?command=ls&args=-la'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if ('output' in data) {
    console.log('출력:', data.output);
  } else if ('code' in data) {
    console.log('종료 코드:', data.code);
    eventSource.close();
  } else if ('error' in data) {
    console.error('오류:', data.error);
    eventSource.close();
  }
};

eventSource.onerror = (error) => {
  console.error('EventSource 오류:', error);
  eventSource.close();
};
```

## 환경 변수

`.env` 파일을 생성하여 다음 변수들을 설정할 수 있습니다:

```
# 포트 설정 (기본값: 8000)
PORT=8000

# CORS 허용 오리진 (쉼표로 구분)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```




http://localhost:8000/docs          # FastAPI 자동 문서
http://localhost:8000/health        # 헬스 체크
http://localhost:8000/config        # MCP 설정 확인
http://localhost:8000/status        # 서버 상태
http://localhost:8000/events        # 실시간 이벤트 확인 (다른 브라우저 탭에서)


# Context7 서버 시작
curl -X POST http://localhost:8000/servers/control \
  -H "Content-Type: application/json" \
  -d '{"server_id": "context7", "action": "start"}'

# Sequential Thinking 서버 시작  
curl -X POST http://localhost:8000/servers/control \
  -H "Content-Type: application/json" \
  -d '{"server_id": "sequential-thinking", "action": "start"}'



// Context7으로 컨텍스트 저장
await callTool('context7', 'store_context', {
  text: "사용자가 React 개발자임을 기억해둬"
});

// Sequential Thinking으로 문제 해결
await callTool('sequential-thinking', 'think_step_by_step', {
  problem: "MCP와 React를 어떻게 통합할까?"
});


#백앤드
bend/
├── fastapi_mcp_manager.py     # ✅ 이미 있음 (메인 서버)
├── mcp_config.json           # ✅ 이미 있음 (설정 파일)
├── requirements.txt          # ✅ 이미 있음
├── README.md                 # ✅ 이미 있음
├── mcp-servers/              # 🆕 새로 추가
│   ├── __init__.py
│   ├── calculator_server.py  # 계산기 MCP 서버
│   └── base_server.py        # 기본 MCP 서버 클래스
├── data/                     # 🆕 새로 추가
│   ├── memory.json
│   └── logs/
└── workspace/                # 🆕 새로 추가 (파일시스템 서버용)

#프론트
frnt/src/
├── components/
│   ├── CanvasPyInterpreter.tsx    # ✅ 이미 있음 (기존 것을 업데이트)
│   ├── MCPDashboard.tsx           # 🆕 새로 추가
│   ├── MCPToolPanel.tsx           # 🆕 새로 추가
│   └── MCPEventStream.tsx         # 🆕 새로 추가
├── utils/
│   ├── mcp-client.ts              # 🆕 새로 추가 (JavaScript SDK의 TypeScript 버전)
│   └── mcp-types.ts               # 🆕 새로 추가 (타입 정의)
└── hooks/
    └── useMCP.ts                  # 🆕 새로 추가 (React Hook)