# Wiki RAG Usage

## 1. 복사해서 다른 제품에 넣기

```bash
cp -R packages/wiki-rag /path/to/your-product/packages/wiki-rag
```

대상 제품이 npm workspace를 쓰면 루트 `package.json`의 workspace 목록에 `packages/wiki-rag`를 추가합니다. workspace가 아니면 파일 경로 의존성으로 설치할 수 있습니다.

```bash
npm install ./packages/wiki-rag
```

## 2. 환경변수 설정

```bash
export WIKI_RAG_ROOTS="/path/to/obsidian/Wiki:/path/to/obsidian/L1_memory"
```

또는:

```bash
export WIKI_RAG_WIKI_ROOT="/path/to/obsidian/Wiki"
export WIKI_RAG_L1_ROOT="/path/to/obsidian/L1_memory"
```

LLM 답변까지 쓰려면 OpenAI-compatible endpoint를 추가합니다.

```bash
export WIKI_RAG_LLM_API_URL="https://api.example.com/v1"
export WIKI_RAG_LLM_API_KEY="..."
export WIKI_RAG_LLM_MODEL="..."
```

기존 GLM 환경변수(`GLM_API_URL`, `GLM_API_KEY`, `GLM_MODEL`)도 fallback으로 인식합니다.

## 3. 라이브러리로 사용

```js
import { createWikiRag } from "@rtm/wiki-rag";

const rag = await createWikiRag({
  roots: [
    "/path/to/obsidian/Wiki",
    "/path/to/obsidian/L1_memory"
  ]
});

const results = rag.search("아사히카세이 다음 액션", { limit: 10 });
const context = await rag.context("아사히카세이 다음 액션", { mode: "standard" });
const answer = await rag.answer("아사히카세이 지금 뭘 해야 해?", { mode: "deep" });
```

## 4. HTTP 서버로 사용

```bash
WIKI_RAG_ROOTS="/path/to/obsidian/Wiki:/path/to/obsidian/L1_memory" \
node packages/wiki-rag/src/server.mjs
```

기본 주소는 `http://127.0.0.1:8797`입니다.

```bash
curl "http://127.0.0.1:8797/search?q=다음%20액션"
curl -X POST "http://127.0.0.1:8797/context" \
  -H "Content-Type: application/json" \
  -d '{"query":"아사히카세이 리스크","mode":"deep"}'
curl -X POST "http://127.0.0.1:8797/answer" \
  -H "Content-Type: application/json" \
  -d '{"query":"아사히카세이 현재 상태와 다음 액션"}'
```

## 5. 권장 통합 방식

제품 백엔드가 이미 있다면 HTTP 서버를 별도 프로세스로 띄우기보다 `WikiRag` 클래스를 직접 import하는 편이 단순합니다. 검색 결과를 UI에 보여줄 때는 `search()`를 쓰고, LLM 프롬프트에 넣을 때는 `context()`의 `cards`만 넣는 구성이 좋습니다.
