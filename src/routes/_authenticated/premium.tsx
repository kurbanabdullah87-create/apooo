import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  CircleHelp,
  CreditCard,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
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

const freeModules = [
  { label: "Panel", detail: "Günlük iş ve cari özeti", icon: BriefcaseBusiness },
  { label: "İşler", detail: "İş oluşturma ve cari hesaba aktarma", icon: CheckCircle2 },
  { label: "Cari", detail: "Müşteri, borç ve tahsilat kaydı", icon: Users },
  { label: "Yevmiye", detail: "Çalışma günleri ve ücret takibi", icon: CalendarDays },
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
  const [selectedPlan, setSelectedPlan] = useState("premium_monthly");
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
            ["4 bölüm", "ücretsiz kullanıma açık"],
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
            Hızlı ekle’den müşteri, tahsilat ve gider kaydı oluşturabilirsin. Ücretsiz kullanım için
            kart bilgisi gerekmez.
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
                    Planını gözden geçir; ödeme sağlayıcısı etkinleştiğinde güvenli biçimde devam
                    et.
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
              <Button className="mt-6 h-12 w-full" size="lg" disabled>
                <LockKeyhole /> Güvenli ödemeye geç
              </Button>
              <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[.045] p-3.5">
                <p className="text-xs font-semibold text-foreground">Ödeme henüz etkin değil</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Ödeme kuruluşu bağlantısı ve sunucu doğrulaması tamamlanınca bu düğme açılır. Şu
                  anda ücret çekilmez, Premium erişimi başlatılmaz.
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
