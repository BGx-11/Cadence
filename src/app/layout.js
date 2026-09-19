import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Cadence — Instant Chord Detection & Key Analysis",
  description: "Upload any song to instantly detect chords, key, BPM, and timing. Transpose, simplify, and play along with real-time chord visualization.",
  keywords: ["chord detection", "key analysis", "bpm detection", "guitar chords", "audio analysis", "music theory", "nextjs", "tonejs"],
  openGraph: {
    title: "Cadence — Instant Chord Detection & Key Analysis",
    description: "Key, tempo, and chord recognition engine with synchronized interactive playback.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
