import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCMaker — serwis sprzętu",
  description: "Szkielet aplikacji do zgłaszania awarii i serwisu sprzętu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
