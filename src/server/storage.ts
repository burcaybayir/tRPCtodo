/**
 * FILE STORAGE — a local stand-in for cloud object storage
 *
 * This module writes uploads to `public/uploads/` and returns a URL. That is
 * NOT how you would ship this, and the difference is worth understanding
 * before you copy it anywhere.
 *
 * WHAT A REAL SETUP LOOKS LIKE (the signed-URL flow)
 *
 *   1. browser → API:      "I want to upload a 240 KB audio/webm"
 *   2. API → S3/R2/GCS:    create a short-lived, single-purpose signed URL
 *   3. API → browser:      here is the URL, PUT your bytes there
 *   4. browser → storage:  uploads DIRECTLY, never touching your server
 *   5. browser → API:      "done, the file is at <url>" → attachVoiceMessage
 *
 * The point of step 4 is that the bytes never pass through your application.
 * A Node process streaming a 50 MB upload is a Node process not answering
 * requests; object storage is built for exactly that traffic and your API is
 * not. The API's whole job becomes issuing a credential and recording a URL —
 * which is precisely the shape the GraphQL mutation already has.
 *
 * WHAT THIS FILE DOES INSTEAD
 *
 * Steps 1-4 collapse into one POST to /api/upload, which writes to disk. The
 * flow the rest of the app sees is identical: something returns a URL, and the
 * mutation stores it. Swapping this for S3 means changing this file and
 * nothing else — the resolvers, the schema and the UI never learn where the
 * bytes went.
 *
 * WHY LOCAL DISK IS A DEAD END IN PRODUCTION
 *
 * Files written to `public/` are lost on redeploy on most platforms, are not
 * shared between instances (so instance A cannot serve what instance B
 * received), and get no CDN. It works here because this is one process on one
 * machine for one learner.
 *
 * THE TWO-SYSTEMS PROBLEM
 *
 * A database row and a stored file can disagree, and no transaction spans
 * both:
 *
 *   upload succeeds, mutation fails  → an orphan file nobody references
 *   row deleted, delete fails        → an orphan file nobody references
 *   row written, file never arrived  → a URL pointing at nothing (worse: the
 *                                      UI shows a broken player)
 *
 * `deleteStoredFile` below is best-effort for that reason: it must never fail
 * the operation that called it. Real systems accept the leak and reconcile
 * later — a scheduled job that lists storage, diffs it against the table, and
 * deletes what no row references. Orphaned bytes are a cleanup problem;
 * a failed delete that rolls back a user's action is a correctness problem.
 */

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Where the "bucket" lives. Served statically by Next.js from /uploads/... */
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Public URL prefix corresponding to UPLOAD_DIR. */
const UPLOAD_URL_PREFIX = "/uploads";

/** Only audio is accepted — this endpoint exists for voice messages. */
const ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
];

/** 10 MB. An unbounded upload endpoint is a denial-of-service waiting to happen. */
const MAX_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export type StoredFile = {
  url: string;
  mimeType: string;
  sizeBytes: number;
};

export class StorageError extends Error {}

export async function storeAudioFile(
  bytes: Buffer,
  mimeType: string,
): Promise<StoredFile> {
  // Strip any `; codecs=opus` parameter the browser appends.
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(baseMime)) {
    throw new StorageError(`Unsupported audio type: ${baseMime}`);
  }

  if (bytes.byteLength === 0) {
    throw new StorageError("Empty file");
  }

  if (bytes.byteLength > MAX_BYTES) {
    throw new StorageError(
      `File is too large (${bytes.byteLength} bytes, limit ${MAX_BYTES})`,
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  /**
   * The stored name is generated, never taken from the client.
   *
   * A client-supplied filename is an attacker-supplied path: `../../.env` and
   * friends escape the directory, and a name ending in `.html` served from
   * your own origin turns your bucket into a cross-site scripting vector. A
   * random id plus an extension derived from the (validated) mime type has
   * neither problem.
   */
  const filename = `${randomUUID()}.${EXTENSION_BY_MIME[baseMime] ?? "bin"}`;

  await writeFile(path.join(UPLOAD_DIR, filename), bytes);

  return {
    url: `${UPLOAD_URL_PREFIX}/${filename}`,
    mimeType: baseMime,
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Best-effort delete. Never throws.
 *
 * Called when a voice message is replaced or removed, so the disk does not
 * accumulate audio nobody references. If it fails — file already gone, locked,
 * permissions — we log and move on: the user's delete must still succeed. See
 * the two-systems note at the top.
 */
export async function deleteStoredFile(url: string): Promise<void> {
  // Only touch files this module created. A URL that does not look like ours
  // (an external CDN link, say) is not ours to delete.
  if (!url.startsWith(`${UPLOAD_URL_PREFIX}/`)) return;

  const filename = path.basename(url);

  try {
    await unlink(path.join(UPLOAD_DIR, filename));
  } catch (error) {
    console.warn(`[storage] could not delete ${filename}:`, error);
  }
}
