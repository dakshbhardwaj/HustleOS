import { signIn } from '@/lib/auth';

const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 380, padding: '36px 32px',
        background: 'var(--panel)', border: '1px solid var(--border-soft)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center',
      }}>
        {/* Logo + brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--accent)', color: 'var(--bg)',
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 22,
          }}>⌘</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>HustleOS</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.5 }}>
            Your personal career &amp; productivity OS.<br />
            Single-user · AI-powered · always in sync.
          </p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Google — primary when configured */}
          {hasGoogle && (
            <form style={{ width: '100%' }}
              action={async () => {
                'use server';
                await signIn('google', { redirectTo: '/' });
              }}
            >
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 40, fontSize: 14, justifyContent: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </form>
          )}

        </div>

        {/* Provider hint */}
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.6 }}>
          {hasGoogle
            ? 'Sign in with Google to enable Gmail integration. Connect GitHub after signing in.'
            : 'Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable sign in.'}
        </p>

        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: 16, width: '100%' }}>
          Access is restricted to the authorized account only.
        </p>
      </div>
    </div>
  );
}
