# 500 yeni geliştirme maddesi — etaplı yol haritas

İstek kapsamı: **200 animasyon/mikro-etkileşim + 100 tasarım iyileştirmesi + 200 profesyonel işlev**. Bu dosya plan ve kabul kapılarıdır; listedeki maddelerin uygulandığı veya canlıya çıktığı anlamına gelmez.

## Uygulama kuralları

- Animasyonlar ortak motion token/component üzerinden uygulanır; her ekleme `prefers-reduced-motion` ayarına uyar, içerik konumunu oynatmaz ve iş verisini geciktirmez.
- Tasarım maddeleri erişilebilirlik, Türkçe sayı/tarih biçimi, mobil dokunma ve mevcut Saha Pro tasarım sistemiyle birlikte ele alınır.
- Profesyonel işlevlerde mevcut modül ve `docs/GELISTIRME_ONERILERI.md` backlog'u ile çakışma taraması yapılır; var olan özellik yeniymiş gibi sayılmaz.
- Her etap: kabul ölçütü + hata/boş/yükleniyor durumları + yetki/RLS incelemesi + build + staging/production doğrulaması tamamlanmadan bitmiş sayılmaz.
- Dış sağlayıcı, ücret, hukuki uyum veya veritabanı migration'ı gerektiren madde ayrı karar/erişim kapısında tutulur; kullanıcı verisini silen veya güvenliği düşüren varsayılan eklenmez.
- Durum notu: `[Kodlandı]` etiketi kod ve üretim derlemesi doğrulanan maddeleri gösterir. Canlı veritabanı migration'ı ve çalışma zamanı doğrulaması ayrıca tamamlanmadan bir etap bitmiş sayılmaz.

## Etap yapısı

10 etap × 50 madde. Her etap 20 animasyon, 10 tasarım, 20 profesyonel işlev içerir. Öncelik önce ortak altyapı ve veri doğruluğu, sonra finans/operasyon; son etaplarda dışa aktarma ve entegrasyon.

| Etap | Animasyon | Tasarım | Profesyonel | Toplam |
|---|---:|---:|---:|---:|
| 1 | 20 | 10 | 20 | 50 |
| 2 | 20 | 10 | 20 | 50 |
| 3 | 20 | 10 | 20 | 50 |
| 4 | 20 | 10 | 20 | 50 |
| 5 | 20 | 10 | 20 | 50 |
| 6 | 20 | 10 | 20 | 50 |
| 7 | 20 | 10 | 20 | 50 |
| 8 | 20 | 10 | 20 | 50 |
| 9 | 20 | 10 | 20 | 50 |
| 10 | 20 | 10 | 20 | 50 |
| **Toplam** | **200** | **100** | **200** | **500** |

## Etap 1 — Temel hareket ve kayıt kalitesi

### Animasyon ve mikro-etkileşim (20)

001. **[Animasyon] Uygulama kabuğu:** ilk görünümde kısa opaklık geçişi.
002. **[Animasyon] Uygulama kabuğu:** kapanırken içerik kaybı olmadan yumuşak çıkış.
003. **[Animasyon] Uygulama kabuğu:** açılır panelde yükseklik ve opaklık geçişi.
004. **[Animasyon] Uygulama kabuğu:** kapanır panelde ters yönde sade geçiş.
005. **[Animasyon] Uygulama kabuğu:** seçili sekme çizgisinde kısa kayma.
006. **[Animasyon] Uygulama kabuğu:** yükleme durumunda düşük kontrastlı iskelet geçişi.
007. **[Animasyon] Uygulama kabuğu:** başarılı kayıtta tek seferlik onay işareti.
008. **[Animasyon] Uygulama kabuğu:** ilerleme göstergesinde sınırlı süreli değer geçişi.
009. **[Animasyon] Uygulama kabuğu:** geri alınabilir işlem bildiriminde kenardan giriş.
010. **[Animasyon] Uygulama kabuğu:** satır sıralamasında konum değişimini yumuşatma.
011. **[Animasyon] Hızlı ekle:** ilk görünümde kısa opaklık geçişi.
012. **[Animasyon] Hızlı ekle:** kapanırken içerik kaybı olmadan yumuşak çıkış.
013. **[Animasyon] Hızlı ekle:** açılır panelde yükseklik ve opaklık geçişi.
014. **[Animasyon] Hızlı ekle:** kapanır panelde ters yönde sade geçiş.
015. **[Animasyon] Hızlı ekle:** seçili sekme çizgisinde kısa kayma.
016. **[Animasyon] Hızlı ekle:** yükleme durumunda düşük kontrastlı iskelet geçişi.
017. **[Animasyon] Hızlı ekle:** başarılı kayıtta tek seferlik onay işareti.
018. **[Animasyon] Hızlı ekle:** ilerleme göstergesinde sınırlı süreli değer geçişi.
019. **[Animasyon] Hızlı ekle:** geri alınabilir işlem bildiriminde kenardan giriş.
020. **[Animasyon] Hızlı ekle:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

021. **[Tasarım] Formlar:** alan etiketleri ve yardımcı metin hiyerarşisi.
022. **[Tasarım] Formlar:** zorunlu alan işaretlerinin tutarlılığı.
023. **[Tasarım] Formlar:** doğrulama hatalarının alan yanında konumu.
024. **[Tasarım] Formlar:** hata düzeltme sonrası durumun görünürlüğü.
025. **[Tasarım] Formlar:** dokunma hedeflerinin mobil boyutu.
026. **[Tasarım] Formlar:** klavye odağı ve tab sırasının belirginliği.
027. **[Tasarım] Formlar:** uzun formlarda bölüm başlıkları.
028. **[Tasarım] Formlar:** varsayılan değerlerin açık anlatımı.
029. **[Tasarım] Formlar:** kaydetmeden önce özet ve iptal seçeneği.
030. **[Tasarım] Formlar:** yükleme ve başarısızlık durumlarının düzeni.

### Profesyonel işlev (20)

