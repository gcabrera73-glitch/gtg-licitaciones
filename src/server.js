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
.logo{width:36px;height:36px;background:#E6F1FB;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#0C447C;flex-shrink:0}
.header h1{font-size:16px;font-weight:500}
.header .sub{font-size:12px;color:#888;margin-top:1px}
.main{max-width:1100px;margin:0 auto;padding:20px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:20px}
.stat{background:#fff;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #e8e8e8}
.stat .num{font-size:24px;font-weight:500}
.stat .lbl{font-size:11px;color:#888;margin-top:2px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.filter-btn{padding:6px 12px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:12px}
.filter-btn.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.scan-link{margin-left:auto;padding:6px 14px;background:#1a1a1a;color:#fff;border-radius:6px;font-size:12px;text-decoration:none}
.lic-card{background:#fff;border:1px solid #e8e8e8;border-radius:8px;padding:14px;margin-bottom:10px}
.lic-card.alto{border-left:3px solid #5DCAA5}
.lic-card.medio{border-left:3px solid #EF9F27}
.lic-card.revisar{border-left:3px solid #378ADD}
.lic-card.evaluada-si{border-left:3px solid #27500A}
.lic-card.evaluada-no{border-left:3px solid #F09595;opacity:0.7}
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
.b-eval-si{background:#EAF3DE;color:#27500A;font-weight:600}
.b-eval-no{background:#FCEBEB;color:#791F1F;font-weight:600}
.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:10px 0}
.card-field{background:#f8f8f6;border-radius:4px;padding:7px 10px}
.card-field .lbl{font-size:10px;color:#888;margin-bottom:2px}
.card-field .val{font-size:12px;font-weight:500;color:#1a1a1a}
.card-field .val.fecha-ok{color:#27500A}
.card-just{font-size:12px;color:#555;background:#f8f8f6;padding:7px 10px;border-radius:4px;margin:8px 0}
.card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center}
.btn-si{padding:6px 14px;background:#EAF3DE;color:#27500A;border:1px solid #97C459;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500}
.btn-no{padding:6px 14px;background:#FCEBEB;color:#791F1F;border:1px solid #F09595;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500}
.btn-link{padding:6px 12px;background:#fff;color:#185FA5;border:1px solid #B5D4F4;border-radius:4px;font-size:12px;text-decoration:none}
.comentario-box{display:none;margin-top:8px;width:100%}
.comentario-box textarea{width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:12px;font-family:inherit;resize:none;height:60px}
.comentario-box .btn-guardar{margin-top:4px;padding:5px 12px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}
.comentario-guardado{font-size:11px;color:#888;font-style:italic;margin-top:4px}
.search-row{margin-bottom:16px}
.search-row input{width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;margin-bottom:8px}
.search-row input:focus{outline:none;border-color:#888}
.keywords{display:flex;flex-wrap:wrap;gap:6px}
.keywords span{padding:4px 10px;background:#E6F1FB;color:#0C447C;border-radius:4px;font-size:11px;cursor:pointer;font-weight:500}
.keywords span:hover{background:#B5D4F4}
.empty{text-align:center;padding:60px;color:#aaa}
.loading{text-align:center;padding:40px;color:#888}
</style>
</head>
<body>
<div class="header">
  <div class="logo">GT</div>
  <div>
    <h1>GTG — Monitor de Licitaciones</h1>
    <div class="sub">Redes · Telecomunicaciones · Seguridad TI</div>
  </div>
</div>
<div class="main">
  <div class="stats">
    <div class="stat"><div class="num" id="s-total">—</div><div class="lbl">Total</div></div>
    <div class="stat"><div class="num" id="s-alto" style="color:#27500A">—</div><div class="lbl">Score Alto</div></div>
    <div class="stat"><div class="num" id="s-medio" style="color:#633806">—</div><div class="lbl">Medio</div></div>
    <div class="stat"><div class="num" id="s-revisar" style="color:#0C447C">—</div><div class="lbl">Revisar</div></div>
    <div class="stat"><div class="num" id="s-evaluadas" style="color:#27500A">—</div><div class="lbl">Evaluadas</div></div>
    <div class="stat"><div class="num" id="s-pendientes" style="color:#888">—</div><div class="lbl">Sin evaluar</div></div>
  </div>
  <div class="filters">
    <button class="filter-btn active" onclick="filtrar('todos',this)">Todas</button>
    <button class="filter-btn" onclick="filtrar('Alto',this)">Score Alto</button>
    <button class="filter-btn" onclick="filtrar('Medio',this)">Medio</button>
    <button class="filter-btn" onclick="filtrar('Revisar',this)">Revisar</button>
    <button class="filter-btn" onclick="filtrar('sin-evaluar',this)">Sin evaluar</button>
    <button class="filter-btn" onclick="filtrar('nos-interesa',this)">Nos interesa</button>
    <button class="filter-btn" onclick="filtrar('no-interesa',this)">No nos interesa</button>
    <a href="/iniciar" class="scan-link">Escanear ahora</a>
  </div>
  <div class="search-row">
    <input type="text" id="buscar" placeholder="Buscar por palabra clave: firewall, NOC, Huawei, fibra..." oninput="buscarPalabra(this.value)" />
    <div class="keywords">
      <span onclick="setBusqueda('switch')">switch</span>
      <span onclick="setBusqueda('router')">router</span>
      <span onclick="setBusqueda('firewall')">firewall</span>
      <span onclick="setBusqueda('wifi')">wifi</span>
      <span onclick="setBusqueda('CCTV')">CCTV</span>
      <span onclick="setBusqueda('fibra')">fibra óptica</span>
      <span onclick="setBusqueda('NOC')">NOC</span>
      <span onclick="setBusqueda('telecomunicaciones')">telecom</span>
      <span onclick="setBusqueda('servicio administrado')">serv. administrado</span>
      <span onclick="setBusqueda('mantenimiento')">mantenimiento</span>
      <span onclick="setBusqueda('Huawei')">Huawei</span>
      <span onclick="setBusqueda('Cisco')">Cisco</span>
      <span onclick="setBusqueda('Fortinet')">Fortinet</span>
      <span onclick="setBusqueda('Ruckus')">Ruckus</span>
    </div>
  </div>
  <div id="lista"><div class="loading">Cargando...</div></div>
</div>
<script>
let todas=[];
let filtroActual='todos';

function badgeScore(s){const m={'Alto':'b-alto','Medio':'b-medio','Revisar':'b-revisar','No relevante':'b-no'};return '<span class="badge '+(m[s]||'b-no')+'">'+s+'</span>';}
function badgeTipo(t){const m={'Servicio administrado':'b-serv','Compra de equipo':'b-compra','Mantenimiento':'b-mant'};return t&&m[t]?'<span class="badge '+m[t]+'">'+t+'</span>':'';}

function renderCard(l){
  const cls = l.es_relevante===1?'evaluada-si':l.es_relevante===0?'evaluada-no':l.score==='Alto'?'alto':l.score==='Medio'?'medio':l.score==='Revisar'?'revisar':'';
  const evalBadge = l.es_relevante===1?'<span class="badge b-eval-si">Nos interesa</span>':l.es_relevante===0?'<span class="badge b-eval-no">No nos interesa</span>':'';
  const fechaEntregaClass = l.fecha_entrega && l.fecha_entrega!=='No especificada'?'val fecha-ok':'val';
  const falloClass = l.fallo && l.fallo!=='No especificada'?'val fecha-ok':'val';
  const comentarioHtml = l.comentario ? '<div class="comentario-guardado">Comentario: '+l.comentario+'</div>' : '';
  const botonesEval = l.es_relevante===null ?
    '<button class="btn-si" onclick="mostrarComentario('+l.id+',1)">Nos interesa</button><button class="btn-no" onclick="mostrarComentario('+l.id+',0)">No nos interesa</button>' :
    '<button class="filter-btn" onclick="resetEval('+l.id+')" style="font-size:11px;padding:4px 8px;">Cambiar evaluación</button>';

  return '<div class="lic-card '+cls+'" id="card-'+l.id+'">' +
    '<div class="card-top"><div><div class="card-portal">'+l.portal_nombre+'</div><div class="card-titulo">'+l.titulo+'</div></div>' +
    '<div class="badges">'+badgeScore(l.score)+badgeTipo(l.tipo)+evalBadge+'</div></div>' +
    '<div class="card-grid">' +
    '<div class="card-field"><div class="lbl">Dependencia</div><div class="val">'+l.dependencia+'</div></div>' +
    '<div class="card-field"><div class="lbl">Marcas</div><div class="val">'+l.marcas+'</div></div>' +
    '<div class="card-field"><div class="lbl">Junta aclaraciones</div><div class="val '+(l.junta_aclaraciones!=='No especificada'?'fecha-ok':'')+'">'+l.junta_aclaraciones+'</div></div>' +
    '<div class="card-field"><div class="lbl">Entrega propuestas</div><div class="'+fechaEntregaClass+'">'+l.fecha_entrega+'</div></div>' +
    '<div class="card-field"><div class="lbl">Fallo</div><div class="'+falloClass+'">'+l.fallo+'</div></div>' +
    '</div>' +
    '<div class="card-just">'+l.justificacion+'</div>' +
    comentarioHtml +
    '<div class="card-actions">'+botonesEval+'<a class="btn-link" href="'+l.portal_url+'" target="_blank">Ver licitación</a></div>' +
    '<div class="comentario-box" id="cbox-'+l.id+'"><textarea id="ctxt-'+l.id+'" placeholder="¿Por qué te interesa o no? (opcional)"></textarea><button class="btn-guardar" onclick="guardarEval('+l.id+')">Guardar evaluación</button></div>' +
    '</div>';
}

function mostrarComentario(id, valor) {
  document.getElementById('cbox-'+id).style.display = 'block';
  document.getElementById('cbox-'+id).dataset.valor = valor;
  document.getElementById('ctxt-'+id).focus();
}

async function guardarEval(id) {
  const cbox = document.getElementById('cbox-'+id);
  const valor = parseInt(cbox.dataset.valor);
  const comentario = document.getElementById('ctxt-'+id).value.trim();
  await fetch('/api/validar/'+id, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({relevante:valor,comentario:comentario})});
  const l = todas.find(x=>x.id===id);
  if(l){ l.es_relevante=valor; l.comentario=comentario; mostrarFiltro(); actualizarStats(); }
}

async function resetEval(id) {
  await fetch('/api/validar/'+id, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({relevante:null,comentario:''})});
  const l = todas.find(x=>x.id===id);
  if(l){ l.es_relevante=null; l.comentario=''; mostrarFiltro(); actualizarStats(); }
}

function cargar(){
  fetch('/api/licitaciones')
    .then(function(res){ return res.json(); })
    .then(function(data){
      todas = Array.isArray(data) ? data : [];
      actualizarStats();
      mostrarFiltro();
    })
    .catch(function(e){
      document.getElementById('lista').innerHTML='<div class="empty">Error cargando: '+e.message+'</div>';
    });
}

function actualizarStats(){
  document.getElementById('s-total').textContent = todas.length;
  document.getElementById('s-alto').textContent = todas.filter(l=>l.score==='Alto').length;
  document.getElementById('s-medio').textContent = todas.filter(l=>l.score==='Medio').length;
  document.getElementById('s-revisar').textContent = todas.filter(l=>l.score==='Revisar').length;
  document.getElementById('s-evaluadas').textContent = todas.filter(l=>l.es_relevante!==null).length;
  document.getElementById('s-pendientes').textContent = todas.filter(l=>l.es_relevante===null).length;
}

function filtrar(f,btn){
  filtroActual=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  mostrarFiltro();
}

function mostrarFiltro(){
  let lista=todas;
  if(filtroActual==='Alto') lista=todas.filter(l=>l.score==='Alto');
  else if(filtroActual==='Medio') lista=todas.filter(l=>l.score==='Medio');
  else if(filtroActual==='Revisar') lista=todas.filter(l=>l.score==='Revisar');
  else if(filtroActual==='sin-evaluar') lista=todas.filter(l=>l.es_relevante===null);
  else if(filtroActual==='nos-interesa') lista=todas.filter(l=>l.es_relevante===1);
  else if(filtroActual==='no-interesa') lista=todas.filter(l=>l.es_relevante===0);
  if(busquedaActual) {
    lista = lista.filter(l => {
      const texto = ((l.titulo||'') + ' ' + (l.dependencia||'') + ' ' + (l.justificacion||'') + ' ' + (l.marcas||'') + ' ' + (l.portal_nombre||'')).toLowerCase();
      return texto.includes(busquedaActual);
    });
  }
  const el=document.getElementById('lista');
  const total = lista.length;
  if(total===0){el.innerHTML='<div class="empty">No hay licitaciones'+(busquedaActual?' con "'+busquedaActual+'"':'en esta categoría')+'</div>';return;}
  el.innerHTML = (busquedaActual?'<div style="font-size:12px;color:#888;margin-bottom:8px;">'+total+' resultado(s) para "'+busquedaActual+'" <a href="#" onclick="setBusqueda(\'\');document.getElementById(\'buscar\').value=\'\';return false;" style="color:#185FA5;">limpiar</a></div>':'')+lista.map(renderCard).join('');
}

let busquedaActual = '';

function buscarPalabra(valor) {
  busquedaActual = valor.toLowerCase().trim();
  mostrarFiltro();
}

function setBusqueda(palabra) {
  document.getElementById('buscar').value = palabra;
  busquedaActual = palabra.toLowerCase();
  mostrarFiltro();
}

cargar();
setInterval(cargar, 60000);
</script>
</body>
</html>`);
});

app.get('/iniciar', (req, res) => {
  if(scanEnCurso){ res.send('Ya hay un scan corriendo.'); return; }
  scanEnCurso = true;
  ultimoEstado = { corriendo: true, progreso: 0, total: 0 };
  res.send('Scan iniciado OK. Regresa al dashboard, se actualiza cada minuto.');
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

app.get('/api/licitaciones', (req, res) => {
  const lics = db.prepare(`
    SELECT * FROM licitaciones
    WHERE score != 'No relevante' AND score != 'Error'
    ORDER BY
      CASE score WHEN 'Alto' THEN 1 WHEN 'Medio' THEN 2 WHEN 'Revisar' THEN 3 ELSE 4 END,
      fecha_deteccion DESC
  `).all();
  res.json(lics);
});

app.get('/api/estado', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(ultimoEstado || { corriendo: scanEnCurso, progreso: 0, total: 0 });
});

app.post('/api/validar/:id', (req, res) => {
  const { relevante, comentario } = req.body;
  if (relevante === null) {
    db.prepare('UPDATE licitaciones SET es_relevante=NULL, validado=0, comentario=NULL WHERE id=?').run(req.params.id);
  } else {
    db.prepare('UPDATE licitaciones SET es_relevante=?, validado=1, comentario=? WHERE id=?')
      .run(relevante ? 1 : 0, comentario || null, req.params.id);
  }
  res.json({ ok: true });
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
