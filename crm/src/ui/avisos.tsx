"use client";

import { useSyncExternalStore } from "react";
import { Icono } from "./icono";

interface Aviso {
  id: number;
  texto: string;
  tipo: "exito" | "error" | "info";
}

let avisos: Aviso[] = [];
let siguiente = 1;
const oyentes = new Set<() => void>();

function emitir() {
  for (const o of oyentes) o();
}

/** Muestra un aviso temporal en la esquina de la pantalla. */
export function avisar(texto: string, tipo: Aviso["tipo"] = "exito") {
  const id = siguiente++;
  avisos = [...avisos, { id, texto, tipo }];
  emitir();
  setTimeout(() => cerrar(id), tipo === "error" ? 7000 : 4000);
}

function cerrar(id: number) {
  avisos = avisos.filter((a) => a.id !== id);
  emitir();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

const vacio: Aviso[] = [];

export function Avisos() {
  const lista = useSyncExternalStore(suscribir, () => avisos, () => vacio);
  if (lista.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {lista.map((a) => (
        <div
          key={a.id}
          role="status"
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
            a.tipo === "error" ? "bg-rose-700" : a.tipo === "info" ? "bg-slate-800" : "bg-emerald-700"
          }`}
        >
          <Icono nombre={a.tipo === "error" ? "TriangleAlert" : a.tipo === "info" ? "Info" : "CircleCheck"} className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{a.texto}</span>
          <button type="button" onClick={() => cerrar(a.id)} className="opacity-80 hover:opacity-100" aria-label="Cerrar aviso">
            <Icono nombre="X" />
          </button>
        </div>
      ))}
    </div>
  );
}
