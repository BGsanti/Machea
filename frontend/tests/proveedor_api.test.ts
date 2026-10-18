// Pruebas del proveedor `api` (habla con backend/api/acceso.py) con un fetch falso: `npm run test:auth`.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ErrorAuth } from '../src/auth/contrato.ts';
import { ProveedorApi } from '../src/auth/proveedores/api.ts';

interface Llamada { url: string; init: RequestInit }

function falso(respuestas: Array<{ status: number; cuerpo?: unknown } | 'red'>) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.shift();
    if (!r || r === 'red') throw new TypeError('Failed to fetch');
    return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

const SESION = {
  cuenta: { id: '1', usuario: 'constructora-andes', correo: 'ventas@andes.co', estado: 'pendiente', tipo: null, metodos: ['correo'], creadaEn: '2026-10-14T00:00:00Z' },
  expiraEn: '2026-11-13T00:00:00Z',
};

async function codigo(p: Promise<unknown>): Promise<string> {
  try { await p; return 'ok'; } catch (e) { assert.ok(e instanceof ErrorAuth); return e.codigo; }
}

describe('proveedor api', () => {
  it('crear cuenta: POST /api/cuentas con JSON, mismo origen y sin caché', async () => {
    const { f, llamadas } = falso([{ status: 201, cuerpo: { correo: 'ventas@andes.co' } }]);
    const p = new ProveedorApi({ fetch: f });
    assert.deepEqual(await p.crearCuenta({ usuario: 'constructora-andes', correo: 'Ventas@Andes.co', clave: 'x'.repeat(12) }), { correo: 'ventas@andes.co' });
    const { url, init } = llamadas[0];
    assert.equal(url, '/api/cuentas');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(String(init.body)), { usuario: 'constructora-andes', correo: 'Ventas@Andes.co', clave: 'x'.repeat(12) });
  });

  it('traduce los errores del backend a ErrorAuth, con los campos', async () => {
    const { f } = falso([
      { status: 422, cuerpo: { detail: { codigo: 'datos_invalidos', mensaje: '...', campos: { usuario: 'Usa minúsculas' } } } },
      { status: 409, cuerpo: { detail: { codigo: 'correo_ocupado' } } },
      { status: 401, cuerpo: { detail: { codigo: 'credenciales' } } },
      { status: 403, cuerpo: { detail: { codigo: 'correo_sin_confirmar' } } },
      { status: 429, cuerpo: { detail: 'texto plano' } },
      { status: 503, cuerpo: { detail: { codigo: 'no_disponible' } } },
      { status: 502 },
      { status: 500, cuerpo: { detail: { codigo: 'algo_raro' } } },
    ]);
    const p = new ProveedorApi({ fetch: f });
    try {
      await p.crearCuenta({ usuario: 'A B', correo: 'a@b.co', clave: 'x'.repeat(12) });
      assert.fail();
    } catch (e) {
      assert.ok(e instanceof ErrorAuth);
      assert.equal(e.codigo, 'datos_invalidos');
      assert.equal(e.campos.usuario, 'Usa minúsculas');
    }
    assert.equal(await codigo(p.crearCuenta({ usuario: 'aaa', correo: 'a@b.co', clave: 'x'.repeat(12) })), 'correo_ocupado');
    assert.equal(await codigo(p.entrar({ correo: 'a@b.co', clave: 'x', recordar: true })), 'credenciales');
    assert.equal(await codigo(p.entrar({ correo: 'a@b.co', clave: 'x', recordar: true })), 'correo_sin_confirmar');
    assert.equal(await codigo(p.pedirRecuperacion('a@b.co')), 'demasiados_intentos');
    assert.equal(await codigo(p.pedirRecuperacion('a@b.co')), 'no_disponible');
    assert.equal(await codigo(p.pedirRecuperacion('a@b.co')), 'no_disponible');   // 502 de Vercel con Render dormido
    assert.equal(await codigo(p.pedirRecuperacion('a@b.co')), 'desconocido');
  });

  it('sin red: sin_conexion', async () => {
    const { f } = falso(['red']);
    assert.equal(await codigo(new ProveedorApi({ fetch: f }).entrar({ correo: 'a@b.co', clave: 'x', recordar: false })), 'sin_conexion');
  });

  it('entrar devuelve la sesión y manda "recordar"', async () => {
    const { f, llamadas } = falso([{ status: 200, cuerpo: SESION }]);
    const s = await new ProveedorApi({ fetch: f }).entrar({ correo: 'ventas@andes.co', clave: 'una frase larga', recordar: false });
    assert.equal(s.cuenta.usuario, 'constructora-andes');
    assert.equal(JSON.parse(String(llamadas[0].init.body)).recordar, false);
    assert.equal(llamadas[0].url, '/api/sesion');
  });

  it('sesionActual: la sesión, o null si 401, 503 o sin red', async () => {
    const { f } = falso([{ status: 200, cuerpo: SESION }, { status: 401, cuerpo: { detail: { codigo: 'sin_sesion' } } }, { status: 503 }, 'red']);
    const p = new ProveedorApi({ fetch: f });
    assert.equal((await p.sesionActual())?.cuenta.correo, 'ventas@andes.co');
    assert.equal(await p.sesionActual(), null);
    assert.equal(await p.sesionActual(), null);
    assert.equal(await p.sesionActual(), null);
  });

  it('rutas de confirmar, reenviar, recuperar, cambiar clave y salir', async () => {
    const { f, llamadas } = falso([{ status: 204 }, { status: 204 }, { status: 204 }, { status: 204 }, { status: 204 }]);
    const p = new ProveedorApi({ fetch: f, base: 'https://x.test/' });
    await p.confirmarCorreo('t1');
    await p.reenviarConfirmacion('a@b.co');
    await p.pedirRecuperacion('a@b.co');
    await p.cambiarClave({ token: 't2', clave: 'otra frase larga' });
    await p.salir();
    assert.deepEqual(llamadas.map((l) => `${l.init.method} ${l.url}`), [
      'POST https://x.test/api/cuentas/confirmar',
      'POST https://x.test/api/cuentas/reenviar-confirmacion',
      'POST https://x.test/api/clave/recuperar',
      'POST https://x.test/api/clave',
      'DELETE https://x.test/api/sesion',
    ]);
  });

  it('salir no lanza aunque falle la red', async () => {
    const { f } = falso(['red']);
    await new ProveedorApi({ fetch: f }).salir();
  });
});
