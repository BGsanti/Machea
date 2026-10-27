import assert from "node:assert/strict";
import test from "node:test";
import { enlacePermitido, esObjetoDeGestion, esObjetoPersonal, puede, puedeCambiarRol, rolDe, soloVeLoSuyo } from "./permisos";

test("el rol antiguo «usuario» es asesor y lo desconocido es el rol más bajo", () => {
  assert.equal(rolDe("usuario"), "asesor");
  assert.equal(rolDe("admin"), "admin");
  assert.equal(rolDe("superadmin"), "lectura");
  assert.equal(rolDe(undefined), "lectura");
});

test("qué puede hacer cada rol", () => {
  assert.ok(puede("admin", "configurar"));
  assert.ok(!puede("gerente", "configurar"));
  assert.ok(puede("gerente", "equipo") && puede("gerente", "repartir") && puede("gerente", "eliminar"));
  assert.ok(puede("asesor", "escribir"));
  assert.ok(!puede("asesor", "eliminar") && !puede("asesor", "importar") && !puede("asesor", "repartir") && !puede("asesor", "equipo"));
  assert.ok(!puede("lectura", "escribir") && puede("lectura", "ver_todo"));
});

test("solo el asesor ve únicamente lo suyo", () => {
  assert.ok(soloVeLoSuyo("asesor"));
  assert.ok(soloVeLoSuyo("usuario"));
  for (const r of ["admin", "gerente", "lectura"]) assert.ok(!soloVeLoSuyo(r), r);
});

test("nadie toca al dueño y solo el dueño nombra gerentes", () => {
  assert.ok(!puedeCambiarRol("gerente", "admin", "asesor"));
  assert.ok(!puedeCambiarRol("admin", "asesor", "admin"));
  assert.ok(puedeCambiarRol("admin", "asesor", "gerente"));
  assert.ok(!puedeCambiarRol("gerente", "asesor", "gerente"));
  assert.ok(!puedeCambiarRol("gerente", "gerente", "asesor"));
  assert.ok(puedeCambiarRol("gerente", "asesor", "lectura"));
  assert.ok(!puedeCambiarRol("asesor", "asesor", "lectura"));
});

test("la barra lateral esconde lo que el rol no puede usar", () => {
  assert.ok(!enlacePermitido("asesor", "equipo") && !enlacePermitido("asesor", "formularios") && !enlacePermitido("asesor", "automatizacion"));
  assert.ok(enlacePermitido("gerente", "equipo") && enlacePermitido("gerente", "automatizacion"));
  assert.ok(!enlacePermitido("gerente", "su-cuenta") && enlacePermitido("admin", "su-cuenta"));
  assert.ok(enlacePermitido("asesor", "leads"));
});

test("objetos personales y de gestión", () => {
  assert.ok(esObjetoPersonal("candidatos") && esObjetoPersonal("tareas") && !esObjetoPersonal("proyectos"));
  assert.ok(esObjetoDeGestion("flujos") && !esObjetoDeGestion("candidatos"));
});
