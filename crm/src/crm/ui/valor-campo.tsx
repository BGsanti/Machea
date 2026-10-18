import Link from "next/link";
import { Insignia } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { textoValor, type FilaConNombres } from "../formato";
import type { Campo } from "../tipos";

/** Muestra el valor de un campo con su formato: enlaces, insignias, moneda, fechas... */
export function ValorCampo({ campo, fila, app, moneda = "COP" }: { campo: Campo; fila: FilaConNombres; app: string; moneda?: string }) {
  const valor = fila[campo.nombre];
  switch (campo.tipo) {
    case "busqueda": {
      const nombre = fila.__nombres?.[campo.nombre];
      if (typeof valor !== "string" || !nombre) return null;
      if (campo.objetoDestino === "usuarios") return <span>{nombre}</span>;
      return (
        <Link href={`/${app}/o/${campo.objetoDestino}/${valor}`} className="text-marca-700 hover:underline">
          {nombre}
        </Link>
      );
    }
    case "polimorfico": {
      const objeto = fila[`${campo.nombre}Objeto`];
      const id = fila[`${campo.nombre}Id`];
      const nombre = fila.__nombres?.[campo.nombre];
      if (typeof objeto !== "string" || typeof id !== "string" || !nombre) return null;
      return (
        <Link href={`/${app}/o/${objeto}/${id}`} className="text-marca-700 hover:underline">
          {nombre}
        </Link>
      );
    }
    case "lista": {
      if (valor === null || valor === undefined || valor === "") return null;
      const opcion = campo.opciones?.find((o) => o.valor === valor);
      return opcion?.color ? <Insignia color={opcion.color}>{opcion.etiqueta}</Insignia> : <span>{opcion?.etiqueta ?? String(valor)}</span>;
    }
    case "casilla":
      return valor ? (
        <Icono nombre="CircleCheck" className="size-4 text-emerald-600" aria-hidden={false} />
      ) : (
        <Icono nombre="Circle" className="size-4 text-slate-300" aria-hidden={false} />
      );
    case "email":
      return typeof valor === "string" ? (
        <a href={`mailto:${valor}`} className="text-marca-700 hover:underline">
          {valor}
        </a>
      ) : null;
    case "telefono":
      return typeof valor === "string" ? (
        <a href={`tel:${valor.replace(/\s/g, "")}`} className="text-marca-700 hover:underline">
          {valor}
        </a>
      ) : null;
    case "url":
      return typeof valor === "string" ? (
        <a href={valor} target="_blank" rel="noopener noreferrer" className="text-marca-700 hover:underline">
          {valor.replace(/^https?:\/\//, "")}
        </a>
      ) : null;
    case "listaMultiple":
      return Array.isArray(valor) && valor.length ? (
        <span className="flex flex-wrap gap-1">
          {valor.map((v) => (
            <Insignia key={String(v)}>{String(v)}</Insignia>
          ))}
        </span>
      ) : null;
    case "areaTexto":
    case "markdown":
      return typeof valor === "string" ? <span className="whitespace-pre-line">{valor}</span> : null;
    default: {
      const texto = textoValor(campo, fila, moneda);
      return texto ? <span>{texto}</span> : null;
    }
  }
}
