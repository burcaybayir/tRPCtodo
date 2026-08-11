/**
 * VOICE MESSAGE SCHEMA
 *
 * A third SDL document, deliberately self-contained. It extends Task with one
 * field and adds two mutations — and it does not touch, reference, or depend on
 * the comment, pagination or subscription machinery next door in team/.
 *
 * That isolation is the design goal, not an accident. This feature is a plain
 * 1-1 relation with two writes; entangling it with the DataLoader or the PubSub
 * would add moving parts it has no use for. Small features should stay small.
 *
 * Note what is NOT in this schema: the audio itself. There is no `Upload`
 * scalar and no `bytes` field. The file travels over POST /api/upload and only
 * its URL reaches GraphQL — see src/app/api/upload/route.ts.
 */

import gql from "graphql-tag";

export const voiceTypeDefs = gql`
  """
  A recorded audio note attached to a task.

  Every field here is a REFERENCE or a piece of METADATA — never the audio.
  Metadata is chosen for what the UI needs before (or without) playing the
  file: a duration to render, a mime type to hand the audio element, a size to
  warn about, a timestamp to sort by.
  """
  type VoiceMessage {
    id: ID!

    "Where the file actually lives. Fetched by the browser, not by the API."
    url: String!

    "Length in seconds. Nullable because the browser cannot always measure it."
    duration: Int

    mimeType: String!

    "Byte size, if the uploader reported it."
    sizeBytes: Int

    "ISO-8601 string."
    uploadedAt: String!
  }

  # One field added to Task. Nullable: most tasks have no voice message, and
  # that is a normal state rather than an error.
  extend type Task {
    voiceMessage: VoiceMessage
  }

  extend type Mutation {
    """
    Attaches a voice message to a task, replacing any existing one.

    UPSERT, not create. The relation is 1-1, so "attach" and "replace" are the
    same operation from the caller's point of view — and modelling them as one
    mutation removes a whole class of client-side branching (check if one
    exists, then choose between two mutations, and race with anyone else doing
    the same).

    url comes from POST /api/upload. mimeType and sizeBytes are optional
    extras: the upload endpoint already knows both, so passing them through
    keeps the row complete without a second round trip.
    """
    attachVoiceMessage(
      taskId: ID!
      url: String!
      duration: Int
      mimeType: String
      sizeBytes: Int
    ): VoiceMessage!

    """
    Detaches the voice message from a task and deletes the stored file.

    Returns true when something was removed, false when the task had none.
    A missing task is an error; a missing voice message is not — asking to
    remove what is already absent has arrived at the requested state.
    """
    removeVoiceMessage(taskId: ID!): Boolean!
  }
`;
