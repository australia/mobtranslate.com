// Drizzle returns camelCase keys; the old Supabase responses (and therefore the
// frontend consumers) use snake_case DB column names. These helpers convert the
// TOP-LEVEL keys of a row back to snake_case so API responses keep their exact
// shape. Shallow on purpose: nested jsonb values (e.g. `metadata`) are returned
// as-is, exactly like Supabase did.

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export function snakeRow<T extends Record<string, any>>(row: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v;
  return out;
}

export function snakeRows<T extends Record<string, any>>(rows: T[]): Record<string, any>[] {
  return rows.map(snakeRow);
}
