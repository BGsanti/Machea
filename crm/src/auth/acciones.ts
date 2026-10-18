"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { bd } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { hayUsuarios } from "@/crm/servidor/consultas";
import { inicializarOrganizacion } from "@/crm/servidor/inicializar";
import { auth } from "./servidor";

export interface EstadoLogin {
  error?: string;
}

const esquemaLogin = z.object({ email: z.email(), password: z.string().min(1) });
const esquemaRegistro = z.object({
  nombre: z.string().trim().min(2, "Escriba su nombre."),
  email: z.email("Escriba un correo válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  empresa: z.string().trim().max(120).optional(),
});

function mensajeAuth(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  if (/invalid email or password|invalid password|user not found/i.test(texto)) return "Correo o contraseña incorrectos.";
  if (/already exists|already registered/i.test(texto)) return "Ya existe un usuario con ese correo.";
  return "No se pudo completar la operación. Inténtelo de nuevo.";
}

export async function iniciarSesion(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const datos = esquemaLogin.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!datos.success) return { error: "Escriba su correo y su contraseña." };
  try {
    await auth().api.signInEmail({ body: datos.data, headers: await headers() });
  } catch (e) {
    return { error: mensajeAuth(e) };
  }
  redirect("/");
}

/** Solo funciona mientras no exista ningún usuario: crea el administrador inicial. */
export async function crearAdministrador(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  if (await hayUsuarios()) return { error: "La cuenta de administrador ya existe. Inicie sesión." };
  const datos = esquemaRegistro.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    password: formData.get("password"),
    empresa: formData.get("empresa") || undefined,
  });
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Revise los datos." };
  try {
    const r = await auth().api.signUpEmail({
      body: { name: datos.data.nombre, email: datos.data.email, password: datos.data.password },
      headers: await headers(),
    });
    const db = await bd();
    await db.update(usuarios).set({ rol: "admin" }).where(eq(usuarios.id, r.user.id));
    await inicializarOrganizacion(r.user.id, datos.data.empresa);
  } catch (e) {
    return { error: mensajeAuth(e) };
  }
  redirect("/");
}

export async function cerrarSesion(): Promise<void> {
  await auth().api.signOut({ headers: await headers() });
  redirect("/login");
}
