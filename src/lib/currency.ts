import { getLiveCurrencyRates } from "@/lib/currency.functions";

export const CURRENCY_OPTIONS = [
  { code: "USD", label: "ABD Doları" },
  { code: "TRY", label: "Türk Lirası" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "İngiliz Sterlini" },
  { code: "CHF", label: "İsviçre Frangı" },
] as const;

export type CurrencyCode = string;
export type RatePoint = { date: string; rate: number };
export type PairRate = {
  base: string;
  quote: string;
  rate: number;
  date: string;
  fetchedAt: string;
  refreshIntervalSeconds: number;
  source: "FXAPI" | "Frankfurter" | "Aynı para birimi" | "Cihaz önbelleği";
  dataType: "mid-market referans" | "günlük referans harmanı" | "sabit 1:1";
  live?: boolean;
  stale?: boolean;
  warning?: string;
  availableCurrencies?: string[];
};

const API = "https://api.frankfurter.dev/v2";
const CACHE_PREFIX = "saha.currency.v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
function cacheKey(key: string) {
  return `${CACHE_PREFIX}.${key}`;
}

function readCache<T>(key: string): { value: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: T; savedAt?: number };
    return parsed.value !== undefined && typeof parsed.savedAt === "number"
      ? { value: parsed.value, savedAt: parsed.savedAt }
      : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Private browsing or full device storage must not block conversion.
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(`Kur servisi yanıt vermedi (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function fetchPairRate(base: CurrencyCode, quote: CurrencyCode, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("İstek iptal edildi", "AbortError");
  if (base === quote) return { base, quote, rate: 1, date: new Date().toISOString(), fetchedAt: new Date().toISOString(), refreshIntervalSeconds: 86_400, source: "Aynı para birimi", dataType: "sabit 1:1", live: false } satisfies PairRate;
  const key = `latest.${base}.${quote}`;
  try {
    const live = await getLiveCurrencyRates();
    if (signal?.aborted) throw new DOMException("İstek iptal edildi", "AbortError");
    const baseRate = live.rates[base];
    const quoteRate = live.rates[quote];
    if (!baseRate || !quoteRate) throw new Error(`${base} / ${quote} çifti canlı kur sağlayıcısında bulunamadı.`);
    const rate = quoteRate / baseRate;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Canlı kur verisi geçersiz.");
    const pair: PairRate = {
      base, quote, rate, date: live.lastUpdatedAt, fetchedAt: live.fetchedAt,
      refreshIntervalSeconds: live.updateIntervalSeconds,
      source: live.provider === "fxapi" ? "FXAPI" : "Frankfurter",
      dataType: live.dataType === "mid_market" ? "mid-market referans" : "günlük referans harmanı",
      live: live.provider === "fxapi" && !live.isStale && !live.warning,
      stale: live.isStale, ...(live.warning ? { warning: live.warning } : {}),
      availableCurrencies: Object.keys(live.rates),
    };
    writeCache(key, pair);
    return pair;
  } catch (error) {
    if (signal?.aborted) throw error;
    try {
      const fallback = await getJson<{ date: string; rate: number }>(`${API}/rate/${base.toLowerCase()}/${quote.toLowerCase()}`, signal);
      if (!Number.isFinite(fallback.rate) || fallback.rate <= 0) throw new Error("Günlük referans servisi geçersiz yanıt verdi.");
      const pair: PairRate = {
        base, quote, rate: fallback.rate, date: fallback.date,
        fetchedAt: new Date().toISOString(), refreshIntervalSeconds: 86_400, source: "Frankfurter",
        dataType: "günlük referans harmanı", live: false,
        warning: error instanceof Error ? `FXAPI kullanılamıyor; Frankfurter günlük referans kuru gösteriliyor. ${error.message}` : "FXAPI kullanılamıyor; Frankfurter günlük referans kuru gösteriliyor.",
      };
      writeCache(key, pair);
      return pair;
    } catch (fallbackError) {
      if (signal?.aborted) throw fallbackError;
      const cached = readCache<PairRate>(key);
      if (cached) return { ...cached.value, source: "Cihaz önbelleği", live: false, stale: true, warning: "Kur sağlayıcılarına ulaşılamıyor; bu cihazda daha önce alınmış değer gösteriliyor." } satisfies PairRate;
      throw new Error(fallbackError instanceof Error ? `Kur sağlayıcılarına ulaşılamadı: ${fallbackError.message}` : "Kur sağlayıcılarına ulaşılamadı.");
    }
  }
}

export async function fetchPairHistory(base: CurrencyCode, quote: CurrencyCode, days: number, signal?: AbortSignal): Promise<RatePoint[]> {
  if (base === quote) return [{ date: new Date().toISOString().slice(0, 10), rate: 1 }];
  const key = `history.${base}.${quote}.${days}`;
  const cached = readCache<RatePoint[]>(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.value;

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const params = new URLSearchParams({ base, quotes: quote, from, to });

  try {
    const rows = await getJson<Array<{ date: string; rate: number }>>(`${API}/rates?${params}`, signal);
    const points = rows
      .filter((row) => Number.isFinite(row.rate) && row.rate > 0)
      .map((row) => ({ date: row.date, rate: row.rate }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (points.length === 0) throw new Error("Bu dönem için kur geçmişi bulunamadı.");
    writeCache(key, points);
    return points;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (cached) return cached.value;
    throw error;
  }
}

export function formatCurrency(value: number, code: CurrencyCode, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: code,
    maximumFractionDigits,
  }).format(value);
}

export function currencyLabel(code: CurrencyCode) {
  const fixed = CURRENCY_OPTIONS.find((option) => option.code === code)?.label;
  if (fixed) return fixed;
  try {
    const label = new Intl.DisplayNames(["tr-TR"], { type: "currency" }).of(code);
    return label && label !== code ? label : code;
  } catch {
    return code;
  }
}

export function supportedCurrencyOptions(codes: string[]) {
  const fixedCodes = new Set<string>(CURRENCY_OPTIONS.map((option) => option.code));
  const displayNames = new Intl.DisplayNames(["tr-TR"], { type: "currency" });
  const validFiatCodes = codes.filter((code) => /^[A-Z]{3}$/.test(code) && (fixedCodes.has(code) || displayNames.of(code) !== code));
  return [...new Set([...CURRENCY_OPTIONS.map((option) => option.code), ...validFiatCodes])]
    .map((code) => ({ code, label: currencyLabel(code) }))
    .sort((a, b) => a.code === "TRY" ? -1 : b.code === "TRY" ? 1 : a.code.localeCompare(b.code));
}
