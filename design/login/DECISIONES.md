# Login Machea: decisiones

Las decisiones se toman por rondas numeradas. Diego contesta por número y después de cada ronda se pasan a
"Decidido" y a [PLAN.md](PLAN.md).

Punto de partida: la rama `acceso-marca` de Felipe (commit `6203cbf`, 2026-10-12), que es la pantalla de
acceso en `/acceso/`. Es solo diseño: no inicia sesión.

## Decidido

| # | Fecha | Decisión |
|---|-------|----------|
| ~~D1~~ | 2026-10-13 | ~~Panel con los leads de cada cliente.~~ Lo reemplaza D6. |
| D2 | 2026-10-13 | **Registro abierto con aprobación:** cualquiera crea cuenta (correo o Google) y queda `pendiente` hasta que Machea la apruebe. |
| D3 | 2026-10-13 | **Google con el botón oficial** (Google Identity Services, popup/FedCM). |
| D4 | 2026-10-13 | **Login genérico, solo con la marca de Machea.** |
| D5 | 2026-10-13 | **Cada usuario es una empresa:** una cuenta = una empresa, sin miembros ni roles. |
| D6 | 2026-10-13 | **Alcance: solo el login.** Detrás irán un panel de administrador y un **CRM**, más adelante. |
| D7 | 2026-10-13 | Los proyectos del formulario son ejemplos; no se usan en el login. |
| D8 | 2026-10-13 | **Independiente del proveedor de nube.** Machea piensa migrar de Supabase a otro servicio pronto, así que ahora se construyen **la lógica y el diseño**: una capa de autenticación con un contrato (`ProveedorAuth`) y un proveedor de pruebas local. El proveedor real se conecta cuando se elija la nube. No se configura nada en Supabase. |
| D9 | 2026-10-13 | **Política de privacidad:** la redacta Claude como borrador ([POLITICA_PRIVACIDAD_BORRADOR.md](POLITICA_PRIVACIDAD_BORRADOR.md)) y la revisa el equipo. |
| D10 | 2026-10-13 | **Se registran constructoras e inmobiliarias.** |
| D11 | 2026-10-13 | **Las cuentas se aprueban desde `/admin`.** |
| D12 | 2026-10-13 | **Registro mínimo:** nombre de usuario, correo y contraseña. Sin teléfono. |
| D13 | 2026-10-13 | **Lo construimos nosotros (Diego + Claude)**, en **una sola rama `login`** en BGsanti/Machea, donde se hace todo. |
| D14 | 2026-10-13 | **Al menos 3 mockups** partiendo del diseño de Felipe, con la marca de Machea → [mockups/login.html](mockups/login.html). |
| D15 | 2026-10-13 | **Se elige la propuesta B "Centrada"** (minimalista: una tarjeta sobre gris claro con el selector Entrar / Crear cuenta). |
| D16 | 2026-10-13 | *Por defecto, a falta de respuesta (se puede cambiar):* el tipo constructora/inmobiliaria **lo marca Machea al aprobar**; **colores del manual** (Inter, #FC4633, #1F2E42); usuario **sin espacios** (`constructora-andes`). La pregunta de los textos del panel se cae: la B no tiene panel. |

Consecuencias:
- D3: el botón lo dibuja Google. La página tiene que mandar `Referrer-Policy: strict-origin-when-cross-origin`
  (hoy manda `no-referrer`) y abrir la CSP a `accounts.google.com/gsi/`.
- D8: el botón de Google entrega un *ID token* firmado por Google, y cualquier backend lo puede verificar.
  Por eso Google no ata el login a ningún proveedor de nube.
- D10 + D12: el registro no pregunta si es constructora o inmobiliaria. Machea lo marca al aprobar la cuenta
  en `/admin` (ver ronda 2, pregunta 2).
- La rama `login` parte de `acceso-marca` (el prototipo de Felipe), con `main` ya unido. Se creó el 2026-10-13.

## Ronda 2: cerrada

Diego eligió la propuesta B (D15). Las demás preguntas quedaron con la opción recomendada (D16).

## Ronda 3 (abierta)

1. **`/admin` → Cuentas:** el panel de Felipe vive en `frontend/public/admin/` (sin build) y habla con su
   backend de FastAPI. Sin una nube elegida no hay dónde guardar las cuentas reales.
   - a) Construir ya la pantalla "Cuentas" en `/admin` (listar, aprobar como constructora o inmobiliaria,
     rechazar) contra el contrato HTTP de `CONTRATO_AUTH.md`, para que funcione apenas exista el backend.
     Mientras tanto, en local se aprueba con el panel "Prueba". *(recomendado)*
   - b) Esperar a que se elija la nube.
2. **Correo de contacto** que aparece si una cuenta es rechazada: hoy es `equipo@machea.co`. ¿Está bien?
