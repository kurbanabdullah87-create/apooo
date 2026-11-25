import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/work";

export const Route = createFileRoute("/_authenticated/premium")({
  head: () => pageHead("Planlar", "Saha ücretsiz ve Premium planlarını karşılaştırın."),
  component: PremiumPage,
});

const featureModules = [
  { key: "panel", label: "Panel", detail: "Günlük iş ve cari özeti", icon: BriefcaseBusiness },
  { key: "isler", label: "İşler", detail: "İş oluşturma ve cari hesaba aktarma", icon: CheckCircle2 },
  { key: "cari", label: "Cari", detail: "Müşteri, borç ve tahsilat kaydı", icon: Users },
  { key: "yevmiye", label: "Yevmiye", detail: "Çalışma günleri ve ücret takibi", icon: CalendarDays },
  { key: "giderler", label: "Giderler", detail: "Gider ve belge kayıtları", icon: ReceiptText },
  { key: "ayarlar", label: "Ayarlar", detail: "İşletme ve uygulama ayarları", icon: BriefcaseBusiness },
  { key: "banka", label: "Banka hareketleri", detail: "Hesap kayıtları ve dekont arşivi", icon: Banknote },
  { key: "taksitler", label: "Taksit ve kart planları", detail: "Borçlar, ödeme planları ve hatırlatmalar", icon: WalletCards },
  { key: "randevu", label: "Randevular", detail: "Takvim ve müşteri randevuları", icon: CalendarDays },
  { key: "ekipman", label: "Ekipman", detail: "Ekipman ve bakım takibi", icon: BriefcaseBusiness },
  { key: "stok", label: "Stok", detail: "Alım ve stok hareketleri", icon: ReceiptText },
  { key: "puantaj", label: "Puantaj", detail: "Vardiya ve giriş çıkış kayıtları", icon: CalendarDays },
  { key: "alim", label: "Alımlar", detail: "Satın alma ve tedarik kayıtları", icon: ReceiptText },
  { key: "doviz", label: "Döviz", detail: "Kur görüntüleme ve hesaplama", icon: Banknote },
  { key: "rapor", label: "Raporlar", detail: "Dönem ve iş raporları", icon: ReceiptText },
  { key: "hava", label: "Hava durumu", detail: "Saha planlaması için hava bilgisi", icon: BriefcaseBusiness },
  { key: "hesaplayici", label: "Hesaplayıcı", detail: "Saha ve ücret hesaplamaları", icon: CheckCircle2 },
];

