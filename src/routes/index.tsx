import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarDays, Check, ChevronRight, ClipboardList, Landmark, LockKeyhole, ReceiptText, UsersRound } from "lucide-react";

const features = [
  { icon: UsersRound, title: "Cari hesaplar", text: "Müşteri bakiyelerini, tahsilatları ve hesap geçmişini tek yerde takip edin." },
  { icon: ClipboardList, title: "İş ve saha takibi", text: "İşlerin durumunu, notlarını ve günlük operasyonları düzenli tutun." },
  { icon: ReceiptText, title: "Gelir ve gider", text: "Tahsilat ve gider kayıtlarını görün; dönem özetlerinizi kolayca inceleyin." },
  { icon: CalendarDays, title: "Randevu ve yevmiye", text: "Takviminizi ve çalışma kayıtlarınızı renkli, anlaşılır bir görünümde yönetin." },
  { icon: Landmark, title: "Hesap hareketleri", text: "Hareketleri kendiniz kaydedin ve giriş/çıkış toplamlarını uygulama içinde izleyin." },
  { icon: BarChart3, title: "Rapor ve PDF", text: "Kayıtlarınızdan dönem raporları oluşturup PDF olarak indirin." },
];

const siteUrl = "https://sahav2full.vercel.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Saha | İş, cari hesap ve saha operasyon yönetimi" },
      { name: "description", content: "Saha işlerinizi, müşteri cari hesaplarını, tahsilat ve giderleri, randevuları ve yevmiyeleri tek bir uygulamada düzenleyin." },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Saha — İş ve saha operasyonlarınızı düzenleyin" },
      { property: "og:description", content: "Cari hesap, işler, tahsilat, gider, randevu ve yevmiye takibi tek yerde." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: siteUrl },
      { property: "og:image", content: `${siteUrl}/og-saha.svg` },
      { property: "og:image:alt", content: "Saha uygulaması — iş, cari hesap ve finans takibi" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Saha — İş ve saha operasyonlarınızı düzenleyin" },
      { name: "twitter:description", content: "Günlük işler, cari hesaplar ve finans kayıtları tek yerde." },
      { name: "twitter:image", content: `${siteUrl}/og-saha.svg` },
    ],
    links: [{ rel: "canonical", href: siteUrl }],
  }),
  component: HomePage,
});

