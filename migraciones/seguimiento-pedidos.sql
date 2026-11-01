-- =====================================================
-- Lo que le pides a cada cliente en el seguimiento
-- =====================================================
-- Cuando le escribes desde Seguimiento («Enviar por WhatsApp y guardar» o
-- «Solo guardar»), lo que le pides (subir un peso, un video, una medición,
-- algo de la comida) se guarda aquí, uno por fila. En el siguiente
-- seguimiento sale en «La vez pasada le dijiste» con si lo cumplió: el CRM
-- lo revisa con sus datos y, cuando no puede, lo marcas tú.
--
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run.
-- Solo CREA lo que falta. No borra ni cambia nada de lo que ya tienes.
-- Se puede correr las veces que quieras.

create table if not exists seguimiento_pedidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha date not null default current_date,     -- el día que se lo pediste
  tipo text not null default 'otro',             -- entreno | video | comida | medicion | otro
  texto text not null,                           -- «Subir elevación lateral a 15 kg»
  objetivo jsonb not null default '{}',          -- { ejercicio, peso_kg, foco } para revisarlo solo
  estado text not null default 'pendiente',      -- pendiente | cumplio | no | medias (lo que marques tú)
  revisado_en timestamptz,
  created_at timestamptz default now()
);

create index if not exists seguimiento_pedidos_cliente_idx on seguimiento_pedidos (cliente_id, fecha desc);

alter table seguimiento_pedidos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'seguimiento_pedidos' and policyname = 'own seguimiento_pedidos') then
    create policy "own seguimiento_pedidos" on seguimiento_pedidos
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Comprobación: debe decir «sí».
select 'seguimiento_pedidos' as tabla,
  case when exists (select 1 from information_schema.tables where table_name = 'seguimiento_pedidos') then 'sí' else 'NO' end as creada;
