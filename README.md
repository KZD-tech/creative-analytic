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
| **Kreatif** | Grid kad video 9:16 atau jadual padat. Tapis ikut status/tag/carian, susun ikut 8 metrik, pilih 2–4 untuk dibanding, tag pukal |
| **Kreatif → butiran** | Video, diagnosis kebocoran + cadangan tindakan, 15 metrik, lengkung keletihan (frekuensi vs CTR), editor tag |
| **Insight** | Peringkat funnel yang paling banyak makan bajet, senarai paling rugi, breakdown prestasi mengikut tag (hook/format/angle/offer) |
| **Banding** | 2–4 kreatif sisi-ke-sisi, 17 metrik, nilai terbaik setiap baris ditanda |
| **Data** | Muat naik CSV, log muat naik, rollback snapshot, tetapan benchmark, kempen baharu |

---

## Persediaan

### 1. Projek Supabase

Projek yang digunakan: **`creative-analytic`** (`yrihtfugfsodsdseqyoe`),
berasingan daripada `donor-crm`. Skema duduk dalam schema bernama `creative`,
bukan `public`.

Kedua-dua migrasi **sudah dijalankan** pada projek itu — 8 jadual (RLS
dihidupkan) dan 5 fungsi agregasi. Untuk projek baharu, jalankan fail ini
mengikut turutan dalam **SQL Editor**:

```
supabase/migrations/0001_creative_schema.sql
supabase/migrations/0002_analytics_functions.sql
```

### 2. Dedahkan schema kepada API  ← **paling kerap terlepas**

Supabase Dashboard → **Settings → API → Exposed schemas** → tambah `creative`.

PostgREST hanya melayan schema yang didedahkan. Tanpa langkah ini setiap
permintaan gagal, walaupun dengan service-role key. Dashboard akan mengesan
keadaan ini dan memaparkan skrin persediaan dengan mesej yang jelas.

### 3. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Wajib | Nota |
|---|---|---|
| `SUPABASE_URL` | ya | `https://yrihtfugfsodsdseqyoe.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Dashboard → Settings → API Keys → `service_role`. **Server sahaja** — jangan sekali-kali beri prefix `NEXT_PUBLIC_` |
| `SUPABASE_SCHEMA` | tidak | lalai `creative` |
| `APP_PASSWORD` | untuk deploy awam | kata laluan kongsi; kosong = dashboard terbuka |
| `APP_SESSION_SECRET` | jika `APP_PASSWORD` diisi | `openssl rand -base64 32` |

Semua akses Supabase berlaku di server. RLS dihidupkan pada setiap jadual
**tanpa satu pun policy**, jadi anon key tidak boleh membaca apa-apa — service
role yang dipegang server sahaja yang boleh masuk.

### 4. Jalankan

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # binaan produksi
npm test           # 23 ujian unit (parser + enjin metrik)
npm run lint
```

Untuk mengesahkan sisi SQL terhadap pangkalan data sebenar (ia berjalan dalam
transaksi yang sentiasa di-rollback):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
```

### 5. Deploy (Vercel)

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
    creatives/            kad, grid, funnel, editor tag
    data/                 muat naik, rollback, benchmark
    ui/                   primitif (Card, Badge, StatTile, Notice…)
  lib/
    ingest/               parser CSV + `adapter.ts` (bentuk data agnostik)
    db/                   client, queries, ingest writer
    metrics/              derive, benchmarks, diagnose, breakdown, summary
supabase/migrations/      schema + fungsi agregasi
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
