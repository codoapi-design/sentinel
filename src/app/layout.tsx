import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Web3Provider } from "@/components/web3-provider";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Radareum — Crypto Wallet Intelligence",
  description: "Automated crypto accounting with intelligent tracking, AI-powered insights, and real-time wallet monitoring",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        style={{ fontFeatureSettings: "'cv01', 'ss03'" }}
      >
        <AuthProvider>
          <Web3Provider>
            {children}
          </Web3Provider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
