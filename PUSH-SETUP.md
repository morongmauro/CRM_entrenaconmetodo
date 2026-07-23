# Activar los recordatorios push — pasos únicos de configuración

## 1. Tabla en Supabase (proyecto del MealTracker)
SQL Editor → correr una vez:

```sql
create table if not exists push_subs (
  endpoint text primary key,
  user_id text,
  name text,
  tz text default 'America/Bogota',
  sub jsonb not null,
  updated_at timestamptz default now()
);
```

## 2. Variables de entorno en Vercel (proyecto mealtracker)
Settings → Environment Variables → agregar y re-deployar:

| Variable | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BFghXytWC-ahLnuu3quJTnfVrVu46owLgMfDbWA5ifO5XElONzo6jOO82DoCVmJYjDC0DsY1AzQescD9Vro1tuc` |
| `VAPID_PRIVATE_KEY` | `32mc1f9OpIFcptwIkdlNGA8N3vT5_XuKlEjpT43JEMU` |
| `CRON_SECRET` | inventa una contraseña larga (ej. 40 caracteres aleatorios) |

## 3. Secret en GitHub (repo mealtracker)
Settings → Secrets and variables → Actions → New repository secret:
- Nombre: `PUSH_CRON_SECRET`
- Valor: el MISMO que pusiste en `CRON_SECRET` de Vercel.

El workflow `.github/workflows/push-cron.yml` (incluido) dispara el envío
cada hora; con el secret configurado queda andando solo.

## 4. Los clientes
Al abrir la app verán el banner "🔔 Recordatorios del día — Activar".
Al aceptar quedan suscritos con la zona horaria de SU teléfono:
- 8:00 am → arranque del día
- 12:00 m → recordatorio de almuerzo (solo si aún no registró nada hoy)
  + recordatorio de pago (solo a quien tiene el corte vencido sin pago en el CRM)
- 8:00 pm → cierre del día (solo si lleva menos de 3 registros)

En iPhone: la app debe estar agregada a la pantalla de inicio (ya es el caso).
Probar a mano: Actions → push-reminders → Run workflow.
