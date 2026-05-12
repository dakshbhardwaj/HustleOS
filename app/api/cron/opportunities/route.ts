import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncOpportunities } from '@/lib/sync/opportunities';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: process.env.ALLOWED_EMAIL! },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const result = await syncOpportunities(user.id);
  return NextResponse.json(result);
}
