"use server";

import { requerirUsuario } from "@/auth/sesion";
import { enlaceRegistro } from "../apps";
import { obtenerObjeto } from "../objetos";
import * as repo from "./repositorio";

export interface ResultadoPaleta {
  id: string;
  nombre: string;
  objeto: string;
  etiqueta: string;
  href: string;
}

const OBJETOS_BUSCABLES = ["candidatos", "contactos", "cuentas", "oportunidades"] as const;

function aResultado(o: { id: string; nombre: string; objeto: string }): ResultadoPaleta {
  return { ...o, etiqueta: obtenerObjeto(o.objeto)?.etiqueta ?? o.objeto, href: enlaceRegistro(o.objeto, o.id) };
}

/** Búsqueda en vivo de la paleta de comandos: leads, contactos, empresas y negocios que la persona puede ver (un asesor, solo los suyos). */
export async function buscarEnTodo(q: string): Promise<ResultadoPaleta[]> {
  await requerirUsuario();
  const texto = q.trim().slice(0, 80);
  if (texto.length < 2) return [];
  const grupos = await Promise.all(OBJETOS_BUSCABLES.map((o) => repo.buscarParaCampo(o, texto, 4).catch(() => [])));
  return grupos.flat().map(aResultado);
}

/** Lo último que abrió la persona: aparece al abrir la paleta sin escribir nada. */
export async function recientesParaPaleta(): Promise<ResultadoPaleta[]> {
  const usuario = await requerirUsuario();
  return (await repo.recientes(usuario.id, 6)).map(aResultado);
}
