import assert from "node:assert/strict";
import { test } from "node:test";
import { textoAutorizacion } from "./plantillas";

test("la autorización de una empresa cliente nombra a Machea como encargado", () => {
  const texto = textoAutorizacion("Inmobiliaria Andes");
  assert.match(texto, /Inmobiliaria Andes es la responsable del tratamiento y Machea actúa como su encargado/);
});

test("la autorización de la propia Machea no se nombra encargada de sí misma", () => {
  for (const nombre of ["Machea", "machea", " MACHEA "]) {
    const texto = textoAutorizacion(nombre);
    assert.match(texto, /Machea es la responsable del tratamiento\./);
    assert.doesNotMatch(texto, /encargado/);
  }
});
