// Reading JSON while the model is still writing it: the value so far of one top-level string field, e.g.
// "answer" in `{"on_topic": true, "answer": "Una tortilla de esp`. Pure, no dependencies.

export interface PartialString {
  /** The decoded text so far; an escape cut at the end is left out until it is whole. */
  value: string;
  /** Its closing quote is in: the value is final. */
  done: boolean;
}

const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const SPACE = /[ \t\n\r]/;
/** What may still become a `\uXXXX` escape once more text arrives. */
const ESCAPE_START = /^(?:\\(?:u[0-9a-fA-F]{0,3})?)?$/;

interface Scanned extends PartialString {
  /** Just after the closing quote (the end of the text when it is not in yet). */
  end: number;
}

/**
 * The top-level string field `key` of a JSON object that may be cut anywhere. Null until the opening quote
 * of its value has arrived, and when its value is not a string. Keys of nested objects and text inside
 * other strings never match.
 */
export function partialStringField(json: string, key: string): PartialString | null {
  let i = json.indexOf('{');
  if (i < 0) return null;
  i++;
  let depth = 1;
  let expectKey = true;
  while (i < json.length) {
    const c = json[i]!;
    if (c === '"') {
      const s = readString(json, i + 1);
      if (!s.done) return null;
      if (depth === 1 && expectKey) {
        let j = skipSpace(json, s.end);
        if (json[j] !== ':') return null;
        j = skipSpace(json, j + 1);
        if (j >= json.length) return null;
        if (s.value === key) {
          if (json[j] !== '"') return null;
          const v = readString(json, j + 1);
          return { value: v.value, done: v.done };
        }
        expectKey = false;
        i = j;
        continue;
      }
      i = s.end;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) return null;
    } else if (c === ',' && depth === 1) expectKey = true;
    i++;
  }
  return null;
}

function skipSpace(json: string, from: number): number {
  let i = from;
  while (i < json.length && SPACE.test(json[i]!)) i++;
  return i;
}

/** Decodes a JSON string from `start` (just after its opening quote) to its closing quote or the end of the text. */
function readString(json: string, start: number): Scanned {
  let out = '';
  let i = start;
  while (i < json.length) {
    const c = json[i]!;
    if (c === '"') return { value: out, done: true, end: i + 1 };
    if (c !== '\\') {
      out += c;
      i++;
      continue;
    }
    const e = json[i + 1];
    if (e === undefined) break; // cut just after the backslash
    if (e === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break; // cut inside \uXXXX
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        const code = parseInt(hex, 16);
        // The first half of an emoji waits for its second half.
        if (code >= 0xd800 && code <= 0xdbff && json.length - (i + 6) < 6 && ESCAPE_START.test(json.slice(i + 6))) break;
        out += String.fromCharCode(code);
        i += 6;
        continue;
      }
    }
    out += ESCAPES[e] ?? e;
    i += 2;
  }
  return { value: out, done: false, end: json.length };
}
