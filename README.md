# Creative Analytic

Dashboard analitik kreatif untuk kempen Meta Ads — dibina untuk menjawab satu
soalan yang tidak dijawab oleh Ads Manager: **kenapa** sesuatu kreatif gagal,
bukan sekadar kreatif mana yang gagal.

Setiap iklan dibaca sebagai satu funnel (Hook → Hold → Klik → Landing → Derma).
Dashboard mencari peringkat pertama yang jatuh di bawah benchmark kempen anda,
dan memberitahu peringkat itulah yang perlu dibaiki — bukan peringkat yang
paling teruk, kerana semua peringkat selepasnya memang kelaparan disebabkan
kebocoran pertama itu.

Ini pengganti dashboard Cloudflare Pages sebelum ini. Lihat
[`docs/migrasi.md`](docs/migrasi.md) untuk perbandingan dan cara memindahkan
data lama.

---

## Apa yang ada

| Halaman | Fungsi |
|---|---|
| **Ringkasan** | KPI dengan perbandingan tempoh sebelumnya, graf belanja vs hasil, derma harian, kadar funnel (4 panel), ringkasan kebocoran, kreatif teratas |
| **Laporan** | Lapan laporan templat, dropdown kumpulan, pemilih metrik, tiga mod paparan (grid/carta/jadual), tag pukal dan pemilihan untuk banding |
| **Laporan → butiran** | Video, diagnosis kebocoran + cadangan tindakan, 15 metrik, lengkung keletihan (frekuensi vs CTR), editor tag |
| **Insight** | Peringkat funnel yang paling banyak makan bajet, senarai paling rugi, breakdown prestasi mengikut tag (hook/format/angle/offer) |
| **Banding** | 2–4 kreatif sisi-ke-sisi, 17 metrik, nilai terbaik setiap baris ditanda |
| **Data** | Muat naik CSV, log muat naik, rollback snapshot, tetapan benchmark, kempen baharu |

### Laporan templat

Setiap laporan ialah pandangan berbeza ke atas data yang sama, dengan metrik
dan susunan lalainya sendiri.

| Laporan | Satu baris ialah | Perlukan |
|---|---|---|
| Top Creatives | satu iklan | eksport Ads Manager |
| Top Landing Pages | satu halaman destinasi (URL dikumpul tanpa UTM) | lajur `Link` |
| Top Body Copy | satu teks utama, walau dipakai banyak iklan | lajur `Body` |
| Top Headlines | satu tajuk | lajur `Title` |
| Top Videos | satu iklan video | CSV pautan video |
| Top Images | satu iklan imej | CSV pautan video |
| Top Hooks | satu tag hook, merangkumi semua iklan yang memakainya | tag hook |
| Video Retention | satu iklan dengan data tontonan | lajur `Video plays at 25%…100%` |

Laporan yang datanya tiada tetap boleh diklik — ia menerangkan lajur mana yang
perlu ditambah, bukan sekadar memaparkan grid kosong.

**Peraturan nilai hijau.** Metrik yang ada benchmark kempen (ROAS, CTR, CVR,
hook, hold, kadar LPV) bertukar hijau apabila mencapai benchmark itu — mutlak,
dan jawapannya sama tanpa mengira apa lagi di skrin. Metrik lain yang ada arah
&ldquo;lebih baik&rdquo; (CPA, CPM, hasil, derma) hijau apabila berada dalam
kuartil terbaik hasil yang sedang dipaparkan. Kalau peraturan relatif itu akan
menyerlahkan **setiap** baris — contohnya semua seri — ia digugurkan, kerana
menyerlahkan semuanya sama dengan tidak memberitahu apa-apa. Belanja dan
impresi tidak pernah diserlahkan.

### Akaun

- **Jemputan sahaja.** Pencetus pangkalan data menolak mana-mana pendaftaran
  yang emelnya tiada dalam senarai jemputan, sama ada melalui kata laluan
  atau Google. Ini berlaku di dalam pangkalan data, bukan di dalam borang.
- **Akaun pertama menjadi admin** dan boleh menjemput orang lain di
  `/settings/team`.