031. **[Kodlandı] [Profesyonel] Tahsilat planlama:** haftalık taksit vadesi ve ödeme sözü listesi.
032. **[Profesyonel] Tahsilat planlama:** müşteri bazında vade ve risk görünümü.
033. **[Kodlandı] [Profesyonel] Tahsilat planlama:** ödeme sözü kaydı ve gerçek ödeme ile otomatik takip durumu.
034. **[Mevcut özellik; yeni sayılmadı] [Profesyonel] Tahsilat planlama:** kısmi tahsilat için kalan bakiye çizelgesi.
035. **[Kodlandı] [Profesyonel] Tahsilat planlama:** vadesi geçen kayıtlar için yaşlandırma dilimleri.
036. **[Kodlandı] [Profesyonel] Tahsilat planlama:** seçilen vade dönemindeki açık taksitleri ve bu taksitlerde ödenen tutarı kıyaslama.
037. **[Kodlandı] [Profesyonel] Tahsilat planlama:** benzersiz makbuz / banka işlem numarası ile ödeme eşlemesi.
038. **[Profesyonel] Tahsilat planlama:** tahsilat için takip görevi oluşturma.
039. **[Profesyonel] Tahsilat planlama:** ödeme itirazı ve çözüm kaydı.
040. **[Profesyonel] Tahsilat planlama:** tahsilat planını CSV/PDF dışa aktarma.
041. **[Kodlandı] [Profesyonel] Borç takvimi:** 7/30/90 günlük açık taksit vade görünümü.
042. **[Profesyonel] Nakit akışı:** senaryolu gelir-gider varsayımları.
043. **[Profesyonel] Nakit akışı:** minimum nakit rezerv uyarısı.
044. **[Profesyonel] Nakit akışı:** planlanan ve gerçekleşen nakit kıyası.
045. **[Profesyonel] Nakit akışı:** tekrarlayan gider takvimi.
046. **[Profesyonel] Nakit akışı:** mevsimsellik notları.
047. **[Profesyonel] Nakit akışı:** yaklaşan ödeme yükü kırılımı.
048. **[Profesyonel] Nakit akışı:** tahmin güven düzeyi ve veri kapsamı.
049. **[Profesyonel] Nakit akışı:** beklenmeyen harcama etiketleri.
050. **[Profesyonel] Nakit akışı:** ay kapanışında tahmin-gerçekleşen özeti.

## Etap 2 — Panel ve nakit görünürlüğü

### Animasyon ve mikro-etkileşim (20)

051. **[Animasyon] Panel:** ilk görünümde kısa opaklık geçişi.
052. **[Animasyon] Panel:** kapanırken içerik kaybı olmadan yumuşak çıkış.
053. **[Animasyon] Panel:** açılır panelde yükseklik ve opaklık geçişi.
054. **[Animasyon] Panel:** kapanır panelde ters yönde sade geçiş.
055. **[Animasyon] Panel:** seçili sekme çizgisinde kısa kayma.
056. **[Animasyon] Panel:** yükleme durumunda düşük kontrastlı iskelet geçişi.
057. **[Animasyon] Panel:** başarılı kayıtta tek seferlik onay işareti.
058. **[Animasyon] Panel:** ilerleme göstergesinde sınırlı süreli değer geçişi.
059. **[Animasyon] Panel:** geri alınabilir işlem bildiriminde kenardan giriş.
060. **[Animasyon] Panel:** satır sıralamasında konum değişimini yumuşatma.
061. **[Animasyon] İş kayıtları:** ilk görünümde kısa opaklık geçişi.
062. **[Animasyon] İş kayıtları:** kapanırken içerik kaybı olmadan yumuşak çıkış.
063. **[Animasyon] İş kayıtları:** açılır panelde yükseklik ve opaklık geçişi.
064. **[Animasyon] İş kayıtları:** kapanır panelde ters yönde sade geçiş.
065. **[Animasyon] İş kayıtları:** seçili sekme çizgisinde kısa kayma.
066. **[Animasyon] İş kayıtları:** yükleme durumunda düşük kontrastlı iskelet geçişi.
067. **[Animasyon] İş kayıtları:** başarılı kayıtta tek seferlik onay işareti.
068. **[Animasyon] İş kayıtları:** ilerleme göstergesinde sınırlı süreli değer geçişi.
069. **[Animasyon] İş kayıtları:** geri alınabilir işlem bildiriminde kenardan giriş.
070. **[Animasyon] İş kayıtları:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

071. **[Tasarım] Tablo ve listeler:** sayı ve para sütunlarının hizası.
072. **[Tasarım] Tablo ve listeler:** tarih ve durum etiketlerinin okunabilirliği.
073. **[Tasarım] Tablo ve listeler:** sıralama durumunun işaretlenmesi.
074. **[Tasarım] Tablo ve listeler:** filtrelerin açık ve temiz durumları.
075. **[Tasarım] Tablo ve listeler:** mobilde yatay taşma stratejisi.
076. **[Tasarım] Tablo ve listeler:** toplam satırlarının ayrıştırılması.
077. **[Tasarım] Tablo ve listeler:** boş sonuç açıklaması ve aksiyonu.
078. **[Tasarım] Tablo ve listeler:** yükleme iskeletinin satır ölçüleri.
079. **[Tasarım] Tablo ve listeler:** uzun metinlerde güvenli kırpma.
080. **[Tasarım] Tablo ve listeler:** klavye ile satır kontrolü.

### Profesyonel işlev (20)

081. **[Profesyonel] İş kârlılığı:** iş bazında malzeme maliyeti.
082. **[Profesyonel] İş kârlılığı:** iş bazında yol ve yakıt maliyeti.
083. **[Profesyonel] İş kârlılığı:** iş başı işçilik maliyeti.
084. **[Profesyonel] İş kârlılığı:** teklif ve gerçekleşen marj farkı.
085. **[Profesyonel] İş kârlılığı:** müşteri bazında net katkı payı.
086. **[Profesyonel] İş kârlılığı:** makine kullanım maliyetini işe dağıtma.
087. **[Profesyonel] İş kârlılığı:** iş tamamlanınca maliyet kontrol listesi.
088. **[Profesyonel] İş kârlılığı:** zarar eşiği bildirim kuralı.
089. **[Profesyonel] İş kârlılığı:** masraf belgesini işe bağlama.
090. **[Profesyonel] İş kârlılığı:** kârlılık hesabının dahil/haric kalemleri.
091. **[Profesyonel] Teklif ve onay:** şablonlu hizmet teklifi.
092. **[Profesyonel] Teklif ve onay:** teklif sürüm geçmişi.
093. **[Profesyonel] Teklif ve onay:** müşteri teklif onayı bağlantısı.
094. **[Profesyonel] Teklif ve onay:** teklif geçerlilik tarihi takibi.
095. **[Profesyonel] Teklif ve onay:** iş emrine teklifi dönüştürme.
096. **[Profesyonel] Teklif ve onay:** fiyat kalemi ve indirim nedeni.
097. **[Profesyonel] Teklif ve onay:** tahmini/gerçekleşen fiyat kıyası.
098. **[Profesyonel] Teklif ve onay:** ek iş için ayrı onay kaydı.
099. **[Profesyonel] Teklif ve onay:** PDF teklif çıktısına şartlar ekleme.
100. **[Profesyonel] Teklif ve onay:** reddedilen teklif nedeni sınıflama.

## Etap 3 — Banka ve müşteri iş akışları

### Animasyon ve mikro-etkileşim (20)

