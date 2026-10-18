import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { bd, bdSinEsperar } from "@/db/cliente";
import { cuentasAuth, sesiones, usuarios, verificaciones } from "@/db/esquema";

/**
 * "machea": la sesión es la del login de Machea (ver machea.ts). Es el único modo permitido en Vercel.
 * "local" (por defecto): Better Auth, para desarrollo y para usar el CRM por su cuenta.
 */
export function modoAuth(): "machea" | "local" {
  const modo = process.env.AUTH_MODO === "machea" ? "machea" : "local";
  // Falla cerrado: un despliegue mal configurado no debe quedar con un login aparte.
  if (process.env.VERCEL && modo !== "machea") throw new Error("En Vercel el CRM exige AUTH_MODO=machea.");
  return modo;
}

/**
 * Con el login de Machea, los datos de ejemplo se mezclarían con los leads reales de la empresa:
 * solo se permiten con CRM_PERMITIR_EJEMPLOS=1 (por ejemplo, en una cuenta de demostración).
 */
export function ejemplosPermitidos(): boolean {
  return modoAuth() === "local" || process.env.CRM_PERMITIR_EJEMPLOS === "1";
}

function crearAuth() {
  return betterAuth({
    appName: "REA CRM",
    secret: process.env.AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: drizzleAdapter(bdSinEsperar(), {
      provider: "pg",
      schema: { user: usuarios, session: sesiones, account: cuentasAuth, verification: verificaciones },
    }),
    // Sin registro público: el primer administrador y el resto de usuarios se crean desde el servidor
    // (crearUsuarioLocal). Con el registro abierto, cualquiera podía hacer POST /api/auth/sign-up/email.
    emailAndPassword: { enabled: true, minPasswordLength: 8, disableSignUp: true },
    user: {
      additionalFields: {
        rol: { type: "string", required: false, defaultValue: "usuario", input: false },
        empresaId: { type: "string", required: false, input: false },
        alias: { type: "string", required: false },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof crearAuth>;

const global = globalThis as unknown as { __reaAuth?: Auth };

/** Se crea al primer uso para no abrir la base de datos durante el build. */
export function auth(): Auth {
  if (modoAuth() !== "local") throw new Error("Better Auth solo se usa con AUTH_MODO=local.");
  global.__reaAuth ??= crearAuth();
  return global.__reaAuth;
}

/** Crea un usuario con contraseña sin iniciar sesión como él (modo local). */
export async function crearUsuarioLocal(
  datos: { nombre: string; email: string; password: string },
  rol: "admin" | "usuario",
  empresaId: string,
): Promise<string> {
  const ctx = await auth().$context;
  const email = datos.email.toLowerCase();
  const hash = await ctx.password.hash(datos.password);
  const nuevo = await ctx.internalAdapter.createUser({ name: datos.nombre, email, emailVerified: false }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({ userId: nuevo.id, providerId: "credential", accountId: nuevo.id, password: hash });
  const db = await bd();
  await db.update(usuarios).set({ rol, empresaId }).where(eq(usuarios.id, nuevo.id));
  return nuevo.id;
}
