import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCurrencyPlanInterval } from "@/lib/currency-plan";

export type ProviderRates = {
  lastUpdatedAt: string;
  fetchedAt: string;
  updateIntervalSeconds: number;
  provider: "fxapi" | "Frankfurter";
  dataType: "mid_market" | "daily_reference_blend";
  isStale: boolean;
  warning?: string;
  base: string;
  rates: Record<string, number>;
};

// Best-effort cache shared by warm function instances to keep provider quota predictable.
let cache: { expiresAt: number; value: ProviderRates } | undefined;
let pending: Promise<ProviderRates> | undefined;
let planCache: { expiresAt: number; intervalSeconds: number; planName: string } | undefined;

async function fetchFrankfurterRates(warning?: string): Promise<ProviderRates> {
  const response = await fetch("https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,EUR,GBP,CHF", {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Günlük kur kaynağı yanıt vermedi (${response.status}).`);
  const rows = await response.json() as Array<{ date?: unknown; quote?: unknown; rate?: unknown }>;
  const rates = Object.fromEntries(rows.flatMap((row) => typeof row.quote === "string" && typeof row.rate === "number" && Number.isFinite(row.rate) && row.rate > 0 ? [[row.quote, row.rate]] : []));
  if (!Object.keys(rates).length || typeof rows[0]?.date !== "string") throw new Error("Günlük kur kaynağından geçerli veri alınamadı.");
  rates.USD = 1;
  return {
    lastUpdatedAt: rows[0].date,
    fetchedAt: new Date().toISOString(),
    updateIntervalSeconds: 86_400,
    provider: "Frankfurter",
    dataType: "daily_reference_blend",
    isStale: false,
    ...(warning ? { warning } : {}),
    base: "USD",
    rates,
  };
}

async function getPlanInterval(apiKey: string) {
  if (planCache && planCache.expiresAt > Date.now()) return planCache;
  const response = await fetch("https://api.fxapi.com/v1/status", {
    headers: { apikey: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Kur planı doğrulanamadı (${response.status}).`);
  const body = await response.json() as { plan?: { name?: unknown; status?: unknown } };
  const planName = typeof body.plan?.name === "string" ? body.plan.name : "unknown";
  if (typeof body.plan?.status === "string" && body.plan.status !== "active") throw new Error("FXAPI aboneliği etkin değil.");
  const overrideValue = Number(process.env["FXAPI_UPDATE_INTERVAL_SECONDS"]);
  const envOverride = Number.isFinite(overrideValue) ? overrideValue : undefined;
  const intervalSeconds = getCurrencyPlanInterval(planName, envOverride);
  planCache = { expiresAt: Date.now() + 6 * 60 * 60_000, intervalSeconds, planName };
  return planCache;
}

export const getLiveCurrencyRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (cache && cache.expiresAt > Date.now()) return cache.value;
    if (!pending) pending = (async () => {
      const apiKey = process.env["FXAPI_API_KEY"];
      if (!apiKey) {
        const value = await fetchFrankfurterRates("FXAPI anahtarı ayarlı değil; ücretsiz günlük referans kaynağı kullanılıyor.");
        cache = { expiresAt: Date.now() + value.updateIntervalSeconds * 1000, value };
        return value;
      }

      const plan = await getPlanInterval(apiKey);
      const url = new URL("https://api.fxapi.com/v1/latest");
      url.searchParams.set("base_currency", "USD");
      url.searchParams.set("shape", "compact");
      const response = await fetch(url, {
        headers: { apikey: apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Canlı kur sağlayıcısı yanıt vermedi (${response.status}).`);

      const body = (await response.json()) as {
        meta?: { base_currency?: string; last_updated_at?: string };
        data?: Record<string, unknown>;
      };
      const rawRates = body.data;
      if (!rawRates || typeof rawRates !== "object") throw new Error("Kur sağlayıcısından geçersiz yanıt alındı.");
      const lastUpdatedAtValue = body.meta?.last_updated_at;
      if (typeof lastUpdatedAtValue !== "string") throw new Error("Kur sağlayıcısı veri zamanını göndermedi.");
      const lastUpdatedAt = lastUpdatedAtValue;
      const rateTime = Date.parse(lastUpdatedAt);
      if (!Number.isFinite(rateTime) || rateTime > Date.now() + 5 * 60_000) throw new Error("Kur sağlayıcısının zaman damgası geçersiz.");
      const rates = Object.fromEntries(
        Object.entries(rawRates).flatMap(([code, raw]) => {
          const value = typeof raw === "number" ? raw : raw && typeof raw === "object" && "value" in raw ? Number(raw.value) : NaN;
          return /^[A-Z0-9]{3,6}$/.test(code) && Number.isFinite(value) && value > 0 ? [[code, value]] : [];
        }),
      );
      rates.USD = 1;
      const fetchedAt = new Date().toISOString();
      const ageMs = Date.now() - rateTime;
      const value = {
        lastUpdatedAt,
        fetchedAt,
        updateIntervalSeconds: plan.intervalSeconds,
        provider: "fxapi" as const,
        dataType: "mid_market" as const,
        isStale: ageMs > plan.intervalSeconds * 1000 + 5 * 60_000,
        ...(ageMs > plan.intervalSeconds * 1000 + 5 * 60_000 ? { warning: `Sağlayıcı verisi plan aralığından eski (${plan.planName}).` } : {}),
        base: body.meta?.base_currency ?? "USD",
        rates,
      } satisfies ProviderRates;
      cache = { expiresAt: Date.now() + plan.intervalSeconds * 1000, value };
      return value;
    })();
    try {
      const request = pending;
      if (!request) throw new Error("Kur isteği başlatılamadı.");
      return await request;
    }
    catch (error) {
      if (cache) return { ...cache.value, isStale: true, warning: error instanceof Error ? `Kur servisine ulaşılamadı; ${cache.value.provider} kaynağından son alınan veri gösteriliyor. ${error.message}` : `Kur servisine ulaşılamadı; ${cache.value.provider} kaynağından son alınan veri gösteriliyor.` };
      const value = await fetchFrankfurterRates(error instanceof Error ? `FXAPI kullanılamıyor; Frankfurter günlük referans kaynağı gösteriliyor. ${error.message}` : "FXAPI kullanılamıyor; Frankfurter günlük referans kaynağı gösteriliyor.");
      cache = { expiresAt: Date.now() + value.updateIntervalSeconds * 1000, value };
      return value;
    }
    finally { pending = undefined; }
  });
