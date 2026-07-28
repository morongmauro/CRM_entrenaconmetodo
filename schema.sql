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
  cliente_id uuid references clientes(id) on delete cascade,  -- opcional si es tarea del coach
  para text default 'cliente',        -- cliente | coach (de quién es la tarea)
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

-- ================================================================
-- MIGRACIÓN · Si ya tenías la tabla "pendientes" creada, corre SOLO
-- estas dos líneas en el SQL Editor (son seguras de repetir):
-- ================================================================
alter table pendientes add column if not exists para text default 'cliente';
alter table pendientes alter column cliente_id drop not null;

-- ================================================================
-- MIGRACIÓN · Campos nuevos del cliente. Seguras de repetir:
-- correo/teléfono (extracción desde entrevista), suplementos y
-- actividades complementarias (correr, tenis… suman bonus al score).
-- ================================================================
alter table clientes add column if not exists email text;
alter table clientes add column if not exists telefono text;
alter table clientes add column if not exists suplementos text;
alter table clientes add column if not exists actividades_complementarias text;

-- Calculadora de meta nutricional: % de las kcal destinado a grasas
-- (configurable por cliente; AMDR 20-35%, default 25). Segura de repetir:
alter table clientes add column if not exists grasa_pct_kcal numeric;

-- Última meta ENVIADA al Mealtracker del cliente ({kcal,p,c,g,at}): registro
-- de qué fue lo último que efectivamente se cargó a su app (puede diferir de
-- la meta guardada en la ficha si aún no se envía). Segura de repetir:
alter table clientes add column if not exists meta_enviada_mt jsonb;
-- Nota: el acceso de clientes al Mealtracker / Centro de Recursos lo
-- resuelve el Mealtracker (api/authorize.js) leyendo la tabla clientes
-- directo con la service_role key. No requiere tabla extra en el CRM.

-- ================================================================
-- CONSUMO DE IA · Registro por llamada al chat del Mealtracker.
-- Lo escribe el proxy api/chat.js del Mealtracker con la service_role
-- key del CRM (fire-and-forget: si falla, nunca rompe el chat). Sirve
-- para el tablero de consumo: tokens y costo por cliente, por día /
-- semana / mes, y qué mensajes generaron ese gasto.
-- Segura de repetir.
-- ================================================================
create table if not exists ia_uso (
  id            bigint generated always as identity primary key,
  creado_en     timestamptz default now(),
  cliente_nombre text,                 -- nombre con el que el cliente entra a la app
  modelo        text,                  -- claude-sonnet-5 | claude-haiku-4-5-...
  accion        text default 'chat',   -- 'chat' (registro) | 'plan' (generación)
  input_tokens  int  default 0,
  output_tokens int  default 0,
  cache_read    int  default 0,        -- tokens servidos de caché (~10% costo)
  cache_write   int  default 0,        -- tokens escritos a caché (~125% costo)
  costo_usd     numeric(10,6) default 0,
  mensaje       text                   -- últimos ~500 chars del mensaje del cliente
);
create index if not exists idx_ia_uso_fecha   on ia_uso (creado_en);
create index if not exists idx_ia_uso_cliente on ia_uso (cliente_nombre);

alter table ia_uso enable row level security;
-- El coach (autenticado en el CRM) puede leer todo; la escritura llega por
-- service_role (bypassa RLS), así que no hace falta política de insert.
drop policy if exists "coach lee ia_uso" on ia_uso;
create policy "coach lee ia_uso" on ia_uso for select using (auth.role() = 'authenticated');
