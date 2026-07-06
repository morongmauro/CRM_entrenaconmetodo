-- ================================================================
-- ESQUEMA SUPABASE · CRM EntrenaConMétodo
-- Pega TODO este archivo en Supabase: SQL Editor → New query → Run
-- ================================================================

-- ---------- CLIENTES ----------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,

  -- Identidad
  nombre text not null,
  fecha_nacimiento date,
  sexo text,                         -- M | F | otro
  ciudad text,
  profesion text,

  -- Coaching
  meta_especifica text,
  lugar_entreno text,                -- casa | gym | aire_libre | mixto
  dias_entreno_cantidad int,         -- meta: cuántos días/semana entrena
  dias_entreno text[] default '{}',  -- qué días: L,M,X,J,V,S,D
  proteina_g_kg numeric,             -- g de proteína por kg (default 1.8 en la app)
  antecedentes_deportivos text,
  restricciones_lesiones text,
  patologias text,
  objetivo text,                     -- objetivo corto resumen

  -- Comercial
  monto numeric default 0,
  moneda text default 'COP',         -- COP | USD
  dia_pago int,                      -- 1-31
  fecha_inicio date,
  estado text default 'activo',      -- activo | pausa | finalizado
  canal_adquisicion text,            -- instagram | referido | web | otro
  metodo_pago_preferido text,        -- paypal | transferencia
  dias_gracia int default 3,

  -- Otros
  tags text[] default '{}',          -- etiquetas libres
  notas text,

  created_at timestamptz default now()
);

-- ---------- PAGOS ----------
-- Un registro por (cliente, mes). Solo importa "pagado sí/no" + monto.
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  mes text not null,                  -- YYYY-MM
  pagado boolean default false,
  monto numeric default 0,
  moneda text default 'COP',
  fecha_pago date,                    -- opcional
  metodo text,                        -- opcional
  nota text,
  created_at timestamptz default now(),
  unique (user_id, cliente_id, mes)
);

-- ---------- SEGUIMIENTOS SEMANALES ----------
create table if not exists seguimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  semana text not null,               -- YYYY-Www
  fecha date not null default current_date,

  -- Adherencias 0-10
  adherencia_entreno int,
  adherencia_alimentacion int,
  adherencia_descanso int,

  -- Asistencia entreno
  dias_planeados int,
  dias_asistidos int,
  dias_entrenados text[] default '{}', -- qué días marcó: L,M,X,J,V,S,D

  -- Estado y contenido
  estado text default 'hecho',        -- hecho (registrado) | la ausencia de registro = falta
  estado_animo text,                  -- excelente | bien | neutro | bajo | muy bajo
  avances text,
  pendientes_semana text,             -- pendientes específicos pedidos esa semana (texto libre)
  notas text,

  created_at timestamptz default now(),
  unique (user_id, cliente_id, semana)
);

-- ---------- PENDIENTES ----------
create table if not exists pendientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  scope text default 'general',       -- semana | general
  seguimiento_id uuid references seguimientos(id) on delete set null,
  descripcion text not null,
  fecha_limite date,
  prioridad text default 'media',     -- alta | media | baja
  estado text default 'abierto',      -- abierto | completado
  completado_en date,
  created_at timestamptz default now()
);

-- ---------- SETTINGS POR USUARIO ----------
create table if not exists settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  usd_cop_rate numeric default 4000,
  nombre_coach text,
  mealtracker_url text,
  mealtracker_anon_key text,
  mealtracker_app_url text,          -- URL de la app Mealtracker en Vercel (API segura)
  mealtracker_coach_password text,   -- COACH_PASSWORD del dashboard de coach
  updated_at timestamptz default now()
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
alter table clientes      enable row level security;
alter table pagos         enable row level security;
alter table seguimientos  enable row level security;
alter table pendientes    enable row level security;
alter table settings      enable row level security;

create policy "own clientes"     on clientes     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pagos"        on pagos        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own seguimientos" on seguimientos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pendientes"   on pendientes   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings"     on settings     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ÍNDICES ----------
create index if not exists idx_clientes_user     on clientes(user_id);
create index if not exists idx_pagos_user_mes    on pagos(user_id, mes);
create index if not exists idx_pagos_cliente     on pagos(cliente_id);
create index if not exists idx_seg_user_semana   on seguimientos(user_id, semana);
create index if not exists idx_seg_cliente       on seguimientos(cliente_id);
create index if not exists idx_pend_user_estado  on pendientes(user_id, estado);
