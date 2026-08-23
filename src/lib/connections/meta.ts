import type { IngestResult, NormalizedAdMetric } from '@/lib/ingest/adapter';
import { fetchWithTimeout, PlatformError, readJson } from './http';

/**
 * Meta Marketing API, read-only.
 *
 * For an internal dashboard this needs no App Review: everyone who signs in is
 * added to the Meta app's own roster (Admin, Developer or Tester), and
 * `ads_read` works for them in development mode. App Review only becomes
 * necessary when strangers connect their own accounts.
 */

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || 'v21.0';
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * What the classic login flow asks for. `business_management` is requested
 * because it helps the plain Facebook Login flow see business-owned ad
 * accounts, but it is not *required* — see META_REQUIRED_SCOPES.
 */
export const META_SCOPES = ['ads_read', 'business_management'].join(',');

/**
 * What this app genuinely cannot work without.
 *
 * Both calls it makes — listing ad accounts and reading their insights — need
 * `ads_read` and nothing more. A Login for Business configuration names its own assets, so
 * it grants `ads_read` alone; treating `business_management` as mandatory would
 * declare a perfectly good token broken.
 */
export const META_REQUIRED_SCOPES = ['ads_read'];

/**
 * Apps created through Meta's use-case flow get **Facebook Login for Business**
 * rather than plain Facebook Login, and that variant asks for a `config_id`
 * naming a saved permission configuration instead of a `scope` list. Sending
 * `scope` to it produces a consent screen that grants nothing, which then
 * surfaces much later as an empty ad-account list rather than as a login error.
 *
 * Both are supported: set `META_LOGIN_CONFIG_ID` for the business flow, leave
 * it empty for the classic one.
 */
