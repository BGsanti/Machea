import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth/servidor";
import { migracionesListas } from "@/db/cliente";

export async function GET(request: Request) {
  await migracionesListas();
  return toNextJsHandler(auth()).GET(request);
}

export async function POST(request: Request) {
  await migracionesListas();
  return toNextJsHandler(auth()).POST(request);
}
