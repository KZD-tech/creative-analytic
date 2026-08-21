import type { CreativeMetrics, FunnelStage } from './derive';
import type { Benchmarks } from '@/types/db';

export interface Diagnosis {
  /** null when nothing is leaking — every stage is at or above benchmark. */
  stage: FunnelStage | null;
  headline: string;
  detail: string;
  action: string;
  /** Extra revenue if the leaking stage were lifted to its "ok" benchmark. */
  upliftRevenue: number | null;
  severity: 'none' | 'info' | 'warning' | 'critical';
}

const ADVICE: Record<
  FunnelStage['key'],
  { headline: string; detail: string; action: string }
> = {
  hook: {
    headline: 'Bocor di Hook',
    detail:
      'Kebanyakan orang scroll lepas dalam 3 saat pertama. Masalahnya pada 3 saat pembuka, bukan pada offer.',
    action:
      'Tukar 3 saat pertama: buka dengan wajah/pergerakan, teks besar, atau ayat pembuka yang provokatif. Kekalkan body video yang sama supaya ujian ini bersih.',
  },
  hold: {
    headline: 'Bocor di Hold',
    detail:
      'Hook berjaya tarik perhatian tetapi penonton tercicir di tengah video sebelum sempat dengar tawaran.',
    action:
      'Potong bahagian lembab di tengah, pendekkan video, dan bawa mesej utama ke hadapan. Sasarkan hook yang sama, editing berbeza.',
  },
  click: {
    headline: 'Bocor di Klik',
    detail:
      'Ramai tonton tetapi sedikit yang klik. Video menghiburkan tetapi tidak memujuk orang bertindak.',
    action:
      'Kuatkan CTA pada 3 saat terakhir dan dalam primary text. Nyatakan sebab kena klik sekarang (urgency/impak).',
  },
  landing: {
    headline: 'Bocor di Landing Page',
    detail:
      'Orang klik tetapi ramai tidak sampai ke halaman. Ini biasanya masalah kelajuan halaman atau ketidakpadanan antara iklan dan halaman.',
    action:
      'Semak kelajuan mobile landing page, pastikan link betul, dan padankan visual/ayat halaman dengan iklan.',
  },
  convert: {
    headline: 'Bocor di Konversi',
    detail:
      'Trafik sampai ke halaman tetapi tidak menderma. Masalah pada halaman atau tawaran, bukan pada kreatif.',
    action:
      'Ringkaskan borang, tunjukkan bukti sosial dan amaun cadangan, dan pastikan gerbang pembayaran senang di telefon.',
  },
};

export function diagnose(m: CreativeMetrics, b: Benchmarks): Diagnosis {
  if (m.spend < b.min_spend) {
    return {
      stage: null,
      headline: 'Belum cukup data',
      detail: `Belanja baru ${m.spend.toFixed(0)}, di bawah ambang ${b.min_spend.toFixed(0)} untuk dibaca dengan yakin.`,
      action: 'Biarkan berjalan sehingga cukup belanja, atau naikkan bajet untuk dapat keputusan lebih cepat.',
      upliftRevenue: null,
      severity: 'info',
    };
  }

  // Stages are walked in funnel order: the earliest leak is the one worth
  // fixing, because everything downstream is starved by it.
  const leak = m.funnel.find((s) => s.grade === 'weak') ?? null;

  if (!leak) {
    return {
      stage: null,
      headline: m.status === 'winner' ? 'Sihat — layak scale' : 'Funnel sihat',
      detail:
        m.status === 'winner'
          ? 'Setiap peringkat funnel berada pada atau melebihi benchmark, dan ROAS sudah menguntungkan.'
          : 'Tiada peringkat funnel di bawah benchmark. ROAS masih rendah — kemungkinan besar isu kos media atau saiz derma.',
      action:
        m.status === 'winner'
          ? 'Naikkan bajet secara berperingkat dan buat variasi hook baharu daripada pemenang ini.'
          : 'Uji audien lebih murah atau naikkan amaun derma cadangan pada halaman.',
      upliftRevenue: null,
      severity: 'none',
    };
  }

  const advice = ADVICE[leak.key];
  return {
    stage: leak,
    headline: advice.headline,
    detail: advice.detail,
    action: advice.action,
    upliftRevenue: estimateUplift(m, leak),
    severity: m.roas !== null && m.roas < b.roas_ok ? 'critical' : 'warning',
  };
}

/**
 * What the creative would have earned if the leaking stage had merely hit its
 * "ok" benchmark, holding every other stage constant. It is a back-of-envelope
 * number for prioritising fixes, not a forecast.
 */
function estimateUplift(m: CreativeMetrics, leak: FunnelStage): number | null {
  if (m.revenue <= 0 || leak.rate === null || leak.rate <= 0) return null;
  const multiplier = leak.ok / leak.rate;
  if (!Number.isFinite(multiplier) || multiplier <= 1) return null;
  return m.revenue * multiplier - m.revenue;
}

/** Campaign-wide roll-up: which stage leaks on the most spend. */
export function leakSummary(items: CreativeMetrics[], b: Benchmarks) {
  const buckets = new Map<string, { stage: FunnelStage['key']; label: string; spend: number; count: number }>();

  for (const m of items) {
    const d = diagnose(m, b);
    if (!d.stage) continue;
    const existing = buckets.get(d.stage.key) ?? {
      stage: d.stage.key,
      label: d.stage.label,
      spend: 0,
      count: 0,
    };
    existing.spend += m.spend;
    existing.count += 1;
    buckets.set(d.stage.key, existing);
  }

  return [...buckets.values()].sort((a, z) => z.spend - a.spend);
}
