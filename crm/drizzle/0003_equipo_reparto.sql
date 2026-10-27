CREATE TABLE "crm"."invitaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"nombre" text NOT NULL,
	"correo" text NOT NULL,
	"rol" text NOT NULL,
	"invitada_por_id" text,
	"expira" timestamp with time zone NOT NULL,
	"usada_en" timestamp with time zone,
	"cuenta_id" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "crm"."candidatos" ADD COLUMN "asignado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm"."candidatos" ADD COLUMN "primer_contacto_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm"."configuracion" ADD COLUMN "reparto" text DEFAULT 'turnos' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."configuracion" ADD COLUMN "reparto_ultimo_id" text;--> statement-breakpoint
ALTER TABLE "crm"."configuracion" ADD COLUMN "sla_minutos" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."usuarios" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."usuarios" ADD COLUMN "recibe_leads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."usuarios" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "crm"."usuarios" ADD COLUMN "ultimo_acceso" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm"."invitaciones" ADD CONSTRAINT "invitaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "crm"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."invitaciones" ADD CONSTRAINT "invitaciones_invitada_por_id_usuarios_id_fk" FOREIGN KEY ("invitada_por_id") REFERENCES "crm"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitaciones_empresa_id_index" ON "crm"."invitaciones" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "invitaciones_cuenta_id_index" ON "crm"."invitaciones" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "candidatos_propietario_id_index" ON "crm"."candidatos" USING btree ("propietario_id");