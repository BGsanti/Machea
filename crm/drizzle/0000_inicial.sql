CREATE TABLE "articulos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"titulo" text NOT NULL,
	"nombre_url" text,
	"contenido" text,
	"visible_cliente" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"publicado_en" timestamp with time zone,
	"asignado_a_id" text,
	"vistas" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campanas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text,
	"estado" text DEFAULT 'planificada' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"presupuesto" numeric(16, 2),
	"activa" boolean DEFAULT true NOT NULL,
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "candidatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"tratamiento" text,
	"nombre" text,
	"apellidos" text NOT NULL,
	"compania" text NOT NULL,
	"cargo" text,
	"sitio_web" text,
	"descripcion" text,
	"valoracion" text,
	"telefono" text,
	"email" text,
	"pais" text,
	"calle" text,
	"ciudad" text,
	"estado_provincia" text,
	"codigo_postal" text,
	"numero_empleados" integer,
	"ingresos_anuales" numeric(16, 2),
	"origen" text,
	"sector" text,
	"convertido" boolean DEFAULT false NOT NULL,
	"convertido_en" timestamp with time zone,
	"cuenta_convertida_id" uuid,
	"contacto_convertido_id" uuid,
	"oportunidad_convertida_id" uuid
);
--> statement-breakpoint
CREATE TABLE "carpetas_texto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "casos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"numero" serial NOT NULL,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"origen" text,
	"prioridad" text DEFAULT 'media' NOT NULL,
	"contacto_id" uuid,
	"cuenta_id" uuid,
	"asunto" text,
	"descripcion" text,
	"notificar_contacto" boolean DEFAULT false NOT NULL,
	"cerrado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conexiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"conector" text NOT NULL,
	"url" text,
	"estado" text DEFAULT 'sin_configurar' NOT NULL,
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"nombre_empresa" text DEFAULT 'Mi empresa' NOT NULL,
	"moneda" text DEFAULT 'COP' NOT NULL,
	"pais" text DEFAULT 'Colombia',
	"marketing_activado" boolean DEFAULT false NOT NULL,
	"impuesto_porcentaje" numeric(5, 2) DEFAULT 19 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tratamiento" text,
	"nombre" text,
	"apellidos" text NOT NULL,
	"cuenta_id" uuid,
	"cargo" text,
	"supervisor_id" uuid,
	"descripcion" text,
	"telefono" text,
	"email" text,
	"correo_pais" text,
	"correo_calle" text,
	"correo_ciudad" text,
	"correo_estado" text,
	"correo_codigo_postal" text
);
--> statement-breakpoint
CREATE TABLE "correos_lista" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"asunto" text NOT NULL,
	"cuerpo" text NOT NULL,
	"objeto_destinatarios" text NOT NULL,
	"destinatarios" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'enviado' NOT NULL,
	"enviado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cuentas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"sitio_web" text,
	"tipo" text,
	"descripcion" text,
	"cuenta_principal_id" uuid,
	"telefono" text,
	"facturacion_pais" text,
	"facturacion_calle" text,
	"facturacion_ciudad" text,
	"facturacion_estado" text,
	"facturacion_codigo_postal" text,
	"envio_pais" text,
	"envio_calle" text,
	"envio_ciudad" text,
	"envio_estado" text,
	"envio_codigo_postal" text
);
--> statement-breakpoint
CREATE TABLE "cuentas_auth" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinatarios_correo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correo_id" uuid NOT NULL,
	"objeto" text NOT NULL,
	"registro_id" uuid NOT NULL,
	"email" text,
	"estado" text DEFAULT 'registrado' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ejecuciones_flujo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flujo_id" uuid,
	"nombre_flujo" text NOT NULL,
	"objeto" text NOT NULL,
	"registro_id" uuid,
	"estado" text NOT NULL,
	"detalle" text,
	"duracion_ms" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entradas_lista_precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"lista_precios_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio" numeric(16, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "establecimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text,
	"moneda" text DEFAULT 'COP' NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"lista_precios_id" uuid,
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"asunto" text NOT NULL,
	"descripcion" text,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"todo_el_dia" boolean DEFAULT false NOT NULL,
	"privado" boolean DEFAULT false NOT NULL,
	"ubicacion" text,
	"quien_objeto" text,
	"quien_id" uuid,
	"relacionado_objeto" text,
	"relacionado_id" uuid
);
--> statement-breakpoint
CREATE TABLE "facturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"numero" serial NOT NULL,
	"oportunidad_id" uuid,
	"cuenta_id" uuid,
	"fecha_emision" date NOT NULL,
	"fecha_vencimiento" date,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"subtotal" numeric(16, 2) DEFAULT 0 NOT NULL,
	"impuestos" numeric(16, 2) DEFAULT 0 NOT NULL,
	"total" numeric(16, 2) DEFAULT 0 NOT NULL,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "flujos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"objeto" text NOT NULL,
	"disparador" text DEFAULT 'crear' NOT NULL,
	"condiciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "informes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"objeto" text NOT NULL,
	"agrupar_por" text,
	"agregacion" text DEFAULT 'conteo' NOT NULL,
	"campo_agregado" text,
	"filtros" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tipo_grafico" text DEFAULT 'barras' NOT NULL,
	"carpeta" text,
	"favorito" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineas_factura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factura_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"cantidad" numeric(14, 2) NOT NULL,
	"precio_unitario" numeric(16, 2) NOT NULL,
	"total" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listas_precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"estandar" boolean DEFAULT false NOT NULL,
	"descripcion" text,
	"valido_desde" timestamp with time zone,
	"valido_hasta" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "miembros_campana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campana_id" uuid NOT NULL,
	"objeto" text NOT NULL,
	"registro_id" uuid NOT NULL,
	"estado" text DEFAULT 'enviado' NOT NULL,
	"agregado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"titulo" text NOT NULL,
	"cuerpo" text,
	"enlace" text,
	"leida" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oportunidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"cuenta_id" uuid,
	"fecha_cierre" date NOT NULL,
	"importe" numeric(16, 2),
	"descripcion" text,
	"etapa" text DEFAULT 'calificar' NOT NULL,
	"probabilidad" integer,
	"categoria_prevision" text DEFAULT 'pipeline' NOT NULL,
	"siguiente_paso" text,
	"lista_precios_id" uuid,
	"origen" text
);
--> statement-breakpoint
CREATE TABLE "paneles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"informes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"favorito" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferencias_usuario" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"sugerencias_ocultas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"navegacion" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"familia" text,
	"codigo" text,
	"sku" text,
	"activo" boolean DEFAULT true NOT NULL,
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "productos_oportunidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"oportunidad_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" numeric(14, 2) DEFAULT 1 NOT NULL,
	"precio_unitario" numeric(16, 2) NOT NULL,
	"descuento" numeric(5, 2),
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesiones_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sesiones_mensajeria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"canal" text DEFAULT 'whatsapp' NOT NULL,
	"contacto_id" uuid,
	"estado" text DEFAULT 'activa' NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fin" timestamp with time zone,
	"resumen" text
);
--> statement-breakpoint
CREATE TABLE "tareas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"asunto" text NOT NULL,
	"tipo" text DEFAULT 'tarea' NOT NULL,
	"fecha_vencimiento" date,
	"comentarios" text,
	"estado" text DEFAULT 'no_iniciada' NOT NULL,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"quien_objeto" text,
	"quien_id" uuid,
	"relacionado_objeto" text,
	"relacionado_id" uuid,
	"completada_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "textos_rapidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"mensaje" text NOT NULL,
	"carpeta_id" uuid,
	"categoria" text,
	"canales" text[] DEFAULT '{}'::text[] NOT NULL,
	"favorito" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"rol" text DEFAULT 'usuario' NOT NULL,
	"alias" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videollamadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"asunto" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"duracion_minutos" integer DEFAULT 30 NOT NULL,
	"enlace" text,
	"estado" text DEFAULT 'programada' NOT NULL,
	"relacionado_objeto" text,
	"relacionado_id" uuid,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "vistos_recientemente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"objeto" text NOT NULL,
	"registro_id" uuid NOT NULL,
	"visto_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_asignado_a_id_usuarios_id_fk" FOREIGN KEY ("asignado_a_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carpetas_texto" ADD CONSTRAINT "carpetas_texto_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carpetas_texto" ADD CONSTRAINT "carpetas_texto_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casos" ADD CONSTRAINT "casos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casos" ADD CONSTRAINT "casos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casos" ADD CONSTRAINT "casos_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casos" ADD CONSTRAINT "casos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conexiones" ADD CONSTRAINT "conexiones_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conexiones" ADD CONSTRAINT "conexiones_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correos_lista" ADD CONSTRAINT "correos_lista_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correos_lista" ADD CONSTRAINT "correos_lista_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_auth" ADD CONSTRAINT "cuentas_auth_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinatarios_correo" ADD CONSTRAINT "destinatarios_correo_correo_id_correos_lista_id_fk" FOREIGN KEY ("correo_id") REFERENCES "public"."correos_lista"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_flujo" ADD CONSTRAINT "ejecuciones_flujo_flujo_id_flujos_id_fk" FOREIGN KEY ("flujo_id") REFERENCES "public"."flujos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_lista_precios" ADD CONSTRAINT "entradas_lista_precios_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_lista_precios" ADD CONSTRAINT "entradas_lista_precios_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_lista_precios" ADD CONSTRAINT "entradas_lista_precios_lista_precios_id_listas_precios_id_fk" FOREIGN KEY ("lista_precios_id") REFERENCES "public"."listas_precios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_lista_precios" ADD CONSTRAINT "entradas_lista_precios_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establecimientos" ADD CONSTRAINT "establecimientos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establecimientos" ADD CONSTRAINT "establecimientos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establecimientos" ADD CONSTRAINT "establecimientos_lista_precios_id_listas_precios_id_fk" FOREIGN KEY ("lista_precios_id") REFERENCES "public"."listas_precios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_oportunidad_id_oportunidades_id_fk" FOREIGN KEY ("oportunidad_id") REFERENCES "public"."oportunidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujos" ADD CONSTRAINT "flujos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujos" ADD CONSTRAINT "flujos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "informes" ADD CONSTRAINT "informes_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "informes" ADD CONSTRAINT "informes_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_factura_id_facturas_id_fk" FOREIGN KEY ("factura_id") REFERENCES "public"."facturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_campana" ADD CONSTRAINT "miembros_campana_campana_id_campanas_id_fk" FOREIGN KEY ("campana_id") REFERENCES "public"."campanas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_lista_precios_id_listas_precios_id_fk" FOREIGN KEY ("lista_precios_id") REFERENCES "public"."listas_precios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paneles" ADD CONSTRAINT "paneles_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paneles" ADD CONSTRAINT "paneles_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_oportunidad" ADD CONSTRAINT "productos_oportunidad_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_oportunidad" ADD CONSTRAINT "productos_oportunidad_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_oportunidad" ADD CONSTRAINT "productos_oportunidad_oportunidad_id_oportunidades_id_fk" FOREIGN KEY ("oportunidad_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_oportunidad" ADD CONSTRAINT "productos_oportunidad_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_mensajeria" ADD CONSTRAINT "sesiones_mensajeria_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_mensajeria" ADD CONSTRAINT "sesiones_mensajeria_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_mensajeria" ADD CONSTRAINT "sesiones_mensajeria_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_rapidos" ADD CONSTRAINT "textos_rapidos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_rapidos" ADD CONSTRAINT "textos_rapidos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_rapidos" ADD CONSTRAINT "textos_rapidos_carpeta_id_carpetas_texto_id_fk" FOREIGN KEY ("carpeta_id") REFERENCES "public"."carpetas_texto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videollamadas" ADD CONSTRAINT "videollamadas_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videollamadas" ADD CONSTRAINT "videollamadas_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vistos_recientemente" ADD CONSTRAINT "vistos_recientemente_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidatos_apellidos_index" ON "candidatos" USING btree ("apellidos");--> statement-breakpoint
CREATE INDEX "candidatos_estado_index" ON "candidatos" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "casos_estado_index" ON "casos" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "contactos_apellidos_index" ON "contactos" USING btree ("apellidos");--> statement-breakpoint
CREATE INDEX "contactos_cuenta_id_index" ON "contactos" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "cuentas_nombre_index" ON "cuentas" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "ejecuciones_flujo_creado_en_index" ON "ejecuciones_flujo" USING btree ("creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "entradas_lista_precios_lista_precios_id_producto_id_index" ON "entradas_lista_precios" USING btree ("lista_precios_id","producto_id");--> statement-breakpoint
CREATE INDEX "eventos_inicio_index" ON "eventos" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "eventos_relacionado_id_index" ON "eventos" USING btree ("relacionado_id");--> statement-breakpoint
CREATE INDEX "eventos_quien_id_index" ON "eventos" USING btree ("quien_id");--> statement-breakpoint
CREATE UNIQUE INDEX "miembros_campana_campana_id_objeto_registro_id_index" ON "miembros_campana" USING btree ("campana_id","objeto","registro_id");--> statement-breakpoint
CREATE INDEX "notificaciones_usuario_id_leida_index" ON "notificaciones" USING btree ("usuario_id","leida");--> statement-breakpoint
CREATE INDEX "oportunidades_etapa_index" ON "oportunidades" USING btree ("etapa");--> statement-breakpoint
CREATE INDEX "oportunidades_cuenta_id_index" ON "oportunidades" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "tareas_relacionado_id_index" ON "tareas" USING btree ("relacionado_id");--> statement-breakpoint
CREATE INDEX "tareas_quien_id_index" ON "tareas" USING btree ("quien_id");--> statement-breakpoint
CREATE INDEX "tareas_propietario_id_index" ON "tareas" USING btree ("propietario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vistos_recientemente_usuario_id_objeto_registro_id_index" ON "vistos_recientemente" USING btree ("usuario_id","objeto","registro_id");--> statement-breakpoint
CREATE INDEX "vistos_recientemente_usuario_id_visto_en_index" ON "vistos_recientemente" USING btree ("usuario_id","visto_en");