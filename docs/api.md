# API — untuk Hermes dan ejen lain

Dashboard ini boleh menerima data dari luar. Kes yang direka untuknya: satu ejen
menarik derma dari Onpay, memadankannya dengan iklan, dan menghantarnya masuk —
menggantikan muat naik CSV manual.

Semua endpoint di bawah `/api/v1/`, dan semuanya memerlukan kunci API.

---

## Kunci

Cipta di **Kunci API** (menu akaun, bawah sekali). Setiap kunci:

- mewakili **satu akaun** — ia hanya nampak kempen yang akaun itu miliki
- boleh **dihadkan kepada satu kempen**, atau dibiarkan terbuka
- membawa kebenaran **read**, **write**, atau kedua-duanya
- **dipaparkan sekali sahaja**. Hanya cincangan SHA-256 disimpan, jadi ia tidak
  boleh dibaca semula — bukan oleh anda, bukan oleh kami, dan bukan oleh sesiapa
  yang mendapat salinan pangkalan data

Hantar pada setiap permintaan:

```
Authorization: Bearer ca_live_xxxxxxxxxxxxxxxx
```

Kunci yang salah dan kunci yang sudah dibatalkan memberi jawapan yang **sama**.
Membezakannya akan memberitahu penyerang kunci mana pernah wujud.

---

## Aliran biasa

```
1. GET  /api/v1/creatives     → senarai iklan
2. (ejen menarik Onpay, memadankan sendiri)
3. POST /api/v1/conversions   → hantar derma yang sudah dipadankan
```

---

## `GET /api/v1/campaigns`

Kempen yang kunci ini boleh capai.

```bash
curl -H "Authorization: Bearer $KEY" \
  https://ihsanku.kaizendigital.my/api/v1/campaigns
```

```json
{
  "ok": true,
  "campaigns": [
    { "id": "rumah-padi", "name": "Rumah Padi", "currency": "MYR",
      "timezone": "Asia/Kuala_Lumpur", "status": "active" }
  ]
}
```

---

## `GET /api/v1/creatives`

Senarai iklan untuk dipadankan. Parameter `?campaign=<id>` diperlukan kecuali
kunci itu sudah terhad kepada satu kempen.

```bash
curl -H "Authorization: Bearer $KEY" \
  "https://ihsanku.kaizendigital.my/api/v1/creatives?campaign=rumah-padi"
```

```json
{
  "ok": true,
  "campaign_id": "rumah-padi",
  "count": 50,
  "creatives": [
    {
      "id": "33bc6235-…",
      "ad_name": "Video A — Hook Ibu",
      "ad_name_key": "video a - hook ibu",
      "adset_name": "Adset A",
      "external_ad_id": "23850001",
      "headline": "Bantu Rumah Padi",
      "body_copy": "Setiap RM10 memberi sepinggan nasi.",
      "landing_url": "https://ihsanku.my/derma",
      "media_url": "https://scontent…jpg",
      "first_seen": "2026-07-24",
      "last_seen": "2026-08-22"
    }
  ]
}
```

**Padankan menggunakan `ad_name_key`, bukan `ad_name`.** Itu bentuk ternormal
yang dashboard sendiri padankan — huruf kecil, ruang dimampatkan, tanda baca
dibuang. Ejen yang membandingkan dengannya mendapat jawapan yang sama seperti
dashboard, bukannya mencipta semula peraturan itu dan tidak bersetuju dengannya.

---

## `POST /api/v1/conversions`

Hantar derma yang sudah dipadankan. Maksimum **1,000** setiap permintaan.

```bash
curl -X POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "rumah-padi",
    "donations": [
      {
        "external_id": "ONP-1001",
        "occurred_at": "2026-08-20T09:15:00+08:00",
        "amount": 50,
        "channel": "Facebook (new)",
        "attribution_raw": "Rumah Padi | Adset A | Video A",
        "ad_name": "Video A — Hook Ibu"
      }
    ]
  }' \
  https://ihsanku.kaizendigital.my/api/v1/conversions
```

| Medan | Wajib | Nota |
|---|---|---|
| `external_id` | tidak, **tetapi hantar ia** | nombor resit Onpay. Lihat nota idempotensi |
| `occurred_at` | ya | ISO 8601 **dengan zon waktu** — `+08:00`, bukan masa telanjang |
| `amount` | ya | nombor, bukan string. Tidak boleh negatif |
| `channel` | tidak | contoh `"Facebook (new)"` |
| `attribution_raw` | tidak | rentetan asal yang ejen padankan — disimpan untuk audit |
| `ad_name` | tidak | keputusan padanan ejen. Tanpanya, derma dikira di peringkat kempen sahaja |

Jawapan:

```json
{
  "ok": true,
  "campaign_id": "rumah-padi",
  "received": 3,
  "inserted": 3,
  "updated": 0,
  "skipped": 0,
  "warnings": ["1 derma tidak dapat dipadankan dengan kreatif — ia dikira di peringkat kempen sahaja."],
  "batch_id": "93c38615-…"
}
```

