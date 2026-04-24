require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const db = require('./database');
const { ejecutarScan, inicializarPortales } = require('./scanner');

const app = express();
app.use(express.json());

let scanEnCurso = false;
let ultimoEstado = null;

try { db.exec('ALTER TABLE licitaciones ADD COLUMN comentario TEXT;'); } catch(e) {}

app.get('/api/licitaciones', (req, res) => {
  const lics = db.prepare(`
    SELECT * FROM licitaciones
    WHERE score != 'No relevante' AND score != 'Error'
    ORDER BY CASE score WHEN 'Alto' THEN 1 WHEN 'Medio' THEN 2 WHEN 'Revisar' THEN 3 ELSE 4 END,
    fecha_deteccion DESC
  `).all();
  res.setHeader('Content-Type', 'application/json');
  res.json(lics);
});

app.get('/api/estado', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(ultimoEstado || { corriendo: scanEnCurso, progreso: 0, total: 0 });
});

app.post('/api/validar/:id', (req, res) => {
  const { relevante, comentario } = req.body;
  if (relevante === null || relevante === undefined) {
    db.prepare('UPDATE licitaciones SET es_relevante=NULL, validado=0, comentario=NULL WHERE id=?').run(req.params.id);
  } else {
    db.prepare('UPDATE licitaciones SET es_relevante=?, validado=1, comentario=? WHERE id=?')
      .run(relevante ? 1 : 0, comentario || null, req.params.id);
  }
  res.json({ ok: true });
});

app.get('/iniciar', (req, res) => {
  if(scanEnCurso){ res.send('Ya hay un scan corriendo.'); return; }
  scanEnCurso = true;
  ultimoEstado = { corriendo: true, progreso: 0, total: 0 };
  res.send('Scan iniciado OK. Regresa al dashboard en unos minutos.');
  setTimeout(async () => {
    try {
      const resultado = await ejecutarScan();
      ultimoEstado = { corriendo: false, ...resultado };
    } catch(e) {
      console.error('Error en scan:', e.message);
      ultimoEstado = { corriendo: false, error: e.message };
    } finally { scanEnCurso = false; }
  }, 1000);
});

