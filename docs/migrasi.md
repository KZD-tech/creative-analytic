# Migrasi daripada dashboard Cloudflare Pages

## Apa yang berubah

| | Dashboard lama | Creative Analytic |
|---|---|---|
| Frontend | satu fail HTML + JS inline | Next.js 16 + TypeScript + Tailwind |
| Backend | Cloudflare Worker + D1 | Supabase Postgres, diakses dari server Next.js |
| Data | jadual rata, satu tempoh | jadual fakta bertarikh (harian atau tempoh), agnostik sumber |
| Analisis | funnel per kad | funnel + diagnosis kebocoran + benchmark boleh ubah + breakdown tag |
| Trend | tiada | belanja/hasil, derma, empat kadar funnel, lengkung keletihan |
| Perbandingan | mata sendiri | 2–4 kreatif sisi-ke-sisi, 17 metrik |
| Tag | tiada | hook / format / angle / offer / persona / CTA |
| Tema | terang sahaja | terang, gelap, ikut sistem |
| Keselamatan | endpoint Worker terbuka | RLS tertutup + gate kata laluan |

## Apa yang kekal sama

- Tiga jenis muat naik CSV yang sama, dengan template yang boleh dimuat turun.
- Log muat naik dan rollback snapshot.
- Berbilang kempen dengan penukar kempen.
- Bahasa antara muka kekal Bahasa Malaysia.

## Memindahkan data lama

Tiada import automatik daripada D1 — struktur jadualnya berbeza dan
Creative Analytic memerlukan tarikh yang tiada dalam skema lama. Cara paling
bersih ialah muat naik semula:

1. Buat kempen dengan ID yang sama seperti sebelum ini (contoh `rumah-padi`),
   supaya pautan lama masih bermakna kepada pasukan anda.
2. Eksport semula fail Meta Ads daripada Ads Manager — kali ini dengan
   **Breakdown → By Day**. Inilah satu-satunya sebab untuk eksport semula:
   pecahan harian mengaktifkan semua graf trend dan lengkung keletihan.
3. Muat naik fail derma Onpay yang sama seperti sebelum ini.
4. Muat naik CSV pautan video yang sama.
5. Semak tab Data → log muat naik untuk memastikan tiada baris dilangkau.

Jika anda benar-benar mahu mengeluarkan data daripada D1:

```bash
wrangler d1 execute <nama-db> --command "select * from ads" --json > ads.json
```

kemudian tukarkan kepada format lajur template Meta Ads
(`/api/templates/fb_ads`) dan muat naik seperti biasa.

## Selepas migrasi

1. Tetapkan benchmark kempen di tab **Data** supaya sepadan dengan realiti
   akaun anda — nilai lalai adalah titik permulaan yang munasabah, bukan
   kebenaran mutlak.
2. Tag kreatif anda. Buka grid **Kreatif**, pilih beberapa kad, guna borang tag
   pukal di bar bawah. Tanpa tag, halaman Insight hanya boleh beritahu *iklan*
   mana yang menang; dengan tag ia boleh beritahu *ciri* mana yang menang —
   dan itulah yang boleh dipakai untuk kreatif seterusnya.
3. Tetapkan `APP_PASSWORD` sebelum berkongsi URL dengan sesiapa.
