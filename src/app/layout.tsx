/**
 * ROOT LAYOUT
 *
 * This is a Server Component. Since tRPC and Apollo hooks run on the client,
 * the providers are pulled in here, at the top of the tree, through Client
 * Components (TRPCProvider and ApolloProvider).
 */

import type { Metadata } from "next";
import { TRPCProvider } from "~/lib/trpc/Provider";
import { ApolloProvider } from "~/lib/apollo/Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "tRPC + GraphQL playground",
  description:
    "A learning project running a tRPC API and a GraphQL API side by side",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
