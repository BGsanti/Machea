import { AsyncLocalStorage } from "node:async_hooks";

/** Usuario del CRM. Cada usuario es de una sola empresa. */
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  empresaId: string;
}

interface Contexto {
  empresaId: string;
  /** Usuario con el que corren las acciones dentro de `conEmpresa` (lo devuelve usuarioActual). */
  usuario?: Usuario;
}

const contexto = new AsyncLocalStorage<Contexto>();

/**
 * Fija la empresa (y opcionalmente el usuario) fuera de una petición: la entrada de leads,
 * los scripts y las pruebas. Dentro de una petición, la empresa sale de la sesión.
 */
export function conEmpresa<T>(empresaId: string, fn: () => Promise<T>, usuario?: Usuario): Promise<T> {
  if (usuario && usuario.empresaId !== empresaId) throw new Error("El usuario no es de esa empresa.");
  return contexto.run({ empresaId, usuario }, fn);
}

export function contextoActual(): Contexto | undefined {
  return contexto.getStore();
}
