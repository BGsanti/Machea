CREATE TABLE "crm"."envios_formulario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"candidato_id" uuid,
	"respuestas" jsonb NOT NULL,
	"consentimiento" jsonb,
	"ip_hash" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm"."formularios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"config" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm"."inmuebles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"titulo" text NOT NULL,
	"codigo" text,
	"operacion" text DEFAULT 'venta' NOT NULL,
	"tipo" text,
	"estado" text DEFAULT 'disponible' NOT NULL,
	"ciudad" text,
	"barrio" text,
	"direccion" text,
	"estrato" integer,
	"precio" numeric(16, 2),
	"administracion" numeric(16, 2),
	"area" integer,
	"alcobas" integer,
	"banos" integer,
	"parqueaderos" integer,
	"dueno_contacto_id" uuid,
	"sitio_web" text,
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "crm"."proyectos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"propietario_id" text,
	"creado_por_id" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"etapa" text DEFAULT 'en_construccion' NOT NULL,
	"tipo_vivienda" text,
	"ciudad" text,
	"barrio" text,
	"direccion" text,
	"estrato" integer,
	"fecha_entrega" date,
	"unidades_totales" integer,
	"unidades_disponibles" integer,
	"precio_desde" numeric(16, 2),
	"precio_hasta" numeric(16, 2),
	"area_desde" integer,
	"area_hasta" integer,
	"alcobas" text,
	"aplica_subsidio" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"sitio_web" text,
	"descripcion" text
);
--> statement-breakpoint
ALTER TABLE "crm"."candidatos" ADD COLUMN "interes" text;--> statement-breakpoint
ALTER TABLE "crm"."candidatos" ADD COLUMN "respuestas" jsonb;--> statement-breakpoint
ALTER TABLE "crm"."configuracion" ADD COLUMN "perfil" text DEFAULT 'inmobiliaria' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."envios_formulario" ADD CONSTRAINT "envios_formulario_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."envios_formulario" ADD CONSTRAINT "envios_formulario_formulario_id_formularios_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "crm"."formularios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."envios_formulario" ADD CONSTRAINT "envios_formulario_candidato_id_candidatos_id_fk" FOREIGN KEY ("candidato_id") REFERENCES "crm"."candidatos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."formularios" ADD CONSTRAINT "formularios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."formularios" ADD CONSTRAINT "formularios_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."formularios" ADD CONSTRAINT "formularios_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."inmuebles" ADD CONSTRAINT "inmuebles_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."inmuebles" ADD CONSTRAINT "inmuebles_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."inmuebles" ADD CONSTRAINT "inmuebles_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."inmuebles" ADD CONSTRAINT "inmuebles_dueno_contacto_id_contactos_id_fk" FOREIGN KEY ("dueno_contacto_id") REFERENCES "crm"."contactos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."proyectos" ADD CONSTRAINT "proyectos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."proyectos" ADD CONSTRAINT "proyectos_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."proyectos" ADD CONSTRAINT "proyectos_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "envios_formulario_formulario_id_creado_en_index" ON "crm"."envios_formulario" USING btree ("formulario_id","creado_en");--> statement-breakpoint
CREATE INDEX "envios_formulario_ip_hash_creado_en_index" ON "crm"."envios_formulario" USING btree ("ip_hash","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "formularios_slug_index" ON "crm"."formularios" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "formularios_empresa_id_index" ON "crm"."formularios" USING btree ("empresa_id");