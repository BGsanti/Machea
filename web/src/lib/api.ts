/**
 * Cliente para la API del motor de recomendación (api.py, FastAPI).
 * En local corre `uvicorn api:app --port 8000` en paralelo al dev server.
 * En producción, apunta a donde esté desplegado api.py vía
 * VITE_API_BASE_URL (build-time env var de Vercel) — sin ella cae a
 * localhost, que solo funciona en dev.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type FormularioMachea = {
  tipo_vivienda: 0 | 1;
  salario: 1 | 2 | 3 | 4;
  personas_a_cargo: 1 | 2 | 3 | 4;
  edad: number;
  Localidad: number;
  numero_habitaciones: 1 | 2 | 3;
  afiliado?: 0 | 1;
  zonas_comunes?: string[];
};

export type Apartamento = {
  posicion: number;
  compatibilidad: number;
  compatibilidad_texto: string;
  nombre_proyecto: string;
  tipo_vivienda: string;
  localidad: string;
  direccion: string;
  precio_desde_cop: number;
  area_construida_m2: number | null;
  habitaciones: number | null;
  cumple_habitaciones: boolean;
  aplica_subsidio_caja: boolean;
  cuota_mensual_estimada_cop: number | null;
  zonas_comunes: string[];
  zonas_en_comun: string[];
  url_ficha: string;
};

export type RespuestaRecomendador = {
  generado_en: string;
  motor: string;
  total_preseleccionados: number;
  usuario: {
    busqueda: { tipo_vivienda: string; localidad: string; numero_habitaciones: number };
  };
  apartamentos: Apartamento[];
};

export class MacheaApiError extends Error {}

export async function recomendar(payload: FormularioMachea): Promise<RespuestaRecomendador> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/recomendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new MacheaApiError(
      "No pudimos conectar con el motor de recomendación. ¿Está corriendo `uvicorn api:app --port 8000`?"
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Error desconocido del motor." }));
    throw new MacheaApiError(body.detail ?? "El formulario tiene datos inválidos.");
  }

  return res.json();
}

export type Localidad = { id: number; nombre: string };

export async function getCatalogos(): Promise<{ localidades: Localidad[]; zonas_comunes: string[] }> {
  const res = await fetch(`${API_BASE}/api/catalogos`);
  if (!res.ok) throw new MacheaApiError("No pudimos cargar el catálogo de localidades.");
  return res.json();
}

export type SolicitudLlamada = {
  nombre: string;
  telefono: string;
  afiliado: boolean;
  rango_ingreso: string;
  edad: number;
  personas_a_cargo: number;
  entorno_deseado: string;
  apartamento: Apartamento;
};

export type RespuestaLlamada = {
  status: "enviado" | "mock_enqueued";
  detalle?: string;
};

export async function llamar(payload: SolicitudLlamada): Promise<RespuestaLlamada> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/llamar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new MacheaApiError("No pudimos conectar con el motor para disparar la llamada.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Error desconocido al llamar." }));
    throw new MacheaApiError(body.detail ?? "No se pudo iniciar la llamada.");
  }
  return res.json();
}
