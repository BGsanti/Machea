// Pruebas de la lógica del login (sin navegador ni dependencias): `npm run test:auth` desde frontend/.
// Node 22.6+ ejecuta TypeScript directamente; los imports llevan la extensión .ts a propósito.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ErrorAuth } from '../src/auth/contrato.ts';
import { sha256Hex } from '../src/auth/cripto.ts';
import { ProveedorPrueba } from '../src/auth/proveedores/prueba.ts';
import { almacenEnMemoria, destinoSeguro, rutaDeAcceso } from '../src/auth/sesion.ts';
import { fuerzaClave, sugerirUsuario, validarClave, validarCorreo, validarRegistro, validarUsuario } from '../src/auth/validacion.ts';

const CLAVE = 'una frase larga 2026';

function nuevo(ahora = { t: Date.parse('2026-10-13T12:00:00Z') }) {
  const p = new ProveedorPrueba({
    almacen: almacenEnMemoria(),
    sesionRecordada: almacenEnMemoria(),
    sesionTemporal: almacenEnMemoria(),
    origen: 'http://localhost:5173',
    ahora: () => ahora.t,
  });
  return { p, ahora };
}

function tokenDe(enlace: string): string {
  return new URL(enlace).searchParams.get('confirmar') || new URL(enlace).searchParams.get('token') || '';
}

async function codigo(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'ok';
  } catch (e) {
    assert.ok(e instanceof ErrorAuth, 'debe lanzar ErrorAuth');
    return e.codigo;
  }
}

