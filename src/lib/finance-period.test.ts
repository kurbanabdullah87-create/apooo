import { describe, expect, it } from "vitest";
import { calculatePeriodFinance, periodDateBounds } from "./finance-period";

describe("finance period summary", () => {
  it("builds local calendar period bounds", () => {
    const now = new Date(2026, 10, 22, 14, 0);
    expect(periodDateBounds("today", "", "", now)).toEqual({ from: "2026-11-22", to: "2026-11-22" });
    expect(periodDateBounds("week", "", "", now)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodDateBounds("month", "", "", now)).toEqual({ from: "2026-11-01", to: "2026-11-22" });
    expect(periodDateBounds("year", "", "", now)).toEqual({ from: "2026-01-01", to: "2026-11-22" });
    expect(periodDateBounds("custom", "2026-10-01", "2026-10-31", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("separates accrued sales, collected cash, expenses and payroll outflows", () => {
    const tx = (kind: "debt" | "payment", amount: number, occurred_on = "2026-11-20") => ({ id: `${kind}${amount}`, customer_id: "c", kind, amount, material_cost: 0, vat_rate: 20, occurred_on });
    const result = calculatePeriodFinance({
      transactions: [tx("debt", 1200), tx("payment", 500), tx("debt", 900, "2026-10-31")],
      expenses: [{ id: "e", category: "yakit", amount: 100, occurred_on: "2026-11-21" }],
      payroll: [{ payload: { date: "2026-11-20", days: 1, rate: 200 } }],
      advances: [{ payload: { date: "2026-11-20", amount: 50 } }],
      payrollPayments: [{ payload: { date: "2026-11-20", amount: 70 } }],
      from: "2026-11-01", to: "2026-11-30",
    });
    expect(result).toMatchObject({ grossAccrued: 1200, collected: 500, expenses: 100, payrollEarned: 200, advancesPaid: 50, payrollPaid: 70, netCashFlow: 280, outstandingReceivable: 700, hasData: true });
  });

  it("keeps empty periods empty rather than inventing transactions", () => {
    expect(calculatePeriodFinance({ transactions: [], expenses: [], payroll: [], advances: [], payrollPayments: [], from: "2026-11-01", to: "2026-11-30" }).hasData).toBe(false);
  });
});
