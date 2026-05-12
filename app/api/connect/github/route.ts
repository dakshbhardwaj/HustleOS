import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET() {
  const session = await auth();
  if (!session) redirect('/login');

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('gh_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/github/callback`,
    scope: 'read:user user:email repo',
    state,
  });

  redirect(`https://github.com/login/oauth/authorize?${params}`);
}
