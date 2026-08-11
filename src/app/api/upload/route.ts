/**
 * UPLOAD ENDPOINT — the one place in this app that speaks binary
 *
 * WHY THIS IS NOT A GRAPHQL MUTATION
 *
 * GraphQL transports JSON. Sending a file through it means either base64
 * (which inflates the payload by a third and forces the whole thing into
 * memory on both ends) or the multipart-request spec, an extra layer that
 * every client and server in the chain has to implement.
 *
 * The mainstream answer is to not send files over GraphQL at all: upload
 * out-of-band, then pass the resulting URL into a perfectly ordinary mutation.
 * That is what happens here — this route returns a URL, and
 * `attachVoiceMessage` takes a `String!`. The GraphQL layer never sees a byte
 * of audio.
 *
 * In production this route would not receive the bytes either; it would issue
 * a signed URL and let the browser PUT directly to storage. Same division of
 * labour, one less hop. See src/server/storage.ts.
 */

import type { NextRequest } from "next/server";
import { StorageError, storeAudioFile } from "~/server/storage";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return Response.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "Missing 'file' field" },
      { status: 400 },
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());

    // The browser reports the type; storeAudioFile validates it rather than
    // trusting it, and derives the stored extension from the validated value.
    const stored = await storeAudioFile(
      bytes,
      file.type || "application/octet-stream",
    );

    console.log(
      `[upload] stored ${stored.url} (${stored.sizeBytes} bytes, ${stored.mimeType})`,
    );

    // The response is exactly what attachVoiceMessage needs as input.
    return Response.json(stored, { status: 201 });
  } catch (error) {
    if (error instanceof StorageError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("[upload] failed:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
