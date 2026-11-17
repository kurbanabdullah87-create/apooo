import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ProviderRates = { lastUpdatedAt: string; base: string; rates: Record<string, number> };

// Best-effort cache shared by warm function instances to keep provider quota predictable.
let cache: { expiresAt: number; value: ProviderRates } | undefined;
let pending: Promise<ProviderRates> | undefined;

export const getLiveCurrencyRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (cache && cache.expiresAt > Date.now()) return cache.value;
    if (!pending) pending = (async () => {
      const apiKey = process.env["FXAPI_API_KEY"];
      if (!apiKey) throw new Error("Canlı kur servisi henüz yapılandırılmadı (FXAPI_API_KEY).");

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
      const rates = Object.fromEntries(
        Object.entries(rawRates).flatMap(([code, raw]) => {
          const value = typeof raw === "number" ? raw : raw && typeof raw === "object" && "value" in raw ? Number(raw.value) : NaN;
          return /^[A-Z0-9]{3,6}$/.test(code) && Number.isFinite(value) && value > 0 ? [[code, value]] : [];
        }),
      );
      rates.USD = 1;
      const value = {
        lastUpdatedAt: body.meta?.last_updated_at ?? new Date().toISOString(),
        base: body.meta?.base_currency ?? "USD",
        rates,
      } satisfies ProviderRates;
      cache = { expiresAt: Date.now() + 50_000, value };
      return value;
    })();
    try { return await pending; }
    finally { pending = undefined; }
  });
