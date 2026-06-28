const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const db = new Database(path.join(DATA_DIR, 'crm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    plan TEXT,
    monto REAL DEFAULT 0,
    moneda TEXT DEFAULT 'USD',
    dia_pago INTEGER,
    fecha_inicio TEXT,
    objetivo TEXT,
    estado TEXT DEFAULT 'activo',
    notas TEXT,
    creado_en TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    fecha_esperada TEXT NOT NULL,
    fecha_pago TEXT,
    monto REAL NOT NULL,
    moneda TEXT DEFAULT 'USD',
    metodo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    nota TEXT,
    creado_en TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS seguimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    semana TEXT NOT NULL,
    fecha TEXT NOT NULL,
    avances TEXT,
    estado_animo TEXT,
    adherencia INTEGER,
    notas TEXT,
    creado_en TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    fecha_limite TEXT,
    prioridad TEXT DEFAULT 'media',
    estado TEXT DEFAULT 'abierto',
    completado_en TEXT,
    creado_en TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT,
    duracion_min INTEGER DEFAULT 60,
    tema TEXT,
    estado TEXT DEFAULT 'agendada',
    notas TEXT,
    creado_en TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS metricas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    peso REAL,
    grasa REAL,
    cintura REAL,
    cadera REAL,
    pecho REAL,
    brazo REAL,
    pierna REAL,
    notas TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  );
`);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const todayISO = () => new Date().toISOString().slice(0, 10);

function asInt(v, def = null) {
  if (v === '' || v === null || v === undefined) return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}
function asNum(v, def = null) {
  if (v === '' || v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isNaN(n) ? def : n;
}

// ---------- CLIENTES ----------
app.get('/api/clientes', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT MIN(fecha_esperada) FROM pagos p
        WHERE p.cliente_id = c.id AND p.estado = 'pendiente') AS proximo_pago,
      (SELECT COUNT(*) FROM pendientes pe
        WHERE pe.cliente_id = c.id AND pe.estado = 'abierto') AS pendientes_abiertos
    FROM clientes c
    ORDER BY c.nombre COLLATE NOCASE ASC
  `).all();
  res.json(rows);
});

app.get('/api/clientes/:id', (req, res) => {
  const id = asInt(req.params.id);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  if (!cliente) return res.status(404).json({ error: 'No encontrado' });
  cliente.pagos = db.prepare('SELECT * FROM pagos WHERE cliente_id = ? ORDER BY fecha_esperada DESC').all(id);
  cliente.seguimientos = db.prepare('SELECT * FROM seguimientos WHERE cliente_id = ? ORDER BY fecha DESC').all(id);
  cliente.pendientes = db.prepare('SELECT * FROM pendientes WHERE cliente_id = ? ORDER BY estado ASC, fecha_limite ASC').all(id);
  cliente.sesiones = db.prepare('SELECT * FROM sesiones WHERE cliente_id = ? ORDER BY fecha DESC, hora DESC').all(id);
  cliente.metricas = db.prepare('SELECT * FROM metricas WHERE cliente_id = ? ORDER BY fecha DESC').all(id);
  res.json(cliente);
});

app.post('/api/clientes', (req, res) => {
  const b = req.body;
  const result = db.prepare(`
    INSERT INTO clientes (nombre, email, telefono, plan, monto, moneda, dia_pago, fecha_inicio, objetivo, estado, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.nombre, b.email || null, b.telefono || null, b.plan || null,
    asNum(b.monto, 0), b.moneda || 'USD', asInt(b.dia_pago),
    b.fecha_inicio || todayISO(), b.objetivo || null,
    b.estado || 'activo', b.notas || null
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/clientes/:id', (req, res) => {
  const id = asInt(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE clientes SET nombre=?, email=?, telefono=?, plan=?, monto=?, moneda=?,
      dia_pago=?, fecha_inicio=?, objetivo=?, estado=?, notas=?
    WHERE id = ?
  `).run(
    b.nombre, b.email || null, b.telefono || null, b.plan || null,
    asNum(b.monto, 0), b.moneda || 'USD', asInt(b.dia_pago),
    b.fecha_inicio || null, b.objetivo || null,
    b.estado || 'activo', b.notas || null, id
  );
  res.json({ ok: true });
});