export function metaAuthUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  configId?: string | null;
}): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: 'code',
  });

  if (input.configId) params.set('config_id', input.configId);
  else params.set('scope', META_SCOPES);

  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params}`;
}

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Meta reports an expired or revoked token as OAuthException code 190, and as
 * code 102 when the session itself is gone. Everything else — rate limits,
 * outages, a bad ad account id — is a failure the connection can recover from
 * on its own, so it must not send the user back through the consent screen.
 */
function metaError(body: MetaErrorBody, status: number): PlatformError {
  const code = body.error?.code ?? 0;
  return new PlatformError(body.error?.message ?? `Meta API HTTP ${status}`, {
    status,
    needsReauth: code === 190 || code === 102 || status === 401,
  });
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetchWithTimeout(url, { cache: 'no-store' }, 'Meta');
  const body = await readJson<T & MetaErrorBody>(response, 'Meta');

  if (!response.ok || body.error) throw metaError(body, response.status);
  return body;
}

export interface MetaToken {
  accessToken: string;
  expiresAt: string | null;
}

/**
 * Two hops on purpose: the code exchange returns a token that lasts hours, and
 * the second call trades it for one that lasts about sixty days. Skipping the
 * second hop gives a dashboard that stops syncing the same afternoon.
 */
export async function exchangeMetaCode(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<MetaToken> {
  const short = await graph<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
    client_id: input.appId,
    client_secret: input.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  // A configuration issuing **system-user** tokens returns one that never
  // expires, and `fb_exchange_token` has nothing to extend. Meta signals this
  // by omitting expires_in or sending 0.
  if (!short.expires_in) return { accessToken: short.access_token, expiresAt: null };

  // A **user** token starts at about two hours; this trades it for the ~60 day
  // one. If the exchange is refused, the short token still works — returning it
  // with its real expiry is far better than failing the whole connection, and
  // the connection simply asks to be renewed sooner.
  try {
    const long = await graph<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: input.appId,
      client_secret: input.appSecret,
      fb_exchange_token: short.access_token,
    });

    return {
      accessToken: long.access_token,
      expiresAt: expiryFrom(long.expires_in),
    };
  } catch {
    return { accessToken: short.access_token, expiresAt: expiryFrom(short.expires_in) };
  }
}

function expiryFrom(seconds: number | undefined): string | null {
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
}


/**
 * What Meta says about a token itself: its type, and the scopes on it.
 *
 * `/me/permissions` cannot answer this. That edge belongs to the User node, so
 * on a **system-user** token it does not describe the token at all — it returns
 * a list that stays identical however the login configuration is changed.
 * Reporting that as "the permissions this token carries" turns a wrong endpoint
 * into a confident, and consistently misleading, error message.
 *
 * `/debug_token` is authoritative, and it needs the app credential rather than
 * the token being examined.
 */
async function inspectToken(
  accessToken: string,
  app: { appId: string; appSecret: string },
): Promise<{ type: string; scopes: string[] } | null> {
  if (!app.appId || !app.appSecret) return null;

  try {
    const body = await graph<{ data?: { type?: string; scopes?: string[] } }>('/debug_token', {
      input_token: accessToken,
      access_token: `${app.appId}|${app.appSecret}`,
    });
    return { type: body.data?.type ?? 'UNKNOWN', scopes: body.data?.scopes ?? [] };
  } catch {
    return null;
  }
}

/**
 * Lists the ad accounts a token can reach.
 *
 * Which edge answers depends on the kind of token. `/me/adaccounts` belongs to
 * the User node; a system-user token resolves `/me` to a system user, whose ad
 * accounts sit behind `assigned_ad_accounts` instead. Asking the wrong one
 * earns a bare "(#200) Missing Permissions" that says nothing about the
 * endpoint being wrong, so both are tried before blaming permissions.
 */
export async function listMetaAdAccounts(
  accessToken: string,
  app: { appId: string; appSecret: string } = { appId: '', appSecret: '' },
): Promise<MetaAdAccount[]> {
  type Row = { id: string; name?: string; currency?: string; timezone_name?: string };
  let firstError: unknown = null;

  for (const edge of ['/me/adaccounts', '/me/assigned_ad_accounts']) {
    try {
      const body = await graph<{ data?: Row[] }>(edge, {
        access_token: accessToken,
        fields: 'id,name,currency,timezone_name',
        limit: '200',
      });

      const rows = body.data ?? [];
      // An empty list is not an answer — the other edge may hold the accounts.
      if (rows.length === 0) continue;

      return rows.map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        currency: row.currency ?? null,
        timezone: row.timezone_name ?? null,
      }));
    } catch (error) {
      firstError ??= error;
    }
  }

  throw await explainNoAccounts(accessToken, app, firstError);
}

async function explainNoAccounts(
  accessToken: string,
  app: { appId: string; appSecret: string },
  cause: unknown,
): Promise<PlatformError> {
  const info = await inspectToken(accessToken, app);

  if (!info) {
    return cause instanceof PlatformError
      ? cause
      : new PlatformError('Meta tidak memulangkan sebarang akaun iklan untuk token ini.', {
          needsReauth: true,
        });
  }

  // A system-user token draws its reach from asset assignment, not from scopes.
  // Pointing at the permission list here would send someone to the wrong screen.
  if (info.type.toUpperCase().includes('SYSTEM')) {
    return new PlatformError(
      'Token system-user ini tidak nampak sebarang akaun iklan. Akaun iklan mesti diberikan ' +
        'kepada system user itu sendiri: Business Settings → Users → System users → pilih ' +
        'system user → Assign assets → Ad accounts. Menyambungkan akaun iklan kepada app ' +
        'sahaja tidak mencukupi.',
      { needsReauth: false },
    );
  }

  const canRead = info.scopes.some((s) => s === 'ads_read' || s === 'ads_management');
  if (!canRead) {
    return new PlatformError(
      `Token ini tidak membawa ads_read. Yang ada: ${info.scopes.join(', ') || 'tiada apa-apa'}. ` +
        'Semak permission dalam configuration Facebook Login for Business, kemudian sambung semula.',
      { needsReauth: true },
    );
  }

  return new PlatformError(
    `Token membawa ${info.scopes.join(', ')} tetapi tiada akaun iklan boleh dicapai. ` +
      'Semak akaun iklan sudah diberikan kepada pengguna ini dalam Business Settings.',
    { needsReauth: false },
  );
}

/**
 * Reads one named ad account directly, without asking which accounts a token
 * can reach.
 *
 * The listing edges are the fragile part of this integration — which one
 * answers depends on the token type, and a refusal from the wrong one says
 * nothing useful. When the account id is already known there is no reason to
 * ask at all.
 */
export async function describeMetaAdAccount(
  accessToken: string,
  accountId: string,
): Promise<MetaAdAccount> {
  const id = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const row = await graph<{ id: string; name?: string; currency?: string; timezone_name?: string }>(
    `/${id}`,
    { access_token: accessToken, fields: 'id,name,currency,timezone_name' },
  );

  return {
    id: row.id,
    name: row.name ?? row.id,
    currency: row.currency ?? null,
    timezone: row.timezone_name ?? null,
  };
}

// ── creative assets ─────────────────────────────────────────────────────────

/**
 * The insights endpoint reports numbers and nothing else — no image, no
 * headline, no body copy. Those live on the ad's creative, which is a separate
 * call. Without it the creative grid renders fifty cards that are only names.
 */
export interface MetaCreativeAsset {
  externalAdId: string;
  adName: string;
  /** What to show or play: the video file for a video ad, the image otherwise. */
  mediaUrl: string | null;
  mediaKind: 'video' | 'image' | 'none';
  /** A still, always. It outlives a video URL and keeps the tile from going black. */
  thumbnailUrl: string | null;
  /** Meta-hosted iframe of the whole ad, as a viewer would see it. */
  previewUrl: string | null;
  headline: string | null;
  bodyCopy: string | null;
  landingUrl: string | null;
}

interface MetaAdRow {
  id: string;
  name?: string;
  previews?: { data?: { body?: string }[] };
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    video_id?: string;
    title?: string;
    body?: string;
    object_story_spec?: {
      link_data?: { message?: string; name?: string; link?: string; picture?: string };
      video_data?: {
        message?: string;
        title?: string;
        video_id?: string;
        image_url?: string;
        call_to_action?: { value?: { link?: string } };
      };
    };
    asset_feed_spec?: {
      bodies?: { text?: string }[];
      titles?: { text?: string }[];
      link_urls?: { website_url?: string }[];
      videos?: { video_id?: string; thumbnail_url?: string }[];
      images?: { url?: string }[];
    };
  };
}

/**
 * The preview is requested as a field expansion rather than a second call, so
 * it costs no extra round trip. MOBILE_FEED_STANDARD because that is where
 * almost all of this spend actually lands.
 */
const PREVIEW_FORMAT = process.env.META_PREVIEW_FORMAT?.trim() || 'MOBILE_FEED_STANDARD';

const CREATIVE_FIELDS = [
  'id',
  'name',
  `previews.ad_format(${PREVIEW_FORMAT}){body}`,
  'creative{thumbnail_url,image_url,video_id,title,body,object_story_spec,asset_feed_spec}',
].join(',');

/**
 * Meta returns the preview as a fragment of HTML containing an iframe, not as a
 * URL. The src is what can be embedded; the surrounding markup is Meta's own
 * sizing, which would fight the layout here.
 *
 * Only Meta's own hosts are accepted. The body is HTML from an external
 * service, and putting an arbitrary src into an iframe would let whatever that
 * service returned render inside this page.
 */
export function previewSrc(body: string | undefined): string | null {
  if (!body) return null;

  const match = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(body);
  if (!match) return null;

  const src = match[1].replace(/&amp;/g, '&');
  const url = src.startsWith('//') ? `https:${src}` : src;

  try {
    const { protocol, hostname } = new URL(url);
    const trusted = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
    return protocol === 'https:' && trusted ? url : null;
  } catch {
    return null;
  }
}

/**
 * Meta scatters the same three pieces of text across three shapes depending on
 * how the ad was built: a plain creative, a story spec, or a dynamic asset
 * feed. Reading only one of them leaves most of a real account blank.
 */
function readCreative(row: MetaAdRow): MetaCreativeAsset & { videoId: string | null } {
  const c = row.creative ?? {};
  const link = c.object_story_spec?.link_data;
  const video = c.object_story_spec?.video_data;
  const feed = c.asset_feed_spec;

  const videoId = c.video_id ?? video?.video_id ?? feed?.videos?.[0]?.video_id ?? null;

  // `image_url` is the real asset; `thumbnail_url` is a tiny preview Meta
  // generates. Showing the latter in a grid tile makes every poster look
  // blurry, so they are kept apart rather than treated as interchangeable.
  const fullImage = c.image_url ?? link?.picture ?? feed?.images?.[0]?.url ?? null;
  const still =
    video?.image_url ?? feed?.videos?.[0]?.thumbnail_url ?? c.thumbnail_url ?? fullImage;

  return {
    externalAdId: row.id,
    adName: row.name?.trim() ?? row.id,
    videoId,
    // Filled in later for videos, once the video nodes have been read.
    mediaUrl: videoId ? null : fullImage,
    mediaKind: videoId ? 'video' : fullImage ? 'image' : 'none',
    thumbnailUrl: still ?? null,
    previewUrl: previewSrc(row.previews?.data?.[0]?.body),
    headline: c.title ?? link?.name ?? video?.title ?? feed?.titles?.[0]?.text ?? null,
    bodyCopy: c.body ?? link?.message ?? video?.message ?? feed?.bodies?.[0]?.text ?? null,
    landingUrl:
      link?.link ??
      video?.call_to_action?.value?.link ??
      feed?.link_urls?.[0]?.website_url ??
      null,
  };
}

export async function fetchMetaCreatives(options: {
  accessToken: string;
  accountId: string;
  campaignIds?: string[];
  /** Stop paging past this moment and return what was gathered. */
  deadline?: number;
}): Promise<MetaCreativeAsset[]> {
  const account = options.accountId.startsWith('act_')
    ? options.accountId
    : `act_${options.accountId}`;

  const filtering =
    options.campaignIds && options.campaignIds.length > 0
      ? JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: options.campaignIds }])
      : null;

  // Meta weighs a page by fields × rows, and these fields nest three deep, so a
  // page size that is fine for insights is refused here. Start modest, and if
  // Meta still calls it too much, list again from the top at half the size —
  // restarting rather than resuming, so no ad is read twice.
  let limit = 25;

  for (;;) {
    try {
      const assets = await listCreativePages({
        account,
        accessToken: options.accessToken,
        filtering,
        limit,
        deadline: options.deadline,
      });
      return await attachVideos(options.accessToken, assets, options.deadline);
    } catch (error) {
      if (!isTooMuchData(error) || limit <= 5) throw error;
      limit = Math.max(5, Math.floor(limit / 2));
    }
  }
}

async function attachVideos(
  accessToken: string,
  assets: (MetaCreativeAsset & { videoId: string | null })[],
  deadline?: number,
): Promise<MetaCreativeAsset[]> {
  const ids = assets.map((a) => a.videoId).filter((id): id is string => Boolean(id));
  const outOfTime = deadline !== undefined && Date.now() >= deadline;
  const videos = ids.length > 0 && !outOfTime ? await readVideos(accessToken, ids, deadline) : new Map();

  return assets.map(({ videoId, ...asset }) => {
    if (!videoId) return asset;

    const video = videos.get(videoId);
    return {
      ...asset,
      mediaUrl: video?.source ?? null,
      // Still a video even when the file could not be read — mislabelling it an
      // image would put a broken <img> where a player belongs.
      mediaKind: 'video' as const,
      thumbnailUrl: asset.thumbnailUrl ?? video?.picture ?? null,
    };
  });
}

/**
 * Reads the video files behind a set of video ids.
 *
 * Batched through `?ids=`, because an account of fifty video ads would
 * otherwise be fifty round trips on top of the listing.
 *
 * Meta's `source` is a signed CDN URL that expires after a while. That is
 * survivable here only because every sync refreshes it — and because the still
 * is stored separately, so an expired video leaves a poster rather than a black
 * tile.
 */
async function readVideos(
  accessToken: string,
  videoIds: string[],
  deadline?: number,
): Promise<Map<string, { source: string | null; picture: string | null }>> {
  const found = new Map<string, { source: string | null; picture: string | null }>();
  const unique = [...new Set(videoIds)];

  for (const part of chunkIds(unique, 25)) {
    if (deadline !== undefined && Date.now() >= deadline) break;
    try {
      const body = await graph<Record<string, { source?: string; picture?: string }>>('/', {
        access_token: accessToken,
        ids: part.join(','),
        fields: 'source,picture',
      });

      for (const [id, node] of Object.entries(body)) {
        found.set(id, { source: node?.source ?? null, picture: node?.picture ?? null });
      }
    } catch {
      // A video the token cannot read must not cost the whole account its
      // images; the ad simply keeps whatever still it already had.
    }
  }

  return found;
}

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function listCreativePages(input: {
  account: string;
  accessToken: string;
  filtering: string | null;
  limit: number;
  deadline?: number;
}): Promise<(MetaCreativeAsset & { videoId: string | null })[]> {
  const assets: (MetaCreativeAsset & { videoId: string | null })[] = [];
  let url: string | null = null;
  let pages = 0;

  do {
    const body: { data?: MetaAdRow[]; paging?: { next?: string } } = url
      ? await graphUrl(url)
      : await graph(`/${input.account}/ads`, {
          access_token: input.accessToken,
          fields: CREATIVE_FIELDS,
          limit: String(input.limit),
          ...(input.filtering ? { filtering: input.filtering } : {}),
        });

    for (const row of body.data ?? []) assets.push(readCreative(row));

    url = body.paging?.next ?? null;
    pages += 1;
    // Returning fewer ads is fine; the next sync picks up the rest. Running out
    // of function time is not, because nothing at all comes back.
    if (input.deadline !== undefined && Date.now() >= input.deadline) break;
  } while (url && pages < 200);

  return assets;
}

function isTooMuchData(error: unknown): boolean {
  return error instanceof PlatformError && /reduce the amount of data/i.test(error.message);
}

/** Follows a paging URL, which already carries its own token and cursor. */
async function graphUrl<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url, { cache: 'no-store' }, 'Meta');
  const parsed = await readJson<T & MetaErrorBody>(response, 'Meta');
  if (!response.ok || parsed.error) throw metaError(parsed, response.status);
  return parsed;
}

// ── insights ────────────────────────────────────────────────────────────────

const INSIGHT_FIELDS = [
  'ad_id', 'ad_name', 'adset_name', 'campaign_id', 'campaign_name',
  'spend', 'impressions', 'reach', 'frequency', 'clicks', 'inline_link_clicks',
  'actions', 'action_values',
  'video_play_actions', 'video_thruplay_watched_actions',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
  'date_start', 'date_stop',
].join(',');

interface ActionRow {
  action_type: string;
  value: string;
}

/**
 * Meta returns these as arrays of {action_type, value}, and the order is not
 * guaranteed — picking by index rather than by type is the classic way to end
 * up reporting the wrong number.
 */
function actionValue(rows: ActionRow[] | undefined, ...types: string[]): number {
  if (!rows) return 0;
  for (const type of types) {
    const match = rows.find((row) => row.action_type === type);
    if (match) {
      const value = Number.parseFloat(match.value);
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
}

function first(rows: ActionRow[] | undefined): number {
  if (!rows || rows.length === 0) return 0;
  const value = Number.parseFloat(rows[0].value);
  return Number.isFinite(value) ? value : 0;
}

interface MetaInsightRow {
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionRow[];
  action_values?: ActionRow[];
  video_play_actions?: ActionRow[];
  video_thruplay_watched_actions?: ActionRow[];
  video_p25_watched_actions?: ActionRow[];
  video_p50_watched_actions?: ActionRow[];
  video_p75_watched_actions?: ActionRow[];
  video_p100_watched_actions?: ActionRow[];
  date_start?: string;
  date_stop?: string;
}

const num = (value: string | undefined): number => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Maps one Meta insight row onto the shape the rest of the app already reads. */
export function mapMetaInsight(row: MetaInsightRow): NormalizedAdMetric | null {
  const adName = row.ad_name?.trim();
  const start = row.date_start;
  if (!adName || !start) return null;

  return {
    ad_name: adName,
    adset_name: row.adset_name?.trim() ?? null,
    platform_campaign: row.campaign_name?.trim() ?? null,
    external_ad_id: row.ad_id ?? null,
    headline: null,
    body_copy: null,
    landing_url: null,
    date_start: start,
    date_stop: row.date_stop ?? start,
    spend: num(row.spend),
    impressions: Math.round(num(row.impressions)),
    reach: Math.round(num(row.reach)),
    frequency: row.frequency ? num(row.frequency) : null,
    clicks_all: Math.round(num(row.clicks)),
    link_clicks: Math.round(num(row.inline_link_clicks)),
    landing_page_views: Math.round(actionValue(row.actions, 'landing_page_view')),
    video_3s_views: Math.round(first(row.video_play_actions)),
    video_thruplays: Math.round(first(row.video_thruplay_watched_actions)),
    video_p25: Math.round(first(row.video_p25_watched_actions)),
    video_p50: Math.round(first(row.video_p50_watched_actions)),
    video_p75: Math.round(first(row.video_p75_watched_actions)),
    video_p100: Math.round(first(row.video_p100_watched_actions)),
    results: Math.round(
      actionValue(row.actions, 'purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'),
    ),
    platform_purchases: Math.round(
      actionValue(row.actions, 'purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'),
    ),
    platform_revenue: actionValue(
      row.action_values,
      'purchase',
      'omni_purchase',
      'offsite_conversion.fb_pixel_purchase',
    ),
    raw: null,
  };
}

export interface MetaFetchOptions {
  accessToken: string;
  accountId: string;
  since: string;
  until: string;
  /** Empty means the whole account. */
  campaignIds?: string[];
}

export async function fetchMetaInsights(
  options: MetaFetchOptions,
): Promise<IngestResult<NormalizedAdMetric>> {
  const items: NormalizedAdMetric[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  const params: Record<string, string> = {
    access_token: options.accessToken,
    level: 'ad',
    // Daily rows are what make every trend chart and the fatigue curve work.
    time_increment: '1',
    time_range: JSON.stringify({ since: options.since, until: options.until }),
    fields: INSIGHT_FIELDS,
    limit: '500',
  };

  if (options.campaignIds && options.campaignIds.length > 0) {
    params.filtering = JSON.stringify([
      { field: 'campaign.id', operator: 'IN', value: options.campaignIds },
    ]);
  }

  const account = options.accountId.startsWith('act_')
    ? options.accountId
    : `act_${options.accountId}`;

  let url: string | null = null;
  let pages = 0;

  do {
    const body: { data?: MetaInsightRow[]; paging?: { next?: string } } = url
      ? await (async () => {
          const response = await fetchWithTimeout(url as string, { cache: 'no-store' }, 'Meta');
          const parsed = await readJson<{ data?: MetaInsightRow[]; paging?: { next?: string } } & MetaErrorBody>(
            response,
            'Meta',
          );
          if (!response.ok || parsed.error) throw metaError(parsed, response.status);
          return parsed;
        })()
      : await graph(`/${account}/insights`, params);

    for (const row of body.data ?? []) {
      const mapped = mapMetaInsight(row);
      if (mapped) items.push(mapped);
      else skipped += 1;
    }

    url = body.paging?.next ?? null;
    pages += 1;
    // A guard rail rather than a limit anyone should hit: 200 pages of 500 rows
    // is 100k ad-days, far past a runaway loop being plausible.
  } while (url && pages < 200);

  if (pages >= 200) warnings.push('Terlalu banyak halaman — sebahagian data mungkin tidak ditarik.');
  if (skipped > 0) warnings.push(`${skipped} baris dilangkau kerana tiada nama iklan atau tarikh.`);
  if (items.length === 0) {
    warnings.push('Meta tidak memulangkan sebarang baris untuk tempoh ini.');
  }

  return { items, warnings, skipped };
}
