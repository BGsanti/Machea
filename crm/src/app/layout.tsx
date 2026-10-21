import type { Metadata } from "next";
import localFont from "next/font/local";
import { Avisos } from "@/ui/avisos";
import "./globals.css";

// Archivo, la tipografía de Machea. Con next/font la ruta del archivo respeta el basePath (/crm).
const archivo = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "400 800",
  variable: "--fuente-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Machea", template: "%s | Machea" },
  description: "El panel de Machea: sus leads, las llamadas de Manuela y sus citas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={archivo.variable}>
      <body className="antialiased">
        {children}
        <Avisos />
      </body>
    </html>
  );
}
