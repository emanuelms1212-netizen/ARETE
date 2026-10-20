import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/auth';
import { daysBetween, exportForRange } from '@/domain';
import { takeToken } from '@/lib/rate-limit';
import { withUser } from '@/persistence';

export const dynamic = 'force-dynamic';

/**
 * Downloads the signed-in person's own data as JSON: everything, or the rows
 * of a date range. The user comes from the session, never from the request,
 * and in live mode the database's row-level security applies as well.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Signed out.' }, { status: 401 });

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let range: { from: string; to: string } | null = null;
  if (from || to) {
    if (!from || !to || !iso.test(from) || !iso.test(to) || daysBetween(from, to) < 0) {
      return NextResponse.json({ error: 'Give a from and to date, from first.' }, { status: 400 });
    }
    range = { from, to };
  }

  const allowed = takeToken('export', user.id);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: 'Several exports in a row. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(allowed.retryAfterSeconds) } },
    );
  }

  const exported = await withUser(user.id, async (repository) => {
    const everything = await repository.exportEverything(user.id);
    await repository.recordAudit(user.id, { action: 'export', detail: range ? 'range' : 'all' });
    return everything;
  });
  const body = {
    exportedAt: new Date().toISOString(),
    schemaVersion: exported.schemaVersion,
    range,
    tables: exportForRange(exported.tables, range),
  };
  const name = range ? `arete-${range.from}-to-${range.to}.json` : 'arete-everything.json';
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