app.get('/', (req, res) => {
  const lics = db.prepare(`
    SELECT * FROM licitaciones
    WHERE score != 'No relevante' AND score != 'Error'
    ORDER BY CASE score WHEN 'Alto' THEN 1 WHEN 'Medio' THEN 2 WHEN 'Revisar' THEN 3 ELSE 4 END,
    fecha_deteccion DESC
  `).all();

  const total = lics.length;
  const alto = lics.filter(l => l.score === 'Alto').length;
  const medio = lics.filter(l => l.score === 'Medio').length;
  const revisar = lics.filter(l => l.score === 'Revisar').length;

  const cards = lics.map(l => {
    const cls = l.score === 'Alto' ? 'alto' : l.score === 'Medio' ? 'medio' : 'revisar';
    const evalBadge = l.es_relevante === 1 ? '<span class="badge b-si">Nos interesa</span>' :
                      l.es_relevante === 0 ? '<span class="badge b-no">No nos interesa</span>' : '';
    const comentario = l.comentario ? `<div class="comentario">💬 ${l.comentario}</div>` : '';
    const fechaJ = l.junta_aclaraciones && l.junta_aclaraciones !== 'No especificada' ?
      `<span class="fecha-ok">${l.junta_aclaraciones}</span>` : '<span class="fecha-nd">No especificada</span>';
    const fechaE = l.fecha_entrega && l.fecha_entrega !== 'No especificada' ?
      `<span class="fecha-ok">${l.fecha_entrega}</span>` : '<span class="fecha-nd">No especificada</span>';
    const fechaF = l.fallo && l.fallo !== 'No especificada' ?
      `<span class="fecha-ok">${l.fallo}</span>` : '<span class="fecha-nd">No especificada</span>';

    return `<div class="card ${cls}" id="c${l.id}">
      <div class="card-head">
        <div>
          <div class="portal">${l.portal_nombre || ''}</div>
          <div class="titulo">${l.titulo || ''}</div>
        </div>
        <div class="badges">
          <span class="badge b-${cls}">${l.score}</span>
          ${l.tipo ? `<span class="badge b-tipo">${l.tipo}</span>` : ''}
          ${evalBadge}
        </div>
      </div>
      <div class="grid">
        <div class="field"><div class="lbl">Dependencia</div><div class="val">${l.dependencia || ''}</div></div>
        <div class="field"><div class="lbl">Marcas</div><div class="val">${l.marcas || 'Ninguna'}</div></div>
        <div class="field"><div class="lbl">Junta aclaraciones</div><div class="val">${fechaJ}</div></div>
        <div class="field"><div class="lbl">Entrega propuestas</div><div class="val">${fechaE}</div></div>
        <div class="field"><div class="lbl">Fallo</div><div class="val">${fechaF}</div></div>
      </div>
      <div class="just">${l.justificacion || ''}</div>
      ${comentario}
      <div class="actions">
        <button onclick="evaluar(${l.id},1)" class="btn-si">✓ Nos interesa</button>
        <button onclick="evaluar(${l.id},0)" class="btn-no">✗ No nos interesa</button>
        <a href="${l.portal_url}" target="_blank" class="btn-link">Ver licitación →</a>
      </div>
      <div class="cbox" id="cb${l.id}" style="display:none">
        <textarea id="ct${l.id}" placeholder="Comentario opcional..."></textarea>
        <button onclick="guardar(${l.id})">Guardar</button>
        <button onclick="document.getElementById('cb${l.id}').style.display='none'">Cancelar</button>
      </div>
    </div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GTG Licitaciones</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f1;color:#1a1a1a;font-size:14px}
.header{background:#fff;border-bottom:1px solid #e0e0e0;padding:14px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10}
.logo{width:36px;height:36px;background:#E6F1FB;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#0C447C}
.header h1{font-size:16px;font-weight:500}
.header .sub{font-size:12px;color:#888}
.scan-link{margin-left:auto;padding:8px 16px;background:#1a1a1a;color:#fff;border-radius:6px;font-size:13px;text-decoration:none}
.main{max-width:1100px;margin:0 auto;padding:20px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.stat{background:#fff;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #e8e8e8}
.stat .num{font-size:24px;font-weight:500}
.stat .lbl{font-size:11px;color:#888;margin-top:2px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.fbtn{padding:6px 12px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:12px}
.fbtn.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.search-row{margin-bottom:16px}
.search-row input{width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:8px}
.kws{display:flex;flex-wrap:wrap;gap:6px}
.kw{padding:4px 10px;background:#E6F1FB;color:#0C447C;border-radius:4px;font-size:11px;cursor:pointer;font-weight:500}
.kw:hover{background:#B5D4F4}
.card{background:#fff;border:1px solid #e8e8e8;border-radius:8px;padding:14px;margin-bottom:10px}
.card.alto{border-left:3px solid #5DCAA5}
.card.medio{border-left:3px solid #EF9F27}
.card.revisar{border-left:3px solid #378ADD}
.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.portal{font-size:11px;color:#888;margin-bottom:2px}
.titulo{font-size:14px;font-weight:500}
.badges{display:flex;gap:5px;flex-wrap:wrap}
.badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:500}
.b-alto{background:#EAF3DE;color:#27500A}
.b-medio{background:#FAEEDA;color:#633806}
.b-revisar{background:#E6F1FB;color:#0C447C}
.b-tipo{background:#f0f0f0;color:#555}
.b-si{background:#EAF3DE;color:#27500A;font-weight:600}
.b-no{background:#FCEBEB;color:#791F1F;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:10px 0}
.field{background:#f8f8f6;border-radius:4px;padding:7px 10px}
.lbl{font-size:10px;color:#888;margin-bottom:2px}
.val{font-size:12px;font-weight:500}
.fecha-ok{color:#27500A}
.fecha-nd{color:#bbb}
.just{font-size:12px;color:#555;background:#f8f8f6;padding:7px 10px;border-radius:4px;margin:8px 0}
.comentario{font-size:11px;color:#666;font-style:italic;margin:4px 0}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.btn-si{padding:5px 12px;background:#EAF3DE;color:#27500A;border:1px solid #97C459;border-radius:4px;cursor:pointer;font-size:12px}
.btn-no{padding:5px 12px;background:#FCEBEB;color:#791F1F;border:1px solid #F09595;border-radius:4px;cursor:pointer;font-size:12px}
.btn-link{padding:5px 12px;background:#fff;color:#185FA5;border:1px solid #B5D4F4;border-radius:4px;font-size:12px;text-decoration:none}
.cbox{margin-top:8px;padding:8px;background:#f8f8f6;border-radius:4px}
.cbox textarea{width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;font-family:inherit;height:50px;resize:none;margin-bottom:4px}
.cbox button{padding:4px 10px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px}
.empty{text-align:center;padding:60px;color:#aaa;font-size:16px}
</style>
</head>
<body>
<div class="header">
  <div class="logo">GT</div>
  <div>
    <h1>GTG — Monitor de Licitaciones</h1>
    <div class="sub">Redes · Telecomunicaciones · Seguridad TI</div>
  </div>
  <a href="/iniciar" class="scan-link">Escanear ahora</a>
</div>
<div class="main">
  <div class="stats">
    <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
    <div class="stat"><div class="num" style="color:#27500A">${alto}</div><div class="lbl">Score Alto</div></div>
    <div class="stat"><div class="num" style="color:#633806">${medio}</div><div class="lbl">Medio</div></div>
    <div class="stat"><div class="num" style="color:#0C447C">${revisar}</div><div class="lbl">Revisar</div></div>
  </div>
  <div class="filters">
    <button class="fbtn active" onclick="filtrar('todos',this)">Todas</button>
    <button class="fbtn" onclick="filtrar('Alto',this)">Score Alto</button>
    <button class="fbtn" onclick="filtrar('Medio',this)">Medio</button>
    <button class="fbtn" onclick="filtrar('Revisar',this)">Revisar</button>
    <button class="fbtn" onclick="filtrar('sin-evaluar',this)">Sin evaluar</button>
    <button class="fbtn" onclick="filtrar('nos-interesa',this)">Nos interesa</button>
    <button class="fbtn" onclick="filtrar('no-interesa',this)">No nos interesa</button>
  </div>
  <div class="search-row">
    <input type="text" id="buscar" placeholder="Buscar por palabra clave..." oninput="buscar(this.value)">
    <div class="kws">
      <span class="kw" onclick="buscarKw('switch')">switch</span>
      <span class="kw" onclick="buscarKw('router')">router</span>
      <span class="kw" onclick="buscarKw('firewall')">firewall</span>
      <span class="kw" onclick="buscarKw('wifi')">wifi</span>
      <span class="kw" onclick="buscarKw('CCTV')">CCTV</span>
      <span class="kw" onclick="buscarKw('fibra')">fibra</span>
      <span class="kw" onclick="buscarKw('NOC')">NOC</span>
      <span class="kw" onclick="buscarKw('telecom')">telecom</span>
      <span class="kw" onclick="buscarKw('administrado')">serv. administrado</span>
      <span class="kw" onclick="buscarKw('mantenimiento')">mantenimiento</span>
      <span class="kw" onclick="buscarKw('Huawei')">Huawei</span>
      <span class="kw" onclick="buscarKw('Cisco')">Cisco</span>
      <span class="kw" onclick="buscarKw('Fortinet')">Fortinet</span>
    </div>
  </div>
  <div id="lista">${cards || '<div class="empty">No hay licitaciones. Dale click a "Escanear ahora" para iniciar.</div>'}</div>
</div>
<script>
var todas = ${JSON.stringify(lics)};
var filtroActual = 'todos';
var busquedaActual = '';

function filtrar(f, btn) {
  filtroActual = f;
  document.querySelectorAll('.fbtn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  mostrar();
}

function buscar(v) {
  busquedaActual = v.toLowerCase();
  mostrar();
}

function buscarKw(kw) {
  document.getElementById('buscar').value = kw;
  busquedaActual = kw.toLowerCase();
  mostrar();
}

function mostrar() {
  var lista = todas;
  if(filtroActual === 'Alto') lista = todas.filter(function(l){ return l.score === 'Alto'; });
  else if(filtroActual === 'Medio') lista = todas.filter(function(l){ return l.score === 'Medio'; });
  else if(filtroActual === 'Revisar') lista = todas.filter(function(l){ return l.score === 'Revisar'; });
  else if(filtroActual === 'sin-evaluar') lista = todas.filter(function(l){ return l.es_relevante === null; });
  else if(filtroActual === 'nos-interesa') lista = todas.filter(function(l){ return l.es_relevante === 1; });
  else if(filtroActual === 'no-interesa') lista = todas.filter(function(l){ return l.es_relevante === 0; });

  if(busquedaActual) {
    lista = lista.filter(function(l){
      var txt = ((l.titulo||'')+(l.dependencia||'')+(l.justificacion||'')+(l.marcas||'')+(l.portal_nombre||'')).toLowerCase();
      return txt.indexOf(busquedaActual) >= 0;
    });
  }

  var cards = lista.map(function(l){ return document.getElementById('c'+l.id); }).filter(Boolean);
  document.querySelectorAll('.card').forEach(function(c){ c.style.display='none'; });
  cards.forEach(function(c){ c.style.display='block'; });

  if(lista.length === 0) {
    document.getElementById('lista').innerHTML = '<div class="empty">No hay licitaciones en esta categoría</div>';
  }
}

function evaluar(id, valor) {
  document.getElementById('cb'+id).style.display = 'block';
  document.getElementById('cb'+id).dataset.valor = valor;
}

function guardar(id) {
  var valor = parseInt(document.getElementById('cb'+id).dataset.valor);
  var comentario = document.getElementById('ct'+id).value;
  fetch('/api/validar/'+id, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({relevante: valor, comentario: comentario})
  }).then(function(){
    location.reload();
  });
}
</script>
</body>
</html>`);
});

app.get('/reset-portales', (req, res) => {
  // Eliminar todos los portales de la BD para que se recarguen del codigo
  db.exec('DELETE FROM portales');
  res.send('Portales eliminados de la BD. Reinicia el servidor para recargarlos. <a href="/">Dashboard</a>');
});

app.get('/limpiar', (req, res) => {
  // Eliminar duplicados
  db.exec(`DELETE FROM licitaciones WHERE id NOT IN (
    SELECT MAX(id) FROM licitaciones GROUP BY titulo, portal_nombre
  )`);
  // Eliminar scores Error y No relevante
  db.exec("DELETE FROM licitaciones WHERE score='Error' OR score='No relevante'");
  // Eliminar licitaciones de mas de 30 dias
  db.exec("DELETE FROM licitaciones WHERE fecha_deteccion < datetime('now', '-30 days', 'localtime')");
  // Eliminar licitaciones de 2024 o anterior por titulo
  db.exec("DELETE FROM licitaciones WHERE titulo LIKE '%/2024%' OR titulo LIKE '%-2024%' OR titulo LIKE '%/2023%' OR titulo LIKE '%/2022%'");
  const total = db.prepare('SELECT COUNT(*) as n FROM licitaciones').get().n;
  res.send('Limpieza completada. Licitaciones restantes: ' + total + '. <a href="/">Ver dashboard</a>');
});

const PORT = process.env.PORT || 3000;
inicializarPortales().then(() => {
  app.listen(PORT, () => {
    console.log('Servidor GTG corriendo en puerto ' + PORT);
    const hora = process.env.SCAN_HOUR || '7';
    cron.schedule('0 ' + hora + ' * * *', async () => {
      if (!scanEnCurso) {
        console.log('Scan automatico diario...');
        scanEnCurso = true;
        ultimoEstado = { corriendo: true, progreso: 0, total: 0 };
        try {
          const resultado = await ejecutarScan();
          ultimoEstado = { corriendo: false, ...resultado };
        } catch(e) {
          ultimoEstado = { corriendo: false, error: e.message };
        } finally { scanEnCurso = false; }
      }
    }, { timezone: 'America/Mexico_City' });
    console.log('Scan automatico: ' + hora + ':00 hora CDMX');
    setInterval(() => {
      require('https').get('https://gtg-licitaciones.onrender.com/', () => {});
    }, 600000);
  });
});