app.delete('/api/clientes/:id', (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(asInt(req.params.id));
  res.json({ ok: true });
});

// ---------- PAGOS ----------
app.get('/api/pagos', (req, res) => {
  const { mes, estado } = req.query;
  let sql = `
    SELECT p.*, c.nombre AS cliente_nombre
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id
    WHERE 1=1
  `;
  const params = [];
  if (mes) { sql += ' AND substr(p.fecha_esperada,1,7) = ?'; params.push(mes); }
  if (estado) { sql += ' AND p.estado = ?'; params.push(estado); }
  sql += ' ORDER BY p.fecha_esperada ASC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/pagos/alertas', (req, res) => {
  const dias = asInt(req.query.dias, 7);
  const hoy = todayISO();
  const hasta = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  const proximos = db.prepare(`
    SELECT p.*, c.nombre AS cliente_nombre
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.estado = 'pendiente' AND p.fecha_esperada BETWEEN ? AND ?
    ORDER BY p.fecha_esperada ASC
  `).all(hoy, hasta);
  const vencidos = db.prepare(`
    SELECT p.*, c.nombre AS cliente_nombre
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.estado = 'pendiente' AND p.fecha_esperada < ?
    ORDER BY p.fecha_esperada ASC
  `).all(hoy);
  res.json({ proximos, vencidos });
});

app.post('/api/pagos', (req, res) => {
  const b = req.body;
  const result = db.prepare(`
    INSERT INTO pagos (cliente_id, fecha_esperada, fecha_pago, monto, moneda, metodo, estado, nota)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    asInt(b.cliente_id), b.fecha_esperada, b.fecha_pago || null,
    asNum(b.monto, 0), b.moneda || 'USD', b.metodo || null,
    b.estado || 'pendiente', b.nota || null
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/pagos/:id', (req, res) => {
  const id = asInt(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE pagos SET fecha_esperada=?, fecha_pago=?, monto=?, moneda=?, metodo=?, estado=?, nota=?
    WHERE id=?
  `).run(
    b.fecha_esperada, b.fecha_pago || null, asNum(b.monto, 0),
    b.moneda || 'USD', b.metodo || null, b.estado || 'pendiente',
    b.nota || null, id
  );
  res.json({ ok: true });
});

app.post('/api/pagos/:id/marcar-pagado', (req, res) => {
  const id = asInt(req.params.id);
  const { fecha_pago, metodo } = req.body || {};
  db.prepare(`
    UPDATE pagos SET estado='pagado', fecha_pago=?, metodo=COALESCE(?, metodo)
    WHERE id=?
  `).run(fecha_pago || todayISO(), metodo || null, id);
  res.json({ ok: true });
});

app.delete('/api/pagos/:id', (req, res) => {
  db.prepare('DELETE FROM pagos WHERE id = ?').run(asInt(req.params.id));
  res.json({ ok: true });
});

// Generar pagos del mes para todos los clientes activos con dia_pago
app.post('/api/pagos/generar-mes', (req, res) => {
  const { mes } = req.body || {};
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ error: 'mes debe ser YYYY-MM' });
  }
  const clientes = db.prepare(`
    SELECT * FROM clientes WHERE estado='activo' AND dia_pago IS NOT NULL AND monto > 0
  `).all();
  const insert = db.prepare(`
    INSERT INTO pagos (cliente_id, fecha_esperada, monto, moneda, estado)
    VALUES (?, ?, ?, ?, 'pendiente')
  `);
  const exists = db.prepare(`
    SELECT 1 FROM pagos
    WHERE cliente_id=? AND substr(fecha_esperada,1,7)=?
  `);
  let creados = 0;
  const tx = db.transaction(() => {
    for (const c of clientes) {
      if (exists.get(c.id, mes)) continue;
      const dia = String(Math.min(c.dia_pago, 28)).padStart(2, '0');
      insert.run(c.id, `${mes}-${dia}`, c.monto, c.moneda, );
      creados++;
    }
  });
  tx();
  res.json({ creados });
});

