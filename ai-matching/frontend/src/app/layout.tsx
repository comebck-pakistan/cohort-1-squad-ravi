import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'AI Matchmaker — The Future of Hiring',
  description: 'AI-powered freelancer and client matching. Onboard via WhatsApp. Get intelligent matches. Build your career.',
  keywords: ['freelancer', 'ai matching', 'hiring', 'whatsapp', 'remote work'],
  openGraph: {
    title: 'AI Matchmaker',
    description: 'The future of hiring is here. AI-powered matching via WhatsApp.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: '#18181b',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f8f8ff',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
