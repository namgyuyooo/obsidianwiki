#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

const repoRoot = process.cwd();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const wikiRoot = positionalArgs[0] || join(repoRoot, "obsidian", "Wiki");
const dryRun = process.argv.includes("--dry-run");

async function walkMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasHubFrontmatter(content, filePath) {
  if (filePath.endsWith("/hub.md")) return true;
  return /^---\n[\s\S]*?\ntype:\s*hub\b/im.test(content);
}

function titleFromContent(content, filePath) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || relative(wikiRoot, filePath).replace(/\.md$/i, "");
}

function siblingOperationalLinks(filePath, allFiles) {
  const dir = filePath.slice(0, filePath.lastIndexOf("/"));
  const preferred = [
    "Status.md",
    "Business_Flow.md",
    "CEO_Brief.md",
    "PM_Action_Plan.md",
    "Customer_Followup.md",
    "Raw_Evidence_Index.md",
    "Project_Overview.md",
    "Sources.md",
    "Evidence_Log.md",
    "Action_Items.md",
    "Risks.md",
    "Decisions.md",
    "Conflict_Register.md",
    "Change_Log.md",
    "Project_Relationships.md",
  ];
  const existing = new Set(
    allFiles
      .filter((path) => path.startsWith(`${dir}/`) && path !== filePath)
      .map((path) => path.slice(dir.length + 1)),
  );
  return preferred
    .filter((name) => existing.has(name))
    .map((name) => {
      const linkPath = relative(join(repoRoot, "obsidian"), join(dir, name)).replace(/\.md$/i, "");
      return `- [[${linkPath}]]`;
    });
}

function projectLabelFromDir(projectDir) {
  return basename(projectDir)
    .replace(/_/g, " ")
    .replace(/\bProject\b/g, "Project")
    .replace(/\bAccount\b/g, "Account")
    .trim();
}

function wikiLinkFor(projectDir, fileName) {
  return relative(join(repoRoot, "obsidian"), join(projectDir, fileName)).replace(/\.md$/i, "");
}

