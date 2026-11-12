-- MENSAJES ENVIADOS · poder retirar de su app o deshacer el registro
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una columna
-- vacía («retirado_en» / «nota_retirada_en») a cuatro tablas.
--
--   respuestas_coach.retirado_en     → lo retiraste de su app: ya no le sale
--   seguimiento_mensajes.retirado_en → deshiciste el registro (no cuenta como toque)
--   capsulas_pedidas.retirado_en     → deshiciste el envío de la cápsula
--   videos_tecnica.nota_retirada_en  → retiraste de su app el «Qué corregir» de un video

do $$ begin
  if to_regclass('public.respuestas_coach') is not null then
    alter table respuestas_coach add column if not exists retirado_en timestamptz;
  end if;
  if to_regclass('public.seguimiento_mensajes') is not null then
    alter table seguimiento_mensajes add column if not exists retirado_en timestamptz;
  end if;
  if to_regclass('public.capsulas_pedidas') is not null then
    alter table capsulas_pedidas add column if not exists retirado_en timestamptz;
  end if;
  -- El «Qué corregir» de un video a mejorar: retirarlo de su app sin borrar la nota.
  if to_regclass('public.videos_tecnica') is not null then
    alter table videos_tecnica add column if not exists nota_retirada_en timestamptz;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: todas deben decir «sí».
select t as tabla, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'retirado_en') then 'sí' else 'no' end as tiene_retirado
from unnest(array['respuestas_coach', 'seguimiento_mensajes', 'capsulas_pedidas']) as t
union all
select 'videos_tecnica', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'videos_tecnica' and column_name = 'nota_retirada_en') then 'sí' else 'no' end;
