import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_GENERICO, textoDeError } from "./errores";

test("los mensajes propios pasan tal cual", () => {
  assert.equal(textoDeError(new Error("El registro ya no existe.")), "El registro ya no existe.");
  assert.equal(textoDeError("algo"), "Ocurrió un error inesperado.");
  assert.equal(textoDeError(new Error("")), "Ocurrió un error inesperado.");
});

test("los errores de la base de datos nunca llegan a la persona", () => {
  const registrado: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void registrado.push(args);
  try {
    for (const interno of [
      'Failed query: insert into "crm"."candidatos" ("id", "empresa_id") values ($1, $2)\nparams: 1,2',
      'value "99999999999999999999" is out of range for type integer',
      'insert or update on table "tareas" violates foreign key constraint',
      'invalid input syntax for type uuid: "no-es-uuid"',
      "connect ECONNREFUSED 127.0.0.1:5432",
    ]) {
      assert.equal(textoDeError(new Error(interno)), MENSAJE_GENERICO, interno);
    }
  } finally {
    console.error = original;
  }
  assert.equal(registrado.length, 5, "cada error de la base queda en el registro del servidor");
});
