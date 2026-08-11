/**
 * CUSTOM NODE SERVER — Next.js plus a WebSocket endpoint in one process
 *
 * WHY THIS FILE HAD TO EXIST
 *
 * Queries and mutations fit the App Router perfectly: a request arrives, a
 * route handler runs, a Response goes back, and the handler is done. That
 * request/response shape is baked into the platform — Next.js route handlers
 * are invoked per request and are expected to RETURN, which is also what makes
 * them deployable to serverless runtimes.
 *
 * A subscription is the opposite shape. The client opens a socket and then
 * says nothing; minutes later the SERVER decides it has news and writes into
 * that still-open connection. Somebody has to hold the socket the whole time,
 * and a function that returns a Response cannot. There is no flag to turn on —
 * it is a structural mismatch between the transport and the runtime model.
 *
 * So the WebSocket lives here instead, in a plain Node HTTP server that also
 * hands every non-WebSocket request to Next.js. One process, two transports,
 * one schema:
 *
 *     ws://localhost:3000/api/graphql/ws   → subscriptions   (this file)
 *     http://localhost:3000/api/graphql    → queries, mutations (route.ts)
 *
 * ONE PROCESS IS NOT AN ACCIDENT
 *
 * `addCommentToTask` runs in the Next.js route handler and publishes to an
 * in-memory PubSub; `commentAdded` listens on it from here. In-memory means
 * in-THIS-memory: split these across two processes and the event never
 * arrives. See src/server/graphql/team/pubsub.ts for the globalThis trick that
 * makes the two halves share one instance despite living in different module
 * registries.
 *
 * WHAT YOU GIVE UP
 *
 * A custom server opts out of Next.js's automatic static optimisation and
 * cannot be deployed to serverless platforms as-is. That is the real cost of
 * subscriptions, and it is why production GraphQL APIs with subscriptions
 * usually run as their own long-lived service rather than inside a Next.js
 * app. Worth knowing before you reach for them.
 */

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { schema } from "~/server/graphql/schema";
import { createGraphQLContext } from "~/server/graphql/context";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = createServer((req, res) => {
    // Everything that is not a WebSocket upgrade goes to Next.js untouched:
    // pages, /api/trpc, /api/graphql, static assets. The existing app does not
    // notice this file exists.
    handle(req, res, parse(req.url ?? "/", true));
  });

  /**
   * `noServer: true` means "do not listen on your own port".
   *
   * Next.js already owns port 3000, and a WebSocket handshake starts life as a
   * normal HTTP GET carrying an `Upgrade: websocket` header. So we let the one
   * HTTP server accept the connection and hand the socket over manually in the
   * `upgrade` listener below. That is how one port serves both.
   */
  const wsServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url ?? "/", true);

    if (pathname === "/api/graphql/ws") {
      wsServer.handleUpgrade(request, socket, head, (ws) => {
        wsServer.emit("connection", ws, request);
      });
      return;
    }

    // Not our path — let it go. Next.js uses its own upgrades for hot reload
    // in dev, and destroying those would break fast refresh.
  });

  /**
   * `useServer` speaks the graphql-ws protocol: connection_init, subscribe,
   * next, complete. The client half of that conversation is configured in
   * src/lib/apollo/client.ts.
   *
   * The context function runs ONCE PER SUBSCRIPTION, not per emitted event —
   * so a long-lived subscription holds one DataLoader for its entire life.
   * That is fine here because these resolvers never read through the loader on
   * the subscription path, but it is a genuine trap: a subscription resolver
   * that loads through a request-scoped cache will happily serve data that
   * went stale hours ago.
   */
  useServer(
    {
      schema,
      context: () => createGraphQLContext(),
      onConnect: () => {
        console.log("[ws] client connected");
      },
      onDisconnect: () => {
        console.log("[ws] client disconnected");
      },
    },
    wsServer,
  );

  server.listen(port, () => {
    console.log(`▲ Next.js ready on http://localhost:${port}`);
    console.log(`◆ GraphQL HTTP      http://localhost:${port}/api/graphql`);
    console.log(`◆ GraphQL WebSocket ws://localhost:${port}/api/graphql/ws`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
