-- ================================================================
-- MIGRACIÓN · Calendario de publicaciones de la Comunidad
-- ================================================================
-- Dónde se corre: Supabase del CRM → SQL Editor → pegar todo → Run.
-- Es idempotente: correrlo dos veces no rompe nada ni duplica nada.
-- Solo AGREGA una tabla nueva: no toca clientes, publicaciones ni nada
-- de lo que ya tienes, y no borra nada.
--
-- Los mensajes que tienes listos para la Comunidad, en orden (CRM →
-- Comunidad → «Calendario de publicaciones»). Solo los ve el coach: a
-- los clientes les llega un mensaje cuando tocas «Publicar».
-- ================================================================

create table if not exists comunidad_borradores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  orden integer not null default 0,
  fecha date,
  texto text not null check (length(trim(texto)) between 1 and 4000),
  publicado_en timestamptz,
  post_id uuid,
  archivado_en timestamptz,
  creado_en timestamptz not null default now()
);

alter table comunidad_borradores enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'comunidad_borradores' and policyname = 'comunidad_borradores_propia') then
    create policy comunidad_borradores_propia on comunidad_borradores for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
