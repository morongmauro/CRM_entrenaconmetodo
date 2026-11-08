-- ═══════════════════════════════════════════════════════════════════════
-- VIDEOS PARA LOS EJERCICIOS DE HOY QUE NO TENÍAN (14)
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run.
-- Solo PONE el video a la ficha (por su nombre en inglés) y SOLO si no tiene
-- video: si ya le pusiste uno, no lo toca. No borra nada. Se puede correr
-- dos veces. Al final sale la lista de cómo quedó cada uno.
-- (Dissociation Steps queda afuera: falta saber cuál movimiento es.)
-- ═══════════════════════════════════════════════════════════════════════

with v(nombre, ref) as (values
  ('Alternating Spiderman lunge to hip lift',       'Ze-_ObqMQbk'),
  ('Battle Rope Alternating Wave',                  'ZujykKeVZpM'),
  ('Bosu Lateral Bounce to Squat Jump',             'aGmLIWsLfjU'),
  ('Clapping Push Up',                              'vv1aPhOLPrk'),  -- Functional Bodybuilding
  ('Dumbbell Bulgarian Split Squat',                'Fmjj7wFJWRE'),
  ('Half Kneeling SuperBand Pallof Press and Raise','wIFJ2_B0fxo'),
  ('In/Out Hops',                                   'jEUWXKFmcm8'),
  ('Kettlebell Alternating Stationary Cossack Squat','LUTFik5l3tI'), -- Functional Bodybuilding
  ('Medicine Ball Slam with Squat Jump',            'mSpsBdYdBTk'),
  ('Pallof Press',                                  'BvSB4tvgLGc'),  -- Functional Bodybuilding
  ('Quadruped Hip Circles',                         '3HcqUibHeDY'),  -- Functional Bodybuilding
  ('Rear Foot Elevated Split Jump on Bench',        'dZXCHinMOus'),  -- Functional Bodybuilding
  ('Superband Anchored Low High Woodchop',          'PbIgoYWXi3E'),
  ('SuperBand Stationary Sprint',                   'rqB0D3zuvbw')
)
update ejercicios e set
  video_fuente = 'youtube',
  video_ref = v.ref,
  video_url = 'https://www.youtube.com/watch?v=' || v.ref,
  video_inicio_seg = null,
  video_path = null,
  poster_path = null,
  updated_at = now()
from v
where coalesce(e.archivado, false) = false
  and coalesce(e.video_fuente, 'ninguno') = 'ninguno'
  and (lower(trim(e.alias)) = lower(v.nombre) or lower(trim(e.nombre)) = lower(v.nombre));

-- Cómo quedó (debe decir «youtube» y su link en cada uno).
select coalesce(nullif(trim(alias), ''), nombre) as ejercicio, video_fuente, video_url
from ejercicios
where coalesce(archivado, false) = false
  and lower(trim(coalesce(alias, ''))) in ('alternating spiderman lunge to hip lift','battle rope alternating wave','bosu lateral bounce to squat jump','clapping push up','dumbbell bulgarian split squat','half kneeling superband pallof press and raise','in/out hops','kettlebell alternating stationary cossack squat','medicine ball slam with squat jump','pallof press','quadruped hip circles','rear foot elevated split jump on bench','superband anchored low high woodchop','superband stationary sprint','dissociation steps')
order by 1;
