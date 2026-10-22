-- ═══════════════════════════════════════════════════════════════════════
-- «NO LE SIRVE» · tag por cliente y ejercicio
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo CREA una tabla nueva: no toca ninguna tabla existente y
-- no borra nada (quitar el tag solo le pone la fecha `quitado_en`).
--
-- Qué guarda: que un ejercicio no va con un cliente, y por qué:
--   motivo 'implemento' → no tiene la máquina o el implemento
--   motivo 'dolor'      → le molesta o le duele
--   motivo 'otro'       → otro (con nota)
-- El cliente no ve nada de esto en su app.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists ejercicios_no_sirven (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users,
  cliente_id    text not null,
  ejercicio_id  text not null,
  motivo        text not null check (motivo in ('implemento', 'dolor', 'otro')),
  nota          text,
  creado_en     timestamptz not null default now(),
  quitado_en    timestamptz
);
create index if not exists ejercicios_no_sirven_cliente_idx on ejercicios_no_sirven (cliente_id, ejercicio_id, quitado_en);
alter table ejercicios_no_sirven enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ejercicios_no_sirven' and policyname = 'own ejercicios_no_sirven') then
    create policy "own ejercicios_no_sirven" on ejercicios_no_sirven for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para comprobar: debe salir 0 (la tabla existe y está vacía al principio).
select count(*) from ejercicios_no_sirven;