### Idempotensi

Menghantar semula derma yang sama **tidak** menggandakannya. Kunci unik ialah
`(campaign_id, source, dedupe_key)`, dan `dedupe_key` datang daripada
`external_id` apabila ia ada.

Tanpa `external_id`, ia jatuh balik kepada cincangan kandungan baris itu
sendiri — jadi jumlah yang dibetulkan akan dibaca sebagai **derma kedua**.
Hantar nombor resit.

Aliran yang selamat: ejen boleh menghantar semula 7 hari terakhir setiap kali ia
berjalan. Yang sudah ada dikemas kini, yang baharu disisipkan, tiada yang
digandakan.

### Sumber berasingan

Baris dari API disimpan dengan `source: 'api'`, berasingan daripada `'csv'`.

Ini bukan label sahaja: rollback CSV mengembalikan snapshot baris **bersumber
CSV**. Kalau API berkongsi sumber yang sama, memutar balik satu hamparan akan
memadam kerja ejen bersamanya, secara senyap.

---

## `DELETE /api/v1/conversions`

Membuang derma yang ejen hantar, supaya larian yang tersilap boleh dibetulkan
dan bukannya ditanggung.

**Dua bentuk.** Guna resit bila anda tahu baris mana; guna julat bila
keseluruhan larian perlu diundur.

```bash
# Mengikut resit — tepat
curl -X DELETE -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"campaign_id":"im-1","external_ids":["ONP-1001","ONP-1002"]}' \
  https://ihsanku.kaizendigital.my/api/v1/conversions

# Mengikut julat — memerlukan confirm
curl -X DELETE -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"campaign_id":"im-1","from":"2026-08-01","to":"2026-08-31","confirm":true}' \
  https://ihsanku.kaizendigital.my/api/v1/conversions
```

```json
{ "ok": true, "campaign_id": "im-1", "deleted": 2, "matched_by": "external_ids" }
```

| Medan | Nota |
|---|---|
| `external_ids` | maksimum 1,000. Tidak boleh digabung dengan julat |
| `from` / `to` | kedua-duanya **inklusif**. Tidak boleh digabung dengan resit |
| `confirm` | wajib `true` untuk julat sahaja |

### Tiga had yang menjadikannya selamat diberi kepada mesin

**Hanya baris yang ditulis melalui API ini disentuh.** Muat naik CSV ialah kerja
seseorang secara sengaja; ejen tidak boleh memadamnya dengan tersilap julat
tarikh. Ini disahkan: padam julat sebulan penuh meninggalkan baris CSV utuh.

**Padam mengikut julat memerlukan `confirm: true`.** Menamakan resit sudah pun
satu pernyataan niat. Menamakan sebulan bukan — dan bulan yang tersilap ialah
kesilapan yang berbaloi dibuat mahal.

**Bilangan dipulangkan.** Ejen boleh menyemak kerosakan sepadan dengan apa yang
ia berniat undur, dan berhenti kalau tidak.

### Betulkan larian yang tersilap

```
1. DELETE mengikut julat larian itu, dengan confirm
2. POST semula data yang betul
```

Tidak perlu berhati-hati tentang pertindihan — `external_id` menjadikan
penghantaran semula idempoten.

---

## Ralat

Setiap jawapan membawa `ok`. Bercabang pada medan itu, bukan pada kod status.

```json
{ "ok": false, "error": "Kunci ini terhad kepada kempen rumah-padi." }
```

| Kod | Maksud |
|---|---|
| `401` | kunci tiada, salah, atau sudah dibatalkan |
| `403` | kunci tiada kebenaran itu, atau ditujukan ke kempen lain |
| `422` | padam: bentuk salah, julat tanpa `confirm`, atau resit **dan** julat diberi serentak |
| `404` | kempen tidak wujud, **atau** bukan milik akaun kunci itu |
| `422` | bentuk data salah — `issues[]` menamakan medan mana |
| `500` | pangkalan data menolak tulisan itu |

`404` sengaja tidak membezakan "tidak wujud" daripada "bukan milik anda". Kalau
ia membezakannya, API ini boleh digunakan untuk menyenaraikan id kempen orang
lain.

---

## Nota keselamatan

Kunci API memintas log masuk, jadi ia memintas row-level security juga —
endpoint ini berjalan sebagai service role dan menapis mengikut pemilik kunci
dalam kod. Itu menjadikan **skop kunci satu-satunya perkara yang memisahkan satu
akaun daripada akaun lain**.

Ikutannya:

- Beri kunci **kebenaran paling sedikit** yang mencukupi. Ejen yang hanya
  menghantar derma tidak memerlukan `read`
- **Hadkan kepada satu kempen** kalau ejen itu hanya menguruskan satu
- **Batalkan** kunci yang tidak lagi digunakan. Ia dibatalkan, bukan dipadam,
  supaya `last_used_at` masih boleh dilihat selepas itu
- Kunci tidak luput sendiri. Putarkan secara berkala
