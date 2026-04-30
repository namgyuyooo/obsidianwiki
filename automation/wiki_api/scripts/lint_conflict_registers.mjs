import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const wikiRoot = join(repoRoot, "obsidian/Wiki");
const strictWarnings = process.argv.includes("--strict-warnings");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "Conflict_Register.md") {
      files.push(fullPath);
    }
  }
  return files;
}

function rel(path) {
  return path.replace(`${repoRoot}/`, "");
}

function titleWarnings(text = "") {
  const warnings = [];
  const structuralTitles = [...text.matchAll(/항목(?:명)?: .*?(구조|범위|경계|관계|연결|연계|분리 여부|차수).*/g)].map((match) => match[0]);
  for (const title of structuralTitles) {
    if (/현재 판단:[\s\S]{0,160}(가능성이 높|보는 편이|추가 확인 필요|여지도|과도기|수준으로 표현)/.test(text)) {
      warnings.push(title);
    }
  }
  return warnings;
}

const files = await walk(wikiRoot);
let errorCount = 0;
let warningCount = 0;

for (const file of files) {
  const text = await readFile(file, "utf-8");
  const errors = [];
  const warnings = [];

  if (/^## Decision Queue Approval - /m.test(text)) {
    errors.push("Decision Queue approval log leaked into Conflict_Register");
  }
  if (/^## Wiki Management Promotion /m.test(text) || /wiki-management:.*project_customer_promotion/.test(text)) {
    errors.push("Wiki management promotion log leaked into Conflict_Register");
  }
  if (/^- 성격: conflict$/m.test(text)) {
    errors.push("Generic management metadata is stored as conflict");
  }

  for (const warning of titleWarnings(text)) {
    warnings.push(`Possible weak conflict pattern: ${warning}`);
  }

  if (errors.length) {
    errorCount += errors.length;
    console.error(`ERROR ${rel(file)}`);
    for (const error of errors) console.error(`  - ${error}`);
  }
  if (warnings.length) {
    warningCount += warnings.length;
    console.warn(`WARN ${rel(file)}`);
    for (const warning of warnings) console.warn(`  - ${warning}`);
  }
}

if (errorCount || (strictWarnings && warningCount)) {
  process.exit(1);
}

console.log(`Conflict register lint passed: ${files.length} files checked, ${warningCount} warnings.`);