- **Setiap pengguna nampak kempen sendiri sahaja.** Ini dikuatkuasakan oleh
  row-level security, bukan oleh kod aplikasi — jadi penapis yang terlupa
  dalam kod tidak boleh membocorkan kempen orang lain.
  `supabase/tests/rls.sql` membuktikannya.

---

## Persediaan

### 1. Projek Supabase

Projek yang digunakan: **`creative-analytic`** (`yrihtfugfsodsdseqyoe`),
berasingan daripada `donor-crm`. Jadual duduk dalam schema **`public`**, yang
Supabase dedahkan kepada API secara lalai — jadi tiada langkah "Exposed
schemas", dan Table Editor terus menunjukkan jadual-jadual ini.

Kesemua migrasi **sudah dijalankan** pada projek itu — 12 jadual (RLS
dihidupkan pada setiap satu), 5 fungsi agregasi, dan pencetus jemputan. Untuk
projek baharu, jalankan fail ini mengikut turutan dalam **SQL Editor**:

```
supabase/migrations/0001_core_schema.sql
supabase/migrations/0002_analytics_functions.sql
supabase/migrations/0003_auth_and_ownership.sql
supabase/migrations/0004_creative_copy.sql
supabase/migrations/0005_ad_connections.sql
supabase/migrations/0006_tighten_function_grants.sql
supabase/migrations/0007_sync_cursor.sql
supabase/migrations/0008_api_keys.sql
```

Selepas menjalankannya, **Advisors → Security** sepatutnya bersih kecuali dua
perkara yang memang dijangka: `is_admin()` boleh dipanggil oleh pengguna yang
sudah log masuk (policy `invites_admin_all` memerlukannya, dan ia hanya
menjawab tentang pemanggil sendiri), dan `rls_auto_enable()` milik platform
Supabase sendiri — ia mengembalikan `event_trigger`, jadi PostgREST tidak boleh
memanggilnya walaupun lint mengatakan sebaliknya.

Satu tetapan yang berbaloi dihidupkan sendiri: **Authentication → Policies →
Leaked password protection**. Ia menyemak kata laluan baharu terhadap
HaveIBeenPwned dan menolak yang sudah bocor.

### 2. Hidupkan cara log masuk

Skrin log masuk hanya menawarkan cara yang benar-benar hidup — ia bertanya
Supabase (`/auth/v1/settings`) dahulu. Kalau Google belum dihidupkan, butangnya
tidak dipaparkan langsung, dan satu nota memberitahu di mana hendak
menghidupkannya. Ini mengelakkan jalan buntu: menekan butang Google pada projek
yang providernya dimatikan akan menghantar anda ke JSON mentah GoTrue —
`{"code":400,"error_code":"validation_failed","msg":"Unsupported provider:
provider is not enabled"}` — di domain Supabase, tanpa jalan kembali.

#### Emel + kata laluan

Supabase Dashboard → **Authentication → Providers → Email** → hidupkan. Untuk
pasukan dalaman, matikan &ldquo;Confirm email&rdquo; supaya akaun terus boleh
guna; pintu masuk sebenar ialah senarai jemputan, bukan pengesahan emel.

#### Google

**Di Google Cloud Console** (console.cloud.google.com):

1. Cipta atau pilih satu projek.
2. **APIs & Services → OAuth consent screen** → **Get started**, pilih jenis
   **External**, dan lengkapkan langkahnya.
3. **APIs & Services → Credentials** → **Create Credentials** → **OAuth client
   ID** → jenis aplikasi **Web application**.
4. Di bawah **Authorised redirect URIs**, tambah:
   `https://yrihtfugfsodsdseqyoe.supabase.co/auth/v1/callback`
   — ini URL Supabase, **bukan** URL aplikasi anda. Ini yang paling kerap
   tersilap.
5. **Create**, kemudian salin Client ID dan Client Secret.

**Di Supabase** → **Authentication → Providers → Google** → hidupkan, tampal
Client ID dan Secret, simpan.

Muat semula halaman log masuk sekali atau dua — butang Google akan muncul
(status provider di-cache selama 30 saat).

#### URL

**Authentication → URL Configuration**:

**Site URL** — satu nilai sahaja. Ini destinasi lalai selepas log masuk apabila
tiada redirect lain dinyatakan.

| Anda jalankan di | Site URL |
|---|---|
| Produksi | `https://ihsanku.kaizendigital.my` |
| Komputer sendiri | `http://localhost:3000` |

