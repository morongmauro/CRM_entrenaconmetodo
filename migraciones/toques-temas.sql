-- =====================================================
-- Qué tocar: lo que marcas como dicho a cada cliente
-- =====================================================
-- En Seguimiento y en Toques, la lista «Qué tocar esta semana» te dice qué
-- recordarle (un logro, su constancia, lo que le pediste y ya cumplió, una
-- sola cosa a mejorar). Cuando marcas «Ya lo dije yo» o «Usar texto», se
-- guarda aquí: el tema (fuerza, adherencia, registro de comida, calorías y
-- macros, medición, técnica) y si lo felicitaste, le pediste o le
-- corregiste. Con eso «Lo que le has dicho» sabe qué ya le dijiste aunque
-- se lo hayas escrito con tus palabras por WhatsApp.
--
-- «Deshacer» no borra la fila: le pone la fecha en deshecho_en.
--
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run.
-- Solo CREA lo que falta. No borra ni cambia nada de lo que ya tienes.
-- Se puede correr las veces que quieras.

create table if not exists toques_temas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  fecha        date not null default current_date,
  tema         text not null,       -- fuerza | adherencia | registro | macros | medicion | tecnica
  accion       text not null,       -- felicita | pide | corrige
  modo         text not null default 'mio',   -- mio (con tus palabras) | texto (el sugerido)
  punto        text,                -- qué punto de la lista era (para no sugerirlo de nuevo esa semana)
  texto        text,                -- lo que recordaste o el texto que usaste
  deshecho_en  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists toques_temas_cliente_idx on toques_temas (cliente_id, fecha desc);

alter table toques_temas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'toques_temas' and policyname = 'own toques_temas') then
    create policy "own toques_temas" on toques_temas
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'toques_temas' as tabla,
  case when to_regclass('public.toques_temas') is not null then 'sí' else 'NO' end as creada;