101. **[Animasyon] Cari hesaplar:** ilk görünümde kısa opaklık geçişi.
102. **[Animasyon] Cari hesaplar:** kapanırken içerik kaybı olmadan yumuşak çıkış.
103. **[Animasyon] Cari hesaplar:** açılır panelde yükseklik ve opaklık geçişi.
104. **[Animasyon] Cari hesaplar:** kapanır panelde ters yönde sade geçiş.
105. **[Animasyon] Cari hesaplar:** seçili sekme çizgisinde kısa kayma.
106. **[Animasyon] Cari hesaplar:** yükleme durumunda düşük kontrastlı iskelet geçişi.
107. **[Animasyon] Cari hesaplar:** başarılı kayıtta tek seferlik onay işareti.
108. **[Animasyon] Cari hesaplar:** ilerleme göstergesinde sınırlı süreli değer geçişi.
109. **[Animasyon] Cari hesaplar:** geri alınabilir işlem bildiriminde kenardan giriş.
110. **[Animasyon] Cari hesaplar:** satır sıralamasında konum değişimini yumuşatma.
111. **[Animasyon] Randevu:** ilk görünümde kısa opaklık geçişi.
112. **[Animasyon] Randevu:** kapanırken içerik kaybı olmadan yumuşak çıkış.
113. **[Animasyon] Randevu:** açılır panelde yükseklik ve opaklık geçişi.
114. **[Animasyon] Randevu:** kapanır panelde ters yönde sade geçiş.
115. **[Animasyon] Randevu:** seçili sekme çizgisinde kısa kayma.
116. **[Animasyon] Randevu:** yükleme durumunda düşük kontrastlı iskelet geçişi.
117. **[Animasyon] Randevu:** başarılı kayıtta tek seferlik onay işareti.
118. **[Animasyon] Randevu:** ilerleme göstergesinde sınırlı süreli değer geçişi.
119. **[Animasyon] Randevu:** geri alınabilir işlem bildiriminde kenardan giriş.
120. **[Animasyon] Randevu:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

121. **[Tasarım] Navigasyon:** aktif sayfa durumunun ayırt edilmesi.
122. **[Tasarım] Navigasyon:** ikon ve metin eşleşmesi.
123. **[Tasarım] Navigasyon:** mobil alt çubuğun güvenli alan boşluğu.
124. **[Tasarım] Navigasyon:** geri dönüş davranışının tutarlılığı.
125. **[Tasarım] Navigasyon:** bölüm gruplarının görsel ayrımı.
126. **[Tasarım] Navigasyon:** bildirim rozetlerinin anlamı.
127. **[Tasarım] Navigasyon:** dar ekran menü sırası.
128. **[Tasarım] Navigasyon:** erişilebilir isim ve araç ipuçları.
129. **[Tasarım] Navigasyon:** pasif bağlantı durumunun açıklanması.
130. **[Tasarım] Navigasyon:** sayfa başlığı ve eylem alanı hiyerarşisi.

### Profesyonel işlev (20)

131. **[Profesyonel] Malzeme ve stok:** depo ve araç bazlı stok konumu.
132. **[Profesyonel] Malzeme ve stok:** asgari stok seviyesi.
133. **[Profesyonel] Malzeme ve stok:** malzeme rezervasyonu iş emrine.
134. **[Profesyonel] Malzeme ve stok:** malzeme parti ve seri izleme.
135. **[Profesyonel] Malzeme ve stok:** stok giriş/çıkış sayım mutabakatı.
136. **[Profesyonel] Malzeme ve stok:** tedarikçi fiyat geçmişi.
137. **[Profesyonel] Malzeme ve stok:** stokta bekleyen sipariş durumu.
138. **[Profesyonel] Malzeme ve stok:** işe sarf edilen malzeme maliyeti.
139. **[Profesyonel] Malzeme ve stok:** hasarlı/iadeli stok ayrımı.
140. **[Profesyonel] Malzeme ve stok:** stok değişikliği yetki izi.
141. **[Profesyonel] Müşteri ilişkileri:** müşteri iletişim tercihi ve izin kaydı.
142. **[Profesyonel] Müşteri ilişkileri:** müşteri bazlı açık iş portföyü.
143. **[Profesyonel] Müşteri ilişkileri:** tekrar iş ve arıza dönüş oranı.
144. **[Profesyonel] Müşteri ilişkileri:** müşteri özel fiyat anlaşması.
145. **[Profesyonel] Müşteri ilişkileri:** görüşme ve takip notları zaman çizgisi.
146. **[Profesyonel] Müşteri ilişkileri:** müşteri risk/öncelik segmenti.
147. **[Profesyonel] Müşteri ilişkileri:** memnuniyet geri bildirim kaydı.
148. **[Profesyonel] Müşteri ilişkileri:** müşteri birleştirme önizlemesi.
149. **[Profesyonel] Müşteri ilişkileri:** iletişim bilgisi doğrulama zamanı.
150. **[Profesyonel] Müşteri ilişkileri:** müşteri verisi dışa aktarma talebi.

## Etap 4 — Randevu, iş ve ekip planı

### Animasyon ve mikro-etkileşim (20)

151. **[Animasyon] Yevmiye:** ilk görünümde kısa opaklık geçişi.
152. **[Animasyon] Yevmiye:** kapanırken içerik kaybı olmadan yumuşak çıkış.
153. **[Animasyon] Yevmiye:** açılır panelde yükseklik ve opaklık geçişi.
154. **[Animasyon] Yevmiye:** kapanır panelde ters yönde sade geçiş.
155. **[Animasyon] Yevmiye:** seçili sekme çizgisinde kısa kayma.
156. **[Animasyon] Yevmiye:** yükleme durumunda düşük kontrastlı iskelet geçişi.
157. **[Animasyon] Yevmiye:** başarılı kayıtta tek seferlik onay işareti.
158. **[Animasyon] Yevmiye:** ilerleme göstergesinde sınırlı süreli değer geçişi.
159. **[Animasyon] Yevmiye:** geri alınabilir işlem bildiriminde kenardan giriş.
160. **[Animasyon] Yevmiye:** satır sıralamasında konum değişimini yumuşatma.
161. **[Animasyon] Ekipman:** ilk görünümde kısa opaklık geçişi.
162. **[Animasyon] Ekipman:** kapanırken içerik kaybı olmadan yumuşak çıkış.
163. **[Animasyon] Ekipman:** açılır panelde yükseklik ve opaklık geçişi.
164. **[Animasyon] Ekipman:** kapanır panelde ters yönde sade geçiş.
165. **[Animasyon] Ekipman:** seçili sekme çizgisinde kısa kayma.
166. **[Animasyon] Ekipman:** yükleme durumunda düşük kontrastlı iskelet geçişi.
167. **[Animasyon] Ekipman:** başarılı kayıtta tek seferlik onay işareti.
168. **[Animasyon] Ekipman:** ilerleme göstergesinde sınırlı süreli değer geçişi.
169. **[Animasyon] Ekipman:** geri alınabilir işlem bildiriminde kenardan giriş.
170. **[Animasyon] Ekipman:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

