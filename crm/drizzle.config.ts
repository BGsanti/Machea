import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/esquema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
});
