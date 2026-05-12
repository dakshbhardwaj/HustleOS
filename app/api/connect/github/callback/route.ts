import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const savedState  = cookieStore.get('gh_oauth_state')?.value;
  cookieStore.delete('gh_oauth_state');

  if (!code || !state || !savedState || state !== savedState) {
    redirect('/?error=github_oauth_failed');
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/github/callback`,
    }),
  });

  const tokenData   = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  if (!accessToken) redirect('/?error=github_token_failed');

  // Fetch GitHub user profile
  const ghUser = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  }).then((r) => r.json());

  // Get the currently-authenticated user's session
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  // Find or create the User row for this person
  const dbUser = await prisma.user.upsert({
    where: { email: session.user.email },
    create: {
      email:     session.user.email,
      name:      session.user.name      ?? undefined,
      avatarUrl: session.user.image     ?? undefined,
    },
    update: {},
    select: { id: true },
  });

  // Persist the GitHub account / access token
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider:          'github',
        providerAccountId: String(ghUser.id),
      },
    },
    create: {
      userId:            dbUser.id,
      type:              'oauth',
      provider:          'github',
      providerAccountId: String(ghUser.id),
      access_token:      accessToken,
      scope:             'read:user user:email repo',
    },
    update: {
      access_token: accessToken,
      userId:       dbUser.id,
    },
  });

  redirect('/');
}