171. **[Tasarım] Panel:** özet kartlarında değer etiketi sırası.
172. **[Tasarım] Panel:** dönem seçicinin görünürlüğü.
173. **[Tasarım] Panel:** kritik uyarı ve normal bilgi ayrımı.
174. **[Tasarım] Panel:** grafiklerin okunur renk paleti.
175. **[Tasarım] Panel:** kartlar arası boşluk sistemi.
176. **[Tasarım] Panel:** küçük ekranda kart yığılma sırası.
177. **[Tasarım] Panel:** karşılaştırma değerlerinin tanımı.
178. **[Tasarım] Panel:** boş durumun panel bütünlüğü.
179. **[Tasarım] Panel:** veri kaynağı ve zaman damgası.
180. **[Tasarım] Panel:** yükleme hatası için yeniden deneme düzeni.

### Profesyonel işlev (20)

181. **[Profesyonel] Sözleşme ve garanti:** hizmet sözleşmesi başlangıç/bitiş takibi.
182. **[Profesyonel] Sözleşme ve garanti:** garanti kapsamı ve hariç kalemler.
183. **[Profesyonel] Sözleşme ve garanti:** garanti talep numarası yönetimi.
184. **[Profesyonel] Sözleşme ve garanti:** ücretsiz tekrar servis gerekçesi.
185. **[Profesyonel] Sözleşme ve garanti:** garanti öncesi belge hatırlatması.
186. **[Profesyonel] Sözleşme ve garanti:** bakım sözleşmesi yenileme takibi.
187. **[Profesyonel] Sözleşme ve garanti:** sözleşme eklerini sürümleme.
188. **[Profesyonel] Sözleşme ve garanti:** müşteri onaylı iş kapsamı kaydı.
189. **[Profesyonel] Sözleşme ve garanti:** sözleşme yükümlülük takvimi.
190. **[Profesyonel] Sözleşme ve garanti:** sözleşme kapanış kontrolü.
191. **[Profesyonel] Makine maliyeti:** makine başı toplam sahip olma maliyeti.
192. **[Profesyonel] Makine maliyeti:** çalışma saati başı yakıt maliyeti.
193. **[Profesyonel] Makine maliyeti:** bakım sıklığı ve arıza oranı kıyası.
194. **[Profesyonel] Makine maliyeti:** yedek parça maliyet trendi.
195. **[Profesyonel] Makine maliyeti:** makine kullanım kârlılığı.
196. **[Profesyonel] Makine maliyeti:** amortisman varsayım raporu (tahmini).
197. **[Profesyonel] Makine maliyeti:** makine boşta kalma nedeni.
198. **[Profesyonel] Makine maliyeti:** servis sağlayıcı ve garanti kaydı.
199. **[Profesyonel] Makine maliyeti:** makine elden çıkarma dosyası.
200. **[Profesyonel] Makine maliyeti:** makine evrakı geçerlilik kontrol listesi.

## Etap 5 — Ekipman ve saha maliyeti

### Animasyon ve mikro-etkileşim (20)

201. **[Animasyon] Banka kasası:** ilk görünümde kısa opaklık geçişi.
202. **[Animasyon] Banka kasası:** kapanırken içerik kaybı olmadan yumuşak çıkış.
203. **[Animasyon] Banka kasası:** açılır panelde yükseklik ve opaklık geçişi.
204. **[Animasyon] Banka kasası:** kapanır panelde ters yönde sade geçiş.
205. **[Animasyon] Banka kasası:** seçili sekme çizgisinde kısa kayma.
206. **[Animasyon] Banka kasası:** yükleme durumunda düşük kontrastlı iskelet geçişi.
207. **[Animasyon] Banka kasası:** başarılı kayıtta tek seferlik onay işareti.
208. **[Animasyon] Banka kasası:** ilerleme göstergesinde sınırlı süreli değer geçişi.
209. **[Animasyon] Banka kasası:** geri alınabilir işlem bildiriminde kenardan giriş.
210. **[Animasyon] Banka kasası:** satır sıralamasında konum değişimini yumuşatma.
211. **[Animasyon] Banka hareketleri:** ilk görünümde kısa opaklık geçişi.
212. **[Animasyon] Banka hareketleri:** kapanırken içerik kaybı olmadan yumuşak çıkış.
213. **[Animasyon] Banka hareketleri:** açılır panelde yükseklik ve opaklık geçişi.
214. **[Animasyon] Banka hareketleri:** kapanır panelde ters yönde sade geçiş.
215. **[Animasyon] Banka hareketleri:** seçili sekme çizgisinde kısa kayma.
216. **[Animasyon] Banka hareketleri:** yükleme durumunda düşük kontrastlı iskelet geçişi.
217. **[Animasyon] Banka hareketleri:** başarılı kayıtta tek seferlik onay işareti.
218. **[Animasyon] Banka hareketleri:** ilerleme göstergesinde sınırlı süreli değer geçişi.
219. **[Animasyon] Banka hareketleri:** geri alınabilir işlem bildiriminde kenardan giriş.
220. **[Animasyon] Banka hareketleri:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

221. **[Tasarım] Finans ekranları:** borç/alacak yönünün renk dışı işareti.
222. **[Tasarım] Finans ekranları:** tutar biçimlerinin tek standardı.
223. **[Tasarım] Finans ekranları:** vade ve gecikme bilgilerinin önceliği.
224. **[Tasarım] Finans ekranları:** ödenen ve kalan tutarın görsel ayrımı.
225. **[Tasarım] Finans ekranları:** banka kasası kilit durumunun açık gösterimi.
226. **[Tasarım] Finans ekranları:** filtre kapsamı ve etkin filtre etiketleri.
227. **[Tasarım] Finans ekranları:** finansal özetlerin sayı biçimi.
228. **[Tasarım] Finans ekranları:** uyarıların korkutmayan dili.
229. **[Tasarım] Finans ekranları:** onay pencerelerinin tutarlı boyutu.
230. **[Tasarım] Finans ekranları:** özet ve ayrıntı bölümlerinin ritmi.

### Profesyonel işlev (20)

231. **[Profesyonel] Ekip ve yetki:** usta onay kuyruğu ve SLA.
232. **[Profesyonel] Ekip ve yetki:** rol bazlı ekran/işlem matrisi.
233. **[Profesyonel] Ekip ve yetki:** kritik değişiklikte ikinci onay.
234. **[Profesyonel] Ekip ve yetki:** ekip üyesi işe göre maliyet raporu.
235. **[Profesyonel] Ekip ve yetki:** izin ve müsaitlik takvimi.
236. **[Profesyonel] Ekip ve yetki:** beceri ve sertifika matrisi.
237. **[Profesyonel] Ekip ve yetki:** ekip değişikliği audit kaydı.
238. **[Profesyonel] Ekip ve yetki:** iş yükü dengeleme uyarısı.
239. **[Profesyonel] Ekip ve yetki:** ekip üyesi veri kapsamı özeti.
240. **[Profesyonel] Ekip ve yetki:** hesap kapatmada erişim kaldırma kontrolü.
241. **[Profesyonel] Yevmiye ve zaman:** vardiya şablonları.
242. **[Profesyonel] Yevmiye ve zaman:** fazla mesai için ayrı onay.
243. **[Profesyonel] Yevmiye ve zaman:** avans ile yevmiye mahsup planı.
244. **[Profesyonel] Yevmiye ve zaman:** işe bağlı çalışma süresi raporu.
245. **[Profesyonel] Yevmiye ve zaman:** gün/hafta çalışma sınırı uyarısı.
246. **[Profesyonel] Yevmiye ve zaman:** düzeltilmiş yevmiye gerekçe izi.
247. **[Profesyonel] Yevmiye ve zaman:** toplu yevmiye önizleme/onay.
248. **[Profesyonel] Yevmiye ve zaman:** devamsızlık ve geç gelme notu.
249. **[Profesyonel] Yevmiye ve zaman:** yıllık personel maliyet özeti.
250. **[Profesyonel] Yevmiye ve zaman:** saat ve ücret yuvarlama kuralı.

