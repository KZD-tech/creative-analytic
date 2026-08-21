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

Keempat-empat migrasi **sudah dijalankan** pada projek itu — 10 jadual (RLS
dihidupkan, 11 policy), 5 fungsi agregasi, dan pencetus jemputan. Untuk projek
baharu, jalankan fail ini mengikut turutan dalam **SQL Editor**:

```
supabase/migrations/0001_core_schema.sql
supabase/migrations/0002_analytics_functions.sql
supabase/migrations/0003_auth_and_ownership.sql
supabase/migrations/0004_creative_copy.sql
```

### 2. Hidupkan cara log masuk

Supabase Dashboard → **Authentication → Providers**:

- **Email** — hidupkan. Untuk pasukan dalaman, matikan
  &ldquo;Confirm email&rdquo; supaya akaun terus boleh guna; pintu masuk
  sebenar ialah senarai jemputan, bukan pengesahan emel.
- **Google** — hidupkan, tampal Client ID dan Secret dari Google Cloud Console.
  Dalam Google Cloud, authorised redirect URI ialah
  `https://<ref>.supabase.co/auth/v1/callback`.

Kemudian **Authentication → URL Configuration** → Site URL: URL aplikasi anda
(contoh `http://localhost:3000` semasa pembangunan), dan tambah
`<url>/auth/callback` pada Redirect URLs.

Akaun **pertama** yang mendaftar menjadi admin. Selepas itu, jemput orang lain
di `/settings/team`.

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
| `APP_URL` | untuk deploy | asal awam, digunakan untuk redirect Google. Vercel dikesan automatik |

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
npm test           # 30 ujian unit (parser + enjin metrik + peraturan hijau)
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

Import repo, tetapkan environment variables yang sama, deploy. Tiada
konfigurasi lain diperlukan — semua halaman dirender atas permintaan.

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

## Fasa 2 — Meta Marketing API

Lapisan data sudah agnostik terhadap sumber: `creative.ad_metrics` menyimpan
`source` dan `creative.creatives` menyimpan `external_ad_id`, dan
`src/lib/ingest/adapter.ts` mentakrifkan bentuk yang mesti dihasilkan oleh
mana-mana sumber. Menambah tarikan automatik bermakna menulis **satu** penghasil
baharu; writer, enjin metrik dan seluruh UI tidak berubah.

Langkah-langkahnya ada dalam [`docs/meta-api.md`](docs/meta-api.md).
