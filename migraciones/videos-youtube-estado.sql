-- ═══════════════════════════════════════════════════════════════════════
-- VIDEOS DE YOUTUBE QUE NO SE REPRODUCEN (revisión desde el CRM)
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo CREA una tabla nueva: no toca ninguna tabla existente y
-- no borra nada.
--
-- Qué guarda: por cada video de YouTube de la galería, si se reproduce fuera
-- de YouTube (como en la app del cliente) o si YouTube lo bloquea («Video no
-- disponible» por derechos de autor, país, dueño o borrado), con el código
-- de YouTube y cuándo se revisó. Lo llena el botón «Revisar YouTube» de la
-- galería. Mientras no se corra, el CRM lo guarda en el navegador y lo sube
-- solo en cuanto la tabla exista.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists ejercicio_video_estado (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users,
  video_ref     text not null,         -- el id del video de YouTube
  ejercicio_id  text,
  estado        text not null,         -- ok · problema
  codigo        int,                   -- 100 borrado/privado · 101/150 no deja insertarlo · 152/153
  revisado_en   timestamptz not null default now(),
  unique (user_id, video_ref)
);
alter table ejercicio_video_estado enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ejercicio_video_estado' and policyname = 'own ejercicio_video_estado') then
    create policy "own ejercicio_video_estado" on ejercicio_video_estado for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para comprobar: debe salir 0 (la tabla existe y está vacía al principio).
select count(*) from ejercicio_video_estado;
