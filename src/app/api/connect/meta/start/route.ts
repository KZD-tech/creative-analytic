import type { NextRequest } from 'next/server';
import { beginOAuth } from '../../_shared';
import { metaAuthUrl } from '@/lib/connections/meta';
import { metaConfig } from '@/lib/connections/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return beginOAuth(request, 'meta', ({ redirectUri, state }) =>
    metaAuthUrl({ appId: metaConfig().appId, redirectUri, state }),
  );
}
