import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCMaker — konfigurator i serwis sprzętu",
  description: "Konfigurator komputerów i przygotowanie zgłoszeń serwisowych.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
