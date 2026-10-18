// Aplica las migraciones pendientes. La app también lo hace al arrancar; este
// script sirve para preparar una base PostgreSQL antes del primer despliegue.
import { migracionesListas } from "../src/db/cliente";

await migracionesListas();
console.log("Migraciones aplicadas.");
process.exit(0);