## Etap 6 — Finansal kontrol ve onaylar

### Animasyon ve mikro-etkileşim (20)

251. **[Animasyon] Borç ve alacak:** ilk görünümde kısa opaklık geçişi.
252. **[Animasyon] Borç ve alacak:** kapanırken içerik kaybı olmadan yumuşak çıkış.
253. **[Animasyon] Borç ve alacak:** açılır panelde yükseklik ve opaklık geçişi.
254. **[Animasyon] Borç ve alacak:** kapanır panelde ters yönde sade geçiş.
255. **[Animasyon] Borç ve alacak:** seçili sekme çizgisinde kısa kayma.
256. **[Animasyon] Borç ve alacak:** yükleme durumunda düşük kontrastlı iskelet geçişi.
257. **[Animasyon] Borç ve alacak:** başarılı kayıtta tek seferlik onay işareti.
258. **[Animasyon] Borç ve alacak:** ilerleme göstergesinde sınırlı süreli değer geçişi.
259. **[Animasyon] Borç ve alacak:** geri alınabilir işlem bildiriminde kenardan giriş.
260. **[Animasyon] Borç ve alacak:** satır sıralamasında konum değişimini yumuşatma.
261. **[Animasyon] Kredi kartı taksitleri:** ilk görünümde kısa opaklık geçişi.
262. **[Animasyon] Kredi kartı taksitleri:** kapanırken içerik kaybı olmadan yumuşak çıkış.
263. **[Animasyon] Kredi kartı taksitleri:** açılır panelde yükseklik ve opaklık geçişi.
264. **[Animasyon] Kredi kartı taksitleri:** kapanır panelde ters yönde sade geçiş.
265. **[Animasyon] Kredi kartı taksitleri:** seçili sekme çizgisinde kısa kayma.
266. **[Animasyon] Kredi kartı taksitleri:** yükleme durumunda düşük kontrastlı iskelet geçişi.
267. **[Animasyon] Kredi kartı taksitleri:** başarılı kayıtta tek seferlik onay işareti.
268. **[Animasyon] Kredi kartı taksitleri:** ilerleme göstergesinde sınırlı süreli değer geçişi.
269. **[Animasyon] Kredi kartı taksitleri:** geri alınabilir işlem bildiriminde kenardan giriş.
270. **[Animasyon] Kredi kartı taksitleri:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

271. **[Tasarım] Randevu ve işler:** takvim yoğunluğunda boşluk ve kontrast.
272. **[Tasarım] Randevu ve işler:** seçili günün farklı işaretlenmesi.
273. **[Tasarım] Randevu ve işler:** çakışma uyarısının yerleşimi.
274. **[Tasarım] Randevu ve işler:** iş durumu etiketlerinin eş anlamlılığı.
275. **[Tasarım] Randevu ve işler:** saat ve adres bilgilerinin hiyerarşisi.
276. **[Tasarım] Randevu ve işler:** uzun iş adlarının mobil sunumu.
277. **[Tasarım] Randevu ve işler:** harita/konum aksiyonlarının ayrımı.
278. **[Tasarım] Randevu ve işler:** müşteri bağlantısının görünürlüğü.
279. **[Tasarım] Randevu ve işler:** boş gün eylem çağrısı.
280. **[Tasarım] Randevu ve işler:** takvim görünüm değiştirme kontrolü.

### Profesyonel işlev (20)

281. **[Profesyonel] Randevu ve saha planı:** bölgeye göre günlük rota grubu.
282. **[Profesyonel] Randevu ve saha planı:** seyahat süresi tamponu.
283. **[Profesyonel] Randevu ve saha planı:** usta müsaitlik matrisi.
284. **[Profesyonel] Randevu ve saha planı:** makine uygunluğuna göre randevu.
285. **[Profesyonel] Randevu ve saha planı:** randevu çakışması için alternatif saatler.
286. **[Profesyonel] Randevu ve saha planı:** müşteri varış bilgilendirme metni.
287. **[Profesyonel] Randevu ve saha planı:** tekrarlayan bakım randevusu kuralı.
288. **[Profesyonel] Randevu ve saha planı:** iş emri için saha hazırlık listesi.
289. **[Profesyonel] Randevu ve saha planı:** adres doğrulama ve konum hassasiyeti.
290. **[Profesyonel] Randevu ve saha planı:** randevu iptal nedeni analizi.
291. **[Profesyonel] Belge ve imza:** servis formu şablon editörü.
292. **[Profesyonel] Belge ve imza:** müşteri teslim imza kaydı.
293. **[Profesyonel] Belge ve imza:** önce/sonra fotoğraf seti.
294. **[Profesyonel] Belge ve imza:** belge numarası serisi yönetimi.
295. **[Profesyonel] Belge ve imza:** ek dosya türü ve boyut denetimi.
296. **[Profesyonel] Belge ve imza:** belge saklama süresi ayarı.
297. **[Profesyonel] Belge ve imza:** kişisel veri maskeleme çıktısı.
298. **[Profesyonel] Belge ve imza:** belge erişim indirme kaydı.
299. **[Profesyonel] Belge ve imza:** müşteri onaylı iş kapsamı PDF'i.
300. **[Profesyonel] Belge ve imza:** belge klasörü dışa aktarma.

## Etap 7 — Belge, müşteri ve sözleşmeler

### Animasyon ve mikro-etkileşim (20)

