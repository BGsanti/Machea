"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, useTransition } from "react";
import { DESCRIPCION_ROL, ETIQUETA_ROL, puedeCambiarRol, ROLES_INVITABLES, rolDe, type Rol } from "@/auth/permisos";
import {
  alternarActivo,
  alternarRecibeLeads,
  cambiarRol,
  guardarReparto,
  invitarMiembro,
  reasignarLeadsDe,
  revocarInvitacion,
} from "@/crm/servidor/equipo";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta, Tarjeta } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { Modal } from "@/ui/modal";
import { NumeroAnimado } from "@/ui/numero-animado";

export interface MiembroVista {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  recibeLeads: boolean;
  telefono: string | null;
  ultimoAcceso: string | null;
  creadoEn: string;
  abiertos: number;
  sinContactar: number;
  atrasados: number;
  tareasVencidas: number;
}

export interface InvitacionVista {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  expira: string;
  creadaEn: string;
}

const COLORES_AVATAR = ["bg-rose-100 text-rose-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-teal-100 text-teal-700"];

function Avatar({ nombre, activo = true }: { nombre: string; activo?: boolean }) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span className={clsx("inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", activo ? COLORES_AVATAR[h % COLORES_AVATAR.length] : "bg-slate-100 text-slate-400")}>
      {iniciales || "?"}
    </span>
  );
}

