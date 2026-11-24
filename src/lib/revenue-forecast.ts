import type { WorkRecord } from "@/lib/work";

type ForecastWeek = { label: string; from: string; to: string; amount: number };

/** Transparent recurring-work estimate. Historical records are not treated as guaranteed bookings. */
export function forecastRevenueNext30Days(rows: WorkRecord[], today = new Date()) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const daysAgo = (date: Date, days: number) => { const result = new Date(date); result.setDate(result.getDate() - days); return result; };
  const from90 = iso(daysAgo(day, 90));
  const historical = rows.flatMap((row) => {
    if (row.payload.status !== "Tamamlandı") return [];
    const occurred = String(row.payload.completed_at ?? row.payload.date ?? row.created_at).slice(0, 10);
    const amount = Number(row.payload.price ?? 0) || Number(row.payload.hourly_rate ?? 0) * Number(row.payload.planned_hours ?? 0);
    if (occurred < from90 || occurred > iso(day) || !(amount > 0)) return [];
    return [{ date: occurred, amount, customerId: String(row.payload.customer_id ?? row.owner_id) }];
  });
  const customerOrders = new Map<string, number[]>();
  for (const row of historical) customerOrders.set(row.customerId, [...(customerOrders.get(row.customerId) ?? []), row.amount]);

  // Use prior monthly job values as a capped seasonal modifier only when there is
  // enough history; otherwise use neutral seasonality instead of fabricating it.
  const monthValues = new Map<string, number>();
  for (const row of rows) {
    if (row.payload.status !== "Tamamlandı") continue;
    const occurred = String(row.payload.completed_at ?? row.payload.date ?? row.created_at).slice(0, 10);
    const date = new Date(`${occurred}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || date < daysAgo(day, 730) || date >= day) continue;
    const amount = Number(row.payload.price ?? 0) || Number(row.payload.hourly_rate ?? 0) * Number(row.payload.planned_hours ?? 0);
    if (amount > 0) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthValues.set(key, (monthValues.get(key) ?? 0) + amount);
    }
  }
  const seasonalMonths = monthValues.size >= 6;
  const monthlyByCalendar = new Map<number, number[]>();
  for (const [key, value] of monthValues) {
    const month = Number(key.slice(5, 7)) - 1;
    monthlyByCalendar.set(month, [...(monthlyByCalendar.get(month) ?? []), value]);
  }
  const monthAverage = monthValues.size ? [...monthValues.values()].reduce((sum, value) => sum + value, 0) / monthValues.size : 0;
  const seasonalFactor = (month: number) => {
    const values = monthlyByCalendar.get(month) ?? [];
    if (!seasonalMonths || !values.length || !(monthAverage > 0)) return 1;
    return Math.min(1.3, Math.max(0.7, values.reduce((sum, value) => sum + value, 0) / values.length / monthAverage));
  };
  const dailyBase = [...customerOrders.values()].reduce((sum, amounts) => {
    const averageOrder = amounts.reduce((total, value) => total + value, 0) / amounts.length;
    return sum + averageOrder * amounts.length / 90;
  }, 0);
  const weekly: ForecastWeek[] = [];
  let total = 0;
  for (let startOffset = 0; startOffset < 30; startOffset += 7) {
    const start = daysAgo(day, -startOffset);
    const end = daysAgo(day, -(Math.min(29, startOffset + 6)));
    let amount = 0;
    for (let offset = startOffset; offset <= Math.min(29, startOffset + 6); offset++) {
      const date = daysAgo(day, -offset);
      amount += dailyBase * seasonalFactor(date.getMonth());
    }
    total += amount;
    weekly.push({ label: `Hafta ${weekly.length + 1}`, from: iso(start), to: iso(end), amount: Math.round(amount * 100) / 100 });
  }
  const weeklyActual = Array.from({ length: 13 }, (_, index) => {
    const start = daysAgo(day, (index + 1) * 7);
    const end = daysAgo(day, index * 7);
    return historical.filter((row) => row.date >= iso(start) && row.date < iso(end)).reduce((sum, row) => sum + row.amount, 0);
  });
  const mean = weeklyActual.reduce((sum, value) => sum + value, 0) / weeklyActual.length;
  const deviations = weeklyActual.map((value) => Math.abs(value - mean)).sort((a, b) => a - b);
  const error85 = deviations[Math.min(deviations.length - 1, Math.floor(deviations.length * 0.85))] ?? 0;
  const margin = error85 * Math.sqrt(30 / 7);
  return {
    amount: Math.round(total * 100) / 100,
    low: Math.max(0, Math.round((total - margin) * 100) / 100),
    high: Math.round((total + margin) * 100) / 100,
    weeks: weekly,
    sampleJobs: historical.length,
    recurringCustomers: customerOrders.size,
    usesSeasonality: seasonalMonths,
    calculatedAt: new Date().toISOString(),
  };
}