301. **[Animasyon] Giderler:** ilk görünümde kısa opaklık geçişi.
302. **[Animasyon] Giderler:** kapanırken içerik kaybı olmadan yumuşak çıkış.
303. **[Animasyon] Giderler:** açılır panelde yükseklik ve opaklık geçişi.
304. **[Animasyon] Giderler:** kapanır panelde ters yönde sade geçiş.
305. **[Animasyon] Giderler:** seçili sekme çizgisinde kısa kayma.
306. **[Animasyon] Giderler:** yükleme durumunda düşük kontrastlı iskelet geçişi.
307. **[Animasyon] Giderler:** başarılı kayıtta tek seferlik onay işareti.
308. **[Animasyon] Giderler:** ilerleme göstergesinde sınırlı süreli değer geçişi.
309. **[Animasyon] Giderler:** geri alınabilir işlem bildiriminde kenardan giriş.
310. **[Animasyon] Giderler:** satır sıralamasında konum değişimini yumuşatma.
311. **[Animasyon] Alım defteri:** ilk görünümde kısa opaklık geçişi.
312. **[Animasyon] Alım defteri:** kapanırken içerik kaybı olmadan yumuşak çıkış.
313. **[Animasyon] Alım defteri:** açılır panelde yükseklik ve opaklık geçişi.
314. **[Animasyon] Alım defteri:** kapanır panelde ters yönde sade geçiş.
315. **[Animasyon] Alım defteri:** seçili sekme çizgisinde kısa kayma.
316. **[Animasyon] Alım defteri:** yükleme durumunda düşük kontrastlı iskelet geçişi.
317. **[Animasyon] Alım defteri:** başarılı kayıtta tek seferlik onay işareti.
318. **[Animasyon] Alım defteri:** ilerleme göstergesinde sınırlı süreli değer geçişi.
319. **[Animasyon] Alım defteri:** geri alınabilir işlem bildiriminde kenardan giriş.
320. **[Animasyon] Alım defteri:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

321. **[Tasarım] Ekipman ve bakım:** makine kimlik ve seri numarasının ayrımı.
322. **[Tasarım] Ekipman ve bakım:** bakım yaklaşıyor/geçti durum dili.
323. **[Tasarım] Ekipman ve bakım:** sayaç birimlerinin görünürlüğü.
324. **[Tasarım] Ekipman ve bakım:** belge bitiş tarihinin vurgusu.
325. **[Tasarım] Ekipman ve bakım:** fotoğraf ve belge önizleme yerleşimi.
326. **[Tasarım] Ekipman ve bakım:** makine listesi mobil özet alanları.
327. **[Tasarım] Ekipman ve bakım:** kritik servis uyarılarının sunumu.
328. **[Tasarım] Ekipman ve bakım:** durum değişimi eylem menüsü.
329. **[Tasarım] Ekipman ve bakım:** bakım geçmişi zaman çizgisi.
330. **[Tasarım] Ekipman ve bakım:** formlarda zorunlu/opsiyonel ayrımı.

### Profesyonel işlev (20)

331. **[Profesyonel] Gider ve tedarik:** tekrarlayan gider şablonu.
332. **[Profesyonel] Gider ve tedarik:** fişten gider taslağı ve alan doğrulama.
333. **[Profesyonel] Gider ve tedarik:** tedarikçi cari bakiyesi.
334. **[Profesyonel] Gider ve tedarik:** satın alma talebi onayı.
335. **[Profesyonel] Gider ve tedarik:** sipariş ve teslimat eşleştirmesi.
336. **[Profesyonel] Gider ve tedarik:** gider bütçe aşım uyarısı.
337. **[Profesyonel] Gider ve tedarik:** gideri makine/işe dağıtma kuralı.
338. **[Profesyonel] Gider ve tedarik:** iade ve fiyat farkı kaydı.
339. **[Profesyonel] Gider ve tedarik:** KDV alanlarını dışa aktarma (kayıt amaçlı).
340. **[Profesyonel] Gider ve tedarik:** gider belgesi eksik uyarısı.
341. **[Profesyonel] Borç ve kredi:** erken kapama tutarı notu.
342. **[Profesyonel] Borç ve kredi:** faiz/masraf ayrıştırılmış ödeme planı.
343. **[Profesyonel] Borç ve kredi:** borç refinansman senaryosu.
344. **[Profesyonel] Borç ve kredi:** ödeme erteleme ve yeni vade izi.
345. **[Profesyonel] Borç ve kredi:** alacak-borç mahsup önizlemesi.
346. **[Profesyonel] Borç ve kredi:** taksit gecikme sebebi kaydı.
347. **[Profesyonel] Borç ve kredi:** kredi kartı ekstre döngüsü takibi.
348. **[Profesyonel] Borç ve kredi:** kart limiti ve kullanım oranı uyarısı.
349. **[Profesyonel] Borç ve kredi:** farklı para birimi borç değerleme notu.
350. **[Profesyonel] Borç ve kredi:** taksit kapanış belgesi ilişkilendirme.

## Etap 8 — Veri kalitesi ve uyum

### Animasyon ve mikro-etkileşim (20)

351. **[Animasyon] Raporlar:** ilk görünümde kısa opaklık geçişi.
352. **[Animasyon] Raporlar:** kapanırken içerik kaybı olmadan yumuşak çıkış.
353. **[Animasyon] Raporlar:** açılır panelde yükseklik ve opaklık geçişi.
354. **[Animasyon] Raporlar:** kapanır panelde ters yönde sade geçiş.
355. **[Animasyon] Raporlar:** seçili sekme çizgisinde kısa kayma.
356. **[Animasyon] Raporlar:** yükleme durumunda düşük kontrastlı iskelet geçişi.
357. **[Animasyon] Raporlar:** başarılı kayıtta tek seferlik onay işareti.
358. **[Animasyon] Raporlar:** ilerleme göstergesinde sınırlı süreli değer geçişi.
359. **[Animasyon] Raporlar:** geri alınabilir işlem bildiriminde kenardan giriş.
360. **[Animasyon] Raporlar:** satır sıralamasında konum değişimini yumuşatma.
361. **[Animasyon] Döviz:** ilk görünümde kısa opaklık geçişi.
362. **[Animasyon] Döviz:** kapanırken içerik kaybı olmadan yumuşak çıkış.
363. **[Animasyon] Döviz:** açılır panelde yükseklik ve opaklık geçişi.
364. **[Animasyon] Döviz:** kapanır panelde ters yönde sade geçiş.
365. **[Animasyon] Döviz:** seçili sekme çizgisinde kısa kayma.
366. **[Animasyon] Döviz:** yükleme durumunda düşük kontrastlı iskelet geçişi.
367. **[Animasyon] Döviz:** başarılı kayıtta tek seferlik onay işareti.
368. **[Animasyon] Döviz:** ilerleme göstergesinde sınırlı süreli değer geçişi.
369. **[Animasyon] Döviz:** geri alınabilir işlem bildiriminde kenardan giriş.
370. **[Animasyon] Döviz:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

371. **[Tasarım] Rapor ve dışa aktarma:** rapor dönemi başlığının netliği.
372. **[Tasarım] Rapor ve dışa aktarma:** filtrelerin çıktıya dahil olduğunun göstergesi.
373. **[Tasarım] Rapor ve dışa aktarma:** PDF sayfa başlığı ve dip bilgisi.
374. **[Tasarım] Rapor ve dışa aktarma:** CSV alan adlarının anlaşılır düzeni.
375. **[Tasarım] Rapor ve dışa aktarma:** yazdırma görünümünde gereksiz menülerin gizlenmesi.
376. **[Tasarım] Rapor ve dışa aktarma:** grafik renklerinin yazdırmada ayırt edilmesi.
377. **[Tasarım] Rapor ve dışa aktarma:** özet ile detay arasındaki ayrım.
378. **[Tasarım] Rapor ve dışa aktarma:** yükleme süresi ve sonuç adedi.
379. **[Tasarım] Rapor ve dışa aktarma:** ihracat hatasında tekrar eylemi.
380. **[Tasarım] Rapor ve dışa aktarma:** gizli/maskeleme durumunun görünümü.

