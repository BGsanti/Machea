import assert from "node:assert/strict";
import { test } from "node:test";
import { contactoDe, etiquetaOrigen, MAX_INTENTOS, motivoEnEspanol } from "./atascados";

test("el motivo se dice en español y nunca deja pasar el error técnico", () => {
  assert.match(motivoEnEspanol("La fila no trae teléfono."), /sin número de teléfono/);
  assert.match(motivoEnEspanol("Origen desconocido: algo"), /no reconoce/);
  assert.match(motivoEnEspanol("Connection terminated unexpectedly"), /no respondió/);
  assert.match(motivoEnEspanol(null), new RegExp(`${MAX_INTENTOS} veces`));
  assert.match(motivoEnEspanol("   "), new RegExp(`${MAX_INTENTOS} veces`));
  const crudo = 'insert into "crm"."candidatos" (empresa_id, telefono) values ($1, $2) -- violates not-null constraint';
  const motivo = motivoEnEspanol(crudo);
  assert.equal(motivo, "No se pudo guardar por un problema interno.");
  assert.ok(!motivo.includes("insert") && !motivo.includes("crm"));
});

test("un origen que no se conoce se muestra como Machea", () => {
  assert.equal(etiquetaOrigen("consulta"), "Formulario de Machea");
  assert.equal(etiquetaOrigen("lo-que-sea"), "Machea");
});

test("nombre y teléfono salen de las claves de cada origen", () => {
  assert.deepEqual(contactoDe({ nombre: "Pedro", apellido: "Prueba", telefono_digitos: "3001112233" }), { nombre: "Pedro Prueba", telefono: "3001112233" });
  assert.deepEqual(contactoDe({ contacto_nombre: "Ana Soto", empresa: "Constructora X", telefono: "+573001112233" }), { nombre: "Ana Soto", telefono: "+573001112233" });
  assert.deepEqual(contactoDe({ empresa: "Constructora X" }), { nombre: "Constructora X", telefono: null });
  assert.deepEqual(contactoDe({}), { nombre: "Sin nombre", telefono: null });
  assert.deepEqual(contactoDe(null), { nombre: "Sin nombre", telefono: null });
  // valores raros no rompen: ni objetos ni vacíos
  assert.deepEqual(contactoDe({ nombre: { a: 1 }, apellido: "   ", telefono: ["x"] }), { nombre: "Sin nombre", telefono: null });
});
