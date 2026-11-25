import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Check, Clock3, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/work";

export const Route = createFileRoute("/_authenticated/premium")({
  head: () => pageHead("Planlar", "Ücretsiz ve Premium planları karşılaştırın."),
  component: PremiumPage,
});

function PremiumPage() {
  const me = useMe();
  const [selectedPlan, setSelectedPlan] = useState("premium_monthly");
  const plans = useQuery({ queryKey: ["plan-catalog"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_plan_catalog");
    if (error) throw error;
    return data ?? [];
  }});
  const campaigns = useQuery({ queryKey: ["plan-campaigns"], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_plan_campaigns");
    if (error) throw error;
    return data ?? [];
  }});
  const formatPrice = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  const activeCampaigns = (planCode: string) => (campaigns.data ?? []).filter((campaign) => campaign.enabled && new Date(campaign.starts_at).getTime() <= Date.now() && new Date(campaign.ends_at).getTime() > Date.now() && (campaign.applies_to === "all" || campaign.applies_to === planCode));
  const checkoutPlan = plans.data?.find((plan) => plan.plan_code === selectedPlan);
  const checkoutCampaign = checkoutPlan ? activeCampaigns(selectedPlan).sort((a, b) => b.discount_percent - a.discount_percent)[0] : undefined;
  const checkoutAmount = checkoutPlan ? Number((checkoutPlan.amount * (100 - (checkoutCampaign?.discount_percent ?? 0)) / 100).toFixed(2)) : 0;

  return <div className="mx-auto max-w-5xl space-y-7 pb-8">
    <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8"><div className="absolute -right-10 -top-20 size-64 rounded-full bg-primary/10 blur-3xl"/><div className="relative flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-primary"><ShieldCheck className="size-4"/>SAHA · OPERASYON &amp; FİNANS</p><h1 className="mt-3 text-3xl font-bold">Planını seç</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Panel, işler, cari ve yevmiye ücretsizdir. Premium; banka, taksit ve gelişmiş operasyon bölümlerini açar.</p></div>{me.data?.hasFullAccess && <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"><BadgeCheck className="size-4"/>Premium erişimin açık</span>}</div></header>

    {plans.isLoading && <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Planlar yükleniyor…</div>}
    {plans.error && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Plan listesi yüklenemedi. Biraz sonra yeniden deneyin.</div>}
    {plans.data && <div className="grid gap-4 lg:grid-cols-3">{plans.data.map((plan) => {
      const promos = plan.plan_code === "free" ? [] : activeCampaigns(plan.plan_code);
      const campaign = promos.sort((a, b) => b.discount_percent - a.discount_percent)[0];
      const discounted = campaign ? Number((plan.amount * (100 - campaign.discount_percent) / 100).toFixed(2)) : plan.amount;
      const premium = plan.plan_code !== "free";
      const interval = plan.plan_code === "premium_monthly" ? "ay" : "yıl";
      return <article key={plan.plan_code} className={`flex flex-col rounded-3xl border bg-card p-5 shadow-sm sm:p-6 ${plan.plan_code === "premium_annual" ? "border-primary/40 ring-1 ring-primary/15" : ""}`}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{plan.plan_code === "free" ? "Ücretsiz" : plan.plan_code === "premium_monthly" ? "Premium · Aylık" : "Premium · Yıllık"}</p><p className="mt-1 text-xs text-muted-foreground">{premium ? `${plan.interval_months} ay tam erişim` : "İşletmenin temel araçları"}</p></div>{plan.plan_code === "premium_annual" && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">EN AVANTAJLI</span>}</div>
        <div className="mt-5 min-h-16">{premium ? <><div className="flex items-baseline gap-2"><strong className="text-3xl">{formatPrice(discounted, plan.currency)}</strong><span className="text-sm text-muted-foreground">/ {interval}</span></div>{campaign && <><p className="mt-1 text-xs text-muted-foreground line-through">{formatPrice(plan.amount, plan.currency)}</p><p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"><Sparkles className="size-3.5"/>{campaign.title} · %{campaign.discount_percent} indirim</p>{campaign.description && <p className="mt-1 text-xs text-muted-foreground">{campaign.description}</p>}<p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3"/>Son: {new Date(campaign.ends_at).toLocaleDateString("tr-TR")}</p></>}</> : <><strong className="text-3xl">Ücretsiz</strong><p className="mt-1 text-xs text-muted-foreground">Süre sınırı yok · kendi hesabındaki veriler</p></>}</div>
        <ul className="mt-5 flex-1 space-y-3 border-t pt-5">{plan.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm leading-5"><Check className={`mt-0.5 size-4 shrink-0 ${premium ? "text-primary" : "text-emerald-600"}`}/><span>{feature}</span></li>)}</ul>
        {premium && <Button className="mt-5" variant={selectedPlan === plan.plan_code ? "default" : "outline"} onClick={() => setSelectedPlan(plan.plan_code)}>{selectedPlan === plan.plan_code ? "Ödeme planı seçildi" : "Bu planı seç"}</Button>}
        {!premium ? <p className="mt-5 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">Panel, işler, cari ve yevmiye ücretsiz kullanılır. Diğer bölümler burada görünür; Premium ile açılır.</p> : null}
      </article>;
    })}</div>}

    {plans.data && <section className="rounded-3xl border bg-card p-5 sm:p-7">
      <div className="flex items-center gap-2"><LockKeyhole className="size-5 text-primary"/><div><h2 className="font-semibold">Premium ödeme</h2><p className="text-sm text-muted-foreground">Güvenli ödeme adımı</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2"><label className="text-sm font-medium" htmlFor="premium-billing-email">Fatura e-postası</label><input id="premium-billing-email" type="email" readOnly value={me.data?.email ?? ""} className="h-11 w-full rounded-xl border bg-background px-3 text-sm"/><p className="text-xs text-muted-foreground">Satın alma hesabınıza ve bu e-posta adresine bağlanır.</p></div>
        <div className="rounded-2xl bg-secondary/50 p-4 md:min-w-52"><p className="text-xs text-muted-foreground">Seçilen plan</p><p className="mt-1 font-semibold">{selectedPlan === "premium_annual" ? "Premium · Yıllık" : "Premium · Aylık"}</p><p className="mt-2 text-2xl font-bold">{checkoutPlan ? formatPrice(checkoutAmount, checkoutPlan.currency) : "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">/ {selectedPlan === "premium_annual" ? "yıl" : "ay"}</span></p>{checkoutCampaign && <p className="mt-1 text-xs text-emerald-600">{checkoutCampaign.title} · %{checkoutCampaign.discount_percent} indirim</p>}</div>
      </div>
      <Button className="mt-4 w-full sm:w-auto" disabled><LockKeyhole/>Güvenli ödemeye geç</Button>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">Ödeme sağlayıcısı ve sunucu taraflı sipariş doğrulaması henüz yapılandırılmadı. Bu nedenle bu ekrandan ücret tahsil edilmez ve kart bilgisi istenmez. Güvenli ödeme, sağlayıcı hesabı bağlandığında dış ödeme sayfasında açılacak; kart numarası uygulama veritabanına kaydedilmeyecek.</p>
    </section>}

    {campaigns.error && <p className="text-xs text-muted-foreground">Kampanya bilgileri şu an yüklenemedi.</p>}
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/yevmiye">Yevmiye bölümüne dön</Link></Button>{me.data?.isAdmin && <Button asChild variant="outline"><Link to="/ayarlar">Yönetici kampanya ayarları</Link></Button>}</div>
    <p className="flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0"/>Plan bilgisi ve indirim önizlemesi ödeme değildir. Hiçbir ödeme yapılmadan ücretli erişim tanımlanmaz.</p>
  </div>;
}
