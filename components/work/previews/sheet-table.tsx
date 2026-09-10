"use client";

/** Rows and columns shown at most; a bigger sheet says so and offers the download. */
const MAX_ROWS = 500;
const MAX_COLUMNS = 40;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

/** A grid of cells with row numbers, the way a spreadsheet reads. */
export function SheetTable({ rows }: { rows: unknown[][] }) {
  const shown = rows.slice(0, MAX_ROWS);
  const width = Math.min(MAX_COLUMNS, shown.reduce((w, r) => Math.max(w, r.length), 0));
  return (
    <div className="min-w-0">
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-surface text-[12px]">
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className={r === 0 ? "font-semibold" : undefined}>
                <th scope="row" className="sticky left-0 border border-line bg-hover px-2 py-1 text-right font-normal text-muted">
                  {r + 1}
                </th>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="max-w-[18rem] truncate border border-line px-2 py-1 text-ink">
                    {cellText(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS ? <p className="p-3 text-micro text-muted">Showing the first {MAX_ROWS} rows of {rows.length}. Download it for the rest.</p> : null}
    </div>
  );
}