### Profesyonel işlev (20)

381. **[Profesyonel] Uyum ve denetim:** işlem bazlı değişiklik günlüğü.
382. **[Profesyonel] Uyum ve denetim:** günlükte hassas alan maskeleme.
383. **[Profesyonel] Uyum ve denetim:** veri dışa aktarma denetim kaydı.
384. **[Profesyonel] Uyum ve denetim:** profil arşivleme onay kuralı.
385. **[Profesyonel] Uyum ve denetim:** oturum/cihaz listeleme ekranı.
386. **[Profesyonel] Uyum ve denetim:** şüpheli oturum için oturumu kapatma.
387. **[Profesyonel] Uyum ve denetim:** yedek geri yükleme önizleme doğrulaması.
388. **[Profesyonel] Uyum ve denetim:** KVKK talebi iş akışı.
389. **[Profesyonel] Uyum ve denetim:** saklama ve silme politikasını modüle bağlama.
390. **[Profesyonel] Uyum ve denetim:** yetki değişikliği bildirimi.
391. **[Profesyonel] Raporlama:** kaydedilebilir rapor filtreleri.
392. **[Profesyonel] Raporlama:** rapor planını takvime bağlama.
393. **[Profesyonel] Raporlama:** raporda veri kaynağı dipnotu.
394. **[Profesyonel] Raporlama:** dönemler arası karşılaştırmalı rapor.
395. **[Profesyonel] Raporlama:** müşteri ve profil kapsamı seçimi.
396. **[Profesyonel] Raporlama:** filtreli satır adedi ve hariç sayım.
397. **[Profesyonel] Raporlama:** rapor sürümü ve oluşturma zamanı.
398. **[Profesyonel] Raporlama:** yöneticiye aylık e-posta taslağı (onaylı).
399. **[Profesyonel] Raporlama:** kârlılık ve nakit metriklerini ayırma.
400. **[Profesyonel] Raporlama:** rapor başarısızlığında tanılama kodu.

## Etap 9 — Çevrimdışı dayanıklılık ve raporlar

### Animasyon ve mikro-etkileşim (20)

401. **[Animasyon] Küresel arama:** ilk görünümde kısa opaklık geçişi.
402. **[Animasyon] Küresel arama:** kapanırken içerik kaybı olmadan yumuşak çıkış.
403. **[Animasyon] Küresel arama:** açılır panelde yükseklik ve opaklık geçişi.
404. **[Animasyon] Küresel arama:** kapanır panelde ters yönde sade geçiş.
405. **[Animasyon] Küresel arama:** seçili sekme çizgisinde kısa kayma.
406. **[Animasyon] Küresel arama:** yükleme durumunda düşük kontrastlı iskelet geçişi.
407. **[Animasyon] Küresel arama:** başarılı kayıtta tek seferlik onay işareti.
408. **[Animasyon] Küresel arama:** ilerleme göstergesinde sınırlı süreli değer geçişi.
409. **[Animasyon] Küresel arama:** geri alınabilir işlem bildiriminde kenardan giriş.
410. **[Animasyon] Küresel arama:** satır sıralamasında konum değişimini yumuşatma.
411. **[Animasyon] Bildirim merkezi:** ilk görünümde kısa opaklık geçişi.
412. **[Animasyon] Bildirim merkezi:** kapanırken içerik kaybı olmadan yumuşak çıkış.
413. **[Animasyon] Bildirim merkezi:** açılır panelde yükseklik ve opaklık geçişi.
414. **[Animasyon] Bildirim merkezi:** kapanır panelde ters yönde sade geçiş.
415. **[Animasyon] Bildirim merkezi:** seçili sekme çizgisinde kısa kayma.
416. **[Animasyon] Bildirim merkezi:** yükleme durumunda düşük kontrastlı iskelet geçişi.
417. **[Animasyon] Bildirim merkezi:** başarılı kayıtta tek seferlik onay işareti.
418. **[Animasyon] Bildirim merkezi:** ilerleme göstergesinde sınırlı süreli değer geçişi.
419. **[Animasyon] Bildirim merkezi:** geri alınabilir işlem bildiriminde kenardan giriş.
420. **[Animasyon] Bildirim merkezi:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

421. **[Tasarım] Erişilebilirlik ve tema:** metin/zemin kontrast kontrolü.
422. **[Tasarım] Erişilebilirlik ve tema:** durumların yalnız renkle anlatılmaması.
423. **[Tasarım] Erişilebilirlik ve tema:** büyütülmüş metinde taşma olmaması.
424. **[Tasarım] Erişilebilirlik ve tema:** yüksek kontrast tercihi.
425. **[Tasarım] Erişilebilirlik ve tema:** azaltılmış hareket tercihi açıklaması.
426. **[Tasarım] Erişilebilirlik ve tema:** odak halkasının tüm temalarda görünmesi.
427. **[Tasarım] Erişilebilirlik ve tema:** dokunma hedefi aralıkları.
428. **[Tasarım] Erişilebilirlik ve tema:** ikon-only buton adları.
429. **[Tasarım] Erişilebilirlik ve tema:** hata ve başarı mesajı semantiği.
430. **[Tasarım] Erişilebilirlik ve tema:** karanlık temada durum renkleri.

### Profesyonel işlev (20)

431. **[Profesyonel] Veri kalitesi:** mükerrer müşteri adayları incelemesi.
432. **[Profesyonel] Veri kalitesi:** çakışan hareketleri ödeme referansı ile eşleştirme.
433. **[Profesyonel] Veri kalitesi:** eksik kayıt alanları için kalite kuyruğu.
434. **[Profesyonel] Veri kalitesi:** tarih/tutar tutarsızlığı uyarısı.
435. **[Profesyonel] Veri kalitesi:** toplu düzeltme önizlemesi ve geri alma.
436. **[Profesyonel] Veri kalitesi:** veri kaynağı güven puanı.
437. **[Profesyonel] Veri kalitesi:** işlem kimliği için idempotency anahtarı.
438. **[Profesyonel] Veri kalitesi:** arşiv ve aktif kayıt çakışma kontrolü.
439. **[Profesyonel] Veri kalitesi:** kayıtlar arası yetim bağlantı denetimi.
440. **[Profesyonel] Veri kalitesi:** veri kalitesi özet raporu.
441. **[Profesyonel] Çevrimdışı çalışma:** kuyrukta bekleyen işlem ayrıntısı.
442. **[Profesyonel] Çevrimdışı çalışma:** başarısız senkron için güvenli tekrar.
443. **[Profesyonel] Çevrimdışı çalışma:** çakışma çözümü karşılaştırma ekranı.
444. **[Profesyonel] Çevrimdışı çalışma:** kullanıcı kimliğine bağlı kuyruk izolasyonu denetimi.
445. **[Profesyonel] Çevrimdışı çalışma:** çevrimdışı değişiklik taslağı/başarısız durumu.
446. **[Profesyonel] Çevrimdışı çalışma:** ağ kesintisi sonrası bağlantı testi.
447. **[Profesyonel] Çevrimdışı çalışma:** tekrarlı gönderimi engelleme.
448. **[Profesyonel] Çevrimdışı çalışma:** önbellek saklama süresi kontrolü.
449. **[Profesyonel] Çevrimdışı çalışma:** son senkron zamanını modüle göre gösterme.
450. **[Profesyonel] Çevrimdışı çalışma:** yedek internet/yerel dışa aktarma akışı.

