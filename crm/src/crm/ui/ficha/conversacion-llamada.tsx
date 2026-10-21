"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Icono } from "@/ui/icono";
import type { TurnoLlamada } from "../../servidor/grabaciones";

function minutos(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * El audio de la llamada y su conversación. Tocar un turno salta a ese segundo del audio; mientras suena, el turno
 * en curso se resalta. Sin audio reproducible solo se muestra el texto.
 */
export function ConversacionLlamada({
  llamadaId,
  turnos,
  reproducible,
  enlaceDapta,
  duracionMs,
  agente,
}: {
  llamadaId: string;
  turnos: TurnoLlamada[];
  reproducible: boolean;
  enlaceDapta: string | null;
  duracionMs: number | null;
  agente: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const lista = useRef<HTMLOListElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [actual, setActual] = useState(-1);
  const conTiempos = turnos.some((t) => typeof t.s === "number");

  useEffect(() => {
    const el = audio.current;
    if (!el || !conTiempos) return;
    const alAvanzar = () => {
      let i = -1;
      turnos.forEach((t, n) => {
        if (typeof t.s === "number" && t.s <= el.currentTime + 0.3) i = n;
      });
      setActual(i);
    };
    el.addEventListener("timeupdate", alAvanzar);
    return () => el.removeEventListener("timeupdate", alAvanzar);
  }, [turnos, conTiempos]);

  useEffect(() => {
    if (!abierta || actual < 0) return;
    const item = lista.current?.children[actual] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [actual, abierta]);

  const saltar = (s: number | undefined) => {
    const el = audio.current;
    if (!el || typeof s !== "number") return;
    el.currentTime = Math.max(0, s - 0.2);
    void el.play().catch(() => undefined);
  };

  const rutaAudio = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/grabacion/${encodeURIComponent(llamadaId)}`;

  if (!reproducible && !enlaceDapta && turnos.length === 0) return null;

  return (
    <div className="border-t border-slate-100 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {reproducible ? (
          <audio ref={audio} controls preload="none" src={rutaAudio} className="h-9 w-full max-w-md" aria-label={`Audio de la llamada de ${agente}`} />
        ) : enlaceDapta ? (
          <a href={enlaceDapta} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-marca-700 hover:underline">
            <Icono nombre="ExternalLink" className="size-4" /> Escuchar en Dapta (pide iniciar sesión allá)
          </a>
        ) : (
          <span className="text-xs text-slate-500">Esta llamada no tiene audio guardado.</span>
        )}
        {duracionMs ? <span className="text-xs text-slate-500">Duró {minutos(duracionMs / 1000)}</span> : null}
        {turnos.length ? (
          <button
            type="button"
            onClick={() => setAbierta(!abierta)}
            aria-expanded={abierta}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-marca-700"
          >
            {abierta ? "Ocultar la conversación" : `Ver la conversación (${turnos.length})`}
            <Icono nombre={abierta ? "ChevronDown" : "ChevronRight"} className="size-4" />
          </button>
        ) : null}
      </div>
      {abierta ? (
        <ol ref={lista} className="desplazable animate-bajar mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Conversación">
          {turnos.map((t, i) => (
            <li key={i} className={clsx("flex", t.r === "a" ? "justify-start" : "justify-end")}>
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm transition-colors duration-150",
                  t.r === "a" ? "rounded-tl-sm bg-slate-100 text-slate-800" : "rounded-tr-sm bg-marca-50 text-slate-800",
                  i === actual && "ring-2 ring-marca-500",
                )}
              >
                <p className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                  {t.r === "a" ? agente : "Persona"}
                  {typeof t.s === "number" ? (
                    reproducible ? (
                      <button type="button" onClick={() => saltar(t.s)} className="font-normal text-marca-700 hover:underline" title="Escuchar desde aquí">
                        {minutos(t.s)}
                      </button>
                    ) : (
                      <span className="font-normal">{minutos(t.s)}</span>
                    )
                  ) : null}
                </p>
                {t.t}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