function jwt(cuerpo: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(cuerpo)}.firma`;
}

describe('validación', () => {
  it('usuario: minúsculas, números, punto y guion, 3 a 30', () => {
    assert.equal(validarUsuario('constructora-andes'), null);
    assert.equal(validarUsuario('Constructora-Andes'), null); // se normaliza a minúsculas
    assert.ok(validarUsuario('ab'));
    assert.ok(validarUsuario('con espacio'));
    assert.ok(validarUsuario('ñandú'));
    assert.ok(validarUsuario('-empieza'));
  });
  it('correo', () => {
    assert.equal(validarCorreo(' Ventas@Andes.co '), null);
    assert.ok(validarCorreo('sin-arroba'));
    assert.ok(validarCorreo(''));
  });
  it('clave: largo y que no contenga usuario ni correo', () => {
    assert.ok(validarClave('corta'));
    assert.equal(validarClave(CLAVE), null);
    assert.ok(validarClave('constructora-andes-2026', { usuario: 'constructora-andes' }));
    assert.ok(validarClave('ventas123456789', { correo: 'ventas@andes.co' }));
    assert.ok(validarClave('aaaaaaaaaaaa'));
  });
  it('fuerza: premia el largo', () => {
    assert.equal(fuerzaClave('').nivel, 0);
    assert.equal(fuerzaClave('corta').nivel, 1);
    assert.ok(fuerzaClave('una frase muy larga de verdad').nivel >= 3);
  });
  it('sugerir usuario desde un nombre de Google', () => {
    assert.equal(sugerirUsuario('Constructora Ñandú S.A.S.'), 'constructora-nandu-s.a.s');
    assert.equal(sugerirUsuario('Al'), 'al-empresa');
    assert.equal(validarUsuario(sugerirUsuario('  María José  ')), null);
  });
  it('validarRegistro devuelve errores por campo', () => {
    const e = validarRegistro({ usuario: 'x', correo: 'malo', clave: '123' });
    assert.deepEqual(Object.keys(e).sort(), ['clave', 'correo', 'usuario']);
  });
});

describe('redirección después de entrar', () => {
  it('solo rutas del mismo sitio', () => {
    assert.equal(destinoSeguro('/inicio/'), '/inicio/');
    assert.equal(destinoSeguro('https://malo.com'), '/inicio/');
    assert.equal(destinoSeguro('//malo.com'), '/inicio/');
    assert.equal(destinoSeguro('/\\malo.com'), '/inicio/');
    assert.equal(destinoSeguro('/acceso/'), '/inicio/');
    assert.equal(destinoSeguro(null), '/inicio/');
    assert.equal(destinoSeguro('/\n/malo.com'), '/inicio/');
    assert.equal(rutaDeAcceso('/inicio/'), '/acceso/?volver=%2Finicio%2F');
  });
});

describe('proveedor de prueba: flujo con correo', () => {
  let p: ProveedorPrueba;
  beforeEach(() => ({ p } = nuevo()));

  it('crear → no entra sin confirmar → confirmar → pendiente → aprobar → aprobada', async () => {
    await p.crearCuenta({ usuario: 'constructora-andes', correo: 'Ventas@Andes.co', clave: CLAVE });
    assert.equal(await codigo(p.entrar({ correo: 'ventas@andes.co', clave: CLAVE, recordar: true })), 'correo_sin_confirmar');

    const [correo] = p.buzon();
    assert.equal(correo.para, 'ventas@andes.co');
    assert.ok(correo.enlace.startsWith('http://localhost:5173/acceso/?confirmar='));
    await p.confirmarCorreo(tokenDe(correo.enlace));
    assert.equal(await codigo(p.confirmarCorreo(tokenDe(correo.enlace))), 'enlace_invalido'); // un solo uso

    const s = await p.entrar({ correo: 'ventas@andes.co', clave: CLAVE, recordar: true });
    assert.equal(s.cuenta.estado, 'pendiente');
    assert.equal(s.cuenta.tipo, null);

    const [pend] = await p.listarCuentas({ estado: 'pendiente' });
    await p.aprobar(pend.id, 'constructora');
    const actual = await p.sesionActual();
    assert.equal(actual?.cuenta.estado, 'aprobada');
    assert.equal(actual?.cuenta.tipo, 'constructora');
  });

  it('no se repiten correo ni usuario', async () => {
    await p.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    assert.equal(await codigo(p.crearCuenta({ usuario: 'otro', correo: 'A@andes.co', clave: CLAVE })), 'correo_ocupado');
    assert.equal(await codigo(p.crearCuenta({ usuario: 'ANDES', correo: 'b@andes.co', clave: CLAVE })), 'usuario_ocupado');
  });

  it('datos inválidos traen el error de cada campo', async () => {
    try {
      await p.crearCuenta({ usuario: 'a b', correo: 'x', clave: 'corta' });
      assert.fail('debía fallar');
    } catch (e) {
      assert.ok(e instanceof ErrorAuth);
      assert.equal(e.codigo, 'datos_invalidos');
      assert.ok(e.campos.usuario && e.campos.correo && e.campos.clave);
    }
  });

  it('credenciales malas no revelan si el correo existe, y hay tope de intentos', async () => {
    await p.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    assert.equal(await codigo(p.entrar({ correo: 'nadie@x.co', clave: CLAVE, recordar: false })), 'credenciales');
    for (let i = 0; i < 5; i++) assert.equal(await codigo(p.entrar({ correo: 'a@andes.co', clave: 'mala-clave-123', recordar: false })), 'credenciales');
    assert.equal(await codigo(p.entrar({ correo: 'a@andes.co', clave: CLAVE, recordar: false })), 'demasiados_intentos');
  });

  it('el tope de intentos se libera después de 15 minutos', async () => {
    const reloj = { t: Date.parse('2026-10-13T12:00:00Z') };
    const { p: q } = nuevo(reloj);
    await q.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    await q.confirmarCorreo(tokenDe(q.buzon()[0].enlace));
    for (let i = 0; i < 5; i++) await codigo(q.entrar({ correo: 'a@andes.co', clave: 'mala-clave-123', recordar: false }));
    reloj.t += 16 * 60_000;
    assert.equal(await codigo(q.entrar({ correo: 'a@andes.co', clave: CLAVE, recordar: false })), 'ok');
  });

  it('recuperar la clave: no revela correos, valida antes de gastar el enlace y cierra sesiones', async () => {
    await p.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    await p.confirmarCorreo(tokenDe(p.buzon()[0].enlace));
    await p.entrar({ correo: 'a@andes.co', clave: CLAVE, recordar: true });

    await p.pedirRecuperacion('nadie@x.co'); // no lanza
    assert.equal(p.buzon().length, 1);
    await p.pedirRecuperacion('A@andes.co');
    const token = tokenDe(p.buzon()[0].enlace);

    assert.equal(await codigo(p.cambiarClave({ token, clave: 'corta' })), 'datos_invalidos');
    await p.cambiarClave({ token, clave: 'otra frase larga 2027' }); // el mismo enlace sigue sirviendo
    assert.equal(await codigo(p.cambiarClave({ token, clave: 'otra frase larga 2028' })), 'enlace_invalido');
    assert.equal(await p.sesionActual(), null);
    assert.equal(await codigo(p.entrar({ correo: 'a@andes.co', clave: CLAVE, recordar: false })), 'credenciales');
    assert.equal(await codigo(p.entrar({ correo: 'a@andes.co', clave: 'otra frase larga 2027', recordar: false })), 'ok');
  });

  it('los enlaces vencen', async () => {
    const reloj = { t: Date.parse('2026-10-13T12:00:00Z') };
    const { p: q } = nuevo(reloj);
    await q.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    reloj.t += 25 * 60 * 60_000;
    assert.equal(await codigo(q.confirmarCorreo(tokenDe(q.buzon()[0].enlace))), 'enlace_invalido');
  });

  it('"Recordarme" decide dónde queda la sesión, y salir la borra', async () => {
    const recordada = almacenEnMemoria();
    const temporal = almacenEnMemoria();
    const q = new ProveedorPrueba({ almacen: almacenEnMemoria(), sesionRecordada: recordada, sesionTemporal: temporal, origen: 'http://x' });
    await q.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    await q.confirmarCorreo(tokenDe(q.buzon()[0].enlace));

    await q.entrar({ correo: 'a@andes.co', clave: CLAVE, recordar: false });
    assert.ok(temporal.getItem('machea.auth.sesion'));
    assert.equal(recordada.getItem('machea.auth.sesion'), null);

    await q.entrar({ correo: 'a@andes.co', clave: CLAVE, recordar: true });
    assert.ok(recordada.getItem('machea.auth.sesion'));
    assert.equal(temporal.getItem('machea.auth.sesion'), null);

    await q.salir();
    assert.equal(await q.sesionActual(), null);
  });

  it('no se aprueba una cuenta sin confirmar, ni con un tipo inventado', async () => {
    await p.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    const [c] = await p.listarCuentas();
    assert.equal(await codigo(p.aprobar(c.id, 'constructora')), 'datos_invalidos');
    await p.confirmarCorreo(tokenDe(p.buzon()[0].enlace));
    assert.equal(await codigo(p.aprobar(c.id, 'banco' as never)), 'datos_invalidos');
    assert.equal((await p.rechazar(c.id)).estado, 'rechazada');
  });
});

describe('proveedor de prueba: Google', () => {
  it('cuenta nueva por Google: pendiente, confirmada y con usuario sugerido', async () => {
    const { p } = nuevo();
    const nonce = 'nonce-de-prueba';
    const s = await p.entrarConGoogle({
      idToken: jwt({ email: 'Gerencia@Bolivar.co', email_verified: true, name: 'Constructora Bolívar', sub: 'g-1', nonce: await sha256Hex(nonce) }),
      nonce,
      recordar: true,
    });
    assert.equal(s.cuenta.estado, 'pendiente');
    assert.equal(s.cuenta.correo, 'gerencia@bolivar.co');
    assert.equal(s.cuenta.usuario, 'constructora-bolivar');
    assert.deepEqual(s.cuenta.metodos, ['google']);
    // Una cuenta solo de Google no entra con clave.
    assert.equal(await codigo(p.entrar({ correo: 'gerencia@bolivar.co', clave: CLAVE, recordar: false })), 'credenciales');
  });

  it('se vincula a una cuenta existente con el mismo correo y la da por confirmada', async () => {
    const { p } = nuevo();
    await p.crearCuenta({ usuario: 'andes', correo: 'a@andes.co', clave: CLAVE });
    const s = await p.entrarConGoogle({ idToken: jwt({ email: 'a@andes.co', email_verified: true, sub: 'g-2' }), nonce: 'n', recordar: false });
    assert.equal(s.cuenta.usuario, 'andes');
    assert.equal(s.cuenta.estado, 'pendiente');
    assert.deepEqual(s.cuenta.metodos.sort(), ['correo', 'google']);
  });

  it('rechaza nonce distinto, correo sin verificar, token vencido o basura', async () => {
    const { p } = nuevo();
    const exp = Date.parse('2026-10-13T12:00:00Z') / 1000;
    assert.equal(await codigo(p.entrarConGoogle({ idToken: jwt({ email: 'a@b.co', nonce: 'otro' }), nonce: 'n', recordar: false })), 'google_invalido');
    assert.equal(await codigo(p.entrarConGoogle({ idToken: jwt({ email: 'a@b.co', email_verified: false }), nonce: 'n', recordar: false })), 'google_invalido');
    assert.equal(await codigo(p.entrarConGoogle({ idToken: jwt({ email: 'a@b.co', exp: exp - 1 }), nonce: 'n', recordar: false })), 'google_invalido');
    assert.equal(await codigo(p.entrarConGoogle({ idToken: 'no-es-un-jwt', nonce: 'n', recordar: false })), 'google_invalido');
  });

  it('usuarios sugeridos repetidos se numeran', async () => {
    const { p } = nuevo();
    await p.entrarConGoogle({ idToken: jwt({ email: 'a@x.co', name: 'Andes', sub: '1' }), nonce: 'n', recordar: false });
    const s = await p.entrarConGoogle({ idToken: jwt({ email: 'b@x.co', name: 'Andes', sub: '2' }), nonce: 'n', recordar: false });
    assert.equal(s.cuenta.usuario, 'andes-2');
  });
});
