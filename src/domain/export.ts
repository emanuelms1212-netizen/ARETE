/**
 * Exporting part of an account: the rows that belong to a date range.
 *
 * Rows are matched on the local date they belong to, whatever the adapter
 * calls it. Rows with no date — settings, foods, a programme's choices — are
 * left out of a range export and included in a full one, so "the last 28
 * days" means exactly that.
 */
const DATE_KEYS = [
  'local_date',
  'localDate',
  'date',
  'weekStart',
  'started_on',
  'startedOn',
] as const;

export function rowDate(row: Record<string, unknown>): string | null {
  for (const key of DATE_KEYS) {
    const value = row[key];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return null;
}

export function exportForRange(
  tables: Readonly<Record<string, readonly Record<string, unknown>[]>>,
  range: { readonly from: string; readonly to: string } | null,
): Record<string, Record<string, unknown>[]> {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const [table, rows] of Object.entries(tables)) {
    const kept = range
      ? rows.filter((row) => {
          const date = rowDate(row);
          return date !== null && date >= range.from && date <= range.to;
        })
      : [...rows];
    if (kept.length > 0) result[table] = kept;
  }
  return result;
}
