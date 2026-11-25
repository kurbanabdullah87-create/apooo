# iyzico ile Premium ödemesi

Saha, kart bilgisini almadan iyzico Checkout Form'a yönlendirir. Premium erişimi; iyzico'dan sunucu tarafında yeniden sorgulanan işlem `success`, `paymentStatus=SUCCESS`, `fraudStatus=1` ve beklenen sepet, tutar, para birimi ve sipariş bilgileriyle eşleştiğinde açılır. Kullanıcının tarayıcıdan gönderdiği “başarılı” bilgisi tek başına hiçbir zaman erişim vermez.

## Canlı ödemeyi açma

1. İşletme adına iyzico üye iş yeri hesabını oluşturup sağlayıcının istediği şirket, vergi, banka ve site inceleme adımlarını tamamlayın. Canlı API anahtarı, iyzico hesabı onaylanıp canlı API erişimi açıldıktan sonra alınır.
2. Önce iyzico sandbox API anahtarlarıyla test edin. Test anahtarlarını production ortamında kullanmayın.
3. Vercel projesinin **Settings → Environment Variables** alanına aşağıdaki sunucu değişkenlerini ekleyin. `VITE_` öneki kullanmayın:
   - `IYZICO_ENV=sandbox` (canlıya geçince `production`)
   - `IYZICO_API_KEY` (iyzico API key)
   - `IYZICO_SECRET_KEY` (iyzico secret key)
   - `APP_BASE_URL=https://<yayındaki-uygulama-domaini>` (sonunda `/` olmadan)
4. Veritabanında `drizzle/migrations/0029_iyzico_checkout.sql` migrasyonunu uygulayın. Üretim deploy'unda `LOVABLE_DB_MIGRATION_URL`/`POSTGRES_URL_NON_POOLING` kullanan migration adımı da bunu uygular; mevcut dağıtım süreciniz doğrudan SQL çalıştırmıyorsa dosyayı Supabase SQL Editor'da bir defa çalıştırın.
5. Değişkenleri Vercel'de **Production** ve gerekiyorsa Preview ortamlarına ayrı ayrı ekleyip yeni deployment alın. Production değişkeni değişikliği yeni deployment olmadan çalışan deployment'a uygulanmaz.
6. Sandbox'ta kartla ödeme başarı, ret ve yarım bırakma akışlarını kontrol edin. Sipariş geçmişinde beklenen durumları, hesapta Premium erişimini ve iyzico merchant panelindeki işlemi karşılaştırın.
7. iyzico canlı onayı ve testler tamamlandıktan sonra canlı API anahtarı/secret değerlerini Vercel Production ortamına ekleyin, `IYZICO_ENV=production` yapın ve yeni deployment alın. Canlı test için kendi ekibinizin belirlediği küçük ve kontrollü bir tutarı tercih edin.

## İşleyiş ve veri

- Aylık ve yıllık planlar tek seferlik dönem satın alımıdır; otomatik kart çekimi / otomatik yenileme yapılmaz. Süre bitince kullanıcı yeni satın alım başlatır.
- Kart numarası, CVV ve son kullanma tarihi Saha sunucusuna gönderilmez. Ödeme alanlarını iyzico barındırır.
- Fatura/ödeme başlatımı için girilen ad-soyad, T.C. kimlik numarası, cep telefonu ve adres ödeme formuna iyzico'ya aktarılır; Saha'nın `payment_orders` tablosunda bu alanlar tutulmaz. E-posta oturum hesabından alınır.
- `payment_orders` tablosunda yalnız sipariş sahibi kendi sipariş durumlarını okuyabilir. Sipariş açma/güncelleme ve Premium hakkı verme yalnız sunucu service-role yetkisiyle yapılır.
- `fraudStatus=0` inceleme olarak kalır ve Premium açmaz; `-1` veya ret başarısız olur. İnceleme sonucu için iyzico bildirim ayarları ek bir iş akışı olarak yapılandırılmalıdır.
- Webhook veya callback yanıtı tek başına ödeme kanıtı kabul edilmez; callback içindeki token ile iyzico retrieve API çağrısı yapılır.

## Gerekli ortam değişkenleri

```dotenv
IYZICO_ENV=sandbox
IYZICO_API_KEY=
IYZICO_SECRET_KEY=
APP_BASE_URL=https://your-production-domain.example
```

Bu değişkenler istemci tarafına açılmamalı, kaynak koda veya ekran görüntüsüne yazılmamalıdır. Sağlayıcı hesabı/anahtarlar ve production veritabanı migration'ı olmadan gerçek para tahsilatı yapılamaz; arayüz bu durumda ödeme başlatma düğmesini kapalı tutar.