function operationalDocumentTemplate(fileName, projectDir) {
  const today = new Date().toISOString().slice(0, 10);
  const projectLabel = projectLabelFromDir(projectDir);
  const hub = wikiLinkFor(projectDir, "hub.md");
  const raw = wikiLinkFor(projectDir, "Raw_Evidence_Index.md");
  const evidence = wikiLinkFor(projectDir, "Evidence_Log.md");
  const sources = wikiLinkFor(projectDir, "Sources.md");
  const changeMemo = `${today} 00:00 운영형 위키 전환 기준으로 ${projectLabel} 운영 문서 구조가 생성/점검되었고 원문 보존, 상태 갱신, CEO/PM 후속 판단이 수행/대기됨`;
  const frontmatter = [
    "---",
    `type: ${fileName.replace(/\.md$/i, "").toLowerCase()}`,
    `created: ${today}`,
    `updated: ${today}`,
    'source: "operational wiki conversion"',
    "---",
    "",
  ].join("\n");
  const templates = {
    "Status.md": [
      frontmatter,
      "# Status",
      "",
      "## 현재 상태",
      "- 상태 라벨: 확인 필요",
      "- 단계: 운영형 위키 전환 완료, 실무 정보 검토 대기",
      "- 헬스: 근거 확인 전",
      "- 담당/고객 접점: 확인 필요",
      "- 막힘: 최신 원문/증적 검토 전까지 확정 판단 보류",
      "- 다음 게이트: Raw_Evidence_Index, Evidence_Log, Sources 확인 후 CEO/PM 판단 문서 갱신",
      "",
      "## 상태 변화 메모",
      `- ${changeMemo}`,
      "",
      "## 운영 링크",
      `- [[${hub}]]`,
      `- [[${wikiLinkFor(projectDir, "Business_Flow.md")}]]`,
      `- [[${wikiLinkFor(projectDir, "CEO_Brief.md")}]]`,
      `- [[${wikiLinkFor(projectDir, "PM_Action_Plan.md")}]]`,
      `- [[${raw}]]`,
      "",
    ],
    "Business_Flow.md": [
      frontmatter,
      "# Business Flow",
      "",
      "## 운영 흐름",
      "| 단계 | 현재 상태 | 근거 | 다음 게이트 | 담당 |",
      "| --- | --- | --- | --- | --- |",
      `| 수집/원문 보존 | 운영 문서 구조 생성, 원문 확인 대기 | [[${sources}]], [[${raw}]] | 핵심 문장/수치/버전 체인 확인 | TBD |`,
      `| 실무 판단 | CEO/PM 판단 레이어 보강 필요 | [[${evidence}]], [[${wikiLinkFor(projectDir, "Status.md")}]] | 리스크/결정/후속 액션 분리 | TBD |`,
      `| 고객 후속 | 고객 접점 영향 확인 필요 | [[${wikiLinkFor(projectDir, "Customer_Followup.md")}]] | 다음 연락/자료 요청 여부 결정 | TBD |`,
      "",
      "## 변화 메모",
      `- ${changeMemo}`,
      "",
    ],
    "CEO_Brief.md": [
      frontmatter,
      "# CEO Brief",
      "",
      "## 판단 대기",
      "- 사업 영향: 원문/증적 검토 후 판단",
      "- 리스크: 확인 필요",
      "- 결정 필요 여부: Decision Queue 또는 PM 검토 후 확정",
      "- 원문 확인: [[" + raw + "]]",
      "",
      "## CEO 확인 질문",
      "- 지금 이 프로젝트가 매출/고객관계/리소스 배분에 주는 영향은 무엇인가?",
      "- 확정된 사실과 아직 근거가 약한 주장은 무엇인가?",
      "- 다음 고객 접점 전에 반드시 확인해야 할 수치/자료/결정은 무엇인가?",
      "",
      "## 변화 메모",
      `- ${changeMemo}`,
      "",
    ],
    "PM_Action_Plan.md": [
      frontmatter,
      "# PM Action Plan",
      "",
      "| 액션 | Owner | 기한 | 선행조건 | 근거 | 상태 |",
      "| --- | --- | --- | --- | --- | --- |",
      `| 원문/추출문 검토 후 현재 상태와 다음 액션 확정 | TBD | TBD | Raw_Evidence_Index 확인 | [[${raw}]] | planned |`,
      `| 충돌/중복 후보가 있으면 Decision Queue에 등록 | TBD | TBD | Evidence_Log/Conflict_Register 확인 | [[${evidence}]] | planned |`,
      `| 고객 후속 필요 여부 판단 | TBD | TBD | CEO_Brief/Business_Flow 확인 | [[${wikiLinkFor(projectDir, "CEO_Brief.md")}]] | planned |`,
      "",
      "## 변화 메모",
      `- ${changeMemo}`,
      "",
    ],
    "Customer_Followup.md": [
      frontmatter,
      "# Customer Follow-up",
      "",
      "| 고객/상대 | 마지막 접점 | 요청/관심사 | 다음 연락 | 준비물 | 상태 |",
      "| --- | --- | --- | --- | --- | --- |",
      "| 확인 필요 | 확인 필요 | 원문/증적 검토 후 정리 | TBD | 핵심 수치, 제안/보고 자료, 미해결 질문 | pending |",
      "",
      "## 후속 질문 후보",
      "- 고객에게 확인해야 할 최신 요구사항/일정/검수 기준은 무엇인가?",
      "- 다음 미팅 전에 준비해야 할 산출물과 근거 파일은 무엇인가?",
      "",
      "## 변화 메모",
      `- ${changeMemo}`,
      "",
    ],
    "Raw_Evidence_Index.md": [
      frontmatter,
      "# Raw Evidence Index",
      "",
      "## 원문 보존 원칙",
      "- 파일 원문/긴 추출문/표/수치/버전/출처 위치는 짧은 요약으로 대체하지 않는다.",
      "- 운영 요약은 Status, Business_Flow, CEO_Brief, PM_Action_Plan에서 별도 관리한다.",
      "- 원문이 아직 연결되지 않은 경우 `pending review`로 남기고, 추후 수집/인제스트 결과를 append한다.",
      "",
      "| 원천 | 원문/추출 경로 | 유형 | 버전/일시 | 보존 범위 | 위키 반영 상태 |",
      "| --- | --- | --- | --- | --- | --- |",
      `| 운영형 전환 스캐폴드 | [[${hub}]] | wiki scaffold | ${today} | 원문 연결 대기 | pending review |`,
      "",
      "## 변화 메모",
      `- ${changeMemo}`,
      "",
    ],
  };
  return (templates[fileName] || [frontmatter, `# ${fileName.replace(/\.md$/i, "")}`, ""]).join("\n");
}

