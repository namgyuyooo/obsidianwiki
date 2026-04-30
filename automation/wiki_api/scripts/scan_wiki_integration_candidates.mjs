#!/usr/bin/env node
import { enqueueWikiIntegrationCandidate, wikiIntegrationCandidateScan } from "../server.mjs";

function readFlag(name, fallback = "") {
  const args = process.argv.slice(2);
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return fallback;
}

const workspace = readFlag("--workspace", "rtm");
const limit = Number(readFlag("--limit", "20")) || 20;
const enqueueTop = Number(readFlag("--enqueue-top", "0")) || 0;

const scan = await wikiIntegrationCandidateScan(workspace, { limit });
if (enqueueTop > 0) {
  const enqueued = [];
  for (const candidate of scan.candidates.slice(0, Math.min(enqueueTop, scan.candidates.length))) {
    enqueued.push(await enqueueWikiIntegrationCandidate(candidate, workspace));
  }
  console.log(JSON.stringify({ ...scan, enqueued }, null, 2));
} else {
  console.log(JSON.stringify(scan, null, 2));
}
