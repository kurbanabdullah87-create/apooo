import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { pageHead } from "@/lib/work";

export const Route = createFileRoute("/_authenticated/premium")({
  head: () => pageHead("Premium plan", "Yevmiye & Finans Premium üyelik planı."),
  component: PremiumPage,
});

const features = ["Banka hareketleri, aylık özet ve PDF raporları", "Taksit planı ve ödeme hatırlatmaları", "Randevu, makbuz ve cari işlemler", "Ekip, işletme profilleri ve gelişmiş raporlar"];

function PremiumPage() {
  const me = useMe();
  return <div className="mx-auto max-w-2xl space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-primary">YEVMİYE & FİNANS</p><h1 className="mt-2 text-3xl font-bold">Premium üyelik</h1><p className="mt-2 text-muted-foreground">Ücretsiz hesap Yevmiye kayıtlarını kullanır. Premium, ek finans ve işletme araçlarını açar.</p></header>
    <section className="overflow-hidden rounded-3xl border bg-card shadow-sm"><div className="bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8"><div className="flex items-center gap-2 text-primary"><ShieldCheck/><span className="text-sm font-bold">Yıllık plan</span></div><div className="mt-4 flex items-baseline gap-2"><strong className="text-4xl">₺300</strong><span className="text-sm text-muted-foreground">/ yıl</span></div><p className="mt-1 text-sm text-muted-foreground">Premium erişim 12 aylık geçerli üyelik olarak tasarlanmıştır.</p><ul className="mt-6 space-y-3">{features.map((item) => <li key={item} className="flex gap-2 text-sm"><Check className="size-4 shrink-0 text-primary"/>{item}</li>)}</ul></div>
      <div className="border-t p-5 sm:p-6">{me.data?.hasFullAccess ? <p className="rounded-xl bg-primary/10 p-3 text-sm font-medium text-primary">Hesabınızda Premium erişim açık{me.data.premiumExpiresAt ? ` · sona erme ${new Date(me.data.premiumExpiresAt).toLocaleDateString("tr-TR")}` : ""}.</p> : <><div className="flex gap-3 rounded-xl border p-3 text-sm"><LockKeyhole className="size-4 shrink-0 text-muted-foreground"/><p>Ödeme altyapısı ve doğrulanmış sipariş bildirimi bağlanana kadar bu ekrandan tahsilat alınmaz. Güvenlik için sahte ödeme/erişim açma butonu gösterilmiyor.</p></div><p className="mt-3 text-xs text-muted-foreground">Ödeme tamamlandığında sunucu tarafı sağlayıcı doğrulaması erişimi 12 ay için tanımlar. Ekrandaki fiyat tek başına erişim açmaz.</p></>}</div>
    </section>
    <Button asChild variant="outline"><Link to="/yevmiye">Yevmiye bölümüne dön</Link></Button>
  </div>;
}
