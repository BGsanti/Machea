"use client";

import { useEffect, useRef } from "react";
import { avisar } from "@/ui/avisos";
import { enlaceRegistro } from "../../apps";
import { novedadesDeLeads } from "../../servidor/vivo";

const CADA_MS = 30_000;

/**
 * Avisa en pantalla cuando entra un lead nuevo de Machea o Manuela deja uno caliente, sin recargar.
 * Pregunta cada 30 s mientras la pestaña está a la vista; la primera vez solo marca la hora de partida.
 */
export function AvisosEnVivo() {
  const desde = useRef<number>(Date.now());

  useEffect(() => {
    let vivo = true;
    const preguntar = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await novedadesDeLeads(desde.current).catch(() => null);
      if (!vivo || !r) return;
      desde.current = r.ahoraMs;
      for (const n of r.novedades.slice(0, 3)) {
        const accion = n.candidatoId ? { texto: "Abrir", href: enlaceRegistro("candidatos", n.candidatoId) } : undefined;
        if (n.tipo === "caliente") avisar(`Lead caliente: ${n.nombre}${n.detalle ? ` · ${n.detalle}` : ""}`, "caliente", { accion, duracion: 12000 });
        else avisar(`Nuevo lead: ${n.nombre}${n.detalle ? ` · ${n.detalle}` : ""}`, "info", { accion, duracion: 9000 });
      }
    };
    const reloj = setInterval(preguntar, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && void preguntar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  return null;
}
