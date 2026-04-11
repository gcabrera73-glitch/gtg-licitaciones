require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const db = require('./database');
const { ejecutarScan, inicializarPortales } = require('./scanner');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── Dashboard HTML ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GTG — Monitor de Licitaciones</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f1;color:#1a1a1a;font-size:14px}
.header{background:#fff;border-bottom:1px solid #e0e0e0;padding:14px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10}
.logo{width:36px;height:36px;background:#E6F1FB;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#0C447C}
.header h1{font-size:16px;font-weight:500}
.header .sub{font-size:12px;color:#888;margin-top:1px}
.scan-btn{margin-left:auto;padding:8px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px}
.scan-btn:hover{background:#333}
.scan-btn:disabled{background:#ccc;cursor:not-allowed}
.main{max-width:1100px;margin:0 auto;padding:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px}
.stat{background:#fff;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #e8e8e8}
.stat .num{font-size:24px;font-weight:500}
.stat .lbl{font-size:11px;color:#888;margin-top:2px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.filter-btn{padding:6px 12px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:12px}
.filter-btn.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.lic-card{background:#fff;border:1px solid #e8e8e8;border-radius:8px;padding:14px;margin-bottom:10px}
.lic-card.alto{border-left:3px solid #5DCAA5}
.lic-card.medio{border-left:3px solid #EF9F27}
.lic-card.revisar{border-left:3px solid #378ADD}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.card-portal{font-size:11px;color:#888;margin-bottom:2px}
.card-titulo{font-size:14px;font-weight:500}
.badges{display:flex;gap:5px;flex-wrap:wrap}
.badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:500;white-space:nowrap}
.b-alto{background:#EAF3DE;color:#27500A}
.b-medio{background:#FAEEDA;color:#633806}
.b-revisar{background:#E6F1FB;color:#0C447C}
.b-no{background:#FCEBEB;color:#791F1F}
.b-serv{background:#EEEDFE;color:#3C3489}
.b-compra{background:#E1F5EE;color:#085041}
.b-mant{background:#FAEEDA;color:#633806}
.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin:10px 0}
.card-field{background:#f8f8f6;border-radius:4px;padding:7px 10px}
.card-field .lbl{font-size:10px;color:#888;margin-bottom:2px}
.card-field .val{font-size:12px;font-weight:500;color:#1a1a1a}
.card-just{font-size:12px;color:#555;background:#f8f8f6;padding:7px 10px;border-radius:4px;margin:8px 0}
.card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.btn-ok{padding:5px 12px;background:#EAF3DE;color:#27500A;border:1px solid #97C459;border-radius:4px;cursor:pointer;font-size:12px}
.btn-ok:hover{background:#C0DD97}
.btn-no{padding:5px 12px;background:#FCEBEB;color:#791F1F;border:1px solid #F09595;border-radius:4px;cursor:pointer;font-size:12px}
.btn-no:hover{background:#F7C1C1}
.btn-link{padding:5px 12px;background:#fff;color:#185FA5;border:1px solid #B5D4F4;border-radius:4px;cursor:pointer;font-size:12px;text-decoration:none}
.empty{text-align:center;padding:60px;color:#aaa;font-size:14px}
.loading{text-align:center;padding:40px;color:#888}
.scan-status{background:#E6F1FB;border-radius:6px;padding:10px 14px;font-size:13px;color:#0C447C;margin-bottom:16px;display:none}
#last-scan{font-size:12px;color:#888;margin-left:8px}
</style>
</head>
<body>
<div class="header">
  <div class="logo">GT</div>
  <div>
    <h1>GTG — Monitor de Licitaciones</h1>
    <div class="sub">Redes · Telecomunicaciones · Seguridad TI</div>
  </div>
  <span id="last-scan"></span>
  <button class="scan-btn" onclick="iniciarScan()">Escanear ahora</button>
</div>

<div class="main">
  <div id="scan-status" class="scan-status"></div>

  <div class="stats" id="stats">
    <div class="stat"><div class="num" id="s-total">—</div><div class="lbl">Total</div></div>
    <div class="stat"><div class="num" id="s-alto" style="color:#27500A">—</div><div class="lbl">Score Alto</div></div>
    <div class="stat"><div class="num" id="s-medio" style="color:#633806">—</div><div class="lbl">Score Medio</div></div>
    <div class="stat"><div class="num" id="s-revisar" style="color:#0C447C">—</div><div class="lbl">Revisar</div></div>
    <div class="stat"><div class="num" id="s-pendientes" style="color:#888">—</div><div class="lbl">Sin validar</div></div>
    <div class="stat"><div class="num" id="s-portales" style="color:#888">—</div><div class="lbl">Portales activos</div></div>
  </div>

  <div class="filters">
    <button class="filter-btn active" onclick="filtrar('todos',this)">Todos</button>
    <button class="filter-btn" onclick="filtrar('Alto',this)">Score Alto</button>
    <button class="filter-btn" onclick="filtrar('Medio',this)">Medio</button>
    <button class="filter-btn" onclick="filtrar('Revisar',this)">Revisar</button>
    <button class="filter-btn" onclick="filtrar('sin-validar',this)">Sin validar</button>
  </div>

  <div id="lista"><div class="loading">Cargando licitaciones...</div></div>
</div>

<script>
let todas = [];
let filtroActual = 'todos';

function badgeScore(s){
  const m={'Alto':'b-alto','Medio':'b-medio','Revisar':'b-revisar','No relevante':'b-no'};
  return '<span class="badge '+(m[s]||'b-no')+'">'+s+'</span>';
}
function badgeTipo(t){
  const m={'Servicio administrado':'b-serv','Compra de equipo':'b-compra','Mantenimiento':'b-mant'};
  return '<span class="badge '+(m[t]||'b-no')+'">'+t+'</span>';
}

function renderCard(l){
  const cls = l.score==='Alto'?'alto':l.score==='Medio'?'medio':l.score==='Revisar'?'revisar':'';
  const validBadge = l.es_relevante===1?'<span class="badge b-alto">Confirmado</span>':
                     l.es_relevante===0?'<span class="badge b-no">Rechazado</span>':'';
  return \`<div class="lic-card \${cls}" id="card-\${l.id}">
    <div class="card-top">
      <div><div class="card-portal">\${l.portal_nombre}</div>
      <div class="card-titulo">\${l.titulo}</div></div>
      <div class="badges">\${badgeScore(l.score)}\${badgeTipo(l.tipo)}\${validBadge}</div>
    </div>
    <div class="card-grid">
      <div class="card-field"><div class="lbl">Dependencia</div><div class="val">\${l.dependencia}</div></div>
      <div class="card-field"><div class="lbl">Marcas</div><div class="val">\${l.marcas}</div></div>
      <div class="card-field"><div class="lbl">Junta aclaraciones</div><div class="val">\${l.junta_aclaraciones}</div></div>
      <div class="card-field"><div class="lbl">Entrega propuestas</div><div class="val">\${l.fecha_entrega}</div></div>
      <div class="card-field"><div class="lbl">Fallo</div><div class="val">\${l.fallo}</div></div>
      <div class="card-field"><div class="lbl">Detectada</div><div class="val">\${l.fecha_deteccion}</div></div>
    </div>
    <div class="card-just">\${l.justificacion}</div>
    <div class="card-actions">
      <button class="btn-ok" onclick="validar(\${l.id},1)">Confirmar relevante</button>
      <button class="btn-no" onclick="validar(\${l.id},0)">No es relevante</button>
      <a class="btn-link" href="\${l.portal_url}" target="_blank">Ver portal →</a>
    </div>
  </div>\`;
}

async function cargar(){
  const res = await fetch('/api/licitaciones');
  todas = await res.json();
  actualizarStats();
  mostrarFiltro();

  const scan = await fetch('/api/stats');
  const s = await scan.json();
  if(s.ultimo_scan) document.getElementById('last-scan').textContent = 'Último scan: '+s.ultimo_scan;
}

function actualizarStats(){
  document.getElementById('s-total').textContent = todas.length;
  document.getElementById('s-alto').textContent = todas.filter(l=>l.score==='Alto').length;
  document.getElementById('s-medio').textContent = todas.filter(l=>l.score==='Medio').length;
  document.getElementById('s-revisar').textContent = todas.filter(l=>l.score==='Revisar').length;
  document.getElementById('s-pendientes').textContent = todas.filter(l=>l.es_relevante===null).length;
  document.getElementById('s-portales').textContent = '95';
}

function filtrar(f, btn){
  filtroActual = f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  mostrarFiltro();
}

function mostrarFiltro(){
  let lista = todas;
  if(filtroActual==='Alto') lista = todas.filter(l=>l.score==='Alto');
  else if(filtroActual==='Medio') lista = todas.filter(l=>l.score==='Medio');
  else if(filtroActual==='Revisar') lista = todas.filter(l=>l.score==='Revisar');
  else if(filtroActual==='sin-validar') lista = todas.filter(l=>l.es_relevante===null);

  const el = document.getElementById('lista');
  if(lista.length===0){
    el.innerHTML = '<div class="empty">No hay licitaciones en esta categoría</div>';
    return;
  }
  el.innerHTML = lista.map(renderCard).join('');
}

async function validar(id, valor){
  await fetch('/api/validar/'+id, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({relevante:valor})});
  const l = todas.find(x=>x.id===id);
  if(l){ l.es_relevante = valor; mostrarFiltro(); actualizarStats(); }
}

async function iniciarScan(){
  const btn = document.querySelector('.scan-btn');
  const status = document.getElementById('scan-status');
  btn.disabled = true;
  btn.textContent = 'Escaneando...';
  status.style.display = 'block';
  status.textContent = 'Scan iniciado — esto puede tomar varios minutos dependiendo de los portales...';

  try {
    const res = await fetch('/api/scan', {method:'POST'});
    const data = await res.json();
    status.textContent = \`Scan completado: \${data.encontradas} encontradas, \${data.relevantes} relevantes para GTG.\`;
    await cargar();
  } catch(e) {
    status.textContent = 'Error al iniciar scan: '+e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Escanear ahora';
  }
}

cargar();
</script>
</body>
</html>`);
});

// ── API ─────────────────────────────────────────────────────────────────────
app.get('/api/licitaciones', (req, res) => {
  const lics = db.prepare(`
    SELECT * FROM licitaciones
    WHERE score != 'No relevante' AND score != 'Error'
    ORDER BY
      CASE score WHEN 'Alto' THEN 1 WHEN 'Medio' THEN 2 WHEN 'Revisar' THEN 3 ELSE 4 END,
      fecha_deteccion DESC
    LIMIT 200
  `).all();
  res.json(lics);
});

app.get('/api/stats', (req, res) => {
  const ultimo = db.prepare('SELECT fecha FROM scans ORDER BY id DESC LIMIT 1').get();
  const portales = db.prepare('SELECT COUNT(*) as n FROM portales WHERE activo=1').get();
  res.json({
    ultimo_scan: ultimo?.fecha || null,
    portales_activos: portales.n
  });
});

app.post('/api/validar/:id', (req, res) => {
  const { relevante } = req.body;
  db.prepare('UPDATE licitaciones SET es_relevante = ?, validado = 1 WHERE id = ?')
    .run(relevante ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.post('/api/scan', async (req, res) => {
  try {
    const resultado = await ejecutarScan();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/portales', (req, res) => {
  res.json(db.prepare('SELECT * FROM portales ORDER BY categoria, nombre').all());
});

// ── Cron: scan automático diario ────────────────────────────────────────────
const hora = process.env.SCAN_HOUR || '7';
cron.schedule(`0 ${hora} * * *`, async () => {
  console.log('Iniciando scan automático diario...');
  await ejecutarScan();
}, { timezone: 'America/Mexico_City' });

// ── Iniciar servidor ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
inicializarPortales().then(() => {
  app.listen(PORT, () => {
    console.log(`\nServidor GTG corriendo en puerto ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`Scan automático: ${hora}:00 hora CDMX\n`);
  });
});
