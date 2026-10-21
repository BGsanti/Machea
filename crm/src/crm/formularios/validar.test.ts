import assert from "node:assert/strict";
import test from "node:test";
import { plantillaFormulario } from "./plantillas";
import { esquemaConfig } from "./tipos";
import { normalizarTelefono, partirNombre, validarEnvio } from "./validar";

test("teléfonos", () => {
  assert.deepEqual(normalizarTelefono("312 555 1001"), { telefono: "+57 312 555 1001", digitos: "3125551001" });
  assert.deepEqual(normalizarTelefono("+57 (312) 555-1001"), { telefono: "+57 312 555 1001", digitos: "3125551001" });
  assert.equal(normalizarTelefono("573125551001")?.digitos, "3125551001");
  assert.equal(normalizarTelefono("601 555 3002")?.digitos, "6015553002");
  assert.equal(normalizarTelefono("+1 443 293 0308")?.telefono, "+14432930308");
  assert.equal(normalizarTelefono("12345"), null);
  assert.equal(normalizarTelefono("2125551001"), null); // 10 dígitos pero no celular ni fijo de Colombia
});

test("nombres", () => {
  assert.deepEqual(partirNombre("Ana"), { nombre: "Ana", apellidos: "(sin apellido)" });
  assert.deepEqual(partirNombre("Ana Ríos"), { nombre: "Ana", apellidos: "Ríos" });
  assert.deepEqual(partirNombre("Juan Gómez Pérez"), { nombre: "Juan", apellidos: "Gómez Pérez" });
  assert.deepEqual(partirNombre("Juan Felipe Gómez Pérez"), { nombre: "Juan Felipe", apellidos: "Gómez Pérez" });
});

test("las tres plantillas son válidas (con el texto de autorización sin completar, pero válidas de forma)", () => {
  for (const id of ["comprador", "proyecto", "demo"] as const) {
    const r = esquemaConfig.safeParse(plantillaFormulario(id, "Constructora Aurora").config);
    assert.ok(r.success, id + ": " + JSON.stringify(r.success ? "" : r.error.issues));
  }
});

test("envío completo", () => {
  const { config } = plantillaFormulario("comprador", "Inmobiliaria X");
  const r = validarEnvio(config, { nombre: "  Valentina   Ríos ", telefono: "312 555 1001", correo: "VALE@Correo.example", operacion: "Comprar", presupuesto: "$400 a $700 millones", interes: "Torres de Chapinero", mensaje: "Hola" }, true);
  assert.equal(r.errores, null);
  if (r.errores === null) {
    assert.equal(r.envio.lead.nombre, "Valentina");
    assert.equal(r.envio.lead.apellidos, "Ríos");
    assert.equal(r.envio.lead.telefono, "+57 312 555 1001");
    assert.equal(r.envio.lead.email, "vale@correo.example");
    assert.equal(r.envio.lead.interes, "Torres de Chapinero");
    assert.equal(r.envio.digitos, "3125551001");
    assert.ok(r.envio.respuestas.some((x) => x.clave === "operacion" && x.valor === "Comprar"));
    assert.ok(!r.envio.respuestas.some((x) => x.clave === "telefono" || x.clave === "nombre"));
  }
});

test("errores", () => {
  const { config } = plantillaFormulario("comprador", "X");
  const r = validarEnvio(config, { nombre: "", telefono: "123", correo: "no-es-correo", operacion: "Otra cosa" }, false);
  assert.ok(r.errores);
  assert.ok(r.errores!.nombre && r.errores!.telefono && r.errores!.correo && r.errores!.operacion && r.errores!._consentimiento);
});

test("no acepta opciones que no existen ni sube de tamaño", () => {
  const { config } = plantillaFormulario("proyecto", "X");
  const r = validarEnvio(config, { nombre: "A B", telefono: "3125551001", interes: "Algo", ingresos: "Un millón de dólares" }, true);
  assert.ok(r.errores && r.errores.ingresos);
});