function HomePage() {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Saha",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description: "Saha işlerini, cari hesapları, tahsilat ve giderleri, randevuları ve çalışma kayıtlarını yönetme uygulaması.",
    url: siteUrl,
  };

  return (
    <main className="min-h-dvh overflow-hidden bg-background pb-24 text-foreground sm:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema).replace(/</g, "\\u003c") }} />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-xl">
        <nav aria-label="Ana gezinme" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight" aria-label="Saha ana sayfa">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><span aria-hidden="true" className="text-lg">S</span></span>Saha
          </Link>
          <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#ozellikler" className="transition hover:text-foreground">Özellikler</a>
            <a href="#nasil-calisir" className="transition hover:text-foreground">Nasıl çalışır?</a>
            <Link to="/sss" className="transition hover:text-foreground">Sık sorulanlar</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-white/5 hover:text-foreground sm:inline-flex">Giriş yap</Link>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-primary/30">Hesap oluştur <ArrowRight className="size-4" /></Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[34rem] max-w-5xl bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_62%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:pt-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><span className="size-1.5 rounded-full bg-primary" />Saha operasyonları için tek çalışma alanı</div>
            <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Gününüzü sahada geçirin.<br /><span className="text-primary">Takibini kolaylaştırın.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">İşlerinizi, müşterilerinizi ve günlük finans kayıtlarınızı sade bir düzende yönetin. Nerede ne olduğunu aramak yerine, işinize odaklanın.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/auth" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/20 transition hover:-translate-y-0.5">Hemen başla <ArrowRight className="size-4" /></Link>
              <Link to="/sss" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border bg-card px-6 text-sm font-semibold transition hover:bg-secondary">Uygulamayı tanı <ChevronRight className="size-4" /></Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" />İş ve müşteri kayıtları</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" />Tahsilat ve gider takibi</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" />PDF raporları</span></div>
          </div>

          <div aria-label="Saha uygulaması özellik önizlemesi" className="relative mx-auto w-full max-w-lg">
            <div aria-hidden="true" className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary/20 via-transparent to-sky-500/10 blur-2xl" />
            <div className="relative rounded-[1.75rem] border border-white/10 bg-card/90 p-4 shadow-2xl shadow-black/30 sm:p-6">
              <div className="flex items-center justify-between border-b pb-4"><div><p className="text-xs text-muted-foreground">SAHA ÖZETİ</p><p className="mt-1 font-display text-lg font-bold">Kontrol sizde</p></div><span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="size-5" /></span></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl border bg-background/70 p-4"><p className="text-xs text-muted-foreground">Açık işler</p><div className="mt-3 h-2 w-16 rounded-full bg-primary/70"/><div className="mt-2 h-2 w-24 rounded-full bg-muted"/></div><div className="rounded-2xl border bg-background/70 p-4"><p className="text-xs text-muted-foreground">Bu ayki kayıtlar</p><div className="mt-2 font-display text-2xl font-bold">Düzenli</div><p className="mt-1 text-xs text-muted-foreground">Tek ekranda görünüm</p></div></div>
              <div className="mt-3 rounded-2xl border bg-background/70 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Günlük akış</p><span className="text-xs text-muted-foreground">İşlerinize göre</span></div><div className="mt-4 space-y-3"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400"><CalendarDays className="size-4" /></span><span className="h-2 flex-1 rounded-full bg-muted"/><span className="h-2 w-12 rounded-full bg-primary/50"/></div><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><UsersRound className="size-4" /></span><span className="h-2 flex-1 rounded-full bg-muted"/><span className="h-2 w-16 rounded-full bg-amber-500/40"/></div><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400"><ReceiptText className="size-4" /></span><span className="h-2 flex-1 rounded-full bg-muted"/><span className="h-2 w-10 rounded-full bg-violet-500/40"/></div></div></div>
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground"><LockKeyhole className="size-4 shrink-0 text-primary" />Verilerinizi yalnızca hesabınızda yetkili olduğunuz kapsamda görüntüleyin.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="ozellikler" className="scroll-mt-24 border-y bg-card/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Daha az dağınıklık</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">İşinizin farklı parçaları, aynı yerde</h2><p className="mt-4 leading-7 text-muted-foreground">Günlük operasyonunuzu ayrı notlar ve tablolar arasında kaybolmadan takip edin.</p></div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="group rounded-3xl border bg-background/70 p-5 transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-5" /></span><h3 className="mt-5 font-display text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div>
        </div>
      </section>

      <section id="nasil-calisir" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Basit bir başlangıç</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Kayıtlarınızı düzenleyin, akışı görün</h2><p className="mt-4 leading-7 text-muted-foreground">Saha; işlerinizi ve finans kayıtlarınızı takip etmenize yardımcı olur. Girdiğiniz bilgileri kontrol edin, ihtiyaç duyduğunuzda raporunu indirin.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">{[{ n: "01", t: "Hesabınızı oluşturun", d: "E-posta ile güvenli giriş yapın." }, { n: "02", t: "Kayıtlarınızı ekleyin", d: "İş, cari, gider ve takvim bilgilerini yönetin." }, { n: "03", t: "Özetinizi inceleyin", d: "Dönem görünümünü kullanın ve PDF alın." }].map((item) => <div key={item.n} className="rounded-3xl border bg-card p-5"><span className="font-display text-sm font-bold text-primary">{item.n}</span><h3 className="mt-4 font-semibold">{item.t}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.d}</p></div>)}</div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:flex-row sm:items-center sm:p-10"><div><h2 className="font-display text-2xl font-bold sm:text-3xl">Saha akışınızı tek yerde toparlayın</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">İlk adım için hesabınızı oluşturun ve uygulamayı keşfedin.</p></div><Link to="/auth" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground">Hesap oluştur <ArrowRight className="size-4" /></Link></div></section>

      <footer className="border-t bg-card/40 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><Link to="/" className="font-display text-lg font-bold">Saha</Link><p className="mt-1 text-xs text-muted-foreground">Saha operasyonlarını düzenlemek için dijital çalışma alanı.</p></div><nav aria-label="Alt gezinme" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><Link to="/sss" className="hover:text-foreground">Sık sorulanlar</Link><Link to="/gizlilik" className="hover:text-foreground">Gizlilik ve KVKK</Link><Link to="/kullanim-sartlari" className="hover:text-foreground">Kullanım şartları</Link><Link to="/auth" className="hover:text-foreground">Giriş yap</Link></nav></div>
        </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-background/90 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-xl sm:hidden"><Link to="/auth" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">Saha’yı kullanmaya başla <ArrowRight className="size-4" /></Link></div>
    </main>
  );
}
