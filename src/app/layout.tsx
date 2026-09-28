import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
