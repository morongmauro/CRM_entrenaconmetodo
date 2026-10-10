// Un Supabase de mentira para ver el CRM entero en el navegador, sin red.
// Lo usa pruebas/visual-crm.mjs: reemplaza el script de supabase-js del CDN.
// Las tablas viven en window.TABLAS_FALSAS (las llena la prueba antes de que
// cargue la app). Las consultas se resuelven en memoria: select/filtros/orden
// sobre la tabla; insert/update/upsert/delete la modifican.
(function () {
  const T = () => (window.TABLAS_FALSAS = window.TABLAS_FALSAS || {});
  const tabla = (n) => (T()[n] = T()[n] || []);
  let n = 0;
  const id = () => 'f' + Date.now().toString(36) + (n++);

  function consulta(nombre) {
    const filtros = [];
    let orden = null, limite = null, uno = null, accion = 'select', cuerpo = null, opts = {};
    const comparar = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);
    const q = {
      select(_c, o) { if (accion === 'select') accion = 'select'; opts = o || opts; return q; },
      eq(c, v) { filtros.push(r => r[c] === v); return q; },
      neq(c, v) { filtros.push(r => r[c] !== v); return q; },
      gt(c, v) { filtros.push(r => r[c] > v); return q; },
      gte(c, v) { filtros.push(r => r[c] >= v); return q; },
      lt(c, v) { filtros.push(r => r[c] < v); return q; },
      lte(c, v) { filtros.push(r => r[c] <= v); return q; },
      in(c, vs) { filtros.push(r => (vs || []).includes(r[c])); return q; },
      is(c, v) { filtros.push(r => (v === null ? r[c] == null : r[c] === v)); return q; },
      not(c, op, v) { if (op === 'is') filtros.push(r => (v === null ? r[c] != null : r[c] !== v)); return q; },
      ilike(c, v) { const re = new RegExp('^' + String(v).replace(/%/g, '.*') + '$', 'i'); filtros.push(r => re.test(String(r[c] ?? ''))); return q; },
      like(c, v) { return q.ilike(c, v); },
      contains(c, v) { filtros.push(r => (v || []).every(x => (r[c] || []).includes(x))); return q; },
      or() { return q; }, filter() { return q; }, match(o) { Object.entries(o || {}).forEach(([c, v]) => q.eq(c, v)); return q; },
      order(c, o = {}) { orden = { c, asc: o.ascending !== false }; return q; },
      limit(k) { limite = k; return q; },
      range(a, b) { limite = b - a + 1; return q; },
      single() { uno = 'single'; return q; },
      maybeSingle() { uno = 'maybe'; return q; },
      insert(f) { accion = 'insert'; cuerpo = f; return q; },
      upsert(f, o) { accion = 'upsert'; cuerpo = f; opts = { ...opts, onConflict: o && o.onConflict }; return q; },
      update(f) { accion = 'update'; cuerpo = f; return q; },
      delete() { accion = 'delete'; return q; },
      then(ok, mal) { return Promise.resolve().then(ejecutar).then(ok, mal); },
      catch(mal) { return q.then(null, mal); },
    };
    function ejecutar() {
      const t = tabla(nombre);
      const pasa = (r) => filtros.every(f => f(r));
      let data;
      if (accion === 'insert' || accion === 'upsert') {
        const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(f => ({ id: id(), created_at: new Date().toISOString(), ...f }));
        // upsert con onConflict: la fila que ya tiene esa columna se actualiza.
        const clave = accion === 'upsert' && opts.onConflict;
        filas.forEach(f => { const i = t.findIndex(r => (clave ? r[clave] === f[clave] : r.id === f.id)); if (i >= 0) t[i] = { ...t[i], ...f, id: t[i].id }; else t.push(f); });
        data = filas;
      } else if (accion === 'update') {
        data = t.filter(pasa); data.forEach(r => Object.assign(r, cuerpo));
      } else if (accion === 'delete') {
        data = t.filter(pasa); T()[nombre] = t.filter(r => !pasa(r));
      } else {
        data = t.filter(pasa);
        if (orden) data = [...data].sort((a, b) => comparar(a[orden.c], b[orden.c]) * (orden.asc ? 1 : -1));
        if (limite != null) data = data.slice(0, limite);
      }
      data = data.map(r => ({ ...r }));
      const count = opts && opts.count ? data.length : null;
      if (opts && opts.head) data = null;
      if (uno) data = data && data.length ? data[0] : null;
      if (uno === 'single' && !data) return { data: null, error: { message: 'No rows', code: 'PGRST116' }, count };
      return { data, error: null, count, status: 200 };
    }
    return q;
  }

  const sesion = { user: { id: 'coach-1', email: 'coach@prueba.test' }, access_token: 'falso' };
  function createClient() {
    return {
      from: consulta,
      rpc: async () => ({ data: null, error: null }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), list: async () => ({ data: [], error: null }), upload: async () => ({ data: null, error: null }) }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: {
        getSession: async () => ({ data: { session: sesion }, error: null }),
        getUser: async () => ({ data: { user: sesion.user }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: async () => ({ data: { session: sesion }, error: null }),
        signOut: async () => ({ error: null }),
      },
    };
  }
  window.supabase = { createClient };
})();
