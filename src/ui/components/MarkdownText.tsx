import React from 'react';

interface Props {
  text: string;
  fontSize?: number;
}

interface Block {
  type: 'code' | 'text';
  content: string;
  language?: string;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    blocks.push({ type: 'code', content: match[2].trimEnd(), language: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    blocks.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return blocks.length === 0 ? [{ type: 'text', content: text }] : blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      parts.push(<code key={key++} style={inlineCodeStyle}>{match[1]}</code>);
    } else if (match[2] !== undefined) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(<strong key={key++}>{match[4]}</strong>);
    } else if (match[5] !== undefined) {
      parts.push(<em key={key++}>{match[5]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length <= 1 ? (parts[0] ?? text) : <>{parts}</>;
}

interface TableData {
  headers: string[];
  rows: string[][];
}

function tryParseTable(lines: string[], startIndex: number): { table: TableData; consumed: number } | null {
  if (startIndex + 1 >= lines.length) return null;
  const headerLine = lines[startIndex].trim();
  const sepLine = lines[startIndex + 1].trim();
  if (!headerLine.includes('|') || !sepLine.includes('|')) return null;
  if (!/^[\s|:-]+$/.test(sepLine)) return null;

  const parseCells = (line: string): string[] =>
    line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  const headers = parseCells(headerLine);
  const sepCells = parseCells(sepLine);
  if (sepCells.length !== headers.length) return null;
  if (!sepCells.every((c) => /^:?-+:?$/.test(c))) return null;

  const rows: string[][] = [];
  let i = startIndex + 2;
  while (i < lines.length) {
    const row = lines[i].trim();
    if (!row.includes('|')) break;
    rows.push(parseCells(row));
    i++;
  }
  if (rows.length === 0) return null;
  return { table: { headers, rows }, consumed: i - startIndex };
}

function renderTable(table: TableData, key: number): React.ReactNode {
  return (
    <div key={key} style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} style={thStyle}>{renderInline(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={tdStyle}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderTextBlock(text: string, blockKey: number): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let i = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    elements.push(
      <Tag key={elements.length} style={listStyle}>
        {listItems.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
      </Tag>,
    );
    listItems = [];
    listType = null;
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Try table parse
    const tableResult = tryParseTable(lines, i);
    if (tableResult) {
      flushList();
      elements.push(renderTable(tableResult.table, elements.length));
      i += tableResult.consumed;
      continue;
    }

    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={elements.length} style={hrStyle} />);
      i++;
      continue;
    }

    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const sizes = [18, 16, 14];
      elements.push(
        <div key={elements.length} style={{ fontWeight: 'bold', fontSize: `${sizes[headerMatch[1].length - 1]}px`, margin: '8px 0 4px', color: '#e8d5a8' }}>
          {renderInline(headerMatch[2])}
        </div>,
      );
      i++;
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulMatch) {
      if (listType === 'ol') flushList();
      listType = 'ul';
      listItems.push(ulMatch[1]);
      i++;
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (olMatch) {
      if (listType === 'ul') flushList();
      listType = 'ol';
      listItems.push(olMatch[1]);
      i++;
      continue;
    }

    flushList();

    if (!trimmed) {
      if (elements.length > 0) elements.push(<div key={elements.length} style={{ height: '6px' }} />);
      i++;
      continue;
    }

    elements.push(<div key={elements.length} style={{ margin: '2px 0' }}>{renderInline(trimmed)}</div>);
    i++;
  }

  flushList();
  return <div key={blockKey}>{elements}</div>;
}

export function MarkdownText({ text, fontSize }: Props) {
  if (!text) return null;
  const blocks = parseBlocks(text);
  return (
    <div style={{ fontSize: fontSize ? `${fontSize}px` : undefined, lineHeight: 1.5, wordBreak: 'break-word' }}>
      {blocks.map((block, i) =>
        block.type === 'code' ? (
          <pre key={i} style={codeBlockStyle}>
            {block.language && <div style={codeLangStyle}>{block.language}</div>}
            <code>{block.content}</code>
          </pre>
        ) : (
          renderTextBlock(block.content, i)
        ),
      )}
    </div>
  );
}

const inlineCodeStyle: React.CSSProperties = {
  backgroundColor: 'rgba(197, 160, 89, 0.15)',
  border: '1px solid rgba(197, 160, 89, 0.3)',
  borderRadius: '3px',
  padding: '1px 4px',
  fontSize: '0.9em',
  fontFamily: 'monospace',
};

const codeBlockStyle: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  border: '1px solid rgba(197, 160, 89, 0.2)',
  borderRadius: '4px',
  padding: '8px 10px',
  margin: '6px 0',
  overflowX: 'auto',
  fontSize: '0.85em',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const codeLangStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#a69d8c',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const listStyle: React.CSSProperties = {
  margin: '4px 0',
  paddingLeft: '20px',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid rgba(197, 160, 89, 0.3)',
  margin: '8px 0',
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: '0.9em',
  margin: '4px 0',
};

const thStyle: React.CSSProperties = {
  borderBottom: '2px solid rgba(197, 160, 89, 0.4)',
  padding: '4px 8px',
  textAlign: 'left',
  color: '#e8d5a8',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(197, 160, 89, 0.15)',
  padding: '3px 8px',
  whiteSpace: 'nowrap',
};
