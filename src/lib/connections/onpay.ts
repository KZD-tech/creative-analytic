import { fetchWithTimeout, PlatformError, readJson } from './http';

/**
 * Onpay, read-only.
 *
 * RPC-style rather than REST: every call is a GET/POST to
 * `https://{account}.onpay.my/api/v1/{family}.{method}`, authenticated with a
 * `token` query parameter (no header scheme, no OAuth), and every response —
 * success or failure — comes back as HTTP 200 with its own `ok` boolean.
 * https://onpaysb.github.io/docs/developer/api-v1.html
 */

function baseUrl(account: string): string {
  return `https://${account}.onpay.my/api/v1`;
}

interface OnpayEnvelope {
  ok: boolean;
  message?: string;
}

async function call<T extends OnpayEnvelope>(
  account: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${baseUrl(account)}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetchWithTimeout(url, { cache: 'no-store' }, 'Onpay');
  const parsed = await readJson<T>(response, 'Onpay');

  // The account itself decides success here, independent of HTTP status —
  // a bad token still comes back 200 with ok:false.
  if (!parsed.ok) {
    throw new PlatformError(parsed.message ?? 'Onpay menolak permintaan ini.', {
      status: response.status,
      needsReauth: /token/i.test(parsed.message ?? ''),
    });
  }
  return parsed;
}

/**
 * One row from `sales.list` / `sales.get`. Onpay's own docs show every field
 * as an unexpanded `{...}` placeholder — this is only what a real response
 * actually returned, not a guess from documentation.
 */
export interface OnpaySale {
  id: number;
  type: string;
  /** `1` = dibayar, `0` = belum bayar. Binari sahaja — tiada status lain. */
  status: number;
  total_amount: string;
  confirmed_at: string | null;
  created_at: string;
  invoice_number: string;
  extra_field_1: string;
  extra_field_2: string;
  extra_field_3: string;
}

interface SalesListResponse extends OnpayEnvelope {
  record_count: number;
  per_page: number;
  sales: OnpaySale[];
}

export async function fetchOnpaySalesPage(options: {
  account: string;
  token: string;
  page: number;
  perPage?: number;
}): Promise<{ sales: OnpaySale[]; recordCount: number }> {
  const parsed = await call<SalesListResponse>(options.account, 'sales.list', {
    token: options.token,
    page: String(options.page),
    per_page: String(options.perPage ?? 100),
    sort_column: 'created_at',
    sort_dir: 'desc',
  });
  return { sales: parsed.sales ?? [], recordCount: parsed.record_count ?? 0 };
}

export interface OnpayDonation {
  /** `onpay_<id>` — the exact dedupe_key shape donations have carried since
   *  the agent that used to submit these by hand, so a sale either system
   *  has already written lands on the same row instead of a duplicate. */
  externalId: string;
  occurredAt: string;
  amount: number;
  channel: string | null;
  attributionRaw: string | null;
  adNameHint: string | null;
  /** `"GYT-AIRBERSIHGAZA347557"` — the prefix before the first `-` is which
   *  form the donor actually paid through, a stronger signal of platform
   *  family than the ad code alone. */
  invoiceNumber: string | null;
}

/**
 * `extra_field_3` carries the tracking code a landing page attached to the
 * order, pipe-separated with a middle segment that is usually empty — e.g.
 * `"W4L |  | tankgaza V3H1"`. The last non-empty segment is the ad name
 * (campaign shorthand and all) exactly as the agent used to report it, so it
 * still needs matching against a synced creative — never assumed correct on
 * its own.
 *
 * Only a `donation` sale with `status === 1` is a real, paid donation: Onpay
 * forms can sell ordinary products too, and `confirmed_at` is **not** a paid
 * signal — it is set (and keeps changing) whenever Onpay re-checks the order,
 * including ones still sitting at `status: 0` days later. A real sample of
 * each confirmed this: a status:0 row carried a confirmed_at timestamp from
 * over a week after it was created, with payment_gateway_log.state: "due".
 */
export function mapOnpaySale(sale: OnpaySale): OnpayDonation | null {
  if (sale.type !== 'donation' || sale.status !== 1) return null;

  const amount = Number.parseFloat(sale.total_amount);
  if (!Number.isFinite(amount)) return null;

  const segments = (sale.extra_field_3 ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    externalId: `onpay_${sale.id}`,
    // confirmed_at tracks closely with the actual payment moment for a paid
    // sale (seconds apart from payment_gateway_log.paid_at in every sample
    // seen) — created_at is the fallback for the rare paid row missing it.
    occurredAt: sale.confirmed_at ?? sale.created_at,
    amount,
    channel: sale.extra_field_2?.trim() || null,
    attributionRaw: sale.extra_field_3?.trim() || null,
    adNameHint: segments.length > 0 ? segments[segments.length - 1] : null,
    invoiceNumber: sale.invoice_number?.trim() || null,
  };
}
