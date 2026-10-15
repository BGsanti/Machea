/* MACHEA — Utilidades criptográficas del login (Web Crypto; funcionan en el navegador y en Node 20+). */

export function hex(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

/** Token aleatorio para enlaces de un solo uso (32 bytes en hexadecimal). */
export function tokenAleatorio(bytes = 32): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** El cuerpo de un JWT, SIN verificar la firma. Solo para el proveedor de prueba: en la nube se verifica. */
export function leerJwtSinVerificar(jwt: string): Record<string, unknown> | null {
  const partes = String(jwt || '').split('.');
  if (partes.length !== 3) return null;
  try {
    let b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const cuerpo = JSON.parse(new TextDecoder().decode(bytes));
    return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
