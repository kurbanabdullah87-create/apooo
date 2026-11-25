import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Phone,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentCheckoutAvailability, startIyzicoCheckout } from "@/lib/payment.functions";
import { pageHead } from "@/lib/work";

export const Route = createFileRoute("/_authenticated/premium")({
  head: () => pageHead("Planlar", "Saha ücretsiz ve Premium planlarını karşılaştırın."),
  component: PremiumPage,
});

const freeModules = [
  { label: "Panel", detail: "Günlük iş akışı, tahsilat ve gider özeti", icon: BriefcaseBusiness },
  { label: "İş yönetimi", detail: "İş oluşturma, müşteri atama, durum, zamanlayıcı, kontrol listesi ve teklif taslağı", icon: CheckCircle2 },
  { label: "Müşteri ve cari", detail: "Müşteri kartı, iletişim bilgisi, borç/alacak görünümü ve tahsilat kaydı", icon: Users },
  { label: "Yevmiye", detail: "Çalışan, gün, ücret, mesai, avans ve ödeme kayıtları", icon: CalendarDays },
  { label: "Temel finans", detail: "İşten cariye aktarım, tahsilat ve gider girişi", icon: WalletCards },
  { label: "İşletme ayarları", detail: "Tek çalışma profili, makbuz bilgileri ve temel hedefler", icon: ShieldCheck },
];

const premiumModules = [
  { label: "Banka hareketleri", detail: "Hesap kayıtları ve banka raporları", icon: Banknote },
  {
    label: "Taksit ve kart planları",
    detail: "Borçlar, ödeme planları ve hatırlatmalar",
    icon: WalletCards,
  },
  { label: "Saha araçları", detail: "Randevu, ekipman, bakım ve puantaj", icon: BriefcaseBusiness },
  {
    label: "Stok ve raporlama",
    detail: "Alımlar, stok hareketleri ve gelişmiş raporlar",
    icon: ReceiptText,
  },
];

function PremiumPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState("premium_monthly");
  const [buyer, setBuyer] = useState({
    fullName: "",
    identityNumber: "",
    phone: "",
    address: "",
    city: "",
  });
  const [buyerConsent, setBuyerConsent] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [paymentReturned, setPaymentReturned] = useState(false);
  const [returnedOrderId, setReturnedOrderId] = useState("");
  const availability = useQuery({
    queryKey: ["payment-checkout-availability"],
    queryFn: () => getPaymentCheckoutAvailability(),
  });
  const paymentOrders = useQuery({
    queryKey: ["payment-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_orders")
        .select("id,plan_code,amount,currency,status,created_at,paid_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "returned") return;
    setPaymentReturned(true);
    setReturnedOrderId(params.get("orderId") ?? "");
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["payment-orders"] });
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("orderId");
    window.history.replaceState({}, "", url.toString());
  }, [queryClient]);

  const returnedOrder = paymentOrders.data?.find((order) => order.id === returnedOrderId);
  const paymentResult = returnedOrder?.status ?? (paymentReturned ? "checking" : "");

  const beginCheckout = async () => {
    setCheckoutError("");
    setCheckoutPending(true);
    try {
      const result = await startIyzicoCheckout({
        data: {
          ...buyer,
          planCode: selectedPlan as "premium_monthly" | "premium_annual",
          consent: buyerConsent,
        },
      });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Ödeme oturumu başlatılamadı. Tekrar deneyin.",
      );
      setCheckoutPending(false);
    }
  };

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
              Temel iş akışını ücretsiz kullan. Banka ve gelişmiş saha araçlarına ihtiyaç duyduğunda
              Premium’a geç.
            </p>
          </div>
          {me.data?.hasFullAccess ? (
            <span className="inline-flex flex-col gap-1 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
              <span className="inline-flex items-center gap-2"><BadgeCheck className="size-5" /> Premium etkin</span>
              <span className="pl-7 text-[11px] font-normal">{me.data.premiumExpiresAt ? `Erişim sonu: ${new Date(me.data.premiumExpiresAt).toLocaleDateString("tr-TR")}` : "Süresiz veya yetkili hesap erişimi"}</span>
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
            ["6 temel akış", "ücretsiz kullanıma açık"],
            ["Premium bölümler", "menüde görünür ve kilitli"],
            ["Ücretsiz erişim", "yönetici tarafından tanımlanabilir"],
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
                Ücretsiz plan
              </p>
              <h2 className="mt-2 text-xl font-bold">Başlamak için gerekenler</h2>
            </div>
            <span className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-400">
              <Check className="size-5" />
            </span>
          </div>
          <div className="mt-5 divide-y divide-white/[.07]">
            {freeModules.map(({ label, detail, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
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
          <p className="mt-5 rounded-2xl bg-black/15 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            Ücretsiz plan süresizdir ve kart bilgisi istemez. Tek işletme çalışma alanında temel saha
            kayıtlarını kullanabilirsin. Banka kasası, taksit/kredi kartı planları, gelişmiş saha
            modülleri ve çoklu işletme profilleri Premium erişimi gerektirir. Yönetici, hesabına
            ücretsiz Premium süresi veya süresiz erişim tanımlayabilir.
          </p>
        </article>

        <article className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[.09] via-card to-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-primary">
                Premium ile açılır
              </p>
              <h2 className="mt-2 text-xl font-bold">Daha geniş kontrol</h2>
            </div>
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <LockKeyhole className="size-5" />
            </span>
          </div>
          <div className="mt-5 divide-y divide-white/[.07]">
            {premiumModules.map(({ label, detail, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
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
          <p className="mt-5 rounded-2xl border border-primary/15 bg-primary/[.045] px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            Kilitli bölümler uygulamada görünür. Seçtiğinde içerik ve Premium’a geçiş bilgisi
            gösterilir.
          </p>
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
                      YILLIK
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
          <div className="grid lg:grid-cols-[1fr_.85fr]">
            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <CreditCard className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">
                    Güvenli ödeme adımı
                  </p>
                  <h2 className="mt-1 text-xl font-bold">Sipariş özeti</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Planını seç, fatura bilgilerini tamamla ve iyzico’nun güvenli ödeme ekranında
                    ödemeyi bitir.
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-2xl border bg-background/45 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-xl bg-secondary p-2 text-muted-foreground">
                      <Users className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Hesap e-postası</p>
                      <p className="truncate text-sm font-semibold">
                        {me.data?.email || "Oturum bilgisi yükleniyor"}
                      </p>
                    </div>
                  </div>
                  <BadgeCheck className="size-4 shrink-0 text-emerald-400" />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl border bg-background/45 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-xl bg-secondary p-2 text-muted-foreground">
                      <CalendarDays className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">Seçilen plan</p>
                      <p className="text-sm font-semibold">
                        {selectedPlan === "premium_annual" ? "Premium · Yıllık" : "Premium · Aylık"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById("plan-sec-heading")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Değiştir <ArrowRight className="size-3.5" />
                  </button>
                </div>
                <div className="rounded-2xl border border-dashed border-border p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-primary" />
                    Ödeme yöntemi
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-xl border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                      <CreditCard className="size-4" />
                      Kredi kartı
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-xl border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                      <WalletCards className="size-4" />
                      Banka kartı
                    </span>
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <CircleHelp className="mt-0.5 size-3.5 shrink-0" />
                    Kart numarası bu uygulamada alınmaz veya saklanmaz. Ödeme, sağlayıcının güvenli
                    sayfasında tamamlanmalıdır.
                  </p>
                </div>
              </div>
            </div>
            <aside className="flex flex-col border-t bg-gradient-to-br from-primary/[.08] to-transparent p-5 sm:p-7 lg:border-l lg:border-t-0">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">
                Ödenecek tutar
              </p>
              <p className="mt-2 text-4xl font-extrabold tracking-tight">
                {checkoutPlan ? formatPrice(checkoutAmount, checkoutPlan.currency) : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                /{selectedPlan === "premium_annual" ? "yıl" : "ay"} · Seçilen plan fiyatı
              </p>
              {checkoutCampaign && (
                <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] p-3">
                  <p className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Sparkles className="size-3.5" />
                    {checkoutCampaign.title} · %{checkoutCampaign.discount_percent} indirim
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Kampanya seçili plana uygulandı.
                  </p>
                </div>
              )}
              <div className="my-5 h-px bg-border/70" />
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Plan</span>
                  <span>
                    {selectedPlan === "premium_annual" ? "Premium · Yıllık" : "Premium · Aylık"}
                  </span>
                </div>
                <div className="flex justify-between gap-3 font-semibold">
                  <span>Toplam</span>
                  <span>
                    {checkoutPlan ? formatPrice(checkoutAmount, checkoutPlan.currency) : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border bg-background/35 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <FileCheck2 className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Fatura bilgileri</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      iyzico ödeme formunun istediği alanlar güvenli oturumu başlatmak için
                      kullanılır; Saha kart numaranızı almaz.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
                    Ad soyad
                    <Input
                      autoComplete="name"
                      value={buyer.fullName}
                      onChange={(event) => setBuyer({ ...buyer, fullName: event.target.value })}
                      placeholder="Fatura üzerindeki ad soyad"
                      maxLength={120}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium">
                    T.C. kimlik numarası
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      value={buyer.identityNumber}
                      onChange={(event) =>
                        setBuyer({
                          ...buyer,
                          identityNumber: event.target.value.replace(/\D/g, "").slice(0, 11),
                        })
                      }
                      placeholder="11 haneli numara"
                      maxLength={11}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground" />
                      Cep telefonu
                    </span>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={buyer.phone}
                      onChange={(event) => setBuyer({ ...buyer, phone: event.target.value })}
                      placeholder="05xx xxx xx xx"
                      maxLength={24}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
                    Fatura adresi
                    <Input
                      autoComplete="street-address"
                      value={buyer.address}
                      onChange={(event) => setBuyer({ ...buyer, address: event.target.value })}
                      placeholder="Mahalle, cadde/sokak, bina ve daire no"
                      maxLength={400}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      İl
                    </span>
                    <Input
                      autoComplete="address-level1"
                      value={buyer.city}
                      onChange={(event) => setBuyer({ ...buyer, city: event.target.value })}
                      placeholder="Örn. İstanbul"
                      maxLength={80}
                    />
                  </label>
                  <div className="flex items-end text-xs text-muted-foreground">Ülke: Türkiye</div>
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-background/45 p-3 text-[11px] leading-5 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={buyerConsent}
                    onChange={(event) => setBuyerConsent(event.target.checked)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    Ödeme oturumunun oluşturulması ve yasal faturalama amacıyla bu bilgilerin
                    iyzico’ya aktarılmasını kabul ediyorum. Kart bilgilerim Saha’da saklanmaz.{" "}
                    <Link
                      to="/gizlilik"
                      className="font-semibold text-primary underline underline-offset-2"
                    >
                      Gizlilik ve KVKK metni
                    </Link>
                  </span>
                </label>
                {checkoutError && (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs leading-5 text-destructive"
                  >
                    {checkoutError}
                  </p>
                )}
                <Button
                  className="mt-4 h-12 w-full"
                  size="lg"
                  disabled={
                    checkoutPending ||
                    !availability.data?.configured ||
                    !buyerConsent ||
                    !buyer.fullName.trim() ||
                    buyer.identityNumber.length !== 11 ||
                    !buyer.phone.trim() ||
                    buyer.address.trim().length < 10 ||
                    buyer.city.trim().length < 2
                  }
                  onClick={() => void beginCheckout()}
                >
                  {checkoutPending ? (
                    <>
                      <LoaderCircle className="animate-spin" /> Güvenli oturum hazırlanıyor…
                    </>
                  ) : (
                    <>
                      <LockKeyhole /> iyzico ile güvenli ödemeye geç
                    </>
                  )}
                </Button>
                {!availability.isLoading && !availability.data?.configured && (
                  <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-3.5">
                    <p className="text-xs font-semibold text-amber-200">
                      Ödeme bağlantısı sunucuda henüz yapılandırılmamış
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Canlı ödeme için iyzico iş yeri hesabı onaylanmalı; Vercel sunucu ayarlarına{" "}
                      <code>IYZICO_API_KEY</code>, <code>IYZICO_SECRET_KEY</code>,{" "}
                      <code>IYZICO_ENV=production</code> ve <code>APP_BASE_URL</code> eklenmeli.
                      Anahtarları bu sayfaya yazmayın.
                    </p>
                  </div>
                )}
                {availability.data?.configured && availability.data.mode === "sandbox" && (
                  <p className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/[.05] p-3 text-[11px] leading-5 text-sky-200">
                    Test modu açık: gerçek tahsilat yapılmaz. Canlı tahsilat için iyzico canlı
                    anahtarları ve production modu gerekir.
                  </p>
                )}
                <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                  Aylık plan 1 ay, yıllık plan 12 ay Premium erişim verir. Bu tek seferlik ödemedir;
                  otomatik yenileme yapılmaz. Süre bitince yeni bir siparişle tekrar satın
                  alabilirsiniz.
                </p>
              </div>
              <p className="mt-auto flex items-start gap-2 pt-5 text-[10px] leading-4 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-3 shrink-0" />
                Ödeme sağlayıcısına bağlandığında kart verileri Saha sunucularında saklanmayacak.
              </p>
            </aside>
          </div>
        </section>
      )}

      {paymentReturned && (
        <section
          role="status"
          className={`rounded-2xl border p-4 ${paymentResult === "paid" ? "border-emerald-400/25 bg-emerald-400/[.06]" : paymentResult === "review" || paymentResult === "checking" || paymentResult === "pending" ? "border-amber-400/25 bg-amber-400/[.06]" : "border-destructive/25 bg-destructive/[.05]"}`}
        >
          <p className="text-sm font-bold">
            {paymentResult === "paid"
              ? "Ödeme doğrulandı · Premium etkin"
              : paymentResult === "review" ||
                  paymentResult === "checking" ||
                  paymentResult === "pending"
                ? "Ödeme kontrol ediliyor"
                : "Ödeme tamamlanamadı"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {paymentResult === "paid"
              ? "iyzico işlemi doğrulandı ve Premium süren hesabınıza eklendi."
              : paymentResult === "review" ||
                  paymentResult === "checking" ||
                  paymentResult === "pending"
                ? "Ödeme sağlayıcısından dönüş alındı. Siparişiniz hesabınızın kayıtlarıyla eşleştirilip doğrulanana kadar Premium açılmaz; birkaç saniye sonra işlem geçmişini yenileyin."
                : "Ödeme reddedildi veya doğrulanamadı. Ücret çekilmediyse bilgileri kontrol edip tekrar deneyebilirsiniz."}
          </p>
        </section>
      )}

      <section
        className="rounded-3xl border bg-card/70 p-5 sm:p-6"
        aria-labelledby="payment-history-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-primary">
              Hesap geçmişi
            </p>
            <h2 id="payment-history-heading" className="mt-1 text-xl font-bold">
              Son ödeme işlemleri
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sipariş oluşturma ve doğrulama durumlarını buradan izleyin.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void paymentOrders.refetch()}>
            Yenile
          </Button>
        </div>
        {paymentOrders.isLoading ? (
          <p className="mt-5 animate-pulse text-sm text-muted-foreground">
            Ödeme geçmişi yükleniyor…
          </p>
        ) : paymentOrders.data?.length ? (
          <div className="mt-4 divide-y divide-border/70">
            {paymentOrders.data.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {order.plan_code === "premium_annual" ? "Premium · Yıllık" : "Premium · Aylık"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat("tr-TR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(order.created_at))}{" "}
                    · Sipariş {order.id.slice(0, 8)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">
                    {formatPrice(Number(order.amount), order.currency)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${order.status === "paid" ? "bg-emerald-400/10 text-emerald-300" : order.status === "review" ? "bg-amber-400/10 text-amber-200" : order.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}
                  >
                    {order.status === "paid"
                      ? "Ödendi"
                      : order.status === "review"
                        ? "İncelemede"
                        : order.status === "failed"
                          ? "Başarısız"
                          : "Bekliyor"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed p-5 text-center">
            <ReceiptText className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">Henüz ödeme siparişi yok</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Başlattığınız ödeme oturumları bu alanda görünür.
            </p>
          </div>
        )}
        {paymentOrders.error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            Ödeme geçmişi yüklenemedi. Veritabanı migrasyonunun uygulanmış olduğunu kontrol edin.
          </p>
        )}
      </section>

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
