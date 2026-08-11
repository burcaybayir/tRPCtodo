/**
 * THE EXECUTABLE SCHEMA
 *
 * One schema object, built once, shared by two transports:
 *
 *   src/app/api/graphql/route.ts  → HTTP  (queries + mutations)
 *   server.ts                     → WebSocket (subscriptions)
 *
 * This file exists because of that second consumer. Apollo Server can build a
 * schema internally from `{ typeDefs, resolvers }`, but the WebSocket server
 * needs a `GraphQLSchema` instance of its own — and if the two built their own
 * copies from the same inputs, they would drift the moment someone edited one
 * call site. Building it here makes "the schema" a single value both sides
 * import.
 *
 * Note how the two features are combined: arrays. `makeExecutableSchema` merges
 * the SDL documents into one type system and deep-merges the resolver maps, so
 * `Task` ends up with `user` from one file and `comments` from the other. This
 * is the mechanism that lets `extend type Task` in team/typeDefs.ts work
 * without either feature's files referencing the other.
 */

import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "~/server/graphql/typeDefs";
import { resolvers } from "~/server/graphql/resolvers";
import { teamTypeDefs } from "~/server/graphql/team/typeDefs";
import { teamResolvers } from "~/server/graphql/team/resolvers";
import { voiceTypeDefs } from "~/server/graphql/voice/typeDefs";
import { voiceResolvers } from "~/server/graphql/voice/resolvers";

export const schema = makeExecutableSchema({
  // Three features, three pairs, one schema. `Task` now collects fields from
  // all three: `user` from the first, `comments` and `team` from the second,
  // `voiceMessage` from the third — and no file references any other.
  typeDefs: [typeDefs, teamTypeDefs, voiceTypeDefs],
  resolvers: [resolvers, teamResolvers, voiceResolvers],
});
