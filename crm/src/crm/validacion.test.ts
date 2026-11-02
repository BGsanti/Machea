import assert from "node:assert/strict";
import { test } from "node:test";
import type { Campo } from "./tipos";
import { convertirValor, telefonoValido } from "./validacion";

const leer = (valor: string) => (n: string) => (n === "x" ? valor : "");
const convertir = (campo: Campo, valor: string) => convertirValor(campo, leer(valor), () => [valor]);

test("teléfonos escritos a mano", () => {
  for (const bueno of ["3001234567", "300 123 4567", "+57 300 123 4567", "(601) 234-5678", "+1 (305) 555-0100", "300.123.4567", "3001234567 ext. 12", "6012345678 x 204"]) {
    assert.equal(telefonoValido(bueno), true, bueno);
  }
  for (const malo of ["abc123", "123", "no tiene", "300 123 4567 llamar", "+++3001234567", "1234567890123456", "3001234567 ext", "<script>"]) {
    assert.equal(telefonoValido(malo), false, malo);
  }
});

test("un campo de teléfono rechaza texto y acepta vacío", () => {
  const campo: Campo = { nombre: "x", etiqueta: "Teléfono", tipo: "telefono" };
  assert.deepEqual(convertir(campo, "abc123"), { error: "Escriba un teléfono válido, por ejemplo 312 555 1001." });
  assert.deepEqual(convertir(campo, "300 123 4567"), { valor: { x: "300 123 4567" } });
  assert.deepEqual(convertir(campo, ""), { valor: { x: null } });
});

test("números: tope, mínimo y porcentaje", () => {
  const empleados: Campo = { nombre: "x", etiqueta: "Empleados", tipo: "numero", min: 0 };
  assert.deepEqual(convertir(empleados, "25"), { valor: { x: 25 } });
  assert.deepEqual(convertir(empleados, "-50"), { error: "No puede ser menor que 0." });
  assert.deepEqual(convertir(empleados, "99999999999999999999"), { error: "El número es demasiado grande." });
  assert.deepEqual(convertir(empleados, "abc"), { error: "Escriba un número." });
  const dinero: Campo = { nombre: "x", etiqueta: "Importe", tipo: "moneda" };
  assert.deepEqual(convertir(dinero, "2.330.000.000".replace(/\./g, "")), { valor: { x: 2330000000 } });
  assert.deepEqual(convertir(dinero, "-1000"), { valor: { x: -1000 } });
  const porcentaje: Campo = { nombre: "x", etiqueta: "Probabilidad", tipo: "porcentaje" };
  assert.deepEqual(convertir(porcentaje, "101"), { error: "Debe estar entre 0 y 100." });
});
