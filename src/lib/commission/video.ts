import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A new video room for an online hearing, used when the officer does not paste a link of their own.
 *
 * Rooms are on Jitsi: the public meet.jit.si by default, or the ACC's own Jitsi server via HEARING_VIDEO_BASE_URL.
 * The name is "ACC-Hearing-" plus 16 random characters (about 82 bits), so it cannot be guessed, and it carries no
 * case number or names to the video service.
 */
export function newHearingRoom(): string {
  const base = (process.env.HEARING_VIDEO_BASE_URL?.trim() || "https://meet.jit.si").replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(base)) throw new Error("HEARING_VIDEO_BASE_URL must be an https URL");
  let id = "";
  for (let i = 0; i < 16; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return `${base}/ACC-Hearing-${id}`;
}
