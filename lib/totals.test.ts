import { expect, test } from "vitest";
import golden from "../fixtures/golden.json";
import goldenB from "../fixtures/golden-b.json";
import { totals } from "./totals";
import type { Row } from "./types";

test("golden policy cuts", () => {
  const result = totals(golden.rows as Row[]);
  expect(result.unfair).toBe(45000);
  expect(result.fair).toBe(42000);
  expect(result.cut).toBe(87000);
  expect(result.billed).toBe(172000);
});

test("stricter policy cuts", () => {
  const result = totals(goldenB.rows as Row[]);
  expect(result.unfair).toBe(20000);
  expect(result.fair).toBe(67000);
});

test("treats null amounts as zero", () => {
  const result = totals([
    {
      item: "Unknown charge",
      billed: null,
      cut: null,
      insurer_reason: "",
      verdict: "unclear",
      why: "",
      box: [0, 0, 1, 1],
    },
    {
      item: "Extra",
      billed: 100,
      cut: 40,
      insurer_reason: "",
      verdict: "unclear",
      why: "",
      box: [0, 0, 1, 1],
    },
  ]);
  expect(result).toEqual({
    unfair: 0,
    fair: 0,
    unclear: 40,
    cut: 40,
    billed: 100,
  });
});
