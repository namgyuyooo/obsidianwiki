import { useMemo } from "react";

// Minimal, dependency-free markdown renderer covering the subset used by
// SLACK_MESSAGE_GUIDE.md: headings, fenced code blocks, tables, bullet/number
// lists, and paragraphs. Kept intentionally small — not a general parser.
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(
        <pre
          key={k()}
          style={{
            background: "#f4f4f5",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          }}
        >
          {buf.join("\n")}
        </pre>
      );
      continue;
    }

    // table (header row followed by --- separator)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[-\s|:]+\|?\s*$/.test(lines[i + 1])) {
      const parseRow = (row: string) =>
        row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const header = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      out.push(
        <table key={k()} style={{ margin: "8px 0" }}>
          <thead>
            <tr>
              {header.map((h, ix) => (
                <th key={ix} style={{ cursor: "default" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rx) => (
              <tr key={rx}>
                {r.map((c, cx) => (
                  <td key={cx}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // headings
    if (line.startsWith("### ")) {
      out.push(<h4 key={k()} style={{ margin: "12px 0 4px" }}>{line.slice(4)}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(<h3 key={k()} style={{ margin: "14px 0 6px", fontSize: 15 }}>{line.slice(3)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(<h2 key={k()} style={{ margin: "8px 0" }}>{line.slice(2)}</h2>);
      i++;
      continue;
    }

    // list block
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const inner = items.map((it, ix) => <li key={ix}>{renderInline(it)}</li>);
      out.push(
        ordered ? (
          <ol key={k()} style={{ margin: "6px 0 6px 20px" }}>{inner}</ol>
        ) : (
          <ul key={k()} style={{ margin: "6px 0 6px 20px" }}>{inner}</ul>
        )
      );
      continue;
    }

    // blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph
    out.push(
      <p key={k()} style={{ margin: "6px 0", lineHeight: 1.5 }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }
  return out;
}

// inline: `code` and **bold**
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      parts.push(
        <code
          key={idx++}
          style={{ background: "#f4f4f5", padding: "1px 4px", borderRadius: 4, fontSize: 12 }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<b key={idx++}>{token.slice(2, -2)}</b>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function GuidePanel({ markdown }: { markdown: string }) {
  const content = useMemo(() => renderMarkdown(markdown), [markdown]);
  if (!markdown) return <div className="loading">가이드를 불러오는 중…</div>;
  return <div style={{ fontSize: 13 }}>{content}</div>;
}
