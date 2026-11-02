import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ACENTOS_A, ACENTOS_DE, digitosDeTelefono, limpiarBusqueda, patronContiene, sinAcentos } from "./texto";

test("sin acentos ni mayúsculas", () => {
  assert.equal(sinAcentos("Gómez"), "gomez");
  assert.equal(sinAcentos("ÁNGEL Ñandú Üñíga"), "angel nandu uniga");
  assert.equal(sinAcentos("José 🙂 Ñandú"), "jose 🙂 nandu");
});

test("el patrón de búsqueda no deja que %, _ o \\ actúen como comodines", () => {
  assert.equal(patronContiene("Gómez"), "%gomez%");
  assert.equal(patronContiene("100%"), "%100\\%%");
  assert.equal(patronContiene("a_b\\c"), "%a\\_b\\\\c%");
  assert.equal(patronContiene("hola\u0000 "), "%hola%");
  assert.equal(limpiarBusqueda("  a\u0000b  "), "ab");
});

test("un teléfono se reconoce por sus dígitos", () => {
  assert.equal(digitosDeTelefono("300 111 2233"), "3001112233");
  assert.equal(digitosDeTelefono("+57 300 111 2233"), "3001112233");
  assert.equal(digitosDeTelefono("573001112233"), "3001112233");
  assert.equal(digitosDeTelefono("(601) 234-5678"), "6012345678");
  assert.equal(digitosDeTelefono("123"), null, "muy corto para ser un teléfono");
  assert.equal(digitosDeTelefono("Gómez"), null);
  assert.equal(digitosDeTelefono("300 abc"), null);
});

test("los dos lados del mapa de acentos tienen el mismo largo", () => {
  assert.equal([...ACENTOS_DE].length, [...ACENTOS_A].length);
});

test("la condición SQL encuentra sin importar acentos, mayúsculas ni formato del teléfono (PostgreSQL real)", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table t (nombre text, telefono text)");
    await db.query("insert into t values ('Ana Gómez', '+57 300 111 2233'), ('ÁNGEL Ñandú', '3009998877'), ('100% real', null), ('Cien por ciento', null)");
    const nombres = async (q: string) =>
      (
        await db.query<{ nombre: string }>(
          "select nombre from t where lower(translate(nombre::text, $1, $2)) like $3 order by nombre",
          [ACENTOS_DE, ACENTOS_A, patronContiene(q)],
        )
      ).rows.map((r) => r.nombre);
    assert.deepEqual(await nombres("gomez"), ["Ana Gómez"]);
    assert.deepEqual(await nombres("GÓMEZ"), ["Ana Gómez"]);
    assert.deepEqual(await nombres("angel nandu"), ["ÁNGEL Ñandú"]);
    assert.deepEqual(await nombres("100%"), ["100% real"], "el % se busca tal cual, no es comodín");
    assert.deepEqual(await nombres("%"), ["100% real"]);
    const porTelefono = async (q: string) =>
      (await db.query<{ nombre: string }>("select nombre from t where regexp_replace(telefono, '[^0-9]', '', 'g') like $1", [`%${digitosDeTelefono(q)}%`])).rows.map((r) => r.nombre);
    for (const escrito of ["3001112233", "300 111 2233", "+57 300 111 2233", "573001112233", "(300) 111-2233"]) {
      assert.deepEqual(await porTelefono(escrito), ["Ana Gómez"], escrito);
    }
  } finally {
    await db.close();
  }
});
