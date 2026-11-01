-- ═══════════════════════════════════════════════════════════════════════
-- AUSENCIAS (viaje, enfermedad…) y BIENESTAR cada 15 días
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run.
-- Solo CREA dos tablas nuevas. No toca ninguna tabla existente y no borra
-- nada. Se puede correr las veces que quieras.
--
-- ausencias: los días que un cliente va a estar fuera (o estuvo). La marca
--   el cliente en su app («Voy a estar fuera») o tú en el CRM. Esos días no
--   cuentan en su adherencia, puntajes ni alertas. Quitar una ausencia no la
--   borra: se marca `anulada_en`.
-- bienestar: el check-in de cada 15 días en su app: sueño, energía y estrés
--   de 1 a 5 (en los tres, 5 es lo mejor: estrés 5 = tranquilo).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists ausencias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  desde       date not null,
  hasta       date not null,
  motivo      text not null default 'otro',      -- viaje | enfermedad | lesion | trabajo | otro
  nota        text,                              -- lo que quiso contar (opcional)
  origen      text not null default 'coach',     -- coach | cliente (quién la marcó)
  vista_en    timestamptz,                       -- cuándo la viste en el CRM (las que marca el cliente)
  anulada_en  timestamptz,                       -- la quitaron (no se borra)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ausencias_cliente_idx on ausencias (cliente_id, desde desc);
alter table ausencias enable row level security;

create table if not exists bienestar (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  fecha       date not null default current_date,
  sueno       int check (sueno between 1 and 5),
  energia     int check (energia between 1 and 5),
  estres      int check (estres between 1 and 5),   -- 1 = mucho estrés · 5 = tranquilo
  created_at  timestamptz not null default now(),
  unique (cliente_id, fecha)
);
create index if not exists bienestar_cliente_idx on bienestar (cliente_id, fecha desc);
alter table bienestar enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ausencias' and policyname = 'own ausencias') then
    create policy "own ausencias" on ausencias
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bienestar' and policyname = 'own bienestar') then
    create policy "own bienestar" on bienestar
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Comprobación: las dos deben decir «sí».
select t as tabla,
  case when exists (select 1 from information_schema.tables where table_name = t) then 'sí' else 'NO' end as creada
from (values ('ausencias'), ('bienestar')) as x(t);
