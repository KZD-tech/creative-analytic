import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Creative Analytic — Kaizen Digital',
  description:
    'Analitik kreatif untuk kempen Meta Ads: funnel kebocoran, trend, breakdown mengikut tag, dan perbandingan sisi-ke-sisi.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('ca-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-page text-ink antialiased">{children}</body>
    </html>
  );
}
