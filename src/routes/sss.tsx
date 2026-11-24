import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp } from "lucide-react";

const questions = [
  { q: "Yevmiye ve Finans uygulaması ne işe yarar?", a: "Yevmiye ve Finans; iş ve müşteri kayıtlarını, cari hesapları, tahsilat ve giderleri, randevuları ve yevmiye kayıtlarını aynı uygulamada düzenlemenize yardımcı olur." },
  { q: "Banka hareketlerim otomatik olarak mı alınır?", a: "Banka hesabına doğrudan bağlantı kurulmaz. İsterseniz banka ekranında açıkça onay verip Google Gmail hesabınızı tek seferlik taratabilirsiniz. Gmail erişimi e-posta okuma yetkisi ister; uygulama eşleşen ileti metnini tarayıcıda işler, ham e-postayı sunucuya göndermez. Bulunan kayıtlar önizleme sonrası yalnızca bu cihazdaki şifreli kasaya kaydedilir. Tarama uygulama açıkken sizin başlatmanızla çalışır; banka şifrenizi veya tek kullanımlık kodlarınızı uygulamaya girmeyin." },
  { q: "Kayıtlarımı PDF olarak indirebilir miyim?", a: "Uygulamadaki mevcut rapor ve ekstre ekranlarında sunulan PDF indirme seçeneklerini kullanabilirsiniz. PDF içeriğini indirmeden önce tarih aralığını ve kayıtları kontrol edin." },
  { q: "Ekip üyeleri tüm kayıtları görebilir mi?", a: "Erişim, uygulamadaki ekip rolü ve kayıt yetkilerine bağlıdır. Finansal işlemler gibi bazı işlemler yönetici yetkisi gerektirir. Ekip eklerken yalnızca gerekli erişimi verin." },
  { q: "Hesabımı nasıl koruyabilirim?", a: "Benzersiz ve güçlü bir parola kullanın, cihazınızı kilitli tutun ve doğrulama kodlarını kimseyle paylaşmayın. Yevmiye ve Finans sizden banka parolası, kart PIN’i veya tek kullanımlık banka kodu istemez." },
];

export const Route = createFileRoute("/sss")({
  head: () => ({
    meta: [
      { title: "Sık Sorulan Sorular — Yevmiye ve Finans" },
      { name: "description", content: "Yevmiye ve Finans uygulamasının iş, cari hesap, finans takibi, banka hareketleri, PDF raporları ve hesap güvenliği özellikleri hakkında yanıtlar." },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Sık Sorulan Sorular — Yevmiye ve Finans" },
      { property: "og:description", content: "Yevmiye ve Finans uygulamasını kullanma ve hesap güvenliği hakkında merak edilenler." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://sahav2full.vercel.app/og-yevmiye-ve-finans.svg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://sahav2full.vercel.app/sss" }],
  }),
  component: FaqPage,
});

function FaqPage() {
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };

  return (
    <main className="min-h-dvh bg-background px-4 py-8 pb-12 text-foreground sm:px-6 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Ekmek kırıntısı" className="mb-8 text-sm text-muted-foreground"><ol className="flex items-center gap-2"><li><Link to="/" className="hover:text-foreground">Ana sayfa</Link></li><li aria-hidden="true"><ChevronRight className="size-4" /></li><li aria-current="page" className="font-medium text-foreground">Sık sorulanlar</li></ol></nav>
        <header className="rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-10">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><CircleHelp className="size-6" /></span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-primary">Yardım merkezi</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Sık sorulan sorular</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Yevmiye ve Finans uygulamasının kapsamı, hesap hareketleri ve güvenli kullanım hakkında kısa yanıtlar.</p>
        </header>
        <section aria-label="Sık sorulan sorular" className="mt-6 space-y-3">{questions.map(({ q, a }) => <details key={q} className="group rounded-2xl border bg-card px-5 py-4 open:border-primary/30 open:bg-primary/[0.035]"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">{q}<span aria-hidden="true" className="text-xl text-primary transition group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-3 text-sm leading-7 text-muted-foreground">{a}</p></details>)}</section>
        <div className="mt-8 flex flex-col gap-3 rounded-3xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-muted-foreground">Uygulamayı keşfetmek veya hesabınıza girmek için devam edin.</p><Link to="/auth" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Giriş yap <ArrowRight className="size-4" /></Link></div>
        <footer className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t pt-5 text-sm text-muted-foreground"><Link to="/gizlilik" className="hover:text-foreground">Gizlilik ve KVKK</Link><Link to="/kullanim-sartlari" className="hover:text-foreground">Kullanım şartları</Link><Link to="/" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Ana sayfa</Link></footer>
      </div>
    </main>
  );
}
