// Comprueba que cada script en línea de la landing y del quiz tenga su huella en la política de seguridad (CSP) de
// vercel.json. Si alguien cambia ese script sin actualizar la huella, el navegador lo bloquearía en silencio.
// Uso (después de `npm run build`):  node scripts/verificar-csp.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function cspDe(ruta) {
  let valor = null;
  for (const regla of vercel.headers) {
    if (!new RegExp(`^${regla.source}$`).test(ruta)) continue;
    const h = regla.headers.find((x) => x.key === "Content-Security-Policy");
    if (h) valor = h.value; // como en Vercel: si varias coinciden, gana la última
  }
  return valor;
}

let fallos = 0;
for (const [ruta, archivo] of [["/", "../dist/index.html"], ["/experiencia/", "../dist/experiencia/index.html"]]) {
  const html = readFileSync(new URL(archivo, import.meta.url), "utf8");
  const csp = cspDe(ruta);
  if (!csp) {
    console.error(`✗ ${ruta}: no hay Content-Security-Policy en vercel.json`);
    fallos++;
    continue;
  }
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/ld\+json/.test(m[1])) continue; // los datos estructurados no se ejecutan
    const huella = "sha256-" + createHash("sha256").update(m[2]).digest("base64");
    if (csp.includes(`'${huella}'`)) console.log(`✓ ${ruta}: script en línea permitido (${huella.slice(0, 20)}…)`);
    else {
      console.error(`✗ ${ruta}: un script en línea no está permitido. Agregue '${huella}' al script-src de ${ruta} en vercel.json.`);
      fallos++;
    }
  }
}
// Lo que otro proyecto sirve a través de un rewrite (el CRM en /crm) trae su propia política: la de la landing la
// REEMPLAZARÍA (Vercel deja ganar las cabeceras de este vercel.json) y bloquearía sus scripts en línea.
for (const r of vercel.rewrites ?? []) {
  if (new URL(r.destination).hostname === "machea-api.onrender.com") continue;
  const ruta = r.source.replace(/:\w+\*?/g, "x");
  if (cspDe(ruta)) {
    console.error(`✗ ${ruta}: lo sirve ${new URL(r.destination).hostname} con su propia política, pero la regla general de vercel.json también le pone la de la landing. Exclúyalo en el source de esa regla.`);
    fallos++;
  } else console.log(`✓ ${ruta}: sin la política de la landing (usa la de ${new URL(r.destination).hostname})`);
}
process.exit(fallos ? 1 : 0);
