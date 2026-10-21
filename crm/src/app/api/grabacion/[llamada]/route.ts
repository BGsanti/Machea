import { usuarioActual } from "@/auth/sesion";
import { conEmpresa } from "@/db/contexto";
import { urlDelAudio } from "@/crm/servidor/grabaciones";

export const dynamic = "force-dynamic";

/**
 * Sirve el audio de una llamada a quien tiene sesión y es de la empresa dueña de esa llamada. El navegador nunca
 * ve la dirección de Dapta: el CRM la lee de su bandeja (filtrada por empresa), comprueba que sea de un host
 * permitido y reenvía el audio con soporte de adelantar y retroceder (Range).
 */
export async function GET(req: Request, { params }: { params: Promise<{ llamada: string }> }) {
  const usuario = await usuarioActual();
  if (!usuario) return new Response("Inicie sesión.", { status: 401 });
  const { llamada } = await params;
  const url = await conEmpresa(usuario.empresaId, () => urlDelAudio(llamada), usuario);
  if (!url) return new Response("No hay audio para esa llamada.", { status: 404 });

  const rango = req.headers.get("range");
  let origen: Response;
  try {
    origen = await fetch(url, { headers: rango ? { Range: rango } : {}, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    return new Response("No se pudo traer el audio.", { status: 502 });
  }
  if (!origen.ok && origen.status !== 206) return new Response("El audio ya no está disponible.", { status: origen.status === 404 ? 404 : 502 });

  const cabeceras = new Headers({ "Cache-Control": "private, max-age=600", "Accept-Ranges": "bytes" });
  cabeceras.set("Content-Type", origen.headers.get("content-type") ?? "audio/ogg");
  for (const h of ["content-length", "content-range"]) {
    const v = origen.headers.get(h);
    if (v) cabeceras.set(h, v);
  }
  return new Response(origen.body, { status: origen.status, headers: cabeceras });
}
