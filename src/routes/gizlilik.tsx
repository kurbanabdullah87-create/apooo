import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, LockKeyhole, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/gizlilik")({
  head: () => ({
    meta: [
      { title: "Gizlilik ve KVKK Aydınlatma Metni — Saha" },
      { name: "description", content: "Saha uygulamasında kişisel verilerin işlenmesi ve korunmasına ilişkin açıklamalar." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Ekmek kırıntısı" className="text-sm text-muted-foreground"><ol className="flex items-center gap-2"><li><Link to="/" className="hover:text-foreground">Ana sayfa</Link></li><li aria-hidden="true"><ChevronRight className="size-4" /></li><li aria-current="page" className="font-medium text-foreground">Gizlilik ve KVKK</li></ol></nav>
        <header className="mt-8 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-9">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="size-6" /></div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Saha · Şeffaflık ve güven</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Gizlilik ve KVKK Aydınlatma Metni</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Bu metin Saha uygulamasında hangi bilgilerin işlendiğini, ne amaçla kullanıldığını ve verileriniz üzerindeki haklarınızı açıklar.</p>
          <p className="mt-3 text-xs text-muted-foreground">Son güncelleme: 16 Kasım 2026</p>
        </header>

        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm leading-6">
          <p className="font-semibold text-amber-200">Yayımdan önce tamamlanması gereken işletmeci bilgisi</p>
          <p className="mt-2 text-muted-foreground">Veri sorumlusu: <strong className="text-foreground">[İşletmecinin tam adı veya ticaret unvanı]</strong><br />İletişim: <strong className="text-foreground">[Veri talepleri için geçerli e-posta adresi]</strong></p>
          <p className="mt-2 text-muted-foreground">Bu alanlar gerçek bilgilerle değiştirilmeden metin tamamlanmış bir hukuki aydınlatma olarak kullanılmamalıdır.</p>
        </div>

        <div className="mt-6 flex gap-3 rounded-2xl border bg-card p-5 text-sm leading-6 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>Saha sizden banka hesabı parolanızı, kart PIN’inizi veya SMS/uygulama doğrulama kodunuzu istemez. Banka hesabına otomatik bağlantı şu anda etkin değildir; banka hareketleri kullanıcı tarafından elle girilir.</p>
        </div>

        <div className="mt-8 space-y-8 leading-7 text-muted-foreground">
          <section><h2 className="text-xl font-bold text-foreground">1. İşlenen bilgiler</h2><ul className="mt-3 list-disc space-y-2 pl-6"><li>Hesap ve oturum bilgileri: e-posta adresi, ad-soyad ve oturumun güvenli biçimde yürütülmesi için gereken teknik kayıtlar.</li><li>Uygulama kayıtları: işletme profili, müşteri/iş kayıtları, iletişim ve adres bilgileri, tahsilat ve gider kayıtları, randevular ve kullanıcı tarafından girilen banka hareketleri.</li><li>Destek veya kullanıcı tarafından gönderilen mesajlardaki bilgiler.</li><li>Google veya Apple ile giriş özelliği etkinleştirilirse, ilgili sağlayıcının kimlik doğrulaması için paylaştığı temel hesap bilgileri. Sağlayıcı parolanız Saha’ya verilmez.</li></ul><p className="mt-3">Uygulama, bankanın sisteminden hareketleri otomatik çekmez ve banka giriş bilgilerini ya da doğrulama kodlarını toplamaz. Bu özellik gelecekte eklenirse, sağlayıcı, kapsam, izinler ve veri akışı ayrıca açıklanır ve metin güncellenir.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">2. Amaçlar ve hukuki sebepler</h2><p className="mt-3">Bilgiler; hesabı açıp yönetmek, uygulama özelliklerini sunmak, kayıtları kullanıcıya göstermek ve raporlamak, güvenliği sağlamak, destek vermek ve yasal yükümlülükleri yerine getirmek için işlenebilir. KVKK kapsamındaki işleme şartı her işlem için veri sorumlusu tarafından somut kullanım ve hukuki ilişkiye göre belirlenmelidir; bu sayfa tek başına hukuki uygunluk garantisi vermez.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">3. Saklama ve erişim</h2><p className="mt-3">Kayıtlar hizmetin sunulması için gerekli olduğu süre boyunca ve uygulanabilir saklama yükümlülükleri kapsamında tutulabilir. Kayıtları yalnızca yetkili kullanıcıların erişebilmesi için uygulama ve veritabanı erişim kontrolleri kullanılır. İnternet hizmetlerinde mutlak güvenlik garantisi verilemez; parolanızı kimseyle paylaşmayın ve hesabınızı ortak cihazlarda açık bırakmayın.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">4. Hizmet sağlayıcılar ve yurt dışı işleme</h2><p className="mt-3">Uygulamanın çalışması için Supabase (kimlik doğrulama/veritabanı) ve Vercel (barındırma) gibi altyapı sağlayıcıları kullanılmaktadır. Altyapı yapılandırmasına göre veriler Türkiye dışındaki bölgelerde işlenebilir veya saklanabilir. Mevcut yapılandırmada Supabase projesi Avustralya bölgesinde, Vercel işlevleri ABD doğu bölgesindedir. Veri sorumlusu, bu aktarım ve hizmet sağlayıcı ilişkileri için gerekli hukuki dayanakları, sözleşmeleri ve bildirimleri ayrıca sağlamalıdır. Bu metin tek başına yurt dışı aktarım şartlarını yerine getirmez.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">5. Paylaşım</h2><p className="mt-3">Veriler, hizmeti çalıştırmak için gerekli altyapı sağlayıcılarına ve kanunen yetkili kamu kurumlarına, gerekli olduğu ölçüde aktarılabilir. Veriler reklam amacıyla satılmaz. Uygulamaya ekip üyeleri eklendiğinde, ekip içi görünürlük rol ve uygulama yetkilerine bağlı olabilir; kullanıcılar yalnızca yetkili oldukları kayıtları görüntülemelidir.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">6. Haklarınız ve başvuru</h2><p className="mt-3">KVKK’nın 11. maddesi kapsamındaki haklarınız için veri sorumlusuna başvurabilirsiniz. Başvuru kanalı yukarıdaki iletişim e-postasıdır; bu alan işletmeci tarafından doldurulmalıdır. Başvuruda talebinizi ve kimliğinizi doğrulamak için gereken asgari bilgileri belirtin; parola veya doğrulama kodu göndermeyin.</p></section>
          <section><h2 className="text-xl font-bold text-foreground">7. Metin değişiklikleri</h2><p className="mt-3">Uygulama özellikleri, hizmet sağlayıcıları veya mevzuat değişirse bu metin güncellenebilir. Güncel sürüm bu adreste yayımlanır.</p></section>
        </div>
        <footer className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm"><Link to="/sss" className="text-muted-foreground hover:text-foreground">Sık sorulanlar</Link><Link to="/kullanim-sartlari" className="text-primary hover:underline">Kullanım şartları</Link><Link to="/auth" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 inline size-3.5"/>Giriş sayfası</Link></footer>
      </article>
    </main>
  );
}
