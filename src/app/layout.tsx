import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dos Nodos Growth CRM",
  description: "CRM y automatización comercial de WhatsApp para Dos Nodos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
