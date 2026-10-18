import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite carga su WebAssembly desde node_modules; si se empaqueta, no lo encuentra.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default config;
