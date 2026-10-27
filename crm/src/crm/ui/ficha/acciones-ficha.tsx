"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton, clasesBoton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { Modal } from "@/ui/modal";
import { enlaceRegistro } from "../../apps";
import type { FilaConNombres } from "../../formato";
import { actualizarCampo, eliminarRegistros } from "../../servidor/acciones";
import { agregarACampana, cambiarEstadoArticulos, convertirCandidato, generarFactura } from "../../servidor/especiales";
import { BusquedaRegistro } from "../busqueda-registro";
import { FormularioRegistro } from "../formulario-registro";
import { ModalCorreoLista } from "../lista/acciones-masivas";

type Ventana = "editar" | "convertir" | "correo" | "productos" | "miembros" | null;

export function AccionesFicha({ objeto, app, fila, nombre, puedeEliminar = true, puedeEscribir = true }: { objeto: string; app: string; fila: FilaConNombres; nombre: string; puedeEliminar?: boolean; puedeEscribir?: boolean }) {
  const router = useRouter();
  const [ventana, setVentana] = useState<Ventana>(null);
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (fn: () => Promise<{ ok: boolean; mensaje?: string; id?: string }>, despues?: (id?: string) => void) =>
    iniciar(async () => {
      const r = await fn();
      avisar(r.mensaje ?? (r.ok ? "Hecho." : "Error"), r.ok ? "exito" : "error");
      if (r.ok) despues?.(r.id);
    });

  const eliminar = () => {
    if (!confirm(`¿Eliminar «${nombre}»? Esta acción no se puede deshacer.`)) return;
    ejecutar(() => eliminarRegistros(objeto, [fila.id]), () => router.push(`/${app}/o/${objeto}`));
  };

  const estadoArticulo = String(fila.estado ?? "");
  const puedeEditar = puedeEscribir && (objeto !== "articulos" || estadoArticulo === "borrador");

  return (
    <>
      {objeto === "candidatos" && !fila.convertido ? (
        <Boton variante="primario" icono="ArrowRightLeft" onClick={() => setVentana("convertir")}>
          Convertir
        </Boton>
      ) : null}
      {(objeto === "contactos" || objeto === "candidatos") && fila.email ? (
        <Boton icono="Mail" onClick={() => setVentana("correo")}>
          Enviar correo
        </Boton>
      ) : null}
      {objeto === "oportunidades" ? (
        <>
          <Boton icono="Package" onClick={() => setVentana("productos")}>
            Agregar producto
          </Boton>
          <Boton
            icono="Receipt"
            cargando={pendiente}
            onClick={() => ejecutar(() => generarFactura(fila.id), (id) => id && router.push(enlaceRegistro("facturas", id, app)))}
          >
            Generar factura
          </Boton>
        </>
      ) : null}
      {objeto === "casos" && fila.estado !== "cerrado" ? (
        <Boton icono="CircleCheck" cargando={pendiente} onClick={() => ejecutar(() => actualizarCampo("casos", fila.id, "estado", "cerrado"))}>
          Cerrar caso
        </Boton>
      ) : null}
      {objeto === "campanas" ? (
        <Boton icono="UserPlus" onClick={() => setVentana("miembros")}>
          Agregar miembros
        </Boton>
      ) : null}
      {objeto === "articulos" ? (
        estadoArticulo === "borrador" ? (
          <Boton variante="primario" cargando={pendiente} onClick={() => ejecutar(() => cambiarEstadoArticulos([fila.id], "publicar"))}>
            Publicar
          </Boton>
        ) : (
          <>
            {estadoArticulo === "publicado" ? (
              <Boton cargando={pendiente} onClick={() => ejecutar(() => cambiarEstadoArticulos([fila.id], "archivar"))}>
                Archivar
              </Boton>
            ) : null}
            <Boton icono="Pencil" cargando={pendiente} onClick={() => ejecutar(() => cambiarEstadoArticulos([fila.id], "nueva_version"))}>
              Modificar como borrador
            </Boton>
          </>
        )
      ) : null}
      {objeto === "facturas" ? (
        <Boton icono="FileText" onClick={() => window.print()}>
          Imprimir
        </Boton>
      ) : null}
      {objeto === "flujos" ? (
        <Link href={`/${app}/p/flujo?id=${fila.id}`} className={clasesBoton("primario")}>
          <Icono nombre="Workflow" /> Abrir en el editor
        </Link>
      ) : puedeEditar ? (
        <Boton icono="Pencil" onClick={() => setVentana("editar")}>
          Modificar
        </Boton>
      ) : null}
      {objeto === "candidatos" || objeto === "contactos" ? (
        <a
          href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/datos/${objeto}/${fila.id}`}
          download
          title="Descarga todo lo que se sabe de esta persona (Habeas Data)"
          className={clasesBoton("fantasma")}
        >
          <Icono nombre="Download" /> Sus datos
        </a>
      ) : null}
      {puedeEliminar ? <Boton variante="fantasma" icono="Trash" onClick={eliminar} aria-label="Eliminar" title="Eliminar" /> : null}

      {ventana === "editar" ? <FormularioRegistro objeto={objeto} app={app} abierto registro={fila} alCerrar={() => setVentana(null)} /> : null}
      {ventana === "productos" ? (
        <FormularioRegistro
          objeto="productos-oportunidad"
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={{ oportunidadId: fila.id, __nombres: { oportunidadId: nombre } }}
          alCerrar={() => setVentana(null)}
        />
      ) : null}
      {ventana === "correo" ? <ModalCorreoLista objeto={objeto} ids={[fila.id]} alCerrar={() => setVentana(null)} alTerminar={() => undefined} /> : null}
      {ventana === "convertir" ? <ModalConversion fila={fila} app={app} alCerrar={() => setVentana(null)} /> : null}
      {ventana === "miembros" ? <ModalMiembros campanaId={fila.id} alCerrar={() => setVentana(null)} /> : null}
    </>
  );
}

function ModalConversion({ fila, app, alCerrar }: { fila: FilaConNombres; app: string; alCerrar: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<"nueva" | "existente">("nueva");
  const [crearOportunidad, setCrearOportunidad] = useState(true);
  const [pendiente, iniciar] = useTransition();
  const compania = String(fila.compania ?? "");
  const persona = [fila.nombre, fila.apellidos].filter(Boolean).join(" ");

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Convertir lead: ${persona}`}
      ancho="md"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="primario" cargando={pendiente} onClick={() => (document.getElementById("form-conversion") as HTMLFormElement | null)?.requestSubmit()}>
            Convertir
          </Boton>
        </>
      }
    >
      <form
        id="form-conversion"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const datos = new FormData(e.currentTarget);
          iniciar(async () => {
            const r = await convertirCandidato(fila.id, datos);
            avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
            if (r.ok && r.contactoId) {
              alCerrar();
              router.push(enlaceRegistro("contactos", r.contactoId, app));
            }
          });
        }}
      >
        <p className="text-sm text-slate-600">Se creará un contacto con los datos del candidato. Sus tareas y eventos pasarán al contacto.</p>
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Cuenta</legend>
          <input type="hidden" name="modoCuenta" value={modo} />
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={modo === "nueva"} onChange={() => setModo("nueva")} className="accent-marca-700" /> Crear una cuenta nueva
            </label>
            {modo === "nueva" ? <input name="cuentaNombre" defaultValue={compania} className={claseInput} aria-label="Nombre de la cuenta" /> : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={modo === "existente"} onChange={() => setModo("existente")} className="accent-marca-700" /> Elegir una cuenta existente
            </label>
            {modo === "existente" ? <BusquedaRegistro nombre="cuentaId" objeto="cuentas" textoInicial={compania} /> : null}
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Contacto</legend>
          <p className="text-sm text-slate-700">
            <Icono nombre="Contact" className="mr-1 inline size-4 text-fuchsia-600" />
            {persona}
          </p>
        </fieldset>
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Oportunidad</legend>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="crearOportunidad"
              checked={crearOportunidad}
              onChange={(e) => setCrearOportunidad(e.target.checked)}
              className="accent-marca-700"
            />
            Crear también una oportunidad
          </label>
          {crearOportunidad ? (
            <>
              <Etiqueta htmlFor="oportunidadNombre">Nombre de la oportunidad</Etiqueta>
              <input id="oportunidadNombre" name="oportunidadNombre" defaultValue={`${compania} - Nueva oportunidad`} className={claseInput} />
            </>
          ) : null}
        </fieldset>
      </form>
    </Modal>
  );
}

