"use client";

/**
 * VOICE MESSAGE PANEL
 *
 * THE TWO-STEP FLOW — the shape of every file upload in a GraphQL app:
 *
 *   step 1  POST /api/upload   (multipart, binary)  → { url, mimeType, sizeBytes }
 *   step 2  attachVoiceMessage(taskId, url, ...)    → the row in the database
 *
 * The audio never touches GraphQL. Step 1 hands back a URL; step 2 records it.
 * In production step 1 becomes "ask the API for a signed URL, then PUT the
 * bytes straight to storage" — the browser talks to S3 instead of to this
 * server — and step 2 does not change at all. That is the reason for splitting
 * them: the expensive, awkward half stays swappable.
 *
 * Two ways in, because a microphone is not always available:
 *   - record in the browser with MediaRecorder
 *   - pick an existing audio file
 * Both converge on the same upload-then-attach path.
 */

import { useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  ATTACH_VOICE_MESSAGE,
  GET_TASK_VOICE_MESSAGE,
  REMOVE_VOICE_MESSAGE,
} from "~/lib/apollo/voiceOperations";
import type {
  AttachVoiceMessageMutation,
  AttachVoiceMessageMutationVariables,
  GetTaskVoiceMessageQuery,
  GetTaskVoiceMessageQueryVariables,
  RemoveVoiceMessageMutation,
  RemoveVoiceMessageMutationVariables,
} from "~/lib/apollo/generated/graphql";

type UploadResult = { url: string; mimeType: string; sizeBytes: number };

/** Step 1: send the bytes, get back a URL. Plain fetch — no GraphQL involved. */
async function uploadAudio(blob: Blob, filename: string): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
    // Note: no Content-Type header. The browser sets it, including the
    // multipart boundary — setting it by hand produces a request the server
    // cannot parse.
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Upload failed");

  return json as UploadResult;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return null;
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function VoiceMessagePanel({ taskId }: { taskId: string }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const { data, loading } = useQuery<
    GetTaskVoiceMessageQuery,
    GetTaskVoiceMessageQueryVariables
  >(GET_TASK_VOICE_MESSAGE, { variables: { id: taskId } });

  const [attachVoiceMessage] = useMutation<
    AttachVoiceMessageMutation,
    AttachVoiceMessageMutationVariables
  >(ATTACH_VOICE_MESSAGE, {
    // The mutation returns a VoiceMessage, but nothing in that response tells
    // the cache it now belongs to this task — `Task:<id>.voiceMessage` was
    // null and stays null. Same inverse-relation blind spot as elsewhere in
    // this app, same fix.
    refetchQueries: [
      { query: GET_TASK_VOICE_MESSAGE, variables: { id: taskId } },
    ],
    awaitRefetchQueries: true,
  });

  const [removeVoiceMessage] = useMutation<
    RemoveVoiceMessageMutation,
    RemoveVoiceMessageMutationVariables
  >(REMOVE_VOICE_MESSAGE, {
    refetchQueries: [
      { query: GET_TASK_VOICE_MESSAGE, variables: { id: taskId } },
    ],
    awaitRefetchQueries: true,
  });

  /** Shared tail of both paths: upload, then attach. */
  async function uploadAndAttach(
    blob: Blob,
    filename: string,
    duration: number | null,
  ) {
    setBusy(true);
    setError(null);

    try {
      const stored = await uploadAudio(blob, filename);

      await attachVoiceMessage({
        variables: {
          taskId,
          url: stored.url,
          duration,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
        },
      });
    } catch (e) {
      // If the upload succeeded but the mutation failed, the file is now an
      // orphan in storage. Harmless here; in production a cleanup job
      // reconciles storage against the table. See src/server/storage.ts.
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError(null);

    try {
      // Prompts for microphone permission the first time. Requires a secure
      // context — localhost counts, plain http on another host does not.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        // Release the microphone. Without this the browser keeps showing its
        // "recording" indicator and the mic stays held open.
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        // Duration measured by the clock rather than read from the file: a
        // WebM produced by MediaRecorder carries no duration in its header, so
        // asking an <audio> element for it returns Infinity.
        const seconds = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );

        void uploadAndAttach(blob, "recording.webm", seconds);
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError(
        "Could not access the microphone. Check permissions, or upload a file instead.",
      );
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadAndAttach(file, file.name, null);
    e.target.value = ""; // let the same file be chosen again
  }

  const voiceMessage = data?.task?.voiceMessage ?? null;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <h4 className="text-sm font-medium text-slate-700">Voice message</h4>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {voiceMessage ? (
        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2">
          {/*
            The browser fetches this URL directly from /uploads/... — the API
            is not in the path. In production the same element would point at a
            CDN, which is what makes seeking (range requests) work.
          */}
          <audio controls src={voiceMessage.url} className="w-full">
            Your browser does not support the audio element.
          </audio>

          <p className="text-xs text-slate-500">
            {voiceMessage.mimeType}
            {voiceMessage.duration != null && ` · ${voiceMessage.duration}s`}
            {formatBytes(voiceMessage.sizeBytes) &&
              ` · ${formatBytes(voiceMessage.sizeBytes)}`}
            {" · "}
            {new Date(voiceMessage.uploadedAt).toLocaleString("en-GB")}
          </p>

          <button
            onClick={() =>
              removeVoiceMessage({ variables: { taskId } }).catch((e) =>
                setError(e instanceof Error ? e.message : "Remove failed"),
              )
            }
            disabled={busy}
            className="rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No voice message attached.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button
            onClick={stopRecording}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
          >
            ■ Stop recording
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            ● {voiceMessage ? "Record replacement" : "Record"}
          </button>
        )}

        <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-50">
          <input
            type="file"
            accept="audio/*"
            onChange={handleFile}
            disabled={busy || recording}
            className="hidden"
          />
          Upload a file
        </label>

        {busy && <span className="text-sm text-slate-500">Uploading...</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {voiceMessage && (
        <p className="text-xs text-slate-400">
          Recording again replaces this one — the relation is 1-1, so the
          mutation upserts rather than adding a second row.
        </p>
      )}
    </div>
  );
}
