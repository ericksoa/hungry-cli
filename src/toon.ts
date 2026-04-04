// TOON (Token-Oriented Object Notation) encoder.
// LLM-friendly format that uses ~40% fewer tokens than JSON.
// Spec: https://toonformat.dev/

const INDENT = "  ";

export function toToon(data: unknown): string {
  return encodeToon(data, 0);
}

/** Wrap command output in the standard response envelope. */
export function toonResponse(data: unknown, success = true): string {
  const envelope: Record<string, unknown> = {
    success,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      count: Array.isArray(data) ? data.length : 1,
    },
  };
  return encodeToon(envelope, 0);
}

function encodeToon(value: unknown, depth: number): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return escapeString(value);

  if (Array.isArray(value)) {
    return encodeArray(value, depth);
  }

  if (typeof value === "object") {
    return encodeObject(value as Record<string, unknown>, depth);
  }

  return String(value);
}

function encodeObject(obj: Record<string, unknown>, depth: number): string {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";

  const lines: string[] = [];
  const prefix = INDENT.repeat(depth);

  for (const [key, val] of entries) {
    if (val === null || val === undefined) {
      lines.push(`${prefix}${key}: null`);
    } else if (typeof val === "object" && !Array.isArray(val)) {
      // Nested object — indent on next line
      lines.push(`${prefix}${key}:`);
      lines.push(encodeToon(val, depth + 1));
    } else if (Array.isArray(val)) {
      // Array — try tabular format for uniform arrays of objects
      const tabular = tryTabular(key, val, depth);
      if (tabular) {
        lines.push(tabular);
      } else {
        lines.push(`${prefix}${key}[${val.length}]:`);
        for (const item of val) {
          lines.push(`${INDENT.repeat(depth + 1)}${encodeToon(item, depth + 1)}`);
        }
      }
    } else {
      lines.push(`${prefix}${key}: ${encodeToon(val, depth + 1)}`);
    }
  }

  return lines.join("\n");
}

/** Try to encode an array of uniform objects as tabular TOON. */
function tryTabular(key: string, arr: unknown[], depth: number): string | null {
  if (arr.length === 0) return `${INDENT.repeat(depth)}${key}[0]:`;

  // Check if all items are objects with the same keys
  if (!arr.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
    return null;
  }

  const objs = arr as Record<string, unknown>[];
  const fields = Object.keys(objs[0]);
  if (fields.length === 0) return null;

  // All objects must have the same keys
  if (!objs.every((o) => {
    const keys = Object.keys(o);
    return keys.length === fields.length && fields.every((f) => f in o);
  })) {
    return null;
  }

  // All values must be primitives (no nested objects/arrays)
  if (!objs.every((o) => fields.every((f) => {
    const v = o[f];
    return v === null || typeof v !== "object";
  }))) {
    return null;
  }

  const prefix = INDENT.repeat(depth);
  const rowPrefix = INDENT.repeat(depth + 1);
  const lines: string[] = [];
  lines.push(`${prefix}${key}[${arr.length}]{${fields.join(",")}}:`);

  for (const obj of objs) {
    const vals = fields.map((f) => {
      const v = obj[f];
      if (v === null || v === undefined) return "";
      if (typeof v === "string" && (v.includes(",") || v.includes("\n"))) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return String(v);
    });
    lines.push(`${rowPrefix}${vals.join(",")}`);
  }

  return lines.join("\n");
}

function encodeArray(arr: unknown[], depth: number): string {
  if (arr.length === 0) return "[]";

  // For primitive arrays, inline them
  if (arr.every((v) => typeof v !== "object" || v === null)) {
    return `[${arr.map((v) => encodeToon(v, 0)).join(",")}]`;
  }

  // For object arrays at top level, encode each
  const lines: string[] = [];
  for (const item of arr) {
    lines.push(encodeToon(item, depth));
  }
  return lines.join("\n");
}

function escapeString(s: string): string {
  // Only quote if the string contains special characters
  if (/[,\n\r:{}[\]]/.test(s) || s.trim() !== s || s === "") {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
