export const CURRENCY_OPTIONS = [
  { code: "USD", label: "ABD Doları" },
  { code: "TRY", label: "Türk Lirası" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "İngiliz Sterlini" },
  { code: "XAU", label: "Gram Altın" },
  { code: "CHF", label: "İsviçre Frangı" },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];
export type RatePoint = { date: string; rate: number };
export type PairRate = { base: string; quote: string; rate: number; date: string };

const API = "https://api.frankfurter.dev/v2";
const CACHE_PREFIX = "saha.currency.v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
const GRAMS_PER_TROY_OUNCE = 31.1034768;

function toGramRate(rate: number, base: CurrencyCode, quote: CurrencyCode) {
  if (quote === "XAU") return rate * GRAMS_PER_TROY_OUNCE;
  if (base === "XAU") return rate / GRAMS_PER_TROY_OUNCE;
  return rate;
}

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
  if (base === quote) return { base, quote, rate: 1, date: new Date().toISOString().slice(0, 10) } satisfies PairRate;
  const key = `rate.${base}.${quote}`;
  const cached = readCache<PairRate>(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.value;

  try {
    const row = await getJson<{ date: string; base: string; quote: string; rate: number }>(
      `${API}/rate/${base.toLowerCase()}/${quote.toLowerCase()}`,
      signal,
    );
    if (!Number.isFinite(row.rate) || row.rate <= 0) throw new Error("Kur verisi geçersiz.");
    const result = { base, quote, rate: toGramRate(row.rate, base, quote), date: row.date };
    writeCache(key, result);
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (cached) return cached.value;
    throw error;
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
      .map((row) => ({ date: row.date, rate: toGramRate(row.rate, base, quote) }))
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
  if (code === "XAU") return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value)} g altın`;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: code,
    maximumFractionDigits,
  }).format(value);
}

export function currencyLabel(code: CurrencyCode) {
  return CURRENCY_OPTIONS.find((option) => option.code === code)?.label ?? code;
}