async function ensureOperationalDocument(projectDir, fileName, changed) {
  const path = join(projectDir, fileName);
  const current = await readFile(path, "utf-8").catch(() => "");
  if (!current.trim()) {
    if (!dryRun) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, operationalDocumentTemplate(fileName, projectDir), "utf-8");
    }
    changed.push(relative(repoRoot, path));
    return;
  }
  if (current.includes("operational wiki conversion") || current.includes("운영형 위키 전환 기준")) return;
  const today = new Date().toISOString().slice(0, 10);
  const projectLabel = projectLabelFromDir(projectDir);
  const memo = `${today} 00:00 운영형 위키 전환 기준으로 ${projectLabel} 기존 문서가 점검되었고 운영 판단 레이어와 원문 보존 레이어 연결이 수행/대기됨`;
  const appendix = [
    "",
    `## 운영형 위키 전환 메모 - ${today}`,
    `- 상태 변화 메모: ${memo}`,
    "- 원문/긴 추출문은 Raw_Evidence_Index, Sources, Evidence_Log를 기준으로 보존",
    "- CEO/PM 판단은 Status, Business_Flow, CEO_Brief, PM_Action_Plan, Customer_Followup에서 관리",
    "",
  ].join("\n");
  if (!dryRun) await writeFile(path, `${current.trimEnd()}\n${appendix}`, "utf-8");
  changed.push(relative(repoRoot, path));
}

async function ensureChangeLog(projectDir, changed) {
  const today = new Date().toISOString().slice(0, 10);
  const path = join(projectDir, "Change_Log.md");
  const current = await readFile(path, "utf-8").catch(() => "");
  const projectLabel = projectLabelFromDir(projectDir);
  const marker = `operational-conversion:${today}`;
  if (current.includes(marker)) return;
  const heading = current.trim() ? "" : [
    "---",
    "type: change_log",
    `created: ${today}`,
    `updated: ${today}`,
    'source: "operational wiki conversion"',
    "---",
    "",
    "# Change Log",
    "",
  ].join("\n");
  const block = [
    heading,
    `## Change - ${today}`,
    `<!-- ${marker} -->`,
    `- 상태 변화 메모: ${today} 00:00 운영형 위키 전환 기준으로 ${projectLabel} 운영 문서 구조가 생성/점검되었고 원문 보존, 상태 갱신, CEO/PM 후속 판단이 수행/대기됨`,
    "- 생성/점검 문서: Status, Business_Flow, CEO_Brief, PM_Action_Plan, Customer_Followup, Raw_Evidence_Index",
    "- 원칙: 기존 원문/증적은 요약으로 대체하지 않고 보존 레이어와 운영 판단 레이어를 분리",
    "",
  ].join("\n");
  if (!dryRun) await writeFile(path, `${current.trimEnd()}${current.trim() ? "\n" : ""}${block}`, "utf-8");
  changed.push(relative(repoRoot, path));
}

function buildOperationalBlock(content, filePath, allFiles) {
  const today = new Date().toISOString().slice(0, 10);
  const title = titleFromContent(content, filePath);
  const links = siblingOperationalLinks(filePath, allFiles);
  return [
    "",
    "## 운영 메모",
    `- 한줄 요약: ${title}의 실제 업무 진행상황을 한눈에 보기 위한 허브입니다.`,
    "- 진행 맥락: 이 허브는 관리 이력이 아니라 고객/프로젝트/운영 업무의 현재 상태와 다음 액션을 관리합니다.",
    "- 실무 판단: 연결된 근거 문서와 액션/리스크/결정 문서를 확인해 최신 진행상황으로 갱신해야 합니다.",
    "- 다음 확인: 담당자, 고객 대응 상태, 산출물, 미해결 리스크, 다음 실행 항목을 보강합니다.",
    "",
    "## 운영 현황판",
    "- 현재 상태: 진행상황 확인 필요",
    "- 최근 추진: 최신 실무 메모 입력 전",
    "- 다음 액션: 연결된 Raw_Evidence_Index, Sources, Evidence_Log, Status, CEO_Brief, PM_Action_Plan을 검토해 실제 추진 상태를 갱신",
    "",
    "## 일시별 추진내용",
    "| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |",
    "| --- | --- | --- | --- | --- |",
    `| ${today} | ${title} 진행상황 확인 필요 | 현재 허브는 실제 업무 추진내용을 적는 공간이며, 최신 고객/프로젝트 상태를 메모로 보강해야 함 | 연결된 Sources/Evidence_Log/원문 근거 | 담당자, 고객 대응, 산출물, 리스크, 다음 액션 업데이트 |`,
    "",
    "## 증적/근거 링크",
    "- 연결된 Raw_Evidence_Index, Sources, Evidence_Log, 원문 근거를 우선 확인",
    "",
    "## 운영 링크",
    ...(links.length ? links : ["- 연결된 운영 문서 확인 필요"]),
    "",
  ].join("\n");
}