function PremiumPage() {
  const me = useMe();
  const availableModules = featureModules.filter((module) => me.data?.canUseFeature(module.key) === true);
  const restrictedModules = featureModules.filter((module) => me.data?.canUseFeature(module.key) !== true);
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState("premium_monthly");
  const [transferError, setTransferError] = useState("");
  const [transfer, setTransfer] = useState<{
    request_id: string; amount: number; currency: string; transfer_reference: string;
    bank_name: string; account_name: string; iban: string; instructions: string; status: string;
  } | null>(null);
  const myTransfers = useQuery({
    queryKey: ["my-bank-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_bank_transfers");
      if (error) throw error;
      return data ?? [];
    },
  });
  const startTransfer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("start_bank_transfer", { _plan_code: selectedPlan });
      if (error) throw error;
      if (!data?.[0]) throw new Error("Havale talimatı oluşturulamadı.");
      return data[0];
    },
    onSuccess: (data) => { setTransfer(data); setTransferError(""); void queryClient.invalidateQueries({ queryKey: ["my-bank-transfers"] }); },
    onError: (error: Error) => setTransferError(error.message || "Havale talimatı oluşturulamadı."),
  });
  const submitTransfer = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("submit_bank_transfer", { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: async () => {
      setTransfer(null);
      await queryClient.invalidateQueries({ queryKey: ["my-bank-transfers"] });
    },
    onError: (error: Error) => setTransferError(error.message || "Bildirim gönderilemedi."),
  });
  const plans = useQuery({
    queryKey: ["plan-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_plan_catalog");
      if (error) throw error;
      return data ?? [];
    },
  });
  const campaigns = useQuery({
    queryKey: ["plan-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_plan_campaigns");
      if (error) throw error;
      return data ?? [];
    },
  });

  const formatPrice = (amount: number, currency: string) =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  const activeCampaigns = (planCode: string) =>
    (campaigns.data ?? []).filter(
      (campaign) =>
        campaign.enabled &&
        new Date(campaign.starts_at).getTime() <= Date.now() &&
        new Date(campaign.ends_at).getTime() > Date.now() &&
        (campaign.applies_to === "all" || campaign.applies_to === planCode),
    );
  const sortedPlans = [...(plans.data ?? [])].sort((a, b) => {
    const order = (code: string) => (code === "free" ? 0 : code === "premium_monthly" ? 1 : 2);
    return order(a.plan_code) - order(b.plan_code);
  });
  const checkoutPlan = sortedPlans.find((plan) => plan.plan_code === selectedPlan);
  const checkoutCampaign = checkoutPlan
    ? activeCampaigns(selectedPlan).sort((a, b) => b.discount_percent - a.discount_percent)[0]
    : undefined;
  const checkoutAmount = checkoutPlan
    ? Number(
        ((checkoutPlan.amount * (100 - (checkoutCampaign?.discount_percent ?? 0))) / 100).toFixed(
          2,
        ),
      )
    : 0;
  const monthlyPlan = sortedPlans.find((plan) => plan.plan_code === "premium_monthly");

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 sm:space-y-8">
      <header className="relative isolate overflow-hidden rounded-[2rem] border border-primary/20 bg-[radial-gradient(ellipse_at_85%_0%,rgba(79,209,181,.2),transparent_38%),linear-gradient(140deg,rgba(11,31,34,.98),rgba(7,12,15,.98)_58%,rgba(10,17,24,.98))] p-6 shadow-2xl shadow-black/20 sm:p-9">
        <div className="absolute -right-16 -top-20 -z-10 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[.09] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-primary">
              <Sparkles className="size-3.5" /> Saha planları
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              İşin büyüdükçe, Saha da yanında.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              İşlerini, tahsilatını ve saha ekibini tek yerden yönet. Temel araçlarla ücretsiz başla;
              işin büyüdüğünde Premium özellikleri aç.
            </p>
          </div>
          {me.data?.hasFullAccess ? (
            <span className="inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
              <BadgeCheck className="size-5" /> Premium etkin
            </span>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground">Mevcut plan</p>
              <p className="mt-1 font-semibold">Ücretsiz · temel araçlar açık</p>
            </div>
          )}
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-3">
          {[
            [`${availableModules.length} bölüm`, "hesabında şu an açık"],
            ["Tüm modüller", "menüde görünür"],
            ["İstediğin zaman", "planını yükselt"],
          ].map(([value, label]) => (
            <div
              key={value}
              className="rounded-2xl border border-white/[.08] bg-white/[.035] px-4 py-3"
            >
              <p className="text-sm font-bold text-foreground">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Plan özellikleri">
        <article className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[.07] via-card to-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-400">
                Açık özellikler
              </p>
              <h2 className="mt-2 text-xl font-bold">Hesabında kullanılabilir</h2>
            </div>
            <span className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-400">
              <Check className="size-5" />
            </span>
          </div>
          <div className="mt-5 divide-y divide-white/[.07]">
            {availableModules.map(({ key, label, detail, icon: Icon }) => (
              <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="rounded-xl border border-emerald-400/15 bg-emerald-400/[.07] p-2 text-emerald-400">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </div>
                <Check className="size-4 shrink-0 text-emerald-400" />
              </div>
            ))}
          </div>
          {!availableModules.length && <p className="py-3 text-xs text-muted-foreground">Şu an açık özellik bulunmuyor.</p>}
          <p className="mt-5 rounded-2xl bg-black/15 px-3.5 py-3 text-xs leading-5 text-muted-foreground">Ücretsiz plan için kart bilgisi gerekmez. Yönetici, ücretsiz hesapların hangi modüllere erişeceğini ayarlayabilir.</p>
        </article>

        <article className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[.09] via-card to-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-primary">
                Diğer özellikler
              </p>
              <h2 className="mt-2 text-xl font-bold">Kilitli veya Premium</h2>
            </div>
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <LockKeyhole className="size-5" />
            </span>
          </div>
          <div className="mt-5 divide-y divide-white/[.07]">
            {restrictedModules.map(({ key, label, detail, icon: Icon }) => (
              <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="rounded-xl border border-primary/15 bg-primary/[.07] p-2 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </div>
                <LockKeyhole className="size-3.5 shrink-0 text-muted-foreground" />
              </div>
            ))}
          </div>
          {!restrictedModules.length && <p className="py-3 text-xs text-muted-foreground">Tüm özellikler hesabında açık.</p>}
          <p className="mt-5 rounded-2xl border border-primary/15 bg-primary/[.045] px-3.5 py-3 text-xs leading-5 text-muted-foreground">Kilitli özellikler menüde görünür. Ücretsiz hesapların erişimini yönetici açabilir; diğer özellikler Premium planla kullanılabilir.</p>
        </article>
      </section>

      <section className="space-y-4" aria-labelledby="plan-sec-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">
              Plan karşılaştırması
            </p>
            <h2 id="plan-sec-heading" className="mt-1 text-2xl font-bold">
              Sana uygun planı seç
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Fiyat ve kampanyalar güncel plan bilgisinden yüklenir.
          </p>
        </div>
        {plans.isLoading && (
          <div className="animate-pulse rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
            Planlar yükleniyor…
          </div>
        )}
        {plans.error && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
          >
            Plan bilgisi yüklenemedi. Yenileyip tekrar deneyin.
          </div>
        )}
        {plans.data && (
          <div className="grid gap-3 md:grid-cols-3">
            {sortedPlans.map((plan) => {
              const premium = plan.plan_code !== "free";
              const selected = premium && selectedPlan === plan.plan_code;
              const campaign = premium
                ? activeCampaigns(plan.plan_code).sort(
                    (a, b) => b.discount_percent - a.discount_percent,
                  )[0]
                : undefined;
              const amount = campaign
                ? Number(((plan.amount * (100 - campaign.discount_percent)) / 100).toFixed(2))
                : plan.amount;
              const interval = plan.plan_code === "premium_monthly" ? "ay" : "yıl";
              const monthlyCampaign = activeCampaigns("premium_monthly").sort(
                (a, b) => b.discount_percent - a.discount_percent,
              )[0];
              const monthlyAmount = monthlyPlan
                ? Number(
                    ((monthlyPlan.amount * (100 - (monthlyCampaign?.discount_percent ?? 0))) / 100).toFixed(2),
                  )
                : 0;
              const annualReference =
                plan.plan_code === "premium_annual" &&
                monthlyPlan?.currency === plan.currency &&
                plan.interval_months > 0
                  ? monthlyAmount * plan.interval_months
                  : 0;
              const annualSavings = Math.max(0, annualReference - amount);
              const annualSavingsPercent = annualReference
                ? Math.round((annualSavings / annualReference) * 100)
                : 0;
              return (
                <article
                  key={plan.plan_code}
                  className={`relative flex flex-col overflow-hidden rounded-3xl border p-5 transition duration-200 ${selected ? "border-primary/55 bg-primary/[.055] shadow-xl shadow-primary/[.08] ring-1 ring-primary/20" : "border-border/80 bg-card hover:border-primary/25"}`}
                >
                  {selected && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/40 via-primary to-emerald-300" />
                  )}
                  {plan.plan_code === "premium_annual" && (
                    <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] text-primary">
                      {annualSavingsPercent > 0 ? `%${annualSavingsPercent} AVANTAJ` : "YILLIK"}
                    </span>
                  )}
                  <p className="text-sm font-bold">
                    {plan.plan_code === "free"
                      ? "Ücretsiz"
                      : plan.plan_code === "premium_monthly"
                        ? "Premium · Aylık"
                        : "Premium · Yıllık"}
                  </p>
                  <div className="mt-4 min-h-[4.25rem]">
                    {premium ? (
                      <>
                        <p className="text-3xl font-extrabold tracking-tight">
                          {formatPrice(amount, plan.currency)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          /{interval} · {plan.interval_months} ay erişim
                        </p>
                        {plan.plan_code === "premium_annual" && (
                          <p className="mt-2 text-xs font-medium text-primary">
                            Aylık karşılığı {formatPrice(amount / Math.max(1, plan.interval_months), plan.currency)}
                            {annualSavings > 0 && (
                              <span className="ml-1 text-muted-foreground">
                                · {formatPrice(annualSavings, plan.currency)} daha avantajlı
                              </span>
                            )}
                          </p>
                        )}
                        {campaign && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-300">
                            <Sparkles className="size-3" />
                            {campaign.title} · %{campaign.discount_percent}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-extrabold tracking-tight">
                          {formatPrice(0, plan.currency)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Süre sınırı olmadan</p>
                      </>
                    )}
                  </div>
                  <div className="my-4 h-px bg-border/70" />
                  <ul className="flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex gap-2 text-xs leading-5 text-muted-foreground"
                      >
                        <Check
                          className={`mt-0.5 size-3.5 shrink-0 ${premium ? "text-primary" : "text-emerald-400"}`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {premium ? (
                    <Button
                      className="mt-5 w-full"
                      variant={selected ? "default" : "outline"}
                      onClick={() => setSelectedPlan(plan.plan_code)}
                    >
                      {selected ? (
                        <>
                          <CheckCircle2 /> Seçildi
                        </>
                      ) : (
                        <>
                          Bu planı seç <ChevronRight />
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[.05] text-xs font-semibold text-emerald-300">
                      <CheckCircle2 className="size-4" />
                      Ücretsiz plan
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {plans.data && (
        <section className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-xl shadow-black/10">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_.85fr]">
            <div><div className="flex items-start gap-3"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Banknote className="size-5" /></span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">IBAN&#8217;a havale</p><h2 className="mt-1 text-xl font-bold">Premium siparişini oluştur</h2><p className="mt-1 text-sm text-muted-foreground">Kart bilgisi veya kişisel ödeme bilgisi istemiyoruz. Premium, havale hesabında doğrulandıktan sonra etkinleşir.</p></div></div>
              <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Havale ile Premium satın alma adımları">
                {[["01", "Planını seç"], ["02", "Bankandan havale yap"], ["03", "Kodla bildir, onayı bekle"]].map(([step, label]) => (
                  <li key={step} className="rounded-xl border bg-background/45 p-3">
                    <span className="text-[10px] font-extrabold tracking-[.14em] text-primary">{step}</span>
                    <p className="mt-1 text-xs font-semibold leading-5">{label}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-5 rounded-2xl border bg-background/45 p-4"><p className="text-xs text-muted-foreground">Hesap</p><p className="mt-1 text-sm font-semibold">{me.data?.email || "Oturum bilgisi yükleniyor"}</p><p className="mt-4 text-xs text-muted-foreground">Seçilen plan</p><p className="mt-1 text-sm font-semibold">{selectedPlan === "premium_annual" ? "Premium · Yıllık" : "Premium · Aylık"}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">Siparişi başlattığında sunucu güncel fiyatı ve varsa kampanyayı hesaplar. Havale açıklamasına ödeme kodunu yaz.</p></div>
            </div>
            <aside className="flex flex-col rounded-2xl border bg-gradient-to-br from-primary/[.08] to-transparent p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Seçili planın tutarı</p><p className="mt-2 text-3xl font-extrabold">{checkoutPlan ? formatPrice(checkoutAmount, checkoutPlan.currency) : "—"}</p>{checkoutCampaign && <p className="mt-2 text-xs font-semibold text-emerald-300">{checkoutCampaign.title} · %{checkoutCampaign.discount_percent} indirim</p>}
              <Button className="mt-5 h-12 w-full" size="lg" disabled={startTransfer.isPending || me.data?.hasFullAccess} onClick={() => { setTransferError(""); startTransfer.mutate(); }}>{startTransfer.isPending ? <><LoaderCircle className="animate-spin"/> Talimat hazırlanıyor…</> : <><Landmark/> IBAN havale talimatını göster</>}</Button>{me.data?.hasFullAccess && <p className="mt-3 text-xs text-emerald-300">Hesabında Premium erişim zaten etkin.</p>}{transferError && <p role="alert" className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">{transferError}</p>}<p className="mt-4 text-[11px] leading-5 text-muted-foreground">Bu işlem otomatik banka erişimi kurmaz ve hesabından para çekmez. Havale işlemini kendi bankanın uygulamasında sen yaparsın.</p>
            </aside>
          </div>
          {transfer && <div className="border-t bg-primary/[.035] p-5 sm:p-7"><h3 className="text-lg font-bold">Havale bilgileri</h3><p className="mt-1 text-sm text-muted-foreground">Havale açıklamasına aşağıdaki kodu eksiksiz ekle.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-background/60 p-3"><p className="text-xs text-muted-foreground">Banka</p><p className="mt-1 font-semibold">{transfer.bank_name || "Belirtilmedi"}</p></div><div className="rounded-xl border bg-background/60 p-3"><p className="text-xs text-muted-foreground">Hesap sahibi</p><p className="mt-1 font-semibold">{transfer.account_name || "Belirtilmedi"}</p></div>
            <div className="rounded-xl border bg-background/60 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Alıcı IBAN</p><div className="mt-1 flex flex-wrap items-center justify-between gap-2"><code className="break-all font-semibold">{transfer.iban.replace(/(.{4})/g, "$1 ").trim()}</code><Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(transfer.iban).catch(() => setTransferError("Panoya kopyalanamadı; IBAN’ı seçip elle kopyalayabilirsin."))}><Copy className="mr-1 size-4"/>IBAN’ı kopyala</Button></div></div>
            <div className="rounded-xl border border-primary/25 bg-primary/[.06] p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Havale açıklaması / ödeme kodu</p><p className="mt-1 break-all font-mono text-lg font-bold text-primary">{transfer.transfer_reference}</p></div><div className="rounded-xl border bg-background/60 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Gönderilecek tutar</p><p className="mt-1 text-xl font-bold">{formatPrice(Number(transfer.amount), transfer.currency)}</p>{transfer.instructions && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{transfer.instructions}</p>}</div></div>
            <Button className="mt-4" disabled={submitTransfer.isPending || transfer.status !== "awaiting_transfer"} onClick={() => submitTransfer.mutate(transfer.request_id)}>{submitTransfer.isPending ? "Gönderiliyor…" : "Havaleyi yaptım · incelemeye gönder"}</Button></div>}
        </section>
      )}
      <section className="rounded-3xl border bg-card p-5 sm:p-6"><div className="flex items-center gap-2"><ReceiptText className="size-5 text-primary"/><h2 className="text-lg font-bold">Havale durumları</h2></div><p className="mt-1 text-xs text-muted-foreground">Premium, havale yönetici tarafından banka hesabında doğrulandıktan sonra etkinleşir.</p>
        {myTransfers.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Yükleniyor…</p> : myTransfers.error ? <p role="alert" className="mt-4 text-sm text-destructive">Havale durumları yüklenemedi.</p> : myTransfers.data?.length ? <div className="mt-4 space-y-2">{myTransfers.data.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{item.plan_code === "premium_monthly" ? "Premium · Aylık" : "Premium · Yıllık"} · {formatPrice(Number(item.amount), item.currency)}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{item.transfer_reference}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString("tr-TR")}</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold">{item.status === "pending_review" ? "İncelemede" : item.status === "awaiting_transfer" ? "Havale bekleniyor" : item.status === "approved" ? "Onaylandı" : item.status === "rejected" ? "Reddedildi" : "İptal edildi"}</span></article>)}</div> : <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Henüz havale talimatı oluşturmadın.</p>}</section>

      {campaigns.error && (
        <p className="text-xs text-muted-foreground">Kampanya bilgileri şu an yüklenemedi.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/60 p-4">
        <p className="text-xs text-muted-foreground">
          Planla ilgili soruların mı var? Plan özellikleri hesabına giriş yaptığında burada görünür.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/yevmiye">
            Uygulamaya dön <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