function ModalMiembros({ campanaId, alCerrar }: { campanaId: string; alCerrar: () => void }) {
  const [objeto, setObjeto] = useState("contactos");
  const [elegidos, setElegidos] = useState<{ id: string; nombre: string }[]>([]);
  const [clave, setClave] = useState(0);
  const [pendiente, iniciar] = useTransition();
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Agregar miembros a la campaña"
      ancho="md"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            cargando={pendiente}
            disabled={elegidos.length === 0}
            onClick={() =>
              iniciar(async () => {
                const r = await agregarACampana(objeto, elegidos.map((e) => e.id), campanaId);
                avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                if (r.ok) alCerrar();
              })
            }
          >
            Agregar
          </Boton>
        </>
      }
    >
      <div className="flex gap-2">
        <select
          value={objeto}
          onChange={(e) => {
            setObjeto(e.target.value);
            setElegidos([]);
          }}
          className={`${claseInput} w-40`}
          aria-label="Tipo de miembro"
        >
          <option value="contactos">Contactos</option>
          <option value="candidatos">Leads</option>
        </select>
        <div className="flex-1">
          <BusquedaRegistro
            key={`${objeto}-${clave}`}
            nombre="miembro"
            objeto={objeto}
            alSeleccionar={(o) => {
              if (o && !elegidos.some((e) => e.id === o.id)) setElegidos([...elegidos, { id: o.id, nombre: o.nombre }]);
              setClave((k) => k + 1);
            }}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {elegidos.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
            {e.nombre}
            <button type="button" onClick={() => setElegidos(elegidos.filter((x) => x.id !== e.id))} aria-label={`Quitar ${e.nombre}`}>
              <Icono nombre="X" className="size-3" />
            </button>
          </span>
        ))}
      </div>
    </Modal>
  );
}
