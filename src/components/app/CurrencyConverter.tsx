import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownUp, CircleHelp, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CURRENCY_OPTIONS, currencyLabel, fetchPairHistory, fetchPairRate, formatCurrency, supportedCurrencyOptions, type CurrencyCode, type RatePoint } from "@/lib/currency";

const RANGES = [
  { label: "1G", days: 1 },
  { label: "5G", days: 5 },
  { label: "1A", days: 30 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1825 },
] as const;

function parseAmount(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function inputAmount(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 1e8) / 1e8) : "0";
}

export function CurrencyConverter() {
  const gradientId = useId().replace(/:/g, "");
  const [base, setBase] = useState<CurrencyCode>("USD");
  const [quote, setQuote] = useState<CurrencyCode>("TRY");
  const [rate, setRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState("");
  const [rateLive, setRateLive] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState(() => supportedCurrencyOptions(CURRENCY_OPTIONS.map((option) => option.code)));
  const [points, setPoints] = useState<RatePoint[]>([]);
  const [rangeIndex, setRangeIndex] = useState(1);
  const [amount, setAmount] = useState("1");
  const [inputSide, setInputSide] = useState<"base" | "quote">("base");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedRange = RANGES[rangeIndex] ?? RANGES[1];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [currentResult, historyResult] = await Promise.allSettled([
          fetchPairRate(base, quote, controller.signal),
          fetchPairHistory(base, quote, selectedRange.days, controller.signal),
        ]);
        if (!active) return;
        if (currentResult.status === "fulfilled") {
          setRate(currentResult.value.rate);
          setRateDate(currentResult.value.date);
          const fresh = Date.now() - Date.parse(currentResult.value.date) <= 120_000;
          setRateLive(Boolean(currentResult.value.live) && fresh);
          setError(currentResult.value.warning ?? (fresh ? "" : "Kur sağlayıcısının güncelleme zamanı eski. Dakikalık veri için sağlayıcının 60 saniyelik planı gerekir."));
          if (currentResult.value.availableCurrencies) setCurrencyOptions(supportedCurrencyOptions(currentResult.value.availableCurrencies));
        } else {
          setError(currentResult.reason instanceof Error ? currentResult.reason.message : "Canlı kur alınamadı.");
        }
        setPoints(historyResult.status === "fulfilled" ? historyResult.value : []);
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Kur bilgisi şu anda alınamıyor.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => setRefreshKey((key) => key + 1), 60 * 1000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [base, quote, selectedRange.days, refreshKey]);

  const amountValue = parseAmount(amount);
  const converted = useMemo(() => {
    if (!rate || rate <= 0) return 0;
    return inputSide === "base" ? amountValue * rate : amountValue / rate;
  }, [amountValue, inputSide, rate]);

  const changePercent = points.length > 1 && points[0]!.rate !== 0
    ? ((points[points.length - 1]!.rate - points[0]!.rate) / points[0]!.rate) * 100
    : 0;
  const positiveTrend = changePercent >= 0;
  const decimals = base === "XAU" || quote === "XAU" ? 6 : 4;

  function swap() {
    setBase(quote);
    setQuote(base);
    setInputSide(inputSide === "base" ? "quote" : "base");
  }

  function setPairSide(side: "base" | "quote", value: CurrencyCode) {
    if (side === "base") setBase(value);
    else setQuote(value);
  }

  function showAmount(side: "base" | "quote") {
    if (side === inputSide) return amount;
    return inputAmount(converted);
  }

  return (
    <section aria-labelledby="currency-title" className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/90 p-4 shadow-xl shadow-black/10 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Canlı kur dönüştürücü</p>
          <h2 id="currency-title" className="mt-1 font-display text-lg font-bold">Döviz ve altın kurları</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Kuru yenile" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>
          {loading ? <Loader2 className="animate-spin"/> : <RefreshCw/>}
        </Button>
      </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">1 {currencyLabel(base)} eşittir</p>
            <p className="num mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl" aria-live="polite">
              {rate === null ? "—" : formatCurrency(rate, quote, decimals)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{currencyLabel(quote)}</p>
          </div>
          <Button type="button" variant="secondary" size="icon" className="mt-1 shrink-0 rounded-full" onClick={swap} aria-label="Para birimlerini değiştir"><ArrowDownUp/></Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px]">
          <span className={`inline-flex items-center gap-1.5 ${rateLive ? "text-emerald-300" : "text-amber-300"}`}><span className={`size-1.5 rounded-full ${rateLive ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`}/>{rateLive ? "Canlı çevrimiçi kur" : "Günlük/yedek kur"}</span>
          <span className={`inline-flex items-center gap-1 ${positiveTrend ? "text-emerald-300" : "text-rose-300"}`}>
            {positiveTrend ? <TrendingUp className="size-3.5"/> : <TrendingDown className="size-3.5"/>}
            {positiveTrend ? "+" : ""}{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(changePercent)}%
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          {rateDate ? `Kur zamanı: ${new Date(rateDate).toLocaleString("tr-TR")} · çevrimiçi kontrol 60 sn’de bir` : "Canlı kur verisi bekleniyor"}
        </p>
      </div>

      <div className="relative mt-3 space-y-2">
        {(["base", "quote"] as const).map((side) => {
          const code = side === "base" ? base : quote;
          return (
            <label key={side} className="flex min-h-14 items-center overflow-hidden rounded-2xl border border-white/10 bg-black/20 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
              <span className="sr-only">{side === "base" ? "Kaynak miktar" : "Hedef miktar"}</span>
              <input
                inputMode="decimal"
                aria-label={`${currencyLabel(code)} miktarı`}
                className="num min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-lg font-semibold outline-none placeholder:text-muted-foreground focus:ring-0"
                value={showAmount(side)}
                onFocus={() => {
                  if (inputSide !== side) {
                    const nextAmount = showAmount(side);
                    setInputSide(side);
                    setAmount(nextAmount);
                  }
                }}
                onChange={(event) => { setInputSide(side); setAmount(event.target.value); }}
                placeholder="0"
              />
              <span aria-hidden="true" className="h-7 w-px bg-white/10"/>
              <select aria-label={`${side === "base" ? "Kaynak" : "Hedef"} para birimi`} className="h-14 w-[8.6rem] shrink-0 border-0 bg-transparent pl-3 pr-2 text-sm font-medium outline-none focus:ring-0" value={code} onChange={(event) => setPairSide(side, event.target.value as CurrencyCode)}>
                {currencyOptions.map((option) => <option key={option.code} value={option.code} className="bg-zinc-900">{option.code} · {option.label}</option>)}
              </select>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Kur geçmişi</p>
        <div role="group" aria-label="Grafik tarih aralığı" className="flex rounded-xl border border-white/10 bg-black/20 p-0.5">
          {RANGES.map((range, index) => <button type="button" key={range.label} aria-pressed={rangeIndex === index} onClick={() => setRangeIndex(index)} className={`min-w-9 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${rangeIndex === index ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{range.label}</button>)}
        </div>
      </div>

      <div className="mt-2 h-40 w-full" aria-label={`${currencyLabel(base)} ve ${currencyLabel(quote)} kur grafiği`}>
        {points.length > 1 ? <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 2, bottom: 0, left: 2 }}>
            <defs><linearGradient id={`currency-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={positiveTrend ? "#34d399" : "#fb7185"} stopOpacity={0.3}/><stop offset="95%" stopColor={positiveTrend ? "#34d399" : "#fb7185"} stopOpacity={0.01}/></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4"/>
            <XAxis dataKey="date" tickFormatter={(date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28}/>
            <YAxis domain={["auto", "auto"]} hide/>
            <Tooltip
              labelFormatter={(date) => new Date(`${String(date)}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              formatter={(value) => [formatCurrency(Number(value), quote, decimals), `${base} / ${quote}`]}
              contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="rate" stroke={positiveTrend ? "#34d399" : "#fb7185"} strokeWidth={2} fill={`url(#currency-fill-${gradientId})`} activeDot={{ r: 5, strokeWidth: 2, fill: positiveTrend ? "#34d399" : "#fb7185", stroke: "#18181b" }}/>
          </AreaChart>
        </ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-xs text-muted-foreground">{loading ? "Kur geçmişi yükleniyor…" : "Bu aralık için gün içi piyasa verisi bulunmuyor."}</div>}
      </div>

      {error && <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100"><CircleHelp className="mt-0.5 size-4 shrink-0"/><span>{error} Ekrandaki son değer sağlayıcının belirttiği zaman damgasına aittir.</span></div>}
      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Kurlar sağlayıcının planına göre güncellenen çevrimiçi orta piyasa referans değerleridir; banka alış/satış fiyatı veya işlem kotasyonu değildir. Gram altın, ons altın değerinden hesaplanır.</p>
    </section>
  );
}
