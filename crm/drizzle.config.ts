import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/esquema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  // Solo el esquema del CRM: la base también puede tener los de Machea (public, acceso).
  schemaFilter: ["crm"],
});
