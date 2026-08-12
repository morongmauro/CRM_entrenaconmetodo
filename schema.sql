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

-- ================================================================
-- HISTORIAL de recordatorios de PAGO enviados (push masivo desde
-- el CRM → Pagos → "Enviar recordatorios de pago"). Lo escribe
-- push-cron.js con service_role. Cada fila = un envío: fecha,
-- cuántos y a quiénes. Segura de repetir.
-- ================================================================
create table if not exists push_pago_log (
  id            bigint generated always as identity primary key,
  creado_en     timestamptz default now(),
  enviados      int default 0,
  destinatarios jsonb           -- array de nombres a los que llegó
);
create index if not exists idx_push_pago_log_fecha on push_pago_log (creado_en);

alter table push_pago_log enable row level security;
drop policy if exists "coach lee push_pago_log" on push_pago_log;
create policy "coach lee push_pago_log" on push_pago_log for select using (auth.role() = 'authenticated');

-- ================================================================
-- HISTORIAL DE METAS NUTRICIONALES
-- La ficha guarda SOLO la meta vigente (clientes.meta_calorias…).
-- Al recalcularla, la anterior se perdía — y sin ella no se puede
-- leer un resultado ("bajó 2 kg", "se estancó") contra la meta que
-- regía cuando pasó. Cada meta fijada o enviada al Mealtracker deja
-- aquí una fila, con el peso y el objetivo con que se calculó.
-- El CRM funciona sin esta tabla: mientras no exista muestra solo la
-- meta vigente y avisa que falta correr esta migración.
-- ================================================================
create table if not exists metas_historial (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id        uuid not null references clientes(id) on delete cascade,

  -- Desde cuándo rige (la anterior se considera vigente hasta que aparece esta)
  fecha             date not null default current_date,

  -- Los números que ve el cliente (redondeados: kcal a 50, macros a 5 g)
  kcal              integer,
  proteina_g        integer,
  carbos_g          integer,
  grasas_g          integer,

  -- Contexto del cálculo: para releer meses después POR QUÉ fue esta meta
  metodo            text,          -- 'Mifflin-St Jeor' | 'Katch-McArdle'
  origen            text,          -- 'calculo' | 'envio_mt' | 'manual'
  nota              text,
  argumento         text,
  peso_kg           numeric,
  grasa_pct         numeric,
  objetivo          text,          -- p.ej. 'Déficit -20% (moderado)'
  objetivo_pct      numeric,
  proteina_g_kg     numeric,
  grasa_pct_kcal    numeric,
  pal               numeric,
  bmr               integer,
  tdee              integer,
  cambio_semanal_kg numeric,

  -- Si esta meta llegó de verdad a la app del cliente y cuándo
  enviada_mt        boolean not null default false,
  enviada_at        timestamptz,

  created_at        timestamptz not null default now()
);
create index if not exists idx_metas_historial_cliente on metas_historial (cliente_id, fecha desc, created_at desc);

alter table metas_historial enable row level security;
drop policy if exists "own metas_historial" on metas_historial;
create policy "own metas_historial" on metas_historial for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Semilla: deja la meta vigente de cada cliente como primer punto del
-- historial, para no arrancar la trazabilidad en blanco. Segura de repetir.
insert into metas_historial (user_id, cliente_id, fecha, kcal, proteina_g, carbos_g, grasas_g, metodo, argumento, origen, nota)
select c.user_id,
       c.id,
       coalesce(c.meta_calculada_en::date, current_date),
       c.meta_calorias, c.meta_proteina_g, c.meta_carbos_g, c.meta_grasas_g,
       c.meta_metodo, c.meta_argumento,
       'calculo',
       'Meta vigente al crear el historial'
from clientes c
where c.meta_calorias is not null
  and not exists (select 1 from metas_historial m where m.cliente_id = c.id);
