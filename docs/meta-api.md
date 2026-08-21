# Fasa 2 — sambungan Meta Marketing API

Muat naik CSV berfungsi hari ini dan tidak akan hilang. Dokumen ini menerangkan
apa yang perlu ditambah untuk menarik data secara automatik, dan kenapa
perubahan itu kecil.

## Kenapa ia kecil

`src/lib/ingest/adapter.ts` mentakrifkan tiga bentuk data — `NormalizedAdMetric`,
`NormalizedConversion`, `NormalizedMediaLink`. Parser CSV menghasilkan bentuk
itu; writer dalam `src/lib/db/ingest.ts` menerima bentuk itu. Tiada apa-apa di
antara mereka yang tahu tentang CSV.

Jadual `creative.ad_metrics` pula sudah menyimpan `source` (`csv` atau
`meta_api`) sebagai sebahagian daripada kunci unik, dan `creative.creatives`
menyimpan `external_ad_id`. Dua sumber boleh hidup bersama tanpa berlanggar,
dan setiap sumber boleh di-rollback secara berasingan.

Kerja yang tinggal ialah **satu fail** yang menukar respons Insights API kepada
`NormalizedAdMetric[]`, dan satu jadual cron yang memanggilnya.

## Apa yang diperlukan di pihak Meta

1. **Meta App** (jenis Business) di developers.facebook.com.
2. **System User** dalam Business Manager, diberi akses kepada ad account.
3. **Token** system user yang tidak luput, dengan permission:
   - `ads_read` — wajib
   - `business_management` — jika ad account diurus melalui Business Manager
4. **App Review** untuk `ads_read` sebelum boleh guna di luar senarai penguji.
   Ini bahagian yang paling lama; mohon awal.

Isi ke dalam environment (tempat kosong sudah ada dalam `.env.example`):

```
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=act_xxxxxxxxxxxx
```

## Panggilan yang diperlukan

Satu endpoint sahaja — Insights, di peringkat iklan, dengan pecahan harian:

```
GET https://graph.facebook.com/v21.0/{ad_account_id}/insights
  ?level=ad
  &time_increment=1
  &time_range={"since":"2026-03-01","until":"2026-03-31"}
  &fields=ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,
          frequency,clicks,inline_link_clicks,actions,action_values,
          video_play_actions,video_thruplay_watched_actions,
          video_p25_watched_actions,video_p50_watched_actions,
          video_p75_watched_actions,video_p100_watched_actions
  &limit=500
```

Nota pemetaan:

| Medan Meta | Medan dalaman |
|---|---|
| `spend`, `impressions`, `reach`, `frequency` | terus |
| `inline_link_clicks` | `link_clicks` |
| `clicks` | `clicks_all` |
| `actions` → `landing_page_view` | `landing_page_views` |
| `video_play_actions` | `video_3s_views` |
| `video_thruplay_watched_actions` | `video_thruplays` |
| `action_values` → `purchase` | `platform_revenue` |
| `date_start`, `date_stop` | terus (sama apabila `time_increment=1`) |
| `ad_id` | `external_ad_id` |

`actions` dan `action_values` ialah array `{action_type, value}` — pilih
mengikut `action_type`, jangan bergantung pada susunan.

## Bentuk kod yang dicadangkan

```ts
// src/lib/ingest/metaApi.ts
export async function fetchMetaInsights(
  accountId: string,
  token: string,
  window: { since: string; until: string },
): Promise<IngestResult<NormalizedAdMetric>> {
  // 1. paginate melalui data.paging.next
  // 2. petakan setiap baris kepada NormalizedAdMetric
  // 3. kumpulkan amaran untuk medan yang tiada
}
```

Kemudian, dalam satu route handler atau cron job:

```ts
const parsed = await fetchMetaInsights(accountId, token, window);
await writeAdMetrics(campaignId, parsed.items, {
  source: 'meta_api',        // <- satu-satunya perbezaan daripada laluan CSV
  filename: null,
  skipped: parsed.skipped,
  warnings: parsed.warnings,
});
```

Selebihnya — snapshot, rollback, log, padanan kreatif, `first_seen`/`last_seen`
— sudah dikendalikan oleh writer.

## Perkara yang perlu diberi perhatian

- **Rate limit.** Insights API mengehadkan mengikut ad account. Tarik sekali
  sehari untuk 3 hari kebelakangan (bukan keseluruhan sejarah); upsert akan
  mengemas kini baris sedia ada dengan bersih.
- **Attribution window.** Angka Meta berubah selama beberapa hari selepas
  tarikh. Menarik semula 3 hari kebelakangan menangkap penyesuaian itu.
- **Hasil daripada Meta ≠ hasil daripada Onpay.** `platform_revenue` disimpan
  berasingan daripada `conversions.amount`. Dashboard mengira ROAS daripada
  derma Onpay yang sebenar; angka Meta ada untuk perbandingan, bukan untuk
  menggantikannya.
- **Token.** Simpan sebagai environment variable sahaja. Jangan sekali-kali
  hantar ke pelayar dan jangan commit ke repo.