function operationalLinkBlock(filePath) {
  const dir = dirname(filePath);
  return [
    "",
    "## 운영형 문서 링크",
    `- [[${wikiLinkFor(dir, "Status.md")}]]: 현재 상태, 단계, 막힘, 다음 게이트`,
    `- [[${wikiLinkFor(dir, "Business_Flow.md")}]]: 수집부터 고객 후속까지 실제 업무 흐름`,
    `- [[${wikiLinkFor(dir, "CEO_Brief.md")}]]: CEO 의사결정 포인트`,
    `- [[${wikiLinkFor(dir, "PM_Action_Plan.md")}]]: PM 실행 액션과 담당/기한`,
    `- [[${wikiLinkFor(dir, "Customer_Followup.md")}]]: 고객 접점과 다음 커뮤니케이션`,
    `- [[${wikiLinkFor(dir, "Raw_Evidence_Index.md")}]]: 원문/긴 추출문/표/수치/버전 보존`,
    "",
  ].join("\n");
}

const files = await walkMarkdown(wikiRoot);
const changed = [];
const projectDirs = new Set();

for (const filePath of files) {
  const content = await readFile(filePath, "utf-8");
  if (!hasHubFrontmatter(content, filePath)) continue;
  const hubDir = dirname(filePath);
  const hubDirName = basename(hubDir);
  if (hubDirName.endsWith("_Project") || hubDirName.endsWith("_Account")) projectDirs.add(hubDir);
  let next = content;
  if (!next.includes("## 운영 메모")) {
    const block = buildOperationalBlock(content, filePath, files);
    next = next.includes("## 운영 현황판")
      ? next.replace("\n## 운영 현황판", `${block.split("\n## 운영 현황판")[0]}\n\n## 운영 현황판`)
      : `${next.trimEnd()}\n${block}`;
  }
  if ((hubDirName.endsWith("_Project") || hubDirName.endsWith("_Account")) && !next.includes("## 운영형 문서 링크")) {
    const block = operationalLinkBlock(filePath);
    next = next.includes("\n## 운영 링크")
      ? next.replace("\n## 운영 링크", `${block}\n## 운영 링크`)
      : `${next.trimEnd()}\n${block}`;
  }
  next = next
    .replaceAll("- 현재 상태: 기존 허브를 운영 현황판 표준으로 보강함", "- 현재 상태: 진행상황 확인 필요")
    .replaceAll(/- 최근 추진: \d{4}-\d{2}-\d{2} 허브 표준화 작업으로 일시별 추진내용\/증적 관리 섹션 추가/g, "- 최근 추진: 최신 실무 메모 입력 전")
    .replaceAll(/(\| \d{4}-\d{2}-\d{2} \| )([^|\n]+?) 허브 운영 표준 보강 \| 문서 목록 중심 허브를 실무 추진 현황과 증적을 보는 허브로 전환 \| \[\[Wiki\/Schema\]\] \| 최근 업무 기준으로 상태, 액션, 리스크, 결정을 업데이트 \|/g, "$1$2 진행상황 확인 필요 | 현재 허브는 실제 업무 추진내용을 적는 공간이며, 최신 고객/프로젝트 상태를 메모로 보강해야 함 | 연결된 Sources/Evidence_Log/원문 근거 | 담당자, 고객 대응, 산출물, 리스크, 다음 액션 업데이트 |")
    .replaceAll("- [[Wiki/Schema]]: Hub Operating Standard", "- 연결된 Sources, Evidence_Log, 원문 근거를 우선 확인");
  next = next.replaceAll("위키 변경 기록이 아니라", "관리 이력이 아니라");
  if (content === next) continue;
  if (!dryRun) await writeFile(filePath, next, "utf-8");
  changed.push(relative(repoRoot, filePath));
}

for (const projectDir of [...projectDirs].sort()) {
  for (const fileName of [
    "Status.md",
    "Business_Flow.md",
    "CEO_Brief.md",
    "PM_Action_Plan.md",
    "Customer_Followup.md",
    "Raw_Evidence_Index.md",
  ]) {
    await ensureOperationalDocument(projectDir, fileName, changed);
  }
  await ensureChangeLog(projectDir, changed);
}

console.log(JSON.stringify({ dryRun, changedCount: changed.length, changed }, null, 2));
