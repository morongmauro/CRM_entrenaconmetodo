-- MI CICLO · registro del ciclo menstrual (opcional y privado)
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega.
--
--   clientes.ciclo_activo  → si la clienta lo activó en su app (Configuración › Mi ciclo).
--   ciclo_registros        → un registro por día: período sí/no, energía y molestias.

alter table clientes add column if not exists ciclo_activo boolean not null default false;

create table if not exists ciclo_registros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  fecha       date not null,
  periodo     boolean not null default false,
  energia     text check (energia in ('baja', 'normal', 'alta')),
  molestias   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cliente_id, fecha)
);
create index if not exists idx_ciclo_registros_cliente on ciclo_registros (cliente_id, fecha desc);

alter table ciclo_registros enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ciclo_registros' and policyname = 'own ciclo_registros') then
    create policy "own ciclo_registros" on ciclo_registros for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí» dos veces.
select 'ciclo_registros' as que, case when to_regclass('public.ciclo_registros') is not null then 'sí' else 'no' end as existe
union all
select 'clientes.ciclo_activo', case when exists (select 1 from information_schema.columns where table_name = 'clientes' and column_name = 'ciclo_activo') then 'sí' else 'no' end;
