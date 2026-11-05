-- FOTOS DE PROGRESO · subirlas desde el CRM (Composición → Fotos → «Subir fotos»)
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega permisos.
--
-- Para las fotos que tus clientes te mandan por WhatsApp: las subes tú y le
-- salen en su app como si las hubiera subido él.
--   · Guardar en la carpeta privada de fotos ('progreso') SOLO dentro de la
--     carpeta de un cliente tuyo (la ruta empieza por su id).
--   · Verlas (por si este permiso no estaba).
--   · No hay permiso para borrar ni para cambiar fotos desde el CRM.

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'coach sube progreso') then
    create policy "coach sube progreso" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'progreso'
        and exists (select 1 from public.clientes c where c.id::text = (storage.foldername(name))[1] and c.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'coach lee progreso') then
    create policy "coach lee progreso" on storage.objects for select to authenticated using (bucket_id = 'progreso');
  end if;
end $$;

-- Comprobación: las dos deben decir «sí».
select p as permiso,
  case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = p) then 'sí' else 'no' end as existe
from unnest(array['coach sube progreso', 'coach lee progreso']) as p;