## Etap 10 — Entegrasyon ve otomasyon

### Animasyon ve mikro-etkileşim (20)

451. **[Animasyon] Çevrimdışı senkron:** ilk görünümde kısa opaklık geçişi.
452. **[Animasyon] Çevrimdışı senkron:** kapanırken içerik kaybı olmadan yumuşak çıkış.
453. **[Animasyon] Çevrimdışı senkron:** açılır panelde yükseklik ve opaklık geçişi.
454. **[Animasyon] Çevrimdışı senkron:** kapanır panelde ters yönde sade geçiş.
455. **[Animasyon] Çevrimdışı senkron:** seçili sekme çizgisinde kısa kayma.
456. **[Animasyon] Çevrimdışı senkron:** yükleme durumunda düşük kontrastlı iskelet geçişi.
457. **[Animasyon] Çevrimdışı senkron:** başarılı kayıtta tek seferlik onay işareti.
458. **[Animasyon] Çevrimdışı senkron:** ilerleme göstergesinde sınırlı süreli değer geçişi.
459. **[Animasyon] Çevrimdışı senkron:** geri alınabilir işlem bildiriminde kenardan giriş.
460. **[Animasyon] Çevrimdışı senkron:** satır sıralamasında konum değişimini yumuşatma.
461. **[Animasyon] Ayarlar ve profil:** ilk görünümde kısa opaklık geçişi.
462. **[Animasyon] Ayarlar ve profil:** kapanırken içerik kaybı olmadan yumuşak çıkış.
463. **[Animasyon] Ayarlar ve profil:** açılır panelde yükseklik ve opaklık geçişi.
464. **[Animasyon] Ayarlar ve profil:** kapanır panelde ters yönde sade geçiş.
465. **[Animasyon] Ayarlar ve profil:** seçili sekme çizgisinde kısa kayma.
466. **[Animasyon] Ayarlar ve profil:** yükleme durumunda düşük kontrastlı iskelet geçişi.
467. **[Animasyon] Ayarlar ve profil:** başarılı kayıtta tek seferlik onay işareti.
468. **[Animasyon] Ayarlar ve profil:** ilerleme göstergesinde sınırlı süreli değer geçişi.
469. **[Animasyon] Ayarlar ve profil:** geri alınabilir işlem bildiriminde kenardan giriş.
470. **[Animasyon] Ayarlar ve profil:** satır sıralamasında konum değişimini yumuşatma.

### Tasarım iyileştirmesi (10)

471. **[Tasarım] İçerik ve boş durumlar:** buton fiillerinin tutarlı kullanımı.
472. **[Tasarım] İçerik ve boş durumlar:** teknik hata metninin kullanıcı diline çevrilmesi.
473. **[Tasarım] İçerik ve boş durumlar:** para birimi ve birim yazımı.
474. **[Tasarım] İçerik ve boş durumlar:** tarih biçimi ve saat dilimi açıklaması.
475. **[Tasarım] İçerik ve boş durumlar:** ilk kullanım adımlarının kısa anlatımı.
476. **[Tasarım] İçerik ve boş durumlar:** boş durumlarda ilgili modüle bağlantı.
477. **[Tasarım] İçerik ve boş durumlar:** silme yerine arşiv eylemi açıklaması.
478. **[Tasarım] İçerik ve boş durumlar:** geri alınabilirlik etiketleri.
479. **[Tasarım] İçerik ve boş durumlar:** yardım bağlantısının yakınlığı.
480. **[Tasarım] İçerik ve boş durumlar:** yardım metninde hassas verinin uyarısı.

### Profesyonel işlev (20)

481. **[Profesyonel] Entegrasyon:** takvim iki yönlü eşitleme izin matrisi.
482. **[Profesyonel] Entegrasyon:** entegrasyon başına iptal ve veri silme.
483. **[Profesyonel] Entegrasyon:** webhook hata kuyruğu ve tekrar.
484. **[Profesyonel] Entegrasyon:** entegrasyon olayları için idempotency.
485. **[Profesyonel] Entegrasyon:** dış API kota kullanım göstergesi.
486. **[Profesyonel] Entegrasyon:** entegrasyon bağlantı sağlık testi.
487. **[Profesyonel] Entegrasyon:** OAuth izin kapsamı dökümü.
488. **[Profesyonel] Entegrasyon:** veri alanı başına kaynak eşlemesi.
489. **[Profesyonel] Entegrasyon:** entegrasyon kesilince manuel yedek akış.
490. **[Profesyonel] Entegrasyon:** entegrasyon token sonlandırma kontrolü.
491. **[Profesyonel] İş akışı otomasyonu:** duruma göre otomatik görev açma.
492. **[Profesyonel] İş akışı otomasyonu:** gecikmiş iş için sorumlu atama kuralı.
493. **[Profesyonel] İş akışı otomasyonu:** vade sonrası hatırlatma dizisi.
494. **[Profesyonel] İş akışı otomasyonu:** teklif onayından iş emrine geçiş.
495. **[Profesyonel] İş akışı otomasyonu:** iş tamamlanınca belge kontrolü.
496. **[Profesyonel] İş akışı otomasyonu:** kural simülasyonu ve örnek kayıt önizleme.
497. **[Profesyonel] İş akışı otomasyonu:** otomasyon değişiklik sürümleme.
498. **[Profesyonel] İş akışı otomasyonu:** tekrar tetiklemeyi önleme.
499. **[Profesyonel] İş akışı otomasyonu:** otomasyon durdurma anahtarı.
500. **[Profesyonel] İş akışı otomasyonu:** çalışma geçmişi ve hata nedeni.

## Uygulamaya başlama kapısı

Bu listeyi onaylanmış kod görevi saymadan önce her madde mevcut kod ve eski 1.000 maddelik öneri listesiyle karşılaştırılmalı; aynı işi yapanlar yeni özellik diye eklenmemeli. Bir etapta önce veri/RLS ve iş kuralı tasarlanır, sonra işlevler, ardından görsel/motion katmanı eklenir. Etaplar bağımsız PR/commit ve geri alınabilir migration'larla yayımlanır. 200 animasyonun tamamı hiçbir ekranda otomatik oynatılmaz; etkileşim üzerine, kısa ve azaltılabilir hareket olarak uygulanır.
