# Sambungan akaun iklan — Meta Ads & Google Ads

Menyambung akaun iklan menggantikan muat naik CSV: dashboard menarik data
terus daripada platform, sama seperti Madgicx atau Skaler. Sambungan adalah
**baca-sahaja** — skop yang diminta tidak membenarkan aplikasi ini menukar
belanja, menghidupkan iklan, atau menyentuh apa-apa dalam akaun anda.

Muat naik CSV **tidak** dibuang. Kedua-duanya menulis ke jadual yang sama
melalui writer yang sama, jadi anda boleh guna API untuk kempen baharu dan
kekal dengan CSV untuk data sejarah.

---

## Ringkasan aliran

```
Pengguna klik "Sambung Meta Ads"
   → /api/connect/meta/start        ← tandatangan state (HMAC) + id pengguna
   → skrin kebenaran Meta
   → /api/connect/meta/callback     ← sahkan state, sahkan pengguna sama
   → tukar code → token jangka panjang
   → senaraikan akaun iklan, simpan (token disulitkan AES-256-GCM)
   → kembali ke tab Data

Pengguna klik "Segerak sekarang"
   → tarik insights 30 hari terakhir, harian, di peringkat iklan
   → tukar kepada NormalizedAdMetric
   → writer yang sama seperti CSV: snapshot, rollback, padanan kreatif
```

Dua jadual menyimpannya:

| Jadual | Isi |
|---|---|
| `ad_connections` | satu baris per akaun iklan; token disulitkan, milik satu pengguna |
| `campaign_sources` | kempen mana menarik daripada sambungan mana, dan (pilihan) hanya kempen platform yang disenaraikan |

RLS memastikan seorang pengguna hanya nampak sambungannya sendiri, dan
`campaign_sources` menyemak **dua-dua** belah: kempen mesti milik anda *dan*
sambungan mesti milik anda.

---

## Kunci penyulitan (wajib untuk kedua-dua platform)

Token tidak pernah masuk ke pangkalan data dalam bentuk asal. Jana kunci:

```bash
openssl rand -base64 32
```

Letak sebagai `TOKEN_ENCRYPTION_KEY`. Tanpa ia, butang sambung tidak muncul dan
panel akan menyebut nama env yang belum diisi.

> Menukar kunci ini menjadikan semua token sedia ada tidak boleh dibaca.
> Pengguna perlu menyambung semula akaun mereka — tiada data metrik hilang.

---

## Meta Ads

### 1. Cipta app

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**
2. Jenis: **Business**
3. Tambah produk **Facebook Login**, kemudian **Marketing API**

### 2. Konfigurasi Facebook Login for Business

App yang dibuat melalui aliran *use case* mendapat **Facebook Login for
Business**, bukan Facebook Login biasa. Perbezaannya penting: variant business
meminta **config ID** yang menamakan satu set permission yang disimpan, dan
mengabaikan senarai `scope` yang dihantar dalam URL.

Kalau langkah ini dilangkau, skrin kebenaran tetap muncul dan kelihatan
berjaya — tetapi tiada permission diberi, dan ralatnya hanya menampakkan diri
kemudian sebagai *"Tiada akaun iklan pada akaun Meta ini"*.

1. Sidebar → **Facebook Login for Business** → **Configurations** → **Create
   configuration**
2. Beri nama (contoh: `Creative Analytic — baca`)
3. Login variant: **Business login**
4. Jenis token: **System-user access token** — lihat nota di bawah
5. Assets: **Ad accounts**
6. Permissions: tandakan `ads_read` dan `business_management`
7. Simpan, kemudian salin **Configuration ID**

> **Jenis token tidak boleh ditukar selepas configuration disimpan.** Kalau
> tersilap, buat configuration baharu dan tukar `META_LOGIN_CONFIG_ID`.

