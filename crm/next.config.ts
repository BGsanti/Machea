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
  "upgrade-insecure-requests",
].join("; ");

// Las páginas públicas de los formularios (/f/*): se pueden incrustar en el sitio de cada empresa (frame-ancestors) y
// mostrar su logo desde cualquier https (img-src). Nada más se relaja: siguen sin poder cargar scripts de otros sitios.
const politicaFormularios = politica.replace("img-src 'self' data: blob:", "img-src 'self' data: blob: https:").replace("frame-ancestors 'none'", "frame-ancestors *");

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
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      // Solo por https: el navegador se acuerda y no vuelve a intentar http (Vercel ya sirve todo por https).
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    return [
      // Todo menos los formularios públicos: sin poder incrustarse en otros sitios.
      {
        source: "/:ruta((?!f/).*)",
        headers: produccion ? [...comunes, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: politica }] : comunes,
      },
      {
        source: "/f/:slug",
        headers: produccion ? [...comunes, { key: "Content-Security-Policy", value: politicaFormularios }] : comunes,
      },
    ];
  },
};

export default config;
