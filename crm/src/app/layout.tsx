import type { Metadata } from "next";
import { Avisos } from "@/ui/avisos";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "REA CRM", template: "%s | REA CRM" },
  description: "CRM para gestionar ventas, servicio y marketing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        <Avisos />
      </body>
    </html>
  );
}