| | System-user | User |
|---|---|---|
| Log masuk dengan | business portfolio | akaun Facebook peribadi |
| Tempoh sah | tidak luput | ~60 hari |
| Perlu | Business Manager yang memegang akaun iklan | tiada |

**System-user** ialah pilihan yang betul untuk dashboard yang menyegerak
berulang kali: tokennya tidak luput, jadi tiada sesiapa perlu menyambung semula
setiap dua bulan. Syaratnya akaun iklan mesti berada dalam Business Manager.

Pilih **User** hanya kalau akaun iklan itu peribadi dan tiada Business Manager.
Kedua-duanya berfungsi — kod mengendalikan tempoh sah masing-masing, dan
sambungan akan meminta disambung semula bila tokennya hampir luput.

Letak id itu sebagai `META_LOGIN_CONFIG_ID`.

### 3. Redirect URI

Sidebar → **Facebook Login for Business** → **Settings** → *Valid OAuth
Redirect URIs*:

```
https://ihsanku.kaizendigital.my/api/connect/meta/callback
```

Tambah juga `http://localhost:3000/api/connect/meta/callback` kalau anda
membangunkan secara tempatan.

### 4. Kekal dalam Development Mode

Ini yang menjimatkan berminggu-minggu. Skop `ads_read` dan
`business_management` berfungsi **tanpa App Review** untuk sesiapa yang ada
peranan dalam app itu sendiri — jadi biarkan status **Unpublished**; ia bukan
sesuatu yang perlu dibetulkan.

