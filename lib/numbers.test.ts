import { expect, test } from "vitest";
import { inventedNumbers, numbersIn } from "./numbers";

test("reads a rupee amount with commas", () => {
  expect(numbersIn("₹45,000")).toEqual([45000]);
});

test("reads Devanagari digits", () => {
  expect(numbersIn("₹४५,०००")).toEqual([45000]);
});

test("reads Indian grouping", () => {
  expect(numbersIn("1,72,000")).toEqual([172000]);
});

test("drops amounts under 100", () => {
  expect(numbersIn("pay within 14 days in 2026")).toEqual([2026]);
  expect(numbersIn("₹99 and ₹100")).toEqual([100]);
});

test("flags amounts that were not allowed", () => {
  expect(inventedNumbers("pay ₹45,000 and ₹99,999", [45000])).toEqual([99999]);
});
