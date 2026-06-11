import type { ReactNode } from "react";

// Minimal, dependency-free markdown rendering for model replies: paragraphs,
// bullet lists, **bold**, *italic*, and `code`. Everything is built as React
// nodes from the raw string - no HTML parsing or injection - so untrusted
// model output stays inert.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
    index += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function renderMarkdownLite(text: string): ReactNode[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const rendered: ReactNode[] = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) return;

    const isList = lines.every((line) => /^\s*([-*]|\d+[.)])\s+/.test(line));
    if (isList) {
      rendered.push(
        <ul key={`block-${blockIndex}`}>
          {lines.map((line, lineIndex) => (
            <li key={`block-${blockIndex}-item-${lineIndex}`}>
              {renderInline(line.replace(/^\s*([-*]|\d+[.)])\s+/, ""), `b${blockIndex}l${lineIndex}`)}
            </li>
          ))}
        </ul>
      );
      return;
    }

    rendered.push(
      <p key={`block-${blockIndex}`}>
        {lines.map((line, lineIndex) => (
          <span key={`block-${blockIndex}-line-${lineIndex}`}>
            {lineIndex > 0 && <br />}
            {renderInline(line, `b${blockIndex}l${lineIndex}`)}
          </span>
        ))}
      </p>
    );
  });

  return rendered;
}