**App roles → Add people** → tambah setiap ahli pasukan Kaizen sebagai Admin,
Developer atau Tester. Mereka juga perlu menerima jemputan di
[developers.facebook.com/requests](https://developers.facebook.com/requests).

App Review dan **Become a Tech Provider** hanya perlu kalau orang luar (klien,
agensi lain) akan menyambung akaun mereka sendiri. Untuk kegunaan dalaman,
abaikan kedua-duanya.

### 5. Env

| Variable | Dari mana |
|---|---|
| `META_APP_ID` | App settings → Basic → App ID |
| `META_APP_SECRET` | tempat sama → App Secret (klik **Show**) |
| `META_LOGIN_CONFIG_ID` | Facebook Login for Business → Configurations (langkah 2) |
| `META_PREVIEW_FORMAT` | pilihan; lalai `MOBILE_FEED_STANDARD` |
| `META_GRAPH_VERSION` | pilihan; lalai `v21.0` |

### Apa yang ditarik

Dua panggilan berasingan, kerana Meta memisahkan nombor daripada kreatif.

**Insights** — `level=ad`, `time_increment=1` (satu baris per iklan per hari — inilah yang
menghidupkan semua graf trend), medan: spend, impressions, reach, frequency,
clicks, link clicks, landing page views, video views + kuartil, actions dan
action_values.

Derma dibaca daripada `actions`/`action_values` dengan memilih mengikut
`action_type` (`purchase`, kemudian `offsite_conversion.fb_pixel_purchase`),
**bukan** mengikut kedudukan dalam array — susunan array Meta tidak stabil.

**Aset kreatif** — gambar, headline, body copy dan pautan. Endpoint insights
tidak memulangkan satu pun daripadanya, jadi grid kreatif akan memaparkan kad
kosong tanpa panggilan kedua ini.

Meta menyimpan tiga medan yang sama pada tiga tempat berbeza bergantung pada
cara iklan dibina — creative biasa, `object_story_spec`, atau `asset_feed_spec`
untuk iklan dinamik. Ketiga-tiganya dibaca; membaca satu sahaja meninggalkan
kebanyakan akaun sebenar kosong.

Ia ditarik **sekali setiap segerak**, bukan sekali setiap ketulan: gambar iklan
tidak berubah dari hari ke hari, dan nombor yang berbaloi menghabiskan
belanjawan masa.

**Pratonton iklan Meta** juga ditarik, sebagai pengembangan medan pada
permintaan yang sama supaya ia tidak menambah panggilan. Ini berbeza daripada
gambar: gambar menunjukkan rupa kreatif, pratonton menunjukkan rupa **iklan** —
nama Halaman, teks utama, butang CTA, bingkai penempatan itu sendiri.

Ia dimuat **hanya bila diklik**. Grid boleh memegang lima puluh kad, dan lima
puluh iframe akan memperlahankan halaman yang paling kerap dibuka. Pada halaman
butiran satu kreatif, ia dipaparkan terus.

URL pratonton ditandatangani dan luput, jadi ia diperbaharui setiap segerak.
Gambar tersimpan kekal sebagai sandaran — itulah sebabnya kedua-duanya disimpan
dalam lajur berasingan.

Format lalai ialah `MOBILE_FEED_STANDARD`, kerana di situlah hampir semua
belanja ini mendarat. Tukar dengan `META_PREVIEW_FORMAT` kalau perlu.

### Hasil dan derma datang dari Onpay, bukan Meta

KPI **Hasil** dan **Derma** dikira daripada jadual `conversions`, yang diisi
oleh muat naik CSV Onpay — bukan daripada Meta.

Ini disengajakan. Derma berlaku di Onpay, jadi pixel Meta tidak nampak
kebanyakannya, dan angka yang dilaporkan Meta selalunya tidak sepadan dengan
apa yang benar-benar masuk ke akaun bank. Onpay ialah kebenarannya.

Nombor Meta sendiri tetap disimpan (`platform_purchases`, `platform_revenue`)
untuk perbandingan, tetapi tidak digunakan sebagai Hasil.

Jadi: **selepas menyambung Meta, ROAS akan kekal 0.00x sehingga CSV Onpay
dimuat naik.** Belanja, funnel dan kreatif berfungsi tanpanya; wang tidak.

---

## Meta: laluan terus, tanpa OAuth

OAuth wujud supaya **ramai orang** boleh menyambung akaun iklan masing-masing.
Satu pasukan yang memiliki akaunnya sendiri tidak mendapat faedah itu, tetapi
tetap menanggung kosnya: configuration login, redirect URI, senarai peranan app,
dan satu system user yang dicipta secara automatik — yang kadangkala tidak
pernah muncul langsung.

Kalau itu keadaan anda, jana token terus:

**Business Settings → Users → System users** → pilih system user yang **sudah
memegang akaun iklan anda** → **Generate new token** → pilih app → tandakan
`ads_read` → salin.

Isikan dua env:

```
META_SYSTEM_USER_TOKEN=<token yang dijana>
META_AD_ACCOUNT_ID=act_111, act_222
```

Satu butang tambahan — **Guna token system user** — akan muncul pada tab Data.
Menekannya mengimport akaun tersebut dan menyambungkannya ke kempen.

Dua perkara yang menjadikan ini kukuh:

- **Token disulitkan semasa import**, sama seperti token OAuth. Env memegangnya
  hanya sehingga import pertama.
- **`META_AD_ACCOUNT_ID` melangkau penyenaraian akaun sepenuhnya.** Edge mana
  yang menjawab bergantung pada jenis token, dan penolakan dari edge yang salah
  tidak menyebut apa-apa yang berguna. Bila id akaun sudah diketahui, tiada
  sebab untuk bertanya.

Butang OAuth kekal di tempatnya. Kedua-dua laluan menulis baris `ad_connections`
yang sama, jadi segerak, rollback dan semua yang lain tidak tahu bezanya.

---

## Google Ads

Google memerlukan satu benda tambahan yang Meta tidak: **developer token**.

### 1. Developer token

1. Buka akaun **Google Ads Manager (MCC)** — bukan akaun iklan biasa
2. **Tools & Settings → Setup → API Center**
3. Mohon token. Status *Test Account* datang serta-merta tetapi hanya boleh
   membaca akaun ujian; untuk data sebenar mohon **Basic Access** (biasanya
   diluluskan dalam 1–3 hari bekerja)

### 2. OAuth client

Client OAuth yang sama seperti log masuk Google boleh digunakan semula —
hanya tambah callback ini pada **Authorized redirect URIs**:

```
https://ihsanku.kaizendigital.my/api/connect/google-ads/callback
```

Dan hidupkan **Google Ads API** di
[console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library).

### 3. Env

| Variable | Wajib | Nota |
|---|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | ya | daripada API Center |
| `GOOGLE_ADS_CLIENT_ID` | ya* | *jatuh balik kepada `GOOGLE_CLIENT_ID` kalau tidak diisi |
| `GOOGLE_ADS_CLIENT_SECRET` | ya* | *jatuh balik kepada `GOOGLE_CLIENT_SECRET` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | tidak | id MCC (angka sahaja, tanpa sengkang) kalau akaun dicapai melalui manager |

### Apa yang ditarik

GAQL terhadap `ad_group_ad`, satu baris per iklan per hari. Dua perangkap yang
sudah dikendalikan:

- **Kos dalam micros.** `cost_micros: 152340000` bermaksud RM152.34. Dibahagi
  dengan 1,000,000.
- **Kuartil video ialah kadar, bukan bilangan.**
  `video_quartile_p25_rate: 0.62` bermaksud 62% daripada impressions, bukan 62
  tontonan. Didarab dengan impressions supaya sepadan dengan bentuk Meta.

---

## Bagaimana penyegerakan berjalan

Tarikan pertama sebulan data harian peringkat iklan lebih besar daripada apa
yang muat dalam satu permintaan. Daripada gagal, ia dipecahkan:

1. Tempoh sasaran (30 hari) dibahagi kepada ketulan seminggu
2. Ketulan **terbaharu ditarik dahulu** — hari yang orang benar-benar lihat
3. Selepas setiap ketulan, julat yang sudah diliputi disimpan
4. Bila belanjawan masa habis, ia berhenti dan melaporkan setakat mana

Kerana julat itu disimpan selepas setiap ketulan, tarikan yang terputus
**menyambung** dan bukan bermula semula. Tekan Segerak sekali lagi, atau biarkan
cron mengambil alih.

Segerak berikutnya jauh lebih ringan: hanya hari selepas apa yang sudah
diliputi, ditambah **tiga hari tindanan** — Meta dan Google masih melaraskan
angka beberapa hari selepas fakta, jadi menganggap semalam sudah muktamad akan
membekukan nombor yang masih bergerak.

### Berapa jauh ke belakang

Lalai **180 hari**, boleh ditukar dengan `META_LOOKBACK_DAYS`.

Ia sasaran, bukan beban satu permintaan. Tetingkap ditarik berketul mingguan,
terbaharu dahulu, dan setiap larian berhenti pada belanjawan masanya dengan
julat yang diliputi disimpan — jadi 180 hari mengambil beberapa larian, bukan
satu larian panjang yang tamat masa.

Tarikan pertama berbaloi dipercepatkan dengan menekan **Segerak** beberapa kali
berturut-turut; selepas sejarah masuk, hanya tindanan harian yang bergerak.

Meta menyimpan insights selama **37 bulan**, jadi siling di sini milik kita,
bukan Meta. Naikkan `META_LOOKBACK_DAYS` kalau anda perlukan lebih jauh.

### Berjadual

`vercel.json` mendaftarkan cron setiap **2 jam** (`0 */2 * * *` — 12 kali
sehari, dalam UTC tapi itu tidak penting di sini): tiada sesiapa perlu tekan
"Segerak sekarang" secara manual lagi, nombor terus segar sepanjang hari.

> Cron Vercel dibaca dalam **UTC**, bukan waktu tempatan — tapi sebab larian
> berulang setiap 2 jam (bukan sekali sehari), ini tak lagi jadi isu sempadan
> hari macam dulu. `pendingWindows()` sentiasa tarik balik 3 hari terkini
> (`overlapDays`) pada setiap larian, jadi data hari semasa yang masih
> berubah-ubah terus dikemas kini — tak perlu tunggu hari tu "siap" dulu.

Ia memerlukan satu env:

```
CRON_SECRET=<openssl rand -base64 32>
```

Vercel menghantarnya sebagai `Authorization: Bearer …`. Tanpa env itu, endpoint
menolak semua permintaan — ia berjalan sebagai service role di luar mana-mana
sesi pengguna, jadi ia gagal tertutup.

> **Perlukan Vercel Pro.** Hobby hanya benarkan satu cron sehari — jadual
> setiap 2 jam ni tak akan berfungsi di situ. Kalau kekal di Hobby, tukar
> semula `vercel.json` kepada satu larian sehari (contoh `0 18 * * *` = 2
> pagi waktu Malaysia).

---

## Selepas menyambung

Panel di tab **Data** menyenaraikan setiap akaun yang bersambung. Untuk setiap
satu anda boleh:

- **Hadkan kepada kempen tertentu** — isikan id kempen platform, dipisah koma.
  Biarkan kosong untuk menarik seluruh akaun.
- **Buang dari kempen** — berhenti menarik, tetapi kekalkan sambungan
- **Putuskan akaun** — padam sambungan dan tokennya sekali

Setiap segerak menulis melalui writer yang sama seperti CSV, jadi **rollback
berfungsi ke atas tarikan API juga**. Menyegerak semula tempoh yang sama tidak
menggandakan apa-apa: `(creative_id, date_start, date_stop, source)` adalah
unik, jadi baris yang sama dikemas kini, bukan disisipkan.

Tetingkap lalai ialah **30 hari terakhir**. Ia sengaja bertindih: Meta dan
Google masih melaraskan angka beberapa hari selepas fakta, jadi menarik semula
hari semalam adalah betul, bukan pembaziran.

---

## Bila ada yang tak kena

**`Konfigurasi belum lengkap: …`** — panel menamakan env yang belum diisi.
Selepas mengisinya di Vercel, **redeploy**; env baharu tidak terpakai pada
deployment sedia ada.

**`Sesi tidak sepadan. Cuba lagi.`** — sesi berubah antara mula dan tamat
aliran OAuth (biasanya log masuk di tab lain). Mula semula.

**`Token system-user ini tidak nampak sebarang akaun iklan`** — akaun iklan
belum diberikan kepada **system user** itu sendiri. Ini langkah yang paling
kerap terlepas, kerana ada dua tempat berbeza yang kelihatan seperti jawapannya
dan hanya satu yang betul:

| Skrin | Apa ia buat | Cukup? |
|---|---|---|
| Business Settings → **Apps** → Connect assets | menyambung akaun iklan kepada *app* | **tidak** |
| Business Settings → **Users → System users** → Assign assets | memberi akaun iklan kepada *system user* | **ya** |

Token system-user mendapat capaiannya daripada apa yang diberikan kepada system
user itu — bukan daripada permission, dan bukan daripada apa yang app pegang.

**`Token ini tidak membawa ads_read`** — pada token *pengguna*, ini bermakna
configuration login tidak memberi permission itu. Semak langkah 2, kemudian
sambung semula selepas membuang kebenaran lama di
[business.facebook.com/settings](https://business.facebook.com/settings) →
Integrations → Business Integrations.

**`Perlu sambung semula`** pada satu sambungan — platform menolak token itu
(Meta OAuthException 190, atau Google `invalid_grant`). Klik **Sambung** sekali
lagi. Kegagalan rangkaian atau kuota **tidak** menandakan ini; ia dikira secara
eksplisit daripada kod ralat platform, bukan diteka daripada teks mesej.

**`… gagal (HTTP 403): Host not in allowlist`** — persekitaran itu menyekat
`graph.facebook.com` atau `googleads.googleapis.com` di peringkat rangkaian.
Ini bukan masalah token.