**Redirect URLs** — boleh banyak, dan menyokong wildcard. Tambah setiap tempat
aplikasi berjalan:

```
https://ihsanku.kaizendigital.my/auth/callback
http://localhost:3000/auth/callback
https://creative-analytic-*.vercel.app/auth/callback
```

Baris ketiga meliputi preview deployment Vercel. Preview **kekal** pada domain
`vercel.app` walaupun produksi sudah bertukar kepada domain tersuai, dan
URL-nya berubah setiap kali anda push — jadi entri wildcard itu masih
diperlukan. Tanpa itu, log masuk pada preview ditolak dengan
`requested path is invalid`.

Aplikasi membina redirect ini sendiri melalui `siteUrl()`:

1. `APP_URL` kalau diset — inilah yang digunakan untuk domain tersuai
2. Domain produksi Vercel yang stabil, bila `VERCEL_ENV=production`
3. URL deployment Vercel, untuk preview
4. `http://localhost:3000`

Kerana domain tersuai **tidak** muncul dalam `VERCEL_PROJECT_PRODUCTION_URL`,
`APP_URL` mesti diset supaya langkah 1 mengambil alih. Tetapkannya pada
environment **Production sahaja** — kalau ia dikongsi dengan Preview, setiap
preview akan menghantar orang balik ke produksi dan anda tidak akan dapat
menguji log masuk pada preview langsung.

Akaun **pertama** yang mendaftar menjadi admin. Selepas itu, jemput orang lain
di `/settings/team`.

<details>
<summary>Mencipta akaun pertama terus dalam pangkalan data (fallback)</summary>

Cara biasa ialah mendaftar melalui aplikasi, atau Supabase Dashboard →
Authentication → Users → Add user. Kalau kedua-duanya tidak tersedia, akaun
boleh dicipta terus melalui SQL Editor:

```sql
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    -- GoTrue membaca lajur token ini sebagai Go string; NULL di sini akan
    -- menggagalkan log masuk dengan "converting NULL to string is unsupported".
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token,
    phone_change, phone_change_token,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated',
    'nama@syarikat.com',
    extensions.crypt('kata-laluan-anda', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Nama Penuh"}'::jsonb,
    '', '', '', '', '', '', '', '',
    now(), now()
  )
  returning id, email
)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), nu.id, nu.id::text,
       jsonb_build_object('sub', nu.id::text, 'email', nu.email,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from new_user nu;
```

Sahkan kata laluan benar-benar sah — ini pengiraan yang sama dilakukan GoTrue
semasa log masuk:

```sql
select email,
       encrypted_password = extensions.crypt('kata-laluan-anda', encrypted_password) as sah
  from auth.users where email = 'nama@syarikat.com';
```

Pencetus jemputan tetap terpakai: kalau `public.profiles` sudah tidak kosong,
emel itu perlu ada dalam `public.invites` dahulu.

</details>

### 3. Berkongsi projek dengan aplikasi lain (pilihan)

Kalau satu hari projek Supabase ini perlu dikongsi dengan aplikasi lain,
pindahkan jadual ke schema tersendiri, tetapkan `SUPABASE_SCHEMA` kepada nama
itu, dan tambah nama itu di Dashboard → Settings → API → **Exposed schemas**.
PostgREST hanya melayan schema yang didedahkan, walaupun dengan service-role
key. Kalau langkah itu terlepas, dashboard akan memaparkan skrin persediaan
yang menyebutnya secara khusus.