// ---------- SEGUIMIENTOS ----------
app.post('/api/seguimientos', (req, res) => {
  const b = req.body;
  const result = db.prepare(`
    INSERT INTO seguimientos (cliente_id, semana, fecha, avances, estado_animo, adherencia, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    asInt(b.cliente_id), b.semana, b.fecha || todayISO(),
    b.avances || null, b.estado_animo || null,
    asInt(b.adherencia), b.notas || null
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/seguimientos/:id', (req, res) => {
  const id = asInt(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE seguimientos SET semana=?, fecha=?, avances=?, estado_animo=?, adherencia=?, notas=?
    WHERE id=?
  `).run(b.semana, b.fecha, b.avances || null, b.estado_animo || null, asInt(b.adherencia), b.notas || null, id);
  res.json({ ok: true });
});

app.delete('/api/seguimientos/:id', (req, res) => {
  db.prepare('DELETE FROM seguimientos WHERE id = ?').run(asInt(req.params.id));
  res.json({ ok: true });
});

app.get('/api/seguimientos/semana/:semana', (req, res) => {
  const semana = req.params.semana;
  const rows = db.prepare(`
    SELECT s.*, c.nombre AS cliente_nombre
    FROM seguimientos s JOIN clientes c ON c.id = s.cliente_id
    WHERE s.semana = ?
    ORDER BY c.nombre COLLATE NOCASE ASC
  `).all(semana);
  res.json(rows);
});

