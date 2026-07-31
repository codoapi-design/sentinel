import { NextResponse } from 'next/server';
import { createCookieServerClient } from '@/lib/supabase/server';
import {
  ALCHEMY_NETWORK_CATALOG,
  discoverAlchemyNetworks,
} from '@/lib/alchemy/networks';
import { isAlchemyConfigured } from '@/lib/alchemy/service';
import { getApiKey, maskApiKey } from '@/lib/env';

/**
 * GET /api/alchemy/networks
 * Authenticated diagnostic: which Alchemy networks this API key can reach.
 */
export async function GET() {
  const supabase = await createCookieServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAlchemyConfigured()) {
    return NextResponse.json({
      configured: false,
      catalogSize: ALCHEMY_NETWORK_CATALOG.length,
      enabled: [],
      forbidden: [],
      message: 'ALCHEMY_API_KEY is not set',
    });
  }

  const discovery = await discoverAlchemyNetworks({ force: true, syncOnly: false });
  const key = getApiKey('alchemy');

  return NextResponse.json({
    configured: true,
    keyMasked: maskApiKey(key),
    catalogSize: ALCHEMY_NETWORK_CATALOG.length,
    probed: discovery.probed,
    enabledCount: discovery.enabled.length,
    forbiddenCount: discovery.forbidden.length,
    enabled: discovery.enabled.map(n => ({
      key: n.key,
      chainId: n.chainId,
      family: n.family,
      name: n.name,
    })),
    forbidden: discovery.forbidden,
    note:
      'Alchemy apps only answer RPC for networks toggled in the dashboard (Core RPC). ' +
      'HTTP 403 means the network is not enabled on this app — enable it at ' +
      'https://dashboard.alchemy.com/apps then re-sync.',
  });
}
