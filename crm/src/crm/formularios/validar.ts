import type { ConfigFormulario } from "./tipos";

export interface RespuestaForm {
  clave: string;
  etiqueta: string;
  valor: string;
}

export interface DatosLead {
  nombre: string | null;
  apellidos: string;
  telefono: string;
  email: string | null;
  compania: string | null;
  cargo: string | null;
  ciudad: string | null;
  interes: string | null;
}

export interface EnvioValido {
  lead: DatosLead;
  /** Los diez dígitos del celular: con ellos se reconoce a la misma persona si vuelve a llenar un formulario. */
  digitos: string;
  /** Lo que contestó, para mostrar en la ficha (sin el nombre, el teléfono ni el correo, que ya están arriba). */
  respuestas: RespuestaForm[];
}

const limpiar = (v: unknown, max: number): string =>
  String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);

/** Un celular o fijo de Colombia (10 dígitos, con o sin 57) o un número internacional (+ y 8 a 15 dígitos). */
export function normalizarTelefono(valor: string): { telefono: string; digitos: string } | null {
  const crudo = valor.trim();
  const d = crudo.replace(/\D/g, "");
  if (crudo.startsWith("+") && !crudo.startsWith("+57") && d.length >= 8 && d.length <= 15) return { telefono: `+${d}`, digitos: d.slice(-10) };
  const nacional = d.length === 12 && d.startsWith("57") ? d.slice(2) : d;
  if (nacional.length !== 10) return null;
  // Celular (3…) o fijo con indicativo de ciudad (60…).
  if (!/^(3\d{9}|60\d{8})$/.test(nacional)) return null;
  return { telefono: `+57 ${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`, digitos: nacional };
}

/** «Juan Felipe Gómez Pérez» → nombre «Juan Felipe», apellidos «Gómez Pérez». */
export function partirNombre(completo: string): { nombre: string | null; apellidos: string } {
  const partes = completo.split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nombre: partes[0] ?? null, apellidos: "(sin apellido)" };
  const nombres = partes.length >= 4 ? 2 : 1;
  return { nombre: partes.slice(0, nombres).join(" "), apellidos: partes.slice(nombres).join(" ") };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Valida lo que llegó contra la configuración del formulario (nunca contra lo que diga el navegador): obligatorias,
 * tipos, opciones permitidas y largos. Devuelve los errores por pregunta o el envío ya limpio.
 */
export function validarEnvio(
  config: ConfigFormulario,
  valores: Record<string, unknown>,
  consentimiento: boolean,
): { errores: Record<string, string> } | { errores: null; envio: EnvioValido } {
  const errores: Record<string, string> = {};
  const lead: Record<string, string | null> = {};
  const respuestas: RespuestaForm[] = [];
  let digitos = "";

  for (const campo of config.campos) {
    const crudo = valores[campo.id];
    let valor = "";
    switch (campo.tipo) {
      case "casilla":
        valor = crudo === true || crudo === "true" || crudo === "on" || crudo === "si" ? "Sí" : "No";
        if (campo.requerido && valor !== "Sí") errores[campo.id] = "Marque esta casilla para continuar.";
        break;
      case "parrafo":
        valor = limpiar(crudo, 2000);
        break;
      case "telefono": {
        valor = limpiar(crudo, 30);
        if (valor) {
          const t = normalizarTelefono(valor);
          if (!t) errores[campo.id] = "Escriba un número válido, por ejemplo 312 555 1001.";
          else {
            valor = t.telefono;
            if (campo.mapea === "telefono") digitos = t.digitos;
          }
        }
        break;
      }
      case "correo":
        valor = limpiar(crudo, 160).toLowerCase();
        if (valor && !EMAIL.test(valor)) errores[campo.id] = "Escriba un correo válido.";
        break;
      case "numero": {
        valor = limpiar(crudo, 20).replace(",", ".");
        if (valor && !/^-?\d+(\.\d+)?$/.test(valor)) errores[campo.id] = "Escriba solo números.";
        break;
      }
      case "lista":
        valor = limpiar(crudo, 80);
        if (valor && !(campo.opciones ?? []).includes(valor)) errores[campo.id] = "Elija una de las opciones.";
        break;
      case "catalogo":
        valor = limpiar(crudo, 160);
        break;
      default:
        valor = limpiar(crudo, 200);
    }
    if (campo.requerido && campo.tipo !== "casilla" && !valor && !errores[campo.id]) errores[campo.id] = "Esta pregunta es obligatoria.";
    if (errores[campo.id]) continue;
    if (campo.mapea && valor) lead[campo.mapea] = valor;
    const identidad = campo.mapea === "nombreCompleto" || campo.mapea === "nombre" || campo.mapea === "apellidos" || campo.mapea === "telefono" || campo.mapea === "email";
    if (!identidad && valor && !(campo.tipo === "casilla" && valor === "No" && !campo.requerido)) {
      respuestas.push({ clave: campo.id, etiqueta: campo.etiqueta, valor });
    }
  }

  if (config.consentimiento.activo && !consentimiento) errores["_consentimiento"] = "Necesitamos tu autorización para contactarte.";
  if (Object.keys(errores).length) return { errores };

  const partido = lead.nombreCompleto ? partirNombre(lead.nombreCompleto) : { nombre: lead.nombre ?? null, apellidos: lead.apellidos ?? "(sin apellido)" };
  const telefono = config.campos.find((c) => c.mapea === "telefono");
  return {
    errores: null,
    envio: {
      lead: {
        nombre: partido.nombre,
        apellidos: partido.apellidos,
        telefono: String(telefono ? normalizarTelefono(String(valores[telefono.id] ?? ""))?.telefono ?? "" : ""),
        email: lead.email ?? null,
        compania: lead.compania ?? null,
        cargo: lead.cargo ?? null,
        ciudad: lead.ciudad ?? null,
        interes: lead.interes ?? null,
      },
      digitos,
      respuestas,
    },
  };
}