function Interruptor({ activo, deshabilitado, onCambio, etiqueta }: { activo: boolean; deshabilitado?: boolean; onCambio: (valor: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600 disabled:cursor-not-allowed disabled:opacity-40",
        activo ? "bg-emerald-500" : "bg-slate-300",
      )}
    >
      <span className={clsx("inline-block size-5 rounded-full bg-white shadow transition-transform duration-150", activo ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

/** El rol que aparece marcado al invitar: el de la invitación anterior si hay, y si no, asesor (lo más común). */
function rolInicial(valor: string | undefined, puedeGerente: boolean): Rol {
  if (valor === "lectura") return "lectura";
  if (valor === "gerente" && puedeGerente) return "gerente";
  return "asesor";
}

function hace(iso: string | null): string {
  if (!iso) return "Aún no ha entrado";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 2) return "Activo ahora";
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
  return `Hace ${Math.round(min / 1440)} d`;
}

// ---------------------------------------------------------------------------
// Encabezado e invitación
// ---------------------------------------------------------------------------

export function EncabezadoEquipo({ puedeInvitarGerentes }: { puedeInvitarGerentes: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div>
        <p className="text-xs text-slate-500">Configuración</p>
        <h1 className="text-xl font-semibold text-slate-800">Equipo</h1>
        <p className="mt-0.5 text-sm text-slate-500">Quién atiende los leads, cuánto tiene cada uno y cómo se reparten los nuevos.</p>
      </div>
      <Boton variante="primario" icono="UserPlus" onClick={() => setAbierto(true)}>
        Invitar a alguien
      </Boton>
      <ModalInvitar abierto={abierto} alCerrar={() => setAbierto(false)} puedeInvitarGerentes={puedeInvitarGerentes} />
    </div>
  );
}

function ModalInvitar({
  abierto,
  alCerrar,
  puedeInvitarGerentes,
  previa,
}: {
  abierto: boolean;
  alCerrar: () => void;
  puedeInvitarGerentes: boolean;
  previa?: { nombre: string; correo: string; rol: string };
}) {
  const roles = ROLES_INVITABLES.filter((r) => r !== "gerente" || puedeInvitarGerentes);
  const [rol, setRol] = useState<Rol>(rolInicial(previa?.rol, puedeInvitarGerentes));
  const [enlace, setEnlace] = useState<string | null>(null);
  const [nombre, setNombre] = useState(previa?.nombre ?? "");
  const [pendiente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (abierto) {
      setEnlace(null);
      setCopiado(false);
      setNombre(previa?.nombre ?? "");
      setRol(rolInicial(previa?.rol, puedeInvitarGerentes));
    }
  }, [abierto, previa, puedeInvitarGerentes]);

  const mensajeWhatsApp = (e: string) => `Hola ${nombre.split(" ")[0] ?? ""}, te invité a nuestro CRM en Machea. Crea tu acceso aquí (vale 7 días): ${e}`;

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={enlace ? "Invitación lista" : "Invitar a alguien al equipo"}
      ancho="sm"
      pie={
        enlace ? (
          <Boton variante="primario" onClick={alCerrar}>
            Listo
          </Boton>
        ) : (
          <>
            <Boton onClick={alCerrar}>Cancelar</Boton>
            <Boton variante="primario" icono="Send" cargando={pendiente} onClick={() => (document.getElementById("form-invitar") as HTMLFormElement | null)?.requestSubmit()}>
              Crear invitación
            </Boton>
          </>
        )
      }
    >
      {enlace ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            <Icono nombre="CircleCheck" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p>
              Mándale este enlace a <strong>{nombre}</strong>. Con él elige su usuario y su contraseña. Vale 7 días y solo sirve una vez.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <input readOnly value={enlace} aria-label="Enlace de la invitación" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent px-1 text-xs text-slate-700 outline-none" />
            <Boton
              tamano="sm"
              icono={copiado ? "Check" : "Copy"}
              onClick={async () => {
                await navigator.clipboard.writeText(enlace);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </Boton>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp(enlace))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#25d366] px-3.5 text-sm font-semibold text-white transition-[filter,transform] duration-150 hover:brightness-95 active:translate-y-px"
          >
            <Icono nombre="MessageCircle" className="size-4" />
            Enviar por WhatsApp
          </a>
          <p className="text-xs text-slate-500">Por seguridad el enlace solo se muestra ahora. Si se pierde, crea otro desde «Invitaciones pendientes».</p>
        </div>
      ) : (
        <form
          id="form-invitar"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const datos = new FormData(e.currentTarget);
            datos.set("rol", rol);
            iniciar(async () => {
              const r = await invitarMiembro(datos);
              if (r.ok && r.enlace) setEnlace(r.enlace);
              else avisar(r.mensaje ?? "No se pudo crear la invitación.", "error");
            });
          }}
        >
          <div>
            <Etiqueta htmlFor="i-nombre" requerido>
              Nombre
            </Etiqueta>
            <input id="i-nombre" name="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" className={claseInput} placeholder="Laura Gómez" />
          </div>
          <div>
            <Etiqueta htmlFor="i-correo" requerido>
              Correo
            </Etiqueta>
            <input id="i-correo" name="correo" type="email" required defaultValue={previa?.correo} autoComplete="off" className={claseInput} placeholder="laura@tuempresa.com" />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">¿Qué va a hacer?</legend>
            <div className="space-y-2">
              {roles.map((r) => (
                <label
                  key={r}
                  className={clsx(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150",
                    rol === r ? "border-marca-600 bg-marca-50 ring-1 ring-marca-600/30" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <input type="radio" name="rol-visible" checked={rol === r} onChange={() => setRol(r)} className="mt-1 accent-marca-700" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{ETIQUETA_ROL[r]}</span>
                    <span className="block text-xs text-slate-500">{DESCRIPCION_ROL[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}

export function InvitacionesPendientes({ invitaciones, puedeInvitarGerentes }: { invitaciones: InvitacionVista[]; puedeInvitarGerentes: boolean }) {
  const [reenviar, setReenviar] = useState<InvitacionVista | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (invitaciones.length === 0) return null;
  return (
    <Tarjeta titulo={`Invitaciones pendientes (${invitaciones.length})`} icono={<Icono nombre="Mail" className="size-4 text-slate-500" />} sinRelleno>
      <ul className="divide-y divide-slate-100">
        {invitaciones.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar nombre={i.nombre} activo={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {i.nombre} <span className="font-normal text-slate-500">· {ETIQUETA_ROL[rolDe(i.rol)]}</span>
              </p>
              <p className="truncate text-xs text-slate-500">
                {i.correo} · vence {new Date(i.expira).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
              </p>
            </div>
            <Boton tamano="sm" icono="Link" onClick={() => setReenviar(i)}>
              Crear enlace nuevo
            </Boton>
            <Boton
              tamano="sm"
              variante="fantasma"
              icono="X"
              cargando={pendiente}
              onClick={() =>
                iniciar(async () => {
                  const r = await revocarInvitacion(i.id);
                  avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                })
              }
            >
              Cancelar
            </Boton>
          </li>
        ))}
      </ul>
      <ModalInvitar abierto={Boolean(reenviar)} alCerrar={() => setReenviar(null)} puedeInvitarGerentes={puedeInvitarGerentes} previa={reenviar ?? undefined} />
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Resumen y lista
// ---------------------------------------------------------------------------

export function ResumenEquipo({ miembros }: { miembros: MiembroVista[] }) {
  const activos = miembros.filter((m) => m.activo);
  const enReparto = activos.filter((m) => m.recibeLeads).length;
  const sinContactar = miembros.reduce((s, m) => s + m.sinContactar, 0);
  const atrasados = miembros.reduce((s, m) => s + m.atrasados, 0);
  const tiles: { etiqueta: string; valor: number; icono: string; tono: string; nota?: string }[] = [
    { etiqueta: "Personas activas", valor: activos.length, icono: "Users", tono: "text-slate-700 bg-slate-100" },
    { etiqueta: "En el reparto", valor: enReparto, icono: "ArrowRightLeft", tono: "text-emerald-700 bg-emerald-100", nota: enReparto === 0 ? "Los leads quedan con el dueño" : undefined },
    { etiqueta: "Leads sin contactar", valor: sinContactar, icono: "Inbox", tono: "text-sky-700 bg-sky-100" },
    { etiqueta: "Atrasados", valor: atrasados, icono: "AlarmClock", tono: atrasados > 0 ? "text-rose-700 bg-rose-100" : "text-slate-500 bg-slate-100", nota: atrasados > 0 ? "Pasaron el tiempo de respuesta" : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.etiqueta} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">{t.etiqueta}</p>
            <span className={clsx("inline-flex size-7 items-center justify-center rounded-lg", t.tono)}>
              <Icono nombre={t.icono} className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-800">
            <NumeroAnimado valor={t.valor} />
          </p>
          {t.nota ? <p className="mt-0.5 text-[11px] text-slate-500">{t.nota}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function ListaEquipo({
  miembros,
  yoId,
  yoRol: yoRolTexto,
  puedeRepartir,
  slaMinutos,
}: {
  miembros: MiembroVista[];
  yoId: string;
  yoRol: string;
  puedeRepartir: boolean;
  slaMinutos: number;
}) {
  const yoRol = rolDe(yoRolTexto);
  const maxAbiertos = Math.max(1, ...miembros.map((m) => m.abiertos));
  const [aDesactivar, setADesactivar] = useState<MiembroVista | null>(null);
  const [aReasignar, setAReasignar] = useState<MiembroVista | null>(null);
  return (
    <Tarjeta titulo={`Personas (${miembros.length})`} icono={<Icono nombre="Users" className="size-4 text-slate-500" />} sinRelleno>
      <ul className="divide-y divide-slate-100">
        {miembros.map((m, i) => (
          <FilaMiembro
            key={m.id}
            m={m}
            indice={i}
            esYo={m.id === yoId}
            yoRol={yoRol}
            maxAbiertos={maxAbiertos}
            puedeRepartir={puedeRepartir}
            slaMinutos={slaMinutos}
            alDesactivar={() => setADesactivar(m)}
            alReasignar={() => setAReasignar(m)}
          />
        ))}
      </ul>
      <ModalMover
        abierto={Boolean(aDesactivar)}
        alCerrar={() => setADesactivar(null)}
        miembro={aDesactivar}
        otros={miembros.filter((o) => o.activo && o.id !== aDesactivar?.id && rolDe(o.rol) !== "lectura")}
        modo="desactivar"
      />
      <ModalMover
        abierto={Boolean(aReasignar)}
        alCerrar={() => setAReasignar(null)}
        miembro={aReasignar}
        otros={miembros.filter((o) => o.activo && o.id !== aReasignar?.id && rolDe(o.rol) !== "lectura")}
        modo="reasignar"
      />
    </Tarjeta>
  );
}

function FilaMiembro({
  m,
  indice,
  esYo,
  yoRol,
  maxAbiertos,
  puedeRepartir,
  slaMinutos,
  alDesactivar,
  alReasignar,
}: {
  m: MiembroVista;
  indice: number;
  esYo: boolean;
  yoRol: Rol;
  maxAbiertos: number;
  puedeRepartir: boolean;
  slaMinutos: number;
  alDesactivar: () => void;
  alReasignar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [menu, setMenu] = useState(false);
  const refMenu = useRef<HTMLDivElement>(null);
  const rol = rolDe(m.rol);
  const esDueno = rol === "admin";
  const puedeEditar = !esYo && !esDueno && puedeCambiarRol(yoRol, rol, "asesor");

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => {
      if (!refMenu.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [menu]);

  const ejecutar = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
    });

  return (
    <li
      style={{ animationDelay: `${Math.min(indice, 8) * 30}ms` }}
      className={clsx("animate-subir flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors duration-150 hover:bg-slate-50/70", !m.activo && "bg-slate-50/60", pendiente && "opacity-60")}
    >
      <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        <Avatar nombre={m.nombre} activo={m.activo} />
        <div className="min-w-0">
          <p className={clsx("truncate text-sm font-semibold", m.activo ? "text-slate-800" : "text-slate-400")}>
            {m.nombre} {esYo ? <span className="text-xs font-normal text-slate-400">(usted)</span> : null}
          </p>
          <p className="truncate text-xs text-slate-500">{m.email}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{m.activo ? hace(m.ultimoAcceso) : "Desactivado"}</p>
        </div>
      </div>

      <div className="w-36 shrink-0">
        {puedeEditar && m.activo ? (
          <select
            aria-label={`Rol de ${m.nombre}`}
            value={rol}
            disabled={pendiente}
            onChange={(e) => ejecutar(() => cambiarRol(m.id, e.target.value))}
            className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 shadow-sm focus:border-marca-600 focus:ring-2 focus:ring-marca-600/20 focus:outline-none"
          >
            {ROLES_INVITABLES.filter((r) => puedeCambiarRol(yoRol, rol, r)).map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", esDueno ? "bg-marca-100 text-marca-800" : "bg-slate-100 text-slate-600")}>
            {esDueno ? <Icono nombre="Crown" className="size-3" /> : null}
            {ETIQUETA_ROL[rol]}
          </span>
        )}
      </div>

      <div className="w-44 shrink-0">
        {rol === "lectura" ? (
          <p className="text-xs text-slate-400">Solo consulta</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-slate-700">{m.abiertos} leads abiertos</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="h-full rounded-full bg-marca-500 transition-[width] duration-500" style={{ width: `${Math.round((m.abiertos / maxAbiertos) * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.atrasados > 0 ? (
                <span title={`Más de ${slaMinutos} min sin contactar`} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                  {m.atrasados} atrasado{m.atrasados === 1 ? "" : "s"}
                </span>
              ) : null}
              {m.sinContactar - m.atrasados > 0 ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">{m.sinContactar - m.atrasados} por contactar</span> : null}
              {m.tareasVencidas > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">{m.tareasVencidas} tarea{m.tareasVencidas === 1 ? "" : "s"} vencida{m.tareasVencidas === 1 ? "" : "s"}</span> : null}
            </div>
          </>
        )}
      </div>

      <div className="flex w-32 shrink-0 items-center gap-2">
        {rol !== "lectura" && m.activo ? (
          <>
            <Interruptor
              activo={m.recibeLeads}
              deshabilitado={!puedeRepartir || pendiente}
              etiqueta={`${m.nombre} recibe leads nuevos`}
              onCambio={(v) => ejecutar(() => alternarRecibeLeads(m.id, v))}
            />
            <span className="text-xs leading-tight text-slate-500">Recibe leads</span>
          </>
        ) : null}
      </div>

      <div ref={refMenu} className="relative ml-auto">
        {!esYo && !esDueno && (puedeEditar || puedeRepartir) ? (
          <>
            <button
              type="button"
              aria-label={`Más opciones de ${m.nombre}`}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
            >
              <Icono nombre="Ellipsis" className="size-5" />
            </button>
            {menu ? (
              <div role="menu" className="animate-escalar absolute right-0 z-20 mt-1 w-56 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {puedeRepartir && m.activo && m.abiertos > 0 ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      alReasignar();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Icono nombre="ArrowRightLeft" className="size-4 text-slate-500" /> Pasar sus leads a otro
                  </button>
                ) : null}
                {puedeEditar ? (
                  m.activo ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        alDesactivar();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                    >
                      <Icono nombre="UserX" className="size-4" /> Desactivar acceso
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        ejecutar(() => alternarActivo(m.id, true));
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                    >
                      <Icono nombre="UserCheck" className="size-4" /> Reactivar acceso
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

/** Pregunta a quién pasan los leads abiertos: al desactivar a una persona o para pasarlos sin desactivarla. */
function ModalMover({
  abierto,
  alCerrar,
  miembro,
  otros,
  modo,
}: {
  abierto: boolean;
  alCerrar: () => void;
  miembro: MiembroVista | null;
  otros: MiembroVista[];
  modo: "desactivar" | "reasignar";
}) {
  const [destino, setDestino] = useState("turnos");
  const [pendiente, iniciar] = useTransition();
  useEffect(() => {
    if (abierto) setDestino("turnos");
  }, [abierto]);
  if (!miembro) return null;
  const desactivar = modo === "desactivar";
  const hayLeads = miembro.abiertos > 0;
  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={desactivar ? `Desactivar a ${miembro.nombre}` : `Pasar los leads de ${miembro.nombre}`}
      ancho="sm"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            variante={desactivar ? "peligro" : "primario"}
            cargando={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = desactivar ? await alternarActivo(miembro.id, false, hayLeads ? destino : undefined) : await reasignarLeadsDe(miembro.id, destino);
                avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                if (r.ok) alCerrar();
              })
            }
          >
            {desactivar ? "Desactivar" : "Pasar leads"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        {desactivar ? (
          <p>
            <strong>{miembro.nombre}</strong> ya no podrá entrar al CRM. Todo lo que hizo se conserva.
          </p>
        ) : null}
        {hayLeads ? (
          <>
            <p>
              Tiene <strong>{miembro.abiertos} lead{miembro.abiertos === 1 ? "" : "s"} abierto{miembro.abiertos === 1 ? "" : "s"}</strong> con sus tareas y citas pendientes. ¿A quién pasan?
            </p>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className={claseInput} aria-label="A quién pasan sus leads">
              <option value="turnos">Repartirlos por turnos entre los asesores</option>
              {otros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre} · {ETIQUETA_ROL[rolDe(o.rol)]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p>No tiene leads abiertos, no hay nada que pasar.</p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

export function TarjetaReparto({ reparto, slaMinutos, enElReparto, puedeRepartir }: { reparto: string; slaMinutos: number; enElReparto: string[]; puedeRepartir: boolean }) {
  const [modo, setModo] = useState(reparto === "manual" ? "manual" : "turnos");
  const [pendiente, iniciar] = useTransition();
  return (
    <Tarjeta titulo="Reparto de leads nuevos" icono={<Icono nombre="ArrowRightLeft" className="size-4 text-slate-500" />}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const datos = new FormData(e.currentTarget);
          datos.set("reparto", modo);
          iniciar(async () => {
            const r = await guardarReparto(datos);
            avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
          });
        }}
      >
        <fieldset disabled={!puedeRepartir} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { v: "turnos", t: "Por turnos", d: "Cada lead nuevo le toca al siguiente asesor, en orden. Nadie recibe dos seguidos mientras otros esperan." },
              { v: "manual", t: "Manual", d: "Los leads nuevos quedan con el dueño y quien reparte los asigna a mano desde la lista de leads." },
            ].map((o) => (
              <label key={o.v} className={clsx("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150", modo === o.v ? "border-marca-600 bg-marca-50 ring-1 ring-marca-600/30" : "border-slate-200 hover:bg-slate-50")}>
                <input type="radio" name="modo-visible" checked={modo === o.v} onChange={() => setModo(o.v)} className="mt-1 accent-marca-700" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{o.t}</span>
                  <span className="block text-xs text-slate-500">{o.d}</span>
                </span>
              </label>
            ))}
          </div>
          {modo === "turnos" ? (
            <p className="text-sm text-slate-600">
              {enElReparto.length > 0 ? (
                <>
                  Hoy están en el reparto: <strong>{enElReparto.join(", ")}</strong>. Para sumar o quitar a alguien, usa «Recibe leads» en su fila.
                </>
              ) : (
                <>Nadie está en el reparto: los leads nuevos quedan con el dueño. Activa «Recibe leads» en los asesores.</>
              )}
            </p>
          ) : null}
          <div className="max-w-xs">
            <Etiqueta htmlFor="slaMinutos">Tiempo para contactar un lead nuevo (minutos)</Etiqueta>
            <input id="slaMinutos" name="slaMinutos" type="number" min={1} max={1440} defaultValue={slaMinutos} className={claseInput} />
            <p className="mt-1 text-xs text-slate-500">Pasado ese tiempo sin contacto, el lead sale como «atrasado» y el gerente lo ve en su panel.</p>
          </div>
          {puedeRepartir ? (
            <Boton type="submit" variante="primario" cargando={pendiente}>
              Guardar
            </Boton>
          ) : null}
        </fieldset>
      </form>
    </Tarjeta>
  );
}
