import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const version = "2026-05-01-twin-v1";
const today = "2026-05-01";

function parseArgs(argv = []) {
  const options = {
    force: false,
    initGit: false,
    coreRoot: resolve(repoRoot, "../wiki-core"),
    personalRoot: resolve(repoRoot, "../obsidianwiki-personal"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") options.force = true;
    else if (arg === "--init-git") options.initGit = true;
    else if (arg === "--core-root" && argv[index + 1]) {
      options.coreRoot = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--personal-root" && argv[index + 1]) {
      options.personalRoot = resolve(argv[index + 1]);
      index += 1;
    }
  }
  return options;
}

async function writeManagedFile(path, content, force) {
  await mkdir(dirname(path), { recursive: true });
  if (!force && existsSync(path)) return "skipped";
  const existed = existsSync(path);
  await writeFile(path, content, "utf-8");
  return existed ? "updated" : "created";
}

async function ensureJson(path, payload, force) {
  return writeManagedFile(path, `${JSON.stringify(payload, null, 2)}\n`, force);
}

function gitInitIfNeeded(root) {
  if (existsSync(resolve(root, ".git"))) return;
  spawnSync("git", ["init"], { cwd: root, stdio: "ignore" });
}

function coreFiles(coreRoot) {
  return [
    {
      path: resolve(coreRoot, "README.md"),
      content: `# Wiki Core

Shared contract repository for twin work/personal wiki systems.

## Version

- ${version}

## Contains

- shared operating contract
- shared schema
- shared ingest templates
- shared twin-vault separation rules

This repository stores contracts only. It does not store work wiki content or personal wiki content.
`,
    },
    {
      path: resolve(coreRoot, "VERSION"),
      content: `${version}\n`,
    },
    {
      path: resolve(coreRoot, "contracts/AGENTS.shared.md"),
      content: `# Shared AGENTS Contract

- Each vault uses the same layered model: raw sources, Wiki, L1_memory.
- Work and personal content never live in the same wiki tree.
- Mixed events split into work-facing facts and personal context.
- Shared contracts may sync across vaults; content, evidence, and L1 snapshots must not.
`,
    },
    {
      path: resolve(coreRoot, "contracts/Schema.shared.md"),
      content: `# Shared Schema Contract

- Keep frontmatter on all wiki pages.
- Use the same space types: project, account, common, shared.
- Use the same canonical operational documents where applicable.
- Keep source roots, auth context, deployment URL, and automation runtime separated by vault.
`,
    },
    {
      path: resolve(coreRoot, "contracts/Wiki_Ingest_Operating_Model.shared.md"),
      content: `# Shared Ingest Contract

- Reference first, evidence second, structured knowledge third, execution status fourth.
- Promote new events through Reference_Register, Evidence_Log, Conflict/Register or Action/Risk, Status, hub, then L1 memory.
- Personal and work use the same promotion order but different source connectors and target vaults.
`,
    },
    {
      path: resolve(coreRoot, "contracts/Wiki_Ingest_Templates.shared.md"),
      content: `# Shared Templates Contract

- project hub includes 운영 메모, 실행 현황판, 현재 막힘 / 충돌, 다음 액션, 최근 업데이트, 운영 링크
- account hub includes active projects and next touchpoints
- L1 memory stays compact and current
- Reference_Register, Status, Evidence_Log, Raw_Evidence_Index naming stays canonical
`,
    },
    {
      path: resolve(coreRoot, "contracts/Twin_Vault_Separation_Model.shared.md"),
      content: `# Twin Vault Separation Contract

- Separate repository
- Separate raw source root
- Separate automation runtime/state
- Separate auth/session context
- Separate public URL
- Shared logic only through this core contract layer
`,
    },
    {
      path: resolve(coreRoot, "contracts/vault_identity.example.json"),
      content: `${JSON.stringify({
        vaultId: "personal",
        publicBaseUrl: "https://personal.example.com",
        visibility: "public",
        authMode: "public",
        sourceRoot: "./obsidian/raw",
        wikiRoot: "./obsidian/Wiki",
        l1Root: "./obsidian/L1_memory",
      }, null, 2)}\n`,
    },
  ];
}

function personalFiles(personalRoot, coreRoot) {
  const corePointer = "../wiki-core";
  return [
    {
      path: resolve(personalRoot, ".gitignore"),
      content: `.DS_Store
.obsidian/workspace.json
automation/wiki_api/runtime/
automation/drive_wikify/runtime/
`,
    },
    {
      path: resolve(personalRoot, "README.md"),
      content: `# Personal Twin Vault

This repository is the canonical personal wiki sibling to the RTM work wiki.

- personal content only
- separate source connectors
- separate deployment URL
- shared operational contract pinned from ${corePointer}
`,
    },
    {
      path: resolve(personalRoot, "wiki-core.lock.json"),
      content: `${JSON.stringify({
        version,
        source: corePointer,
        syncedAt: `${today}T00:00:00+09:00`,
      }, null, 2)}\n`,
    },
    {
      path: resolve(personalRoot, "AGENTS.md"),
      content: `## Purpose

This repository is the canonical personal wiki.

Use the same layered model as the work wiki:

1. Raw sources: \`obsidian/raw/\`
2. Persistent wiki: \`obsidian/Wiki/\`
3. L1 memory snapshots: \`obsidian/L1_memory/\`
4. Shared contract pointer: \`wiki-core.lock.json\`

## Core Rules

- Personal notes live here, not in the RTM work wiki.
- Work facts that matter for delivery/customer/project operation belong in the work vault.
- Mixed events should be split into personal context here and work-facing facts in the work vault.
- Keep frontmatter on wiki pages.
- Prefer Obsidian wikilinks.
- Do not store secrets or credentials.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/raw/README.md"),
      content: `# Personal Raw Sources

Keep original personal sources here.

- inbox captures
- exported notes
- private documents
- links and source snapshots

Do not treat these files as the same layer as the maintained wiki.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/L1_memory/README.md"),
      content: `# Personal L1 Memory

Keep one compact current snapshot per personal project or operating area.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/index.md"),
      content: `---
type: index
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Personal Wiki Index

## Core Navigation

- [[Wiki/Schema]]
- [[Wiki/log]]
- [[Wiki/Common/hub]]
- [[Wiki/Common/Twin_Vault_Separation_Model]]

## Usage Notes

- This vault is personal-only.
- Work/customer/project delivery content belongs in the separate RTM work vault.
- Structure and operating logic mirror the work vault, but sources, URLs, auth, and runtime stay separate.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/Schema.md"),
      content: `---
type: schema
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Wiki Schema

- Keep YAML frontmatter on wiki pages.
- Use the same space types as the work vault: project, account, common, shared.
- Keep personal and work in separate repositories and separate wiki roots.
- Use the same operational document names where applicable.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/log.md"),
      content: `---
type: log
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Wiki Log

## ${today}
- Personal twin vault scaffold initialized from shared contract ${version}
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/Common/hub.md"),
      content: `---
type: hub
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Common Hub

- [[Wiki/index]]

## 운영 메모
- 한줄 요약: 개인 위키 운영 규칙과 공통 구조를 관리하는 허브입니다.
- 진행 맥락: 이 공간은 개인 위키의 운영 모델, 템플릿, 승격 규칙을 다룹니다.
- 실무 판단: 반복되는 개인 운영 패턴과 템플릿을 재사용 자산으로 유지합니다.
- 다음 확인: 활성 프로젝트와 루틴에 맞는 공통 문서를 보강합니다.

## 활성 운영 모델 또는 재사용 자산
- [[Wiki/Common/Wiki_Ingest_Operating_Model]]
- [[Wiki/Common/Wiki_Ingest_Templates]]
- [[Wiki/Common/Twin_Vault_Separation_Model]]
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/Common/Wiki_Ingest_Operating_Model.md"),
      content: `---
type: knowledge
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Wiki Ingest Operating Model

- Personal wiki still uses reference preservation, evidence capture, structured knowledge, status, and L1 memory.
- Mixed events are split before ingest.
- Shared logic mirrors the work vault, but source connectors and runtime remain personal-only.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/Common/Wiki_Ingest_Templates.md"),
      content: `---
type: knowledge
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Wiki Ingest Templates

- project hub
- account hub
- common/shared hub
- Status
- Reference_Register
- compact L1 memory

Use the same document names and section order as the work vault where practical.
`,
    },
    {
      path: resolve(personalRoot, "obsidian/Wiki/Common/Twin_Vault_Separation_Model.md"),
      content: `---
type: knowledge
created: ${today}
updated: ${today}
source: "personal vault bootstrap"
---

# Twin Vault Separation Model

- This repository is the personal sibling of the RTM work wiki.
- Sources, auth, runtime, and deployment URL are separate.
- Shared logic is pinned from ../wiki-core version ${version}.
- Cross-vault content sync is forbidden.
`,
    },
    {
      path: resolve(personalRoot, "automation/README.md"),
      content: `# Personal Automation Runtime

Personal automation state lives in this repository, separate from the work wiki runtime.
`,
    },
    {
      path: resolve(personalRoot, "automation/wiki_api/runtime/README.md"),
      content: `# Personal Wiki API Runtime

Runtime state for personal wiki API jobs should stay here.
`,
    },
    {
      path: resolve(personalRoot, "automation/drive_wikify/runtime/README.md"),
      content: `# Personal Drive Wikify Runtime

If personal source ingestion is enabled, keep runtime state here rather than in the work repo.
`,
    },
  ];
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const results = [];
  for (const file of coreFiles(options.coreRoot)) {
    const status = await writeManagedFile(file.path, file.content, options.force);
    results.push({ scope: "core", status, path: file.path });
  }
  for (const file of personalFiles(options.personalRoot, options.coreRoot)) {
    const status = await writeManagedFile(file.path, file.content, options.force);
    results.push({ scope: "personal", status, path: file.path });
  }
  await ensureJson(resolve(repoRoot, "wiki-core.lock.json"), {
    version,
    source: "../wiki-core",
    syncedAt: `${today}T00:00:00+09:00`,
  }, true);
  if (options.initGit) {
    gitInitIfNeeded(options.coreRoot);
    gitInitIfNeeded(options.personalRoot);
  }
  const summary = results.reduce((acc, item) => {
    acc[item.scope] = (acc[item.scope] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    status: "ok",
    version,
    repoRoot,
    coreRoot: options.coreRoot,
    personalRoot: options.personalRoot,
    summary,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