### 4. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Wajib | Nota |
|---|---|---|
| `SUPABASE_URL` | ya | `https://yrihtfugfsodsdseqyoe.supabase.co` |
| `SUPABASE_ANON_KEY` | ya | Dashboard → Settings → API Keys → `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Dashboard → Settings → API Keys → `service_role` |
| `SUPABASE_SCHEMA` | tidak | lalai `public`. Set hanya jika jadual dipindahkan ke schema lain |
| `APP_URL` | tidak | hanya untuk domain tersuai. Vercel dikesan automatik, jadi biarkan kosong di sana |

Untuk menyambung akaun iklan terus (pilihan — muat naik CSV berfungsi tanpa
semua ini):

| Variable | Untuk | Nota |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | kedua-dua | `openssl rand -base64 32`. Wajib sebelum mana-mana butang sambung muncul |
| `META_APP_ID` | Meta Ads | App Dashboard → Settings → Basic |
| `META_APP_SECRET` | Meta Ads | tempat sama |
| `META_LOGIN_CONFIG_ID` | Meta Ads | hanya untuk app "Facebook Login for Business" — iaitu semua app baharu |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads | Google Ads MCC → API Center |
| `GOOGLE_ADS_CLIENT_ID` | Google Ads | jatuh balik kepada `GOOGLE_CLIENT_ID` |
| `GOOGLE_ADS_CLIENT_SECRET` | Google Ads | jatuh balik kepada `GOOGLE_CLIENT_SECRET` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Google Ads | hanya kalau akaun dicapai melalui manager (MCC) |

Panel di tab Data menamakan variable yang belum diisi, jadi tidak perlu
meneka mana satu yang tertinggal. Langkah penuh:
[`docs/sambungan-akaun.md`](docs/sambungan-akaun.md).

**Tiada satu pun bernama `NEXT_PUBLIC_`, dan itu disengajakan.** Log masuk —
termasuk redirect Google — dipandu dari server action, jadi tiada kredential
Supabase sampai ke pelayar dan pelayar tidak pernah bercakap terus dengan
Supabase. Ini disahkan dengan membina versi produksi menggunakan nilai
sentinel dan mencarinya dalam `.next/static`: sifar padanan.

Aplikasi menyambung sebagai **pengguna yang log masuk**, bukan sebagai service
role. Row-level security yang menentukan baris mana kelihatan. Service-role key
hanya untuk sistem akaun, tidak pernah untuk data kempen.

### 5. Jalankan

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # binaan produksi
npm test           # 120 ujian unit (parser, metrik, proxy, auth, penyulitan, adapter platform)
npm run lint
```

Dua ujian SQL mengesahkan sisi pangkalan data. Kedua-duanya berjalan dalam
transaksi yang sentiasa di-rollback, jadi selamat dijalankan terhadap
pangkalan data sebenar:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql  # agregasi
psql "$DATABASE_URL" -f supabase/tests/rls.sql                       # pengasingan
```

`rls.sql` ialah bukti untuk dakwaan keselamatan: ia mencipta dua pengguna,
memberi satu kempen kepada setiap seorang, kemudian mengesahkan bahawa setiap
pengguna hanya nampak kempennya sendiri, bahawa fungsi agregasi tidak
membocorkan kempen orang lain, bahawa menulis ke kempen orang lain ditolak,
dan bahawa permintaan tanpa log masuk tidak nampak apa-apa.

### 6. Deploy (Vercel)

Deployment semasa: **https://ihsanku.kaizendigital.my**

1. Import repo. Production branch ialah `claude/creative-dashboard-design-m5hi38`
   — repo ini belum ada `main`.
2. **Settings → Domains** → tambah `ihsanku.kaizendigital.my`, kemudian buat
   rekod DNS yang Vercel tunjukkan pada penyedia domain `kaizendigital.my`
   (biasanya satu rekod `CNAME` menghala ke `cname.vercel-dns.com`).
3. **Settings → Environment Variables** → tambah `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY`, tandakan Production.
   Tambah juga `APP_URL=https://ihsanku.kaizendigital.my` — **Production
   sahaja**, jangan tandakan Preview.
4. **Redeploy.** Perubahan environment variable **tidak** terpakai pada
   deployment yang sudah wujud — ini punca paling biasa bila env sudah diisi
   tetapi ralat lama masih muncul.

Tiada konfigurasi lain diperlukan; semua halaman dirender atas permintaan.

---

## Aliran data

```
Ads Manager CSV  ─┐
Onpay CSV        ─┼─→ parser (alias lajur, derive, dedupe) ─→ creative.ad_metrics
Video links CSV  ─┘                                          creative.conversions
Meta API (fasa 2)─┘                                          creative.creatives
```

### Meta Ads export

Eksport di **peringkat iklan**. Dalam Ads Manager pilih **Reports → Breakdown →
By Day** — tanpa pecahan harian semua graf trend belanja akan kosong (sisi derma
tetap ada garis masa kerana setiap derma bawa timestamp sendiri).

