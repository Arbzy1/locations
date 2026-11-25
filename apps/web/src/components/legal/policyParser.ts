export type PolicyBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export function parsePolicyDocument(source: string): { title: string; blocks: PolicyBlock[] } {
  const lines = source.replace(/\r\n/g, '\n').trim().split('\n');
  let title = 'Legal';
  let startIndex = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('# ')) {
      title = trimmed.slice(2).trim();
      startIndex = i + 1;
    }
    break;
  }

  const blocks: PolicyBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ') });
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ kind: 'list', items: listItems });
      listItems = [];
    }
  };

  for (let i = startIndex; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: trimmed.slice(3).trim() });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      listItems.push(trimmed.replace(/^[-*]\s+/, '').trim());
      continue;
    }
    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return { title, blocks };
}
