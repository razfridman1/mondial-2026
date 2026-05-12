import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מונדיאל 2026 — לוח משחקים ושידורים בישראל",
  description: "כל המשחקים, שעות בישראל, ערוצי שידור, AI insights ועוד.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Mondial 2026" },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/logo.svg",    type: "image/svg+xml", sizes: "any" },
    ],
    apple: "/icons/logo.svg",
    shortcut: "/icons/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&family=Rubik:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Apply saved theme BEFORE first paint to avoid flicker.
            Priority: localStorage → OS prefers-color-scheme → dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mondial26.theme');if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
