import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bdSinEsperar } from "@/db/cliente";
import { cuentasAuth, sesiones, usuarios, verificaciones } from "@/db/esquema";

function crearAuth() {
  return betterAuth({
    appName: "REA CRM",
    secret: process.env.AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: drizzleAdapter(bdSinEsperar(), {
      provider: "pg",
      schema: { user: usuarios, session: sesiones, account: cuentasAuth, verification: verificaciones },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    user: {
      additionalFields: {
        rol: { type: "string", required: false, defaultValue: "usuario", input: false },
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
  global.__reaAuth ??= crearAuth();
  return global.__reaAuth;
}
