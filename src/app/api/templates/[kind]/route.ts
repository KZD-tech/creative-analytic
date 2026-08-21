import { NextResponse } from 'next/server';

/**
 * Templates double as documentation: the header row is exactly what the parser
 * looks for, and the sample rows show the shape each column expects.
 */
const TEMPLATES: Record<string, { filename: string; rows: string[] }> = {
  fb_ads: {
    filename: 'template-fb-ads.csv',
    rows: [
      'Ad name,Ad set name,Campaign name,Day,Amount spent (MYR),Impressions,Reach,Frequency,Clicks (all),Link clicks,CTR (all),Landing page views,3-second video plays,ThruPlays,Results,Purchases conversion value',
      'Contoh Iklan V1H1,Ad Set A,Kempen Ramadan,2026-03-01,150.00,8500,5200,1.63,212,180,2.50,55,1530,420,3,180.00',
      'Contoh Iklan V1H2,Ad Set A,Kempen Ramadan,2026-03-01,200.00,10000,6000,1.67,310,265,3.10,80,2200,610,5,420.00',
    ],
  },
  conversions: {
    filename: 'template-derma.csv',
    rows: [
      '#,Jumlah Keseluruhan (RM),Tambahan #2,Tambahan #3,Tarikh & Masa (Dimasukkan)',
      '1001,50.00,Facebook (new),Kempen Ramadan | Ad Set A | Contoh Iklan V1H1,2026-03-01 10:30:00',
      '1002,100.00,Facebook (returning),Kempen Ramadan | Ad Set A | Contoh Iklan V1H2,2026-03-01 14:20:00',
    ],
  },
  media_links: {
    filename: 'template-video-links.csv',
    rows: [
      'ad_name,youtube_url',
      'Contoh Iklan V1H1,https://youtu.be/VIDEO_ID_1',
      'Contoh Iklan V1H2,https://www.youtube.com/shorts/VIDEO_ID_2',
    ],
  },
};

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const template = TEMPLATES[kind];
  if (!template) return NextResponse.json({ error: 'Template tidak dijumpai' }, { status: 404 });

  return new NextResponse(`﻿${template.rows.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${template.filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
