import { describe, expect, it } from "vitest";
import { getCurrencyPlanInterval } from "./currency-plan";

describe("getCurrencyPlanInterval", () => {
  it("matches the published interval for each known plan", () => {
    expect(getCurrencyPlanInterval("free", 60)).toBe(86_400);
    expect(getCurrencyPlanInterval("basic", 60)).toBe(3_600);
    expect(getCurrencyPlanInterval("professional", 3_600)).toBe(60);
    expect(getCurrencyPlanInterval("enterprise")).toBe(60);
  });

  it("allows a bounded override only for unknown custom plans", () => {
    expect(getCurrencyPlanInterval("custom", 300)).toBe(300);
    expect(getCurrencyPlanInterval("custom", 1)).toBe(86_400);
    expect(getCurrencyPlanInterval("custom", 999_999)).toBe(86_400);
  });
});
