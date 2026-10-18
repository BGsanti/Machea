import { toNextJsHandler } from "better-auth/next-js";
import { auth, modoAuth } from "@/auth/servidor";
import { migracionesListas } from "@/db/cliente";

// Con el login de Machea no hay rutas de Better Auth.
const noExiste = () => new Response("No encontrado", { status: 404 });

export async function GET(request: Request) {
  if (modoAuth() !== "local") return noExiste();
  await migracionesListas();
  return toNextJsHandler(auth()).GET(request);
}

export async function POST(request: Request) {
  if (modoAuth() !== "local") return noExiste();
  await migracionesListas();
  return toNextJsHandler(auth()).POST(request);
}
