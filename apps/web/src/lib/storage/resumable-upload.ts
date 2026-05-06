import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

export type UploadResumableOptions = {
  file: File;
  bucket: string;
  path: string;
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
};

const CHUNK_SIZE = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

/**
 * Upload a file to Supabase Storage using the TUS resumable protocol.
 * Resolves to the file's public URL. Use for large files (e.g. video).
 * Cancellation: pass an AbortSignal; calling .abort() on the controller
 * stops the upload (with `terminate=true` so the server cleans up).
 */
export async function uploadResumable(
  opts: UploadResumableOptions
): Promise<string> {
  const {
    file,
    bucket,
    path,
    contentType = file.type || "application/octet-stream",
    cacheControl = "3600",
    upsert = false,
    onProgress,
    signal,
  } = opts;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return new Promise<string>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: RETRY_DELAYS,
      chunkSize: CHUNK_SIZE,
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": String(upsert),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl,
      },
      onError: (error) => {
        reject(error);
      },
      onProgress: (bytesSent, bytesTotal) => {
        if (onProgress && bytesTotal > 0) {
          onProgress(Math.round((bytesSent / bytesTotal) * 100));
        }
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
      },
    });

    if (signal) {
      const onAbort = () => upload.abort(true).catch(() => undefined);
      if (signal.aborted) {
        onAbort();
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        onAbort();
        reject(new DOMException("Aborted", "AbortError"));
      });
    }

    upload.start();
  });
}
