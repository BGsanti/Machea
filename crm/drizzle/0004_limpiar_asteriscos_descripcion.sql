-- Migración de datos, sin cambios de esquema. La ingesta y los formularios guardaban la descripción con «**», pero ese
-- campo se muestra como texto plano y la persona veía los asteriscos. Solo se limpian las descripciones que generó el
-- sistema: las que traen origen externo y las de un formulario. Se corre DESPUÉS de desplegar el código que ya no los escribe.
UPDATE "crm"."candidatos"
SET "descripcion" = replace("descripcion", '**', '')
WHERE "descripcion" LIKE '%**%'
  AND ("origen_externo" IS NOT NULL OR "descripcion" LIKE 'Llenó el formulario **%');
