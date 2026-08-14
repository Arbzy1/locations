/**
 * Split a SQL file into statements without breaking dollar-quoted bodies
 * (PostgreSQL `DO $$ ... $$`) or quoted strings.
 */
export function splitSql(body: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inDollar: string | null = null;
  const n = body.length;

  const flush = () => {
    const stmt = current.trim();
    if (stmt) statements.push(stmt);
    current = "";
  };

  while (i < n) {
    const c = body[i];
    const next = i + 1 < n ? body[i + 1] : "";

    if (!inSingle && !inDouble && !inDollar) {
      if (c === "-" && next === "-") {
        i += 2;
        while (i < n && body[i] !== "\n") i += 1;
        continue;
      }
      if (c === "/" && next === "*") {
        i += 2;
        while (i + 1 < n && !(body[i] === "*" && body[i + 1] === "/")) i += 1;
        i += 2;
        continue;
      }
    }

    if (!inSingle && !inDouble) {
      const tag = readDollarTag(body, i);
      if (tag) {
        if (!inDollar) {
          inDollar = tag;
          current += tag;
          i += tag.length;
          continue;
        }
        if (inDollar === tag) {
          current += tag;
          i += tag.length;
          inDollar = null;
          continue;
        }
      }
    }

    if (!inDollar) {
      if (c === "'" && !inDouble) {
        current += c;
        i += 1;
        if (inSingle && i < n && body[i] === "'") {
          current += "'";
          i += 1;
          continue;
        }
        inSingle = !inSingle;
        continue;
      }
      if (c === '"' && !inSingle) {
        current += c;
        i += 1;
        if (inDouble && i < n && body[i] === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inDouble = !inDouble;
        continue;
      }
    }

    if (c === ";" && !inSingle && !inDouble && !inDollar) {
      flush();
      i += 1;
      continue;
    }

    current += c;
    i += 1;
  }

  flush();
  return statements;
}

function readDollarTag(body: string, i: number): string | null {
  if (body[i] !== "$") return null;
  let j = i + 1;
  while (j < body.length && /[A-Za-z0-9_]/.test(body[j]!)) j += 1;
  if (body[j] === "$") return body.slice(i, j + 1);
  return null;
}