Parser menerima nama lajur Meta yang berbeza-beza melalui senarai alias, dan
**membina semula kiraan yang tiada daripada lajur kadar atau kos**:

| Tiada lajur | Dibina daripada |
|---|---|
| Link clicks | CTR (link) × Impressions, atau Spend ÷ CPC |
| Clicks (all) | CTR (all) × Impressions |
| Landing page views | Spend ÷ Cost per landing page view |
| 3-second video plays | Hook Hold Rate × Impressions |
| Purchases conversion value | Purchase ROAS × Spend |

Jadi eksport gaya template lama pun tetap menghasilkan funnel yang lengkap.

### Onpay / derma

Lajur `Tambahan #3` dibaca sebagai `Kempen | Adset | Iklan`; segmen terakhir
dipadankan dengan nama iklan. Derma yang belum ada iklannya akan dipadankan
semula secara automatik selepas muat naik Meta Ads yang seterusnya.

**Tiada PII disimpan.** Nama dan emel penderma dibaca lalu dibuang — analitik
kreatif tidak memerlukannya, dan ini bermakna schema ini bukan salinan kedua
CRM anda.

Cap masa Onpay tiada offset, jadi ia diselesaikan mengikut zon waktu kempen.
Tanpa ini derma pukul 00:30 di Malaysia akan jatuh pada hari sebelumnya dalam
setiap graf.

### Muat naik semula & rollback

- Metrik iklan di-upsert pada `(creative, date_start, date_stop, source)` —
  muat naik fail yang sama dua kali tidak menggandakan apa-apa.
- Derma di-dedupe pada nombor resit, atau pada digest kandungan baris jika
  eksport tiada nombor resit.
- Setiap muat naik Meta Ads atau derma menyimpan snapshot keadaan sebelumnya.
  Lima snapshot terkini dikekalkan bagi setiap jenis, boleh dipulihkan dengan
  satu klik di tab Data.
- Jika satu kreatif mempunyai baris harian **dan** baris tempoh, hanya baris
  harian digunakan. Tanpa peraturan ini, memuat naik eksport harian di atas
  eksport ringkasan akan menggandakan setiap metrik.

---

## Metrik & benchmark

| Metrik | Formula |
|---|---|
| Hook rate | 3-second plays ÷ impressions |
| Hold rate | ThruPlays ÷ impressions |
| CTR (link) | link clicks ÷ impressions |
| Kadar LPV | landing page views ÷ **link clicks** |
| CVR | derma ÷ **landing page views** |
| ROAS | hasil ÷ belanja |
| CPA | belanja ÷ derma |
| Purata derma | hasil ÷ derma |
| Frekuensi | impressions ÷ reach (anggaran — reach tidak boleh dijumlahkan merentas hari) |

Benchmark lalai (boleh diubah setiap kempen di tab Data):

| | Baik | Sederhana |
|---|---|---|
| Hook rate | 20% | 15% |
| Hold rate | 5% | 3% |
| CTR | 3% | 2% |
| Kadar LPV | 60% | 40% |
| CVR | 10% | 5% |
| ROAS | 1.0x | 0.5x |
| Belanja minimum | RM 50 | — |

Di bawah belanja minimum, kreatif dilabel "Belum cukup data" dan **tidak**
didiagnosis — menilai kreatif dengan belanja RM 12 hanya menghasilkan bunyi.

Kadar dalam breakdown tag sentiasa dikira semula daripada jumlah kiraan, tidak
pernah dipurata daripada kadar per-kreatif. Purata kadar akan membiarkan iklan
dengan 200 impresi menandingi iklan dengan 200,000.

---

## Struktur kod

```
src/
  app/                    halaman (App Router) + server actions
  components/
    charts/               chart-kit (palet, tooltip, jadual) + graf
    reports/              sidebar laporan, pemilih metrik, kad/jadual/carta
    creatives/            media, funnel, editor tag
    data/                 muat naik, rollback, benchmark
    nav/                  penukar kempen, julat tarikh, menu akaun
    ui/                   primitif (Card, Badge, StatTile, Notice…)
  lib/
    auth/                 pembantu sesi (currentUser, requireUser, requireAdmin)
    ingest/               parser CSV + `adapter.ts` (bentuk data agnostik)
    db/                   client berskop pengguna, queries, ingest writer
    metrics/              derive, benchmarks, diagnose, catalog, rollup
    reports.ts            takrifan lapan laporan templat
supabase/migrations/      schema, fungsi, auth + RLS, lajur copy
supabase/tests/           smoke.sql (agregasi) + rls.sql (pengasingan)
tests/                    ujian unit parser & enjin metrik
```