// ---------- PENDIENTES ----------
app.get('/api/pendientes', (req, res) => {
  const { estado } = req.query;
  let sql = `
    SELECT pe.*, c.nombre AS cliente_nombre
    FROM pendientes pe JOIN clientes c ON c.id = pe.cliente_id
  `;
  const params = [];
  if (estado) { sql += ' WHERE pe.estado = ?'; params.push(estado); }
  sql += ' ORDER BY pe.estado ASC, pe.fecha_limite ASC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/pendientes', (req, res) => {
  const b = req.body;
  const result = db.prepare(`
    INSERT INTO pendientes (cliente_id, descripcion, fecha_limite, prioridad, estado)
    VALUES (?, ?, ?, ?, 'abierto')
  `).run(asInt(b.cliente_id), b.descripcion, b.fecha_limite || null, b.prioridad || 'media');
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/pendientes/:id', (req, res) => {
  const id = asInt(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE pendientes SET descripcion=?, fecha_limite=?, prioridad=?, estado=?, completado_en=?
    WHERE id=?
  `).run(
    b.descripcion, b.fecha_limite || null, b.prioridad || 'media',
    b.estado || 'abierto',
    b.estado === 'completado' ? (b.completado_en || todayISO()) : null,
    id
  );
  res.json({ ok: true });
});

app.post('/api/pendientes/:id/toggle', (req, res) => {
  const id = asInt(req.params.id);
  const row = db.prepare('SELECT estado FROM pendientes WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  const nuevo = row.estado === 'completado' ? 'abierto' : 'completado';
  db.prepare(`
    UPDATE pendientes SET estado=?, completado_en=? WHERE id=?
  `).run(nuevo, nuevo === 'completado' ? todayISO() : null, id);
  res.json({ ok: true, estado: nuevo });
});

app.delete('/api/pendientes/:id', (req, res) => {
  db.prepare('DELETE FROM pendientes WHERE id = ?').run(asInt(req.params.id));
  res.json({ ok: true });
});

// ---------- SESIONES ----------
app.get('/api/sesiones', (req, res) => {
  const { desde, hasta } = req.query;
  let sql = `
    SELECT s.*, c.nombre AS cliente_nombre
    FROM sesiones s JOIN clientes c ON c.id = s.cliente_id
    WHERE 1=1
  `;
  const params = [];
  if (desde) { sql += ' AND s.fecha >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND s.fecha <= ?'; params.push(hasta); }
  sql += ' ORDER BY s.fecha ASC, s.hora ASC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/sesiones', (req, res) => {
  const b = req.body;
  const result = db.prepare(`
    INSERT INTO sesiones (cliente_id, fecha, hora, duracion_min, tema, estado, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    asInt(b.cliente_id), b.fecha, b.hora || null,
    asInt(b.duracion_min, 60), b.tema || null,
    b.estado || 'agendada', b.notas || null
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/sesiones/:id', (req, res) => {
  const id = asInt(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE sesiones SET fecha=?, hora=?, duracion_min=?, tema=?, estado=?, notas=?
    WHERE id=?
  `).run(b.fecha, b.hora || null, asInt(b.duracion_min, 60), b.tema || null, b.estado || 'agendada', b.notas || null, id);
  res.json({ ok: true });
});

app.delete('/api/sesiones/:id', (req, res) => {
  db.prepare('DELETE FROM sesiones WHERE id = ?').run(asInt(req.params.id));
  res.json({ ok: true });
});

// ---------- METRICAS ----------
app.post('/api/metricas', (req, res) => {
  const b = req.body;
  const result = db.prepare(`
    INSERT INTO metricas (cliente_id, fecha, peso, grasa, cintura, cadera, pecho, brazo, pierna, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    asInt(b.cliente_id), b.fecha || todayISO(),
    asNum(b.peso), asNum(b.grasa), asNum(b.cintura), asNum(b.cadera),
    asNum(b.pecho), asNum(b.brazo), asNum(b.pierna), b.notas || null
  );
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/metricas/:id', (req, res) => {
  db.prepare('DELETE FROM metricas WHERE id = ?').run(asInt(req.params.id));
  res.json({ ok: true });
});

// ---------- DASHBOARD ----------
app.get('/api/dashboard', (req, res) => {
  const hoy = todayISO();
  const mes = hoy.slice(0, 7);
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const semanaActual = (() => {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  })();

  const stats = {
    clientes_activos: db.prepare(`SELECT COUNT(*) AS n FROM clientes WHERE estado='activo'`).get().n,
    pagos_mes: db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN estado='pagado' THEN monto END), 0) AS cobrado,
        COALESCE(SUM(CASE WHEN estado='pendiente' THEN monto END), 0) AS pendiente,
        COUNT(CASE WHEN estado='pagado' THEN 1 END) AS num_pagados,
        COUNT(CASE WHEN estado='pendiente' THEN 1 END) AS num_pendientes
      FROM pagos WHERE substr(fecha_esperada,1,7)=?
    `).get(mes),
    proximos_pagos: db.prepare(`
      SELECT p.*, c.nombre AS cliente_nombre
      FROM pagos p JOIN clientes c ON c.id=p.cliente_id
      WHERE p.estado='pendiente' AND p.fecha_esperada BETWEEN ? AND ?
      ORDER BY p.fecha_esperada ASC LIMIT 10
    `).all(hoy, en7),
    vencidos: db.prepare(`
      SELECT p.*, c.nombre AS cliente_nombre
      FROM pagos p JOIN clientes c ON c.id=p.cliente_id
      WHERE p.estado='pendiente' AND p.fecha_esperada < ?
      ORDER BY p.fecha_esperada ASC LIMIT 10
    `).all(hoy),
    pendientes_abiertos: db.prepare(`
      SELECT pe.*, c.nombre AS cliente_nombre
      FROM pendientes pe JOIN clientes c ON c.id=pe.cliente_id
      WHERE pe.estado='abierto'
      ORDER BY pe.fecha_limite ASC LIMIT 10
    `).all(),
    sesiones_proximas: db.prepare(`
      SELECT s.*, c.nombre AS cliente_nombre
      FROM sesiones s JOIN clientes c ON c.id=s.cliente_id
      WHERE s.fecha >= ? AND s.estado='agendada'
      ORDER BY s.fecha ASC, s.hora ASC LIMIT 10
    `).all(hoy),
    semana_actual: semanaActual,
  };

  res.json(stats);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CRM EntrenaConMétodo corriendo en http://localhost:${PORT}`);
});
