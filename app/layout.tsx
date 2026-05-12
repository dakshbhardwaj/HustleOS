import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'HustleOS',
  description: 'AI Career & Productivity OS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="regular">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
