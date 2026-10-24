import type { Row, Totals } from "./types";

export function totals(rows: Row[]): Totals {
  const sum: Totals = { unfair: 0, fair: 0, unclear: 0, cut: 0, billed: 0 };
  for (const row of rows) {
    const cut = row.cut ?? 0;
    const billed = row.billed ?? 0;
    sum.cut += cut;
    sum.billed += billed;
    sum[row.verdict] += cut;
  }
  return sum;
}
