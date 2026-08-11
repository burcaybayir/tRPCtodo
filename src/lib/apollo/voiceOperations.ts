/**
 * VOICE MESSAGE OPERATIONS
 *
 * Two mutations and a fragment. The upload itself is not here — it is a plain
 * `fetch` to /api/upload, because it carries binary and GraphQL carries JSON.
 * See VoiceMessagePanel.tsx for the two-step flow.
 */

import { gql } from "@apollo/client";

/**
 * The task's voice message, fetched on its own.
 *
 * A separate query rather than extra fields on GET_TASK_WITH_COMMENTS, so the
 * voice feature stays removable: delete this file and its component and no
 * other document changes. The cost is one more request; the benefit is that
 * two features never share a document neither of them fully owns.
 */
export const GET_TASK_VOICE_MESSAGE = gql`
  query GetTaskVoiceMessage($id: ID!) {
    task(id: $id) {
      id
      voiceMessage {
        id
        url
        duration
        mimeType
        sizeBytes
        uploadedAt
      }
    }
  }
`;

/**
 * Returns the attached message so `Task:<id>` patches itself in the cache.
 *
 * Note the response includes the task id and its `voiceMessage` — returning
 * only the VoiceMessage would leave the cache unable to connect it to the task
 * it belongs to, and the panel would keep showing the old state until a
 * refetch.
 */
export const ATTACH_VOICE_MESSAGE = gql`
  mutation AttachVoiceMessage(
    $taskId: ID!
    $url: String!
    $duration: Int
    $mimeType: String
    $sizeBytes: Int
  ) {
    attachVoiceMessage(
      taskId: $taskId
      url: $url
      duration: $duration
      mimeType: $mimeType
      sizeBytes: $sizeBytes
    ) {
      id
      url
      duration
      mimeType
      sizeBytes
      uploadedAt
    }
  }
`;

export const REMOVE_VOICE_MESSAGE = gql`
  mutation RemoveVoiceMessage($taskId: ID!) {
    removeVoiceMessage(taskId: $taskId)
  }
`;
