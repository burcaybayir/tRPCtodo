/**
 * KÖK LAYOUT
 *
 * Bu bir Server Component. tRPC hook'ları istemcide çalıştığı için
 * provider'ları burada, ağacın en tepesinde saran bir Client Component
 * (TRPCProvider) ile devreye alıyoruz.
 */

import type { Metadata } from "next";
import { TRPCProvider } from "~/lib/trpc/Provider";
import { ApolloProvider } from "~/lib/apollo/Provider";
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
        {/*
          Two independent providers, nested only because React needs a tree.
          The Todos tab reads from TRPCProvider's React Query cache; the Task
          Assignment tab reads from ApolloProvider's InMemoryCache. Neither
          knows the other exists — swap the nesting order and nothing changes.
        */}
        <TRPCProvider>
          <ApolloProvider>{children}</ApolloProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
