import { valoresPorEtapa } from "../opciones";

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Reglas de negocio que se aplican antes de guardar. Modifica `datos` y devuelve
 * errores por campo si el registro no es válido.
 */
export function aplicarReglas(
  objeto: string,
  datos: Record<string, unknown>,
  anterior: Record<string, unknown> | null,
): Record<string, string> | null {
  const valor = (campo: string) => (campo in datos ? datos[campo] : anterior?.[campo]);

  switch (objeto) {
    case "oportunidades": {
      const etapa = valor("etapa");
      const defecto = typeof etapa === "string" ? valoresPorEtapa[etapa] : undefined;
      if (!defecto) break;
      const cambioEtapa = anterior !== null && etapa !== anterior.etapa;
      // Al cambiar de etapa se proponen sus valores, salvo que la persona haya cambiado también la probabilidad.
      const probabilidadTocada = "probabilidad" in datos && datos.probabilidad !== anterior?.probabilidad;
      if (cambioEtapa && !probabilidadTocada) {
        datos.probabilidad = defecto.probabilidad;
        datos.categoriaPrevision = defecto.categoria;
      } else if (valor("probabilidad") === null || valor("probabilidad") === undefined) {
        datos.probabilidad = defecto.probabilidad;
      }
      if (anterior === null && !datos.categoriaPrevision) datos.categoriaPrevision = defecto.categoria;
      break;
    }
    case "casos": {
      const estado = valor("estado");
      if (estado === "cerrado" && anterior?.estado !== "cerrado") datos.cerradoEn = new Date();
      if (estado !== "cerrado" && "estado" in datos) datos.cerradoEn = null;
      break;
    }
    case "tareas": {
      const estado = valor("estado");
      if (estado === "completada" && anterior?.estado !== "completada") datos.completadaEn = new Date();
      if (estado !== "completada" && "estado" in datos) datos.completadaEn = null;
      break;
    }
    case "eventos": {
      const inicio = valor("inicio");
      const fin = valor("fin");
      if (inicio instanceof Date && fin instanceof Date && fin < inicio) {
        return { fin: "El fin no puede ser anterior al inicio." };
      }
      break;
    }
    case "candidatos": {
      // Un comprador no trae empresa: la columna pide un valor y se deja el nombre de la persona.
      if (!String(valor("compania") ?? "").trim()) {
        const persona = [valor("nombre"), valor("apellidos")].filter((v) => typeof v === "string" && v.trim()).join(" ");
        datos.compania = persona || "Persona natural";
      }
      break;
    }
    case "articulos": {
      if (!valor("nombreUrl") && typeof valor("titulo") === "string") datos.nombreUrl = slug(String(valor("titulo")));
      break;
    }
    case "establecimientos": {
      if (!valor("slug") && typeof valor("nombre") === "string") datos.slug = slug(String(valor("nombre")));
      break;
    }
    case "campanas": {
      const inicio = valor("fechaInicio");
      const fin = valor("fechaFin");
      if (typeof inicio === "string" && typeof fin === "string" && fin < inicio) {
        return { fechaFin: "La fecha de fin no puede ser anterior a la de inicio." };
      }
      break;
    }
  }
  return null;
}
