import type { Expense, Tx } from "@/lib/finance";
import { payrollEntryAmount } from "@/lib/work";

export type FinancePeriod = "today" | "week" | "month" | "year" | "custom";

export function periodDateBounds(period: FinancePeriod, from: string, to: string, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (period === "custom") return { from: from || today, to: to || today };
  if (period === "today") return { from: today, to: today };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") start.setDate(start.getDate() - 6);
  if (period === "month") start.setDate(1);
  if (period === "year") start.setMonth(0, 1);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return { from: startKey, to: today };
}

function inRange(date: string, from: string, to: string) {
  const key = date.slice(0, 10);
  return key >= from && key <= to;
}

type DatedPayload = { payload: Record<string, unknown>; created_at?: string };

/** Dashboard amounts use only known TRY records; bank vault records are deliberately excluded. */
export function calculatePeriodFinance(input: {
  transactions: Tx[];
  expenses: Expense[];
  payroll: DatedPayload[];
  advances: DatedPayload[];
  payrollPayments: DatedPayload[];
  from: string;
  to: string;
}) {
  const tx = input.transactions.filter((row) => inRange(row.occurred_on, input.from, input.to));
  const expenses = input.expenses.filter((row) => inRange(row.occurred_on, input.from, input.to));
  const payroll = input.payroll.filter((row) => String(row.payload.currency ?? "TRY") === "TRY" && inRange(String(row.payload.date ?? row.created_at ?? ""), input.from, input.to));
  const advances = input.advances.filter((row) => String(row.payload.currency ?? "TRY") === "TRY" && inRange(String(row.payload.date ?? row.created_at ?? ""), input.from, input.to));
  const payments = input.payrollPayments.filter((row) => String(row.payload.currency ?? "TRY") === "TRY" && inRange(String(row.payload.date ?? row.created_at ?? ""), input.from, input.to));
  const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
  const grossAccrued = sum(tx.filter((row) => row.kind === "debt").map((row) => Number(row.amount) || 0));
  const collected = sum(tx.filter((row) => row.kind === "payment").map((row) => Number(row.amount) || 0));
  const expensesTotal = sum(expenses.map((row) => Number(row.amount) || 0));
  const payrollEarned = sum(payroll.map((row) => payrollEntryAmount(row.payload as never)));
  const advancesPaid = sum(advances.map((row) => Number(row.payload.amount) || 0));
  const payrollPaid = sum(payments.map((row) => Number(row.payload.amount) || 0));
  const netCashFlow = Math.round((collected - expensesTotal - advancesPaid - payrollPaid) * 100) / 100;
  const outstandingReceivable = sum(tx.filter((row) => row.kind === "debt").map((row) => Number(row.amount) || 0)) - sum(tx.filter((row) => row.kind === "payment").map((row) => Number(row.amount) || 0));
  const hasData = tx.length + expenses.length + payroll.length + advances.length + payments.length > 0;
  return { grossAccrued, collected, expenses: expensesTotal, payrollEarned, advancesPaid, payrollPaid, netCashFlow, outstandingReceivable: Math.max(0, Math.round(outstandingReceivable * 100) / 100), hasData, rowCount: tx.length + expenses.length + payroll.length + advances.length + payments.length };
}
