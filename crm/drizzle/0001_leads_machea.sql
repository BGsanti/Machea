CREATE TABLE "crm"."bandeja_leads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crm"."bandeja_leads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"empresa_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"origen_id" text NOT NULL,
	"datos" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tomado_en" timestamp with time zone,
	"procesado_en" timestamp with time zone,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "crm"."empresa_fuentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"slug" text NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm"."leads_machea" (
	"empresa_id" uuid NOT NULL,
	"telefono_digitos" text NOT NULL,
	"candidato_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_machea_empresa_id_telefono_digitos_pk" PRIMARY KEY("empresa_id","telefono_digitos")
);
--> statement-breakpoint
ALTER TABLE "crm"."candidatos" ADD COLUMN "origen_externo" text;--> statement-breakpoint
ALTER TABLE "crm"."eventos" ADD COLUMN "origen_externo" text;--> statement-breakpoint
ALTER TABLE "crm"."tareas" ADD COLUMN "origen_externo" text;--> statement-breakpoint
ALTER TABLE "crm"."bandeja_leads" ADD CONSTRAINT "bandeja_leads_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."empresa_fuentes" ADD CONSTRAINT "empresa_fuentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads_machea" ADD CONSTRAINT "leads_machea_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads_machea" ADD CONSTRAINT "leads_machea_candidato_id_candidatos_id_fk" FOREIGN KEY ("candidato_id") REFERENCES "crm"."candidatos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bandeja_leads_empresa_id_origen_origen_id_index" ON "crm"."bandeja_leads" USING btree ("empresa_id","origen","origen_id");--> statement-breakpoint
CREATE INDEX "bandeja_leads_empresa_id_procesado_en_index" ON "crm"."bandeja_leads" USING btree ("empresa_id","procesado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_fuentes_tipo_slug_index" ON "crm"."empresa_fuentes" USING btree ("tipo","slug");--> statement-breakpoint
CREATE INDEX "empresa_fuentes_empresa_id_index" ON "crm"."empresa_fuentes" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidatos_empresa_id_origen_externo_index" ON "crm"."candidatos" USING btree ("empresa_id","origen_externo") WHERE "crm"."candidatos"."origen_externo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_empresa_id_origen_externo_index" ON "crm"."eventos" USING btree ("empresa_id","origen_externo") WHERE "crm"."eventos"."origen_externo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tareas_empresa_id_origen_externo_index" ON "crm"."tareas" USING btree ("empresa_id","origen_externo") WHERE "crm"."tareas"."origen_externo" is not null;