"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { Modal } from "@/ui/modal";
import { enlaceRegistro } from "../../apps";
import { cambiarPropietario } from "../../servidor/acciones";
import { agregarACampana, enviarCorreoLista } from "../../servidor/especiales";
import { BusquedaRegistro } from "../busqueda-registro";

interface PropsMasiva {
  objeto: string;
  ids: string[];
  alCerrar: () => void;
  alTerminar: () => void;
}

export function ModalCambiarPropietario({ objeto, ids, alCerrar, alTerminar }: PropsMasiva) {
  const [usuario, setUsuario] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Cambiar propietario"
      ancho="sm"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            cargando={pendiente}
            disabled={!usuario}
            onClick={() =>
              iniciar(async () => {
                const r = await cambiarPropietario(objeto, ids, usuario);
                avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                if (r.ok) {
                  alTerminar();
                  alCerrar();
                }
              })
            }
          >
            Enviar
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        El nuevo propietario será responsable de {ids.length} registro{ids.length === 1 ? "" : "s"}.
      </p>
      <Etiqueta>Buscar usuarios</Etiqueta>
      <BusquedaRegistro nombre="usuario" objeto="usuarios" alSeleccionar={(o) => setUsuario(o?.id ?? "")} />
    </Modal>
  );
}

export function ModalAgregarCampana({ objeto, ids, alCerrar, alTerminar }: PropsMasiva) {
  const [campana, setCampana] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Agregar a campaña"
      ancho="sm"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            cargando={pendiente}
            disabled={!campana}
            onClick={() =>
              iniciar(async () => {
                const r = await agregarACampana(objeto, ids, campana);
                avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                if (r.ok) {
                  alTerminar();
                  alCerrar();
                }
              })
            }
          >
            Agregar
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Se agregarán {ids.length} registro{ids.length === 1 ? "" : "s"} como miembros. Los que ya estén en la campaña se omiten.
      </p>
      <Etiqueta>Campaña</Etiqueta>
      <BusquedaRegistro nombre="campana" objeto="campanas" alSeleccionar={(o) => setCampana(o?.id ?? "")} />
      <p className="mt-2 text-xs text-slate-500">¿No ve la campaña? Active las herramientas en Marketing para crear campañas.</p>
    </Modal>
  );
}

const camposCombinacion = ["{{Nombre}}", "{{Apellidos}}", "{{Compañía}}", "{{Cargo}}"];

export function ModalCorreoLista({ objeto, ids, alCerrar, alTerminar }: PropsMasiva) {
  const router = useRouter();
  const [destino, setDestino] = useState(objeto === "candidatos" ? "candidatos" : "contactos");
  const [extra, setExtra] = useState<{ id: string; nombre: string }[]>([]);
  const [clave, setClave] = useState(0);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [pendiente, iniciar] = useTransition();
  const seleccionPrevia = ids.length > 0;
  const destinatarios = seleccionPrevia ? ids : extra.map((e) => e.id);

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Enviar correo electrónico de lista"
      ancho="lg"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            icono="Mail"
            cargando={pendiente}
            disabled={destinatarios.length === 0 || !asunto.trim() || !cuerpo.trim()}
            onClick={() =>
              iniciar(async () => {
                const r = await enviarCorreoLista(destino, destinatarios, asunto, cuerpo);
                avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                if (r.ok) {
                  alTerminar();
                  alCerrar();
                  if (r.id) router.push(enlaceRegistro("correos-lista", r.id, "marketing"));
                }
              })
            }
          >
            Enviar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          <Icono nombre="Info" className="mt-0.5 size-4 shrink-0" />
          <span>
            El correo queda registrado en el CRM y en la actividad de cada destinatario. Para entregarlo de verdad hay que conectar un servidor de
            correo (SMTP): todavía no está configurado.
          </span>
        </div>
        {seleccionPrevia ? (
          <p className="text-sm text-slate-700">
            Para: <strong>{ids.length}</strong> {destino} seleccionado{ids.length === 1 ? "" : "s"} en la lista.
          </p>
        ) : (
          <div>
            <Etiqueta>Destinatarios</Etiqueta>
            <div className="flex gap-2">
              <select
                value={destino}
                onChange={(e) => {
                  setDestino(e.target.value);
                  setExtra([]);
                }}
                className={`${claseInput} w-40`}
                aria-label="Tipo de destinatario"
              >
                <option value="contactos">Contactos</option>
                <option value="candidatos">Candidatos</option>
              </select>
              <div className="flex-1">
                <BusquedaRegistro
                  key={`${destino}-${clave}`}
                  nombre="destinatario"
                  objeto={destino}
                  placeholder="Buscar y agregar destinatarios..."
                  alSeleccionar={(o) => {
                    if (o && !extra.some((e) => e.id === o.id)) setExtra([...extra, { id: o.id, nombre: o.nombre }]);
                    setClave((k) => k + 1);
                  }}
                />
              </div>
            </div>
            {extra.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {extra.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                    {e.nombre}
                    <button type="button" onClick={() => setExtra(extra.filter((x) => x.id !== e.id))} aria-label={`Quitar ${e.nombre}`}>
                      <Icono nombre="X" className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <div>
          <Etiqueta htmlFor="correo-asunto" requerido>
            Asunto
          </Etiqueta>
          <input id="correo-asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} className={claseInput} />
        </div>
        <div>
          <Etiqueta htmlFor="correo-cuerpo" requerido>
            Mensaje
          </Etiqueta>
          <textarea id="correo-cuerpo" rows={8} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} className={claseInput} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            Insertar:
            {camposCombinacion.map((c) => (
              <button key={c} type="button" onClick={() => setCuerpo(`${cuerpo}${c}`)} className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50">
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
