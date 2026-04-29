#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

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
    "- 다음 액션: 연결된 Sources, Evidence_Log, Action_Items, Risks, Decisions를 검토해 실제 추진 상태를 갱신",
    "",
    "## 일시별 추진내용",
    "| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |",
    "| --- | --- | --- | --- | --- |",
    `| ${today} | ${title} 진행상황 확인 필요 | 현재 허브는 실제 업무 추진내용을 적는 공간이며, 최신 고객/프로젝트 상태를 메모로 보강해야 함 | 연결된 Sources/Evidence_Log/원문 근거 | 담당자, 고객 대응, 산출물, 리스크, 다음 액션 업데이트 |`,
    "",
    "## 증적/근거 링크",
    "- 연결된 Sources, Evidence_Log, 원문 근거를 우선 확인",
    "",
    "## 운영 링크",
    ...(links.length ? links : ["- 연결된 운영 문서 확인 필요"]),
    "",
  ].join("\n");
}

const files = await walkMarkdown(wikiRoot);
const changed = [];

for (const filePath of files) {
  const content = await readFile(filePath, "utf-8");
  if (!hasHubFrontmatter(content, filePath)) continue;
  let next = content;
  if (!next.includes("## 운영 메모")) {
    const block = buildOperationalBlock(content, filePath, files);
    next = next.includes("## 운영 현황판")
      ? next.replace("\n## 운영 현황판", `${block.split("\n## 운영 현황판")[0]}\n\n## 운영 현황판`)
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

console.log(JSON.stringify({ dryRun, changedCount: changed.length, changed }, null, 2));
