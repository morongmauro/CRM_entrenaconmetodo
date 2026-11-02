-- FICHA DEL EJERCICIO · «Errores comunes»
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una columna vacía.
--
--   ejercicios.errores_tecnicos → los errores comunes de cada ejercicio (uno por
--   renglón en el CRM). En la app salen en la ficha, debajo de «Cómo hacerlo bien».

alter table ejercicios add column if not exists errores_tecnicos text[] not null default '{}';

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'ejercicios.errores_tecnicos' as que,
  case when exists (select 1 from information_schema.columns where table_name = 'ejercicios' and column_name = 'errores_tecnicos') then 'sí' else 'no' end as existe;
