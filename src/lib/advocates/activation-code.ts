import { randomInt } from "node:crypto";

// No 0/O/1/I: codes are read off paper notices and typed by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateActivationCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function normaliseActivationCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}
