"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Boton } from "@/ui/boton";
import { Modal } from "@/ui/modal";
import { enlaceRegistro } from "../apps";
import { aHoraLocal, desdeHoraLocal } from "../fechas";
import type { FilaConNombres } from "../formato";
import { campoDe, obtenerObjeto } from "../objetos";
import { valoresPorEtapa } from "../opciones";
import { guardarRegistro } from "../servidor/acciones";
import { precioProducto } from "../servidor/especiales";
import type { OpcionBusqueda } from "../servidor/repositorio";
import type { Campo } from "../tipos";
import { CampoFormulario } from "./campo-formulario";

const anchoCompleto = new Set(["areaTexto", "markdown", "listaMultiple", "polimorfico"]);

export function FormularioRegistro({
  objeto,
  abierto,
  alCerrar,
  registro,
  valoresIniciales,
  irAlRegistro = true,
  app,
  alGuardar,
}: {
  objeto: string;
  abierto: boolean;
  alCerrar: () => void;
  registro?: FilaConNombres | null;
  valoresIniciales?: Partial<FilaConNombres>;
  irAlRegistro?: boolean;
  app?: string;
  alGuardar?: (id: string) => void;
}) {
  const router = useRouter();
  const def = obtenerObjeto(objeto);
  const formulario = useRef<HTMLFormElement>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [guardando, iniciar] = useTransition();
  if (!def) return null;

  const fila: Partial<FilaConNombres> = registro ?? valoresIniciales ?? {};
  const editando = Boolean(registro);
  const titulo = editando ? `Modificar ${def.etiqueta.toLowerCase()}` : `${def.genero === "f" ? "Nueva" : "Nuevo"} ${def.etiqueta.toLowerCase()}`;

  const fijar = (campo: string, valor: string) => {
    const el = formulario.current?.elements.namedItem(campo);
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = valor;
  };
  const leer = (campo: string) => {
    const el = formulario.current?.elements.namedItem(campo);
    return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : "";
  };

  // Comportamientos que ayudan a rellenar el formulario.
  const alCambiar = (campo: Campo, valor: string) => {
    if (objeto === "oportunidades" && campo.nombre === "etapa" && valoresPorEtapa[valor]) {
      fijar("probabilidad", String(valoresPorEtapa[valor].probabilidad));
      fijar("categoriaPrevision", valoresPorEtapa[valor].categoria);
    }
    if (objeto === "eventos" && campo.nombre === "inicio" && valor && !leer("fin")) {
      const inicio = desdeHoraLocal(valor);
      if (inicio) fijar("fin", aHoraLocal(new Date(inicio.getTime() + 60 * 60 * 1000)));
    }
  };
  const alSeleccionar = (campo: Campo, opcion: OpcionBusqueda | null) => {
    if (objeto === "productos-oportunidad" && campo.nombre === "productoId" && opcion && !leer("precioUnitario")) {
      void precioProducto(opcion.id, leer("oportunidadId") || undefined).then((precio) => {
        if (precio !== null) fijar("precioUnitario", String(precio));
      });
    }
  };

  const enviar = (formData: FormData, yNuevo: boolean) => {
    iniciar(async () => {
      const r = await guardarRegistro(objeto, registro?.id ?? null, formData);
      if (!r.ok) {
        setErrores(r.errores ?? {});
        setMensaje(r.mensaje ?? "No se pudo guardar.");
        return;
      }
      setErrores({});
      setMensaje(null);
      avisar(r.mensaje ?? "Guardado.");
      if (r.id) alGuardar?.(r.id);
      if (yNuevo) {
        setVersion((v) => v + 1);
        return;
      }
      alCerrar();
      if (!editando && irAlRegistro && r.id) router.push(enlaceRegistro(objeto, r.id, app));
      else router.refresh();
    });
  };

  const renderCampo = (nombre: string) => {
    const campo = campoDe(def, nombre);
    if (!campo || campo.soloLectura || campo.tipo === "autonumero") return null;
    return (
      <div key={nombre} className={anchoCompleto.has(campo.tipo) ? "sm:col-span-2" : ""}>
        <CampoFormulario
          campo={campo}
          fila={fila}
          error={errores[nombre]}
          alCambiar={(v) => alCambiar(campo, v)}
          alSeleccionar={(o) => alSeleccionar(campo, o)}
        />
      </div>
    );
  };

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={titulo}
      ancho="lg"
      pie={
        <>
          <Boton onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          {!editando ? (
            <Boton
              disabled={guardando}
              onClick={() => formulario.current && enviar(new FormData(formulario.current), true)}
            >
              Guardar y nuevo
            </Boton>
          ) : null}
          <Boton variante="primario" cargando={guardando} onClick={() => formulario.current?.requestSubmit()}>
            Guardar
          </Boton>
        </>
      }
    >
      <form
        key={version}
        ref={formulario}
        onSubmit={(e) => {
          e.preventDefault();
          enviar(new FormData(e.currentTarget), false);
        }}
        className="space-y-6"
        noValidate
      >
        <p className="text-right text-xs text-slate-500">
          <span className="text-rose-600">*</span> = Información obligatoria
        </p>
        {mensaje ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{mensaje}</div> : null}
        {def.secciones.map((seccion) => (
          <fieldset key={seccion.titulo}>
            <legend className="mb-3 w-full rounded bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{seccion.titulo}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {seccion.campos.map((c) =>
                typeof c === "string" ? (
                  renderCampo(c)
                ) : (
                  <div key={c.grupo} className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                    <p className="mb-2 text-xs font-semibold text-slate-600">
                      {c.campos.some((n) => campoDe(def, n)?.requerido) ? <span className="mr-0.5 text-rose-600">*</span> : null}
                      {c.grupo}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">{c.campos.map((n) => renderCampo(n))}</div>
                  </div>
                ),
              )}
            </div>
          </fieldset>
        ))}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
