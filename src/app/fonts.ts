import { Roboto, Roboto_Mono } from "next/font/google";

// Self-hosted at build time by next/font: no requests to Google from users' browsers.
export const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-roboto",
});

// Case numbers, PINs and codes.
export const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-roboto-mono",
});