Agregasi berat berlaku dalam Postgres (`creative.creative_performance`,
`daily_series`, `campaign_summary`); kadar terbitan dikira dalam TypeScript, di
mana ia murah untuk diubah dan senang diuji.

---

## Bila ada yang tak kena

**`Minified React error #441`** — ini bukan pepijat khusus. React 19 menyembunyikan
mesej ralat sisi-pelayan daripada pelayar dalam binaan produksi dan
menggantikannya dengan nombor. **Ralat sebenar ada dalam log pelayan**: terminal
tempat `npm run start` berjalan, atau tab *Logs* di Vercel. Skrin ralat aplikasi
memaparkan `digest` supaya anda boleh mencarinya dalam log itu.

Punca paling biasa ialah environment variable yang belum diisi. Aplikasi kini
mengesan ini lebih awal — kalau `SUPABASE_URL` atau `SUPABASE_ANON_KEY` tiada,
setiap permintaan dihalakan ke skrin persediaan yang menamakan pembolehubah yang
hilang, bukan dibiarkan menjadi ralat bernombor.

**Log masuk berpusing balik ke `/login`** — periksa Site URL dan Redirect URLs di
Supabase → Authentication → URL Configuration. Untuk Google, pastikan
`https://<ref>.supabase.co/auth/v1/callback` ada dalam authorised redirect URI di
Google Cloud Console.

**`Unsupported provider: provider is not enabled`** — provider itu belum
dihidupkan di Supabase → Authentication → Providers. Ikut langkah di bahagian
persediaan di atas. Selepas dihidupkan, muat semula halaman log masuk sekali
atau dua supaya cache status provider (30 saat) menyegar.

**`Emel ini tiada jemputan`** — memang dijangka. Tambah emel itu di
`/settings/team` dahulu, atau, kalau ini akaun pertama, pastikan jadual
`public.profiles` masih kosong supaya ia boleh bootstrap sebagai admin.

---

## API untuk ejen

Dashboard menerima data dari luar melalui `/api/v1/` — direka untuk satu ejen
yang menarik derma dari Onpay, memadankannya dengan iklan, dan menghantarnya
masuk, menggantikan muat naik CSV manual.

Kunci dicipta di **Kunci API** dalam menu akaun. Setiap kunci mewakili satu
akaun, boleh dihadkan kepada satu kempen, dan dipaparkan sekali sahaja — hanya
cincangan SHA-256 yang disimpan.

Tiga endpoint: senarai kempen, senarai kreatif untuk dipadankan, dan hantar
derma. Baris dari API disimpan dengan `source: 'api'`, berasingan daripada CSV,
supaya rollback hamparan tidak memadam kerja ejen bersamanya.

Butiran penuh, contoh `curl` dan nota keselamatan: [`docs/api.md`](docs/api.md).

---

## Sambungan akaun iklan

Selain muat naik CSV, dashboard boleh menarik data terus daripada **Meta Ads**
dan **Google Ads** — sambungan baca-sahaja, seperti Madgicx.

Kedua-dua sumber melalui writer yang sama seperti CSV, jadi snapshot, rollback,
padanan kreatif dan dedupe berfungsi serupa. `src/lib/ingest/adapter.ts`
mentakrifkan bentuk (`NormalizedAdMetric`) yang mesti dihasilkan oleh mana-mana
sumber; menambah platform ketiga bermakna menulis satu penghasil baharu dan
tidak menyentuh apa-apa yang lain.

Token disulitkan (AES-256-GCM) sebelum disimpan, dan lajur token tidak pernah
dipilih oleh kod yang merender halaman.

Langkah persediaan penuh untuk kedua-dua platform, termasuk kenapa app Meta
tidak memerlukan App Review untuk kegunaan dalaman:
[`docs/sambungan-akaun.md`](docs/sambungan-akaun.md).
