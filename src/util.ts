/** Parse API numbers that arrive as strings, with commas or "-" placeholders. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Flatten the grouped `keyMetrics` object into one key -> value map. */
export function flattenMetrics(keyMetrics: Record<string, { key: string; value: unknown }[]> | undefined) {
  const out: Record<string, number | null> = {};
  for (const group of Object.values(keyMetrics ?? {})) {
    for (const item of group) out[item.key.replace(/[)\s]+$/, "")] = num(item.value);
  }
  return out;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}

export function limit<T>(items: T[] | undefined, count: number): T[] {
  return (items ?? []).slice(0, count);
}

export function toTitle(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
