# CRM EntrenaConMétodo

Centro de control personal para tu negocio de coaching. **Estático (Vercel) + Supabase**. 100% gratis para uso personal.

## Lo que hace

### 📊 Inicio
KPIs del día, **bandeja semanal** con clientes que faltan por seguimiento, alertas de pagos vencidos / próximos, clientes en riesgo, pendientes urgentes y cumpleaños de la semana.

### 📅 Seguimiento semanal
- Vista **por cliente** (sidebar + timeline) o **vista panel** (kanban).
- Cards por semana con adherencia desglosada: **Entreno · Alimentación · Descanso**.
- **% de asistencia entreno** calculado automáticamente (días asistidos / días planeados).
- Modal con **panel de contexto** al registrar nueva semana: resumen automático "qué decirle", pendientes abiertos, recordatorio de lesiones, últimas 2-3 semanas.
- **Plantillas** (Alta / Media / Baja) para arrancar el texto según la adherencia.
- Botón **"Copiar de la semana anterior"** para no escribir desde cero.

### 💰 Pagos
- **Tabla anual** estilo Notion: clientes en filas, meses en columnas, totales por mes y año.
- **Cards del mes** con estado visual (verde pagado, amarillo pendiente, rojo vencido).
- Multi-moneda **COP + USD**: la tabla suma todo en COP usando tu tasa configurable.
- Click en cualquier celda para marcar pagado o editar.

### 📌 Pendientes
- Filtros: Todos / Abiertos / Generales / De la semana / Completados.
- Promoción: un pendiente semanal que se vuelve recurrente lo conviertes a **General** con un clic.
- Checkboxes para marcar como hecho.

### 👥 Clientes
Cards con datos clave + ficha completa con identidad, datos de coaching (objetivo, meta, lesiones, lugar de entreno), comercial (monto, día de pago, canal, método preferido) y tags libres.

### 📈 Mi negocio
KPIs: cobrado vs mes anterior, retención mensual, LTV promedio, adherencia global, conversión por canal, clientes en plateau, próximos a renovar.

### ⚙️ Ajustes
Tasa USD→COP y tu nombre.

## Configuración (10 minutos)

### 1) Crear proyecto en Supabase
1. https://supabase.com → "New project" → nombre `crm-entrenaconmetodo`. Espera 1-2 min.
2. **SQL Editor** → "New query" → pega TODO el contenido de `schema.sql` → "Run".

### 2) Crear tu usuario
**Authentication → Users → Add user**. Email + contraseña + marca **"Auto Confirm User"**.

### 3) Obtener credenciales
**Project Settings → API**. Copia **Project URL** y **anon public key**.

### 4) Configurar
Abre `config.js` y reemplaza los dos valores.

### 5) Deploy en Vercel
1. Sube los archivos a GitHub.
2. https://vercel.com → "Add New Project" → importa el repo.
3. Framework Preset: **Other**. Deploy.
4. Entra a la URL, login con tu email/clave.

## Archivos

```
.
├── index.html       App principal (login + UI)
├── app.js           Toda la lógica
├── styles.css       Estilos
├── config.js        URL y anon key de Supabase ← TÚ LO EDITAS
├── schema.sql       Esquema de la base ← pegar en Supabase
├── README.md
└── .gitignore
```

Sin servidor Node.js, sin `npm install`. Solo HTML + JS estático.

## Costo

- **Vercel free**: hosting estático ilimitado, 100 GB/mes de tráfico.
- **Supabase free**: 500 MB de base de datos, 5 GB/mes de tráfico, autenticación incluida.

Para uso personal: **$0**.

## Variables del sistema

### Cliente (diligenciable)
Nombre, teléfono, email, fecha nacimiento, sexo, ciudad, zona horaria, profesión, horario laboral, objetivo, meta específica, fecha objetivo, lugar de entreno, restricciones/lesiones, patologías, antecedentes deportivos, preferencias dietéticas, monto, moneda, día de pago, fecha inicio, estado, canal de adquisición, método de pago preferido, días de gracia, tags libres, notas.

### Seguimiento semanal (diligenciable)
Adherencia entreno (0-10), adherencia alimentación (0-10), adherencia descanso (0-10), días planeados, días asistidos, avances, pendientes de la semana, ánimo, notas.

### Pago (diligenciable)
Mes, pagado sí/no, monto, moneda, fecha de pago (opcional), método (opcional), nota.

### Pendiente (diligenciable)
Cliente, descripción, scope (semana/general), prioridad, fecha límite, estado.

### Calculados (no diligencias, el sistema los muestra)
Promedio de adherencia (3 dimensiones), % asistencia entreno, días desde último seguimiento, tendencia, edad, días hasta cumpleaños, total cobrado/pendiente del mes y año, conversión USD→COP, clientes en riesgo, clientes en plateau, retención mensual, LTV, conversión por canal.
