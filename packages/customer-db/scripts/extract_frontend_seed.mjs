import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const input = process.argv[2] || "/Users/rtm/Downloads/RTM_고객DB_대시보드.html";
const output = process.argv[3] || "data/frontend_seed.json";
const html = fs.readFileSync(input, "utf8");

function extractConst(name) {
  let start = html.indexOf(`const ${name} = `);
  if (start < 0) start = html.indexOf(`const ${name}=`);
  if (start < 0) throw new Error(`Missing const ${name}`);
  const eq = html.indexOf("=", start);
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = eq + 1; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") depth -= 1;
    else if (ch === ";" && depth === 0) return html.slice(eq + 1, i).trim();
  }
  throw new Error(`Unterminated const ${name}`);
}

const seed = {
  extracted_at: new Date().toISOString(),
  source_html: input,
  base_contacts: Function(`return (${extractConst("BASE")});`)(),
  base_events: Function(`return (${extractConst("BASE_EVTS")});`)(),
  auto_company_info: Function(`return (${extractConst("AUTO_CINFO")});`)(),
  company_aliases: Function(`return (${extractConst("CO_ALIAS")});`)(),
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(seed, null, 2), "utf8");
console.log(JSON.stringify({
  output,
  contacts: seed.base_contacts.length,
  events: seed.base_events.length,
  company_profiles: Object.keys(seed.auto_company_info).length,
  aliases: Object.keys(seed.company_aliases).length,
}, null, 2));
