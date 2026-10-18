import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { bd } from "@/db/cliente";
import { conexiones, flujos } from "@/db/esquema";
import { EditorFlujo } from "./flujo-cliente";

export const objetosFlujo = [
  "candidatos",
  "contactos",
  "cuentas",
  "oportunidades",
  "casos",
  "tareas",
  "eventos",
  "productos",
  "facturas",
  "campanas",
  "articulos",
  "sesiones-mensajeria",
  "videollamadas",
];

export async function PaginaFlujo({ app, parametros }: { app: string; parametros: Record<string, string | string[] | undefined> }) {
  const db = await bd();
  const id = typeof parametros.id === "string" ? parametros.id : null;
  let flujo: typeof flujos.$inferSelect | null = null;
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    [flujo = null] = await db.select().from(flujos).where(eq(flujos.id, id)).limit(1);
    if (!flujo) notFound();
  }
  const lista = await db.select({ id: conexiones.id, nombre: conexiones.nombre, url: conexiones.url }).from(conexiones);
  return <EditorFlujo app={app} flujo={flujo} conexiones={lista} objetos={objetosFlujo} />;
}
