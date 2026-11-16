import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/kullanim-sartlari")({
  head: () => ({
    meta: [
      { title: "Kullanım Şartları — Saha" },
      { name: "description", content: "Saha uygulamasına erişim ve kullanım koşulları." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Ekmek kırıntısı" className="text-sm text-muted-foreground"><ol className="flex items-center gap-2"><li><Link to="/" className="hover:text-foreground">Ana sayfa</Link></li><li aria-hidden="true"><ChevronRight className="size-4" /></li><li aria-current="page" className="font-medium text-foreground">Kullanım şartları</li></ol></nav>
        <header className="mt-8 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-9">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><FileCheck2 className="size-6" /></div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Saha · Kullanım kuralları</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Kullanım Şartları</h1>
          <p className="mt-4 leading-7 text-muted-foreground">Saha hesabı oluşturarak veya uygulamayı kullanarak aşağıdaki koşulları kabul etmiş olursunuz.</p>
          <p className="mt-3 text-xs text-muted-foreground">Son güncelleme: 16 Kasım 2026</p>
        </header>
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm leading-6 text-muted-foreground"><p className="font-semibold text-amber-200">İşletmeci bilgisi tamamlanmalı</p><p className="mt-2">Hizmet sağlayıcısının tam adı/ticaret unvanı ve iletişim adresi eklenmelidir: <strong className="text-foreground">[İşletmeci bilgisi ve iletişim e-postası]</strong>.</p></div>
        <div className="mt-8 space-y-8 leading-7 text-muted-foreground">
          <section><h2 className="text-xl font-bold text-foreground">1. Hizmetin kapsamı</h2><p className="mt-3">Saha; saha operasyonlarını, müşteri ve iş kayıtlarını, tahsilat/gider takibini ve kullanıcının elle girdiği kişisel hesap hareketlerinin özetlenmesini sağlayan bir yazılım hizmetidir. Uygulama banka, ödeme kuruluşu, muhasebe veya yatırım danışmanlığı hizmeti vermez.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">2. Hesap güvenliği</h2><p className="mt-3">Hesap bilgilerinizi korumak, güçlü ve benzersiz parola kullanmak, oturumunuzu başkalarıyla paylaşmamak sizin sorumluluğunuzdadır. Saha çalışanları sizden banka parolanızı, kart PIN’inizi veya tek kullanımlık doğrulama kodunuzu istemez. Bu bilgileri hiçbir koşulda Saha’ya girmeyin.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">3. Kayıtların doğruluğu ve haklar</h2><p className="mt-3">Uygulamaya eklediğiniz bilgilerin doğru ve kullanım amacınıza uygun olmasından siz sorumlusunuz. Başka kişilere ait iletişim veya iş bilgilerini girerken bunları paylaşmaya yetkiniz olduğundan emin olun. Kendi hesabınızda bulunan banka hareketleri şu anda otomatik alınmaz; kullanıcı tarafından girilir ve özetler bu girişlere göre hesaplanır.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">4. Uygun kullanım</h2><p className="mt-3">Hizmeti hukuka aykırı amaçlarla kullanamaz, başka kullanıcıların hesabına veya kayıtlarına yetkisiz erişmeye çalışamaz, hizmetin güvenliğini ya da çalışmasını bozacak işlem yapamazsınız.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">5. Erişilebilirlik ve güncellemeler</h2><p className="mt-3">Hizmetin kesintisiz veya hatasız çalışacağı garanti edilmez. Bakım, güvenlik veya teknik gereklilikler nedeniyle özellikler değiştirilebilir. Önemli şart değişiklikleri güncel metinde yayımlanır.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">6. Gizlilik ve iletişim</h2><p className="mt-3">Kişisel verilerin işlenmesi hakkında <Link to="/gizlilik" className="text-primary hover:underline">Gizlilik ve KVKK Aydınlatma Metni</Link> sayfasını okuyun. Sorular ve talepler, işletmeci gerçek iletişim bilgilerini ekledikten sonra o adrese iletilebilir.</p></section>
        </div>
        <footer className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm"><Link to="/sss" className="text-muted-foreground hover:text-foreground">Sık sorulanlar</Link><Link to="/gizlilik" className="text-primary hover:underline">Gizlilik ve KVKK metni</Link><Link to="/auth" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 inline size-3.5"/>Giriş sayfası</Link></footer>
      </article>
    </main>
  );
}
