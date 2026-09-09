import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import packageJson from '../../../../package.json';

export const dynamic = 'force-dynamic';

/**
 * Health and version endpoint.
 *
 * Deliberately says nothing that is not already public: no credentials, no
 * hostnames, no user data. It exists so that "which build is this?" has an
 * answer during CI, smoke tests and support.
 */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      name: 'arete',
      version: packageJson.version,
      mode: env.NEXT_PUBLIC_APP_MODE,
      stage: 'foundation',
      time: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
