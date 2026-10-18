import type { Usuario } from "@/auth/sesion";
import { desdeHoraLocal, diaSemana, fechaLocal, sumarDias } from "../fechas";
import { eventosEntre } from "../servidor/consultas";
import { CalendarioCliente, type EventoCalendario } from "./calendario-cliente";

type Vista = "dia" | "semana" | "mes";

export async function PaginaCalendario({
  usuario,
  app,
  parametros,
}: {
  usuario: Usuario;
  app: string;
  parametros: Record<string, string | string[] | undefined>;
}) {
  const vista: Vista = parametros.vista === "dia" || parametros.vista === "mes" ? parametros.vista : "semana";
  const hoy = fechaLocal();
  const fecha = typeof parametros.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parametros.fecha) ? parametros.fecha : hoy;
  const todos = parametros.todos === "1";

  // Todas las fechas son AAAA-MM-DD en la zona del negocio.
  let desde: string;
  let dias: number;
  let anterior: string;
  let siguiente: string;
  if (vista === "dia") {
    desde = fecha;
    dias = 1;
    anterior = sumarDias(fecha, -1);
    siguiente = sumarDias(fecha, 1);
  } else if (vista === "semana") {
    desde = sumarDias(fecha, -diaSemana(fecha));
    dias = 7;
    anterior = sumarDias(fecha, -7);
    siguiente = sumarDias(fecha, 7);
  } else {
    const primero = `${fecha.slice(0, 7)}-01`;
    desde = sumarDias(primero, -diaSemana(primero));
    dias = 42;
    anterior = `${sumarDias(primero, -1).slice(0, 7)}-01`;
    siguiente = `${sumarDias(primero, 32).slice(0, 7)}-01`;
  }
  const inicio = desdeHoraLocal(`${desde}T00:00`)!;
  const fin = desdeHoraLocal(`${sumarDias(desde, dias)}T00:00`)!;

  const filas = await eventosEntre(inicio, fin, usuario.id, !todos);
  const eventos: EventoCalendario[] = filas.map((e) => ({
    id: e.id,
    asunto: e.asunto,
    inicio: e.inicio.toISOString(),
    fin: e.fin.toISOString(),
    todoElDia: e.todoElDia,
    ubicacion: e.ubicacion,
    privado: e.privado && e.propietarioId !== usuario.id,
  }));

  return (
    <CalendarioCliente
      app={app}
      vista={vista}
      fecha={fecha}
      desde={desde}
      dias={dias}
      anterior={anterior}
      siguiente={siguiente}
      hoy={hoy}
      todos={todos}
      eventos={eventos}
    />
  );
}
