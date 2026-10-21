import type { NextConfig } from "next";

const produccion = process.env.NODE_ENV === "production";

// En Machea el CRM se sirve en www.machea.co/crm a través de un rewrite del proyecto del
// formulario (multi-zones): CRM_BASE_PATH=/crm y CRM_ORIGENES=www.machea.co. En local
// (pnpm dev) no hace falta ninguno de los dos.
const basePath = process.env.CRM_BASE_PATH || undefined;
const origenes = (process.env.CRM_ORIGENES ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const politica = [
  "default-src 'self'",
  // Next inserta scripts en línea para hidratar la página.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const config: NextConfig = {
  basePath,
  // Para las direcciones que arma el navegador a mano (por ejemplo el audio de una llamada): Next no les pone el basePath.
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? "" },
  // PGlite carga su WebAssembly desde node_modules; si se empaqueta, no lo encuentra.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Detrás del rewrite, el Origin (www.machea.co) no coincide con el Host del despliegue del CRM.
    serverActions: origenes.length ? { allowedOrigins: origenes } : undefined,
  },
  async headers() {
    const comunes = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [
      {
        source: "/:ruta*",
        headers: produccion ? [...comunes, { key: "Content-Security-Policy", value: politica }] : comunes,
      },
    ];
  },
};

export default config;
