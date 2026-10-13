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

Consecuencias:
- D3: el botón lo dibuja Google. La página tiene que mandar `Referrer-Policy: strict-origin-when-cross-origin`
  (hoy manda `no-referrer`) y abrir la CSP a `accounts.google.com/gsi/`.
- D8: el botón de Google entrega un *ID token* firmado por Google, y cualquier backend lo puede verificar.
  Por eso Google no ata el login a ningún proveedor de nube.
- D10 + D12: el registro no pregunta si es constructora o inmobiliaria. Machea lo marca al aprobar la cuenta
  en `/admin` (ver ronda 2, pregunta 2).
- La rama `login` parte de `acceso-marca` (el prototipo de Felipe), con `main` ya unido. Se creó el 2026-10-13.

## Ronda 2 (abierta)

1. **¿Qué propuesta de mockup?** Están en [mockups/login.html](mockups/login.html), con 7 pantallas cada una.
   - A) **Dividida:** la evolución del diseño de Felipe, con formulario y panel de marca navy.
   - B) **Centrada:** una tarjeta sola, mínima, con el selector Entrar / Crear cuenta.
   - C) **Plano:** fondo navy donde se dibuja un perfil de edificios, con la tarjeta flotante.
   - O una mezcla, por ejemplo "A con el plano de C en el panel".
2. **¿Constructora o inmobiliaria?** Con el registro mínimo (D12), propongo que **Machea lo marque al
   aprobar** en `/admin`. La alternativa es un selector de dos opciones en el registro. *(recomiendo marcarlo en el admin)*
3. **Colores.** Los mockups usan el manual de marca (Inter, rojo `#FC4633`, navy `#1F2E42`), igual que el
   formulario en producción. La landing y el prototipo de Felipe usan coral `#FF6259` con Archivo.
   - a) Manual. *(recomendado)*
   - b) Landing.
4. **Textos del panel de marca** (A y C): "Manuela llama a cada interesado por ti" y "A tu equipo solo llegan
   los leads calificados" vienen del prototipo de Felipe. ¿Se quedan?
5. **Nombre de usuario:** ¿solo minúsculas, números, guiones y puntos (tipo `constructora-andes`), o libre
   con espacios y tildes (tipo "Constructora Andes")? *(recomiendo el formato sin espacios: es más fácil de
   mostrar y de buscar)*
