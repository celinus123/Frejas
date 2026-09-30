"use client";
import { supabase } from "./supabase";

/**
 * Re-encodes an image through a canvas. This shrinks it and, importantly,
 * drops all metadata — including the GPS location phones store in photos.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process photo"))), "image/jpeg", quality),
  );
}

export async function uploadCheckinPhoto(file: File, challengeId: string, userId: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${challengeId}/${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase().storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const blob = await compressImage(file, 512, 0.85);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function uploadCover(file: File, challengeId: string): Promise<string> {
  const blob = await compressImage(file, 1600, 0.85);
  const path = `${challengeId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase().storage.from("covers").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

/** Private buckets: fetch short-lived links (1 hour). */
export async function signedUrls(bucket: "photos" | "avatars" | "covers", paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (!unique.length) return {};
  const { data } = await supabase().storage.from(bucket).createSignedUrls(unique, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}
