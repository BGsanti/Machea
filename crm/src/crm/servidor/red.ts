import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Las conexiones de webhook las escribe cada empresa y el servidor las llama. Sin este control, una
 * empresa podría apuntar a la red interna del servidor (metadatos de la nube, servicios locales).
 *
 * Límite conocido: entre esta comprobación y la llamada, el DNS podría cambiar (DNS rebinding). Por eso
 * además la llamada no sigue redirecciones.
 */

const privadas = new BlockList();
for (const [red, prefijo] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privadas.addSubnet(red, prefijo, "ipv4");
}
for (const [red, prefijo] of [
  ["::", 127],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privadas.addSubnet(red, prefijo, "ipv6");
}

function esPrivada(ip: string): boolean {
  const familia = isIP(ip);
  if (familia === 0) return true;
  return privadas.check(ip, familia === 4 ? "ipv4" : "ipv6");
}

/** Lanza un error si la URL no es https o si su host resuelve a una dirección no pública. */
export async function exigirUrlPublica(texto: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new Error("La URL de la conexión no es válida.");
  }
  if (url.protocol !== "https:") throw new Error("La conexión debe usar https.");
  if (url.username || url.password) throw new Error("La URL no puede llevar usuario ni contraseña.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const direcciones = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (direcciones.length === 0) throw new Error("No se encontró el servidor de la conexión.");
  if (direcciones.some((d) => esPrivada(d.address))) throw new Error("La conexión apunta a una dirección no permitida.");
  return url;
}
