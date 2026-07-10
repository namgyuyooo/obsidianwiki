# @rtm/wiki-rag

Obsidian 기반 Markdown 위키에서 RAG용 근거를 찾고 압축하는 독립 모듈입니다. 기존 `automation/wiki_api/server.mjs`에 섞여 있던 위키 검색/컨텍스트 생성 핵심만 다른 프로덕트에 옮길 수 있게 발췌했습니다.

## 빠른 시작

```bash
cd packages/wiki-rag
WIKI_RAG_ROOTS="/absolute/path/to/obsidian/Wiki:/absolute/path/to/obsidian/L1_memory" npm run smoke
WIKI_RAG_ROOTS="/absolute/path/to/obsidian/Wiki:/absolute/path/to/obsidian/L1_memory" npm start
```

## API

```js
import { createWikiRag } from "@rtm/wiki-rag";

const rag = await createWikiRag({ roots: ["/vault/obsidian/Wiki", "/vault/obsidian/L1_memory"] });

rag.search("검색어", { limit: 10 });
await rag.context("검색어", { mode: "standard" });
await rag.answer("질문", { mode: "deep" });
await rag.page("Some_Project/hub.md");
```

## HTTP Endpoints

- `GET /health`
- `POST /refresh`
- `GET /search?q=...&limit=12`
- `POST /context` with `{ "query": "...", "mode": "economy|standard|deep" }`
- `POST /answer` with `{ "query": "...", "mode": "economy|standard|deep" }`
- `GET /page?path=...`

## 패키징 범위

이 모듈은 읽기 전용입니다. 위키 파일을 수정하거나 Drive/Slack/HWP/PDF 수집을 실행하지 않습니다. 다른 제품에서는 먼저 이 모듈로 검색/근거 압축/답변 생성을 붙이고, 수집 파이프라인은 필요할 때 별도 모듈로 가져가는 구성을 권장합니다.

자세한 목적은 `PURPOSE.md`, 이식 방법은 `USAGE.md`를 보세요.
