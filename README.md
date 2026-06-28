# CRM EntrenaConMétodo

CRM ligero pensado para un negocio de **coaching online** (entrenamiento, nutrición, hábitos). Permite llevar el control de pagos, hacer seguimiento semanal de cada cliente y registrar su progreso.

## Qué incluye

### Módulo 1 — Control de pagos
- Lista de clientes con su plan, monto y día de pago.
- Generación automática del cobro mensual a partir del día de pago de cada cliente (botón **"Generar pagos del mes"**).
- Vista mensual con **quién pagó** y **quién está pendiente**, agrupado por nombre.
- **Alertas en el inicio**: pagos vencidos y pagos de los próximos 7 días.
- Registro del método de pago (Transferencia, PayPal, etc.) y notas.
- Botón **"Marcar pagado"** con un clic.

### Módulo 2 — Trazabilidad y seguimiento semanal
- Bitácora semanal por cliente: **avances, estado de ánimo, adherencia (0-10), notas**.
- **Pendientes** que le pediste a cada cliente, con fecha límite y prioridad. Se pueden marcar como completados.
- Vista de seguimiento por semana ISO que muestra **quién ya tiene registro** y **a quién todavía no le has hecho seguimiento**.

### Módulo 3 (extra sugerido para coaching) — Sesiones y progreso
- **Calendario de sesiones** (fecha, hora, duración, tema, estado: agendada / realizada / cancelada).
- **Métricas de progreso** por cliente (peso, % grasa, cintura, cadera, pecho, brazo, pierna) para entrenamiento físico.
- **Objetivo** del cliente registrado en su ficha.

## Cómo correrlo

Requisitos: Node.js 18 o superior.

```bash
npm install
npm start
```

Abre http://localhost:3000 en tu navegador.

Para desarrollo con recarga automática:

```bash
npm run dev
```

## Datos

Todo se guarda en una base SQLite local en `data/crm.db`. No se sube a internet, no requiere cuenta. Para hacer backup, copia esa carpeta.

## Otras ideas que pueden servirte (para más adelante)

- **Plantillas de mensajes** de WhatsApp / correo (cobro, bienvenida, recordatorio).
- **Renovaciones**: alerta cuando un plan trimestral/anual está por vencer.
- **Ingresos por mes** en gráfico para ver tu evolución.
- **Tags** por canal de adquisición (Instagram, referido, web) para saber de dónde vienen tus mejores clientes.
- **Encuesta NPS** periódica (1 pregunta cada 4 semanas) para detectar clientes en riesgo.
- **Material entregado** (PDF, video, plan): un campo por cliente con links a Drive/Notion.
