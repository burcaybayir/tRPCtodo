/**
 * KÖK LAYOUT
 *
 * Bu bir Server Component. tRPC hook'ları istemcide çalıştığı için
 * provider'ları burada, ağacın en tepesinde saran bir Client Component
 * (TRPCProvider) ile devreye alıyoruz.
 */

import type { Metadata } from "next";
import { TRPCProvider } from "~/lib/trpc/Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "tRPC Todo",
  description: "tRPC öğrenmek için basit bir todo uygulaması",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
