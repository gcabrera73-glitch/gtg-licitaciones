require('dotenv').config();
const db = require('./database');
const { analizarPortal } = require('./analyzer');
const PORTALES = require('./portales');
const { enviarResumen } = require('./mailer');

const DELAY_MS = 15000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function inicializarPortales() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO portales (url, nombre, categoria)
    VALUES (@url, @nombre, @categoria)
  `);
  for (const p of PORTALES) {
    insert.run(p);
  }
  console.log(`${PORTALES.length} portales inicializados`);
}

async function procesarPortal(portal) {
  console.log(`Analizando: ${portal.nombre}`);
  const resultado = await analizarPortal(portal.url, portal.nombre);

  if (resultado.score === 'Error') {
    db.prepare(`UPDATE portales SET ultimo_scan = datetime('now','localtime') WHERE url = ?`).run(portal.url);
    return null;
  }

  const esRelevante = ['Alto', 'Medio', 'Revisar'].includes(resultado.score);

  try {
    db.prepare(`
      INSERT OR IGNORE INTO licitaciones
        (portal_url, portal_nombre, titulo, dependencia, tipo, score, marcas,
         junta_aclaraciones, fecha_entrega, fallo, justificacion, hash)
      VALUES
        (@portal_url, @portal_nombre, @titulo, @dependencia, @tipo, @score, @marcas,
         @junta_aclaraciones, @fecha_entrega, @fallo, @justificacion, @hash)
    `).run(resultado);
  } catch (e) {
    // hash duplicado = ya la teníamos, skip
  }

  db.prepare(`
    UPDATE portales
    SET ultimo_scan = datetime('now','localtime'),
        total_encontradas = total_encontradas + 1,
        total_relevantes = total_relevantes + ?
    WHERE url = ?
  `).run(esRelevante ? 1 : 0, portal.url);

  return resultado;
}

async function ejecutarScan() {
  console.log('\n==============================');
  console.log('SCAN GTG iniciado:', new Date().toLocaleString('es-MX'));
  console.log('==============================\n');

  await inicializarPortales();

  const portalesActivos = db.prepare('SELECT * FROM portales WHERE activo = 1').all();
  const inicio = Date.now();

  let procesados = 0, encontradas = 0, relevantes = 0;
  const nuevasRelevantes = [];

  for (const portal of portalesActivos) {
    const resultado = await procesarPortal(portal);
    procesados++;

    if (resultado) {
      encontradas++;
      if (['Alto', 'Medio', 'Revisar'].includes(resultado.score)) {
        relevantes++;
        nuevasRelevantes.push(resultado);
      }
    }

    process.stdout.write(`Progreso: ${procesados}/${portalesActivos.length}\r`);
    await sleep(DELAY_MS);
  }

  const duracion = Math.round((Date.now() - inicio) / 1000);
  db.prepare(`
    INSERT INTO scans (portales_procesados, licitaciones_encontradas, licitaciones_relevantes, duracion_segundos)
    VALUES (?, ?, ?, ?)
  `).run(procesados, encontradas, relevantes, duracion);

  console.log(`\n\nScan completado en ${duracion}s`);
  console.log(`Portales procesados: ${procesados}`);
  console.log(`Licitaciones encontradas: ${encontradas}`);
  console.log(`Relevantes para GTG: ${relevantes}`);

  if (nuevasRelevantes.length > 0) {
    await enviarResumen(nuevasRelevantes);
  }

  return { procesados, encontradas, relevantes };
}

if (require.main === module) {
  ejecutarScan().then(() => process.exit(0)).catch(console.error);
}

module.exports = { ejecutarScan, inicializarPortales };
