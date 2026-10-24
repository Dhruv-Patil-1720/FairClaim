import { expect, test } from "vitest";
import { demoAudit } from "./demoCache";
import { sharePercents } from "./reference";

test("demo cache keeps both policy totals", () => {
  const standard = demoAudit("first");
  expect(standard.totals).toMatchObject({
    unfair: 45000,
    fair: 42000,
    cut: 87000,
    billed: 172000,
  });
  expect(standard.audit.rows.map((row) => row.verdict)).toEqual([
    "fair",
    "fair",
    "unfair",
    "unfair",
    "unfair",
    "fair",
  ]);

  const strict = demoAudit("strict");
  expect(strict.totals).toMatchObject({
    unfair: 20000,
    fair: 67000,
    cut: 87000,
    billed: 172000,
  });
  expect(strict.audit.rows.find((row) => row.item.startsWith("Blood"))?.verdict).toBe("fair");
  expect(strict.audit.rows.find((row) => row.item.startsWith("Heart"))?.verdict).toBe("fair");
  expect(strict.audit.rows.find((row) => row.item === "Medicines")?.verdict).toBe("unfair");
  expect(strict.audit.policy.paid_in_full_items).toEqual(["medicines"]);
  expect(strict.audit.policy.quote.toLowerCase()).toContain("medicines");
  expect(strict.audit.policy.quote.toLowerCase()).not.toContain("implants");
});

test("bill shares match the labelled percents", () => {
  expect(sharePercents([85000, 42000, 45000])).toEqual([49, 24, 27]);
  expect(sharePercents([85000, 67000, 20000])).toEqual([49, 39, 12]);
});
