# Trazabilidad del Centro de Recursos en el CRM

Qué material ha visto cada cliente —onboarding, guía, **cápsulas** y
podcast— dentro de la ficha del cliente. Todo llega solo: lo registra el
propio Centro de Recursos cuando el cliente abre cada pieza, y el CRM lo
lee de `reading_state` (Supabase del centro, solo lectura).


> Parcheado sobre el commit **737f72a** de `morongmauro/CRM_entrenaconmetodo`
> (la versión que subiste con los cambios de MealTracker + CRM).

## Qué se ve y dónde

**1 · Tarjeta del listado de clientes** — una línea nueva:

```
Journey    🚀 7/12
Cápsulas   🖼️ 4/10
```

Verde si las vio todas, ámbar si va a medias, gris si no ha abierto ninguna.

**2 · Ficha del cliente → “📚 Centro de recursos · qué ha visto”**

- Chips de resumen: Onboarding 3/5 · Guía 6 capítulos · Cápsulas 4/10 · Podcast 1
- Las 5 secciones del onboarding, con ✓ o ○ cada una
- **Las cápsulas una por una**, agrupadas por categoría, marcando cuáles vio
- Una línea con las que le faltan, lista para copiar y pegársela por chat
- Los podcast que abrió
- Botón **↻ actualizar** para volver a consultar el centro sin recargar el CRM

**3 · Journey del cliente** — paso nuevo: *“Empezó las cápsulas
informativas”*, automático, se marca en cuanto abre la primera.

## Lo único que hay que mantener

Cuando publiques una cápsula nueva en el Centro de Recursos, añádela también
al catálogo del CRM: en `app.js`, busca `const CENTRO_CAPSULAS` y agrega su
`id` y su `title` (los mismos de `capsulas/capsulas.js` del otro repo).

Ese catálogo solo sirve para saber **cuáles faltan**. Si se te olvida
copiarla, no se rompe nada: la cápsula que el cliente vio aparece igual, bajo
el grupo “Otras”, con el título que quedó registrado.

## Detalle técnico

- Fuente: vista `reading_state` del Supabase del centro
  (`client_name, source, section_key[, section_label]`).
- Fuentes que lee: `hub` (onboarding y FAQ), `ga` (guía), `capsula`
  (llave `cap:<id>`) y `podcast` (llave `pod:<id>`).
- Se pide **una sola vez por sesión** para todos los clientes y queda en
  cache; el botón ↻ la vacía.
- Si la vista todavía no expone `section_label`, la consulta se reintenta sin
  esa columna en vez de fallar.
- Los nombres se cruzan con `normalizeName`, así que las tildes y las
  mayúsculas no importan. **Sí importa que el cliente escriba su nombre igual
  que como está en el CRM** al entrar al centro.
