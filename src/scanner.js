require('dotenv').config();
const db = require('./database');
const { analizarPortal } = require('./analyzer');
const PORTALES = require('./portales');
const { enviarResumen } = require('./mailer');

const DELAY_ENTRE_PORTALES = 8000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function inicializarPortales() {
  const insert = db.prepare('INSERT OR IGNORE INTO portales (url, nombre, categoria) VALUES (@url, @nombre, @categoria)');
  for (const p of PORTALES) insert.run(p);
}

function obtenerCriteriosAprendizaje() {
  try {
    const validadas = db.prepare(`
      SELECT titulo, justificacion FROM licitaciones
      WHERE es_relevante = 1
      ORDER BY id DESC LIMIT 50
    `).all();
    if (validadas.length === 0) return null;
    const palabras = validadas
      .map(l => l.titulo + ' ' + l.justificacion)
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(p => p.length > 4)
      .slice(0, 30)
      .join(', ');
    return palabras;
  } catch(e) {
    return null;
  }
}

async function ejecutarScan(onProgreso) {
  console.log('\n=== SCAN GTG ' + new Date().toLocaleString('es-MX') + ' ===\n');
  await inicializarPortales();

  const portalesActivos = db.prepare('SELECT * FROM portales WHERE activo=1').all();
  const criteriosAprendizaje = obtenerCriteriosAprendizaje();
  if (criteriosAprendizaje) {
    console.log('Aprendizaje activo: ' + criteriosAprendizaje.substring(0, 80) + '...');
  }

  const inicio = Date.now();
  let procesados = 0, encontradas = 0, relevantes = 0;
  const nuevasRelevantes = [];

  for (const portal of portalesActivos) {
    console.log('Analizando: ' + portal.nombre);
    const resultados = await analizarPortal(portal.url, portal.nombre, criteriosAprendizaje);
    procesados++;
    if (onProgreso) onProgreso(procesados);

    for (const resultado of resultados) {
      encontradas++;
      const esRelevante = ['Alto', 'Medio'].includes(resultado.score);
      if (resultado.score === 'Vencida') resultado.score = 'No relevante';

      try {
        const existe = db.prepare('SELECT id, junta_aclaraciones, fecha_entrega, fallo, validado, es_relevante FROM licitaciones WHERE hash=?').get(resultado.hash);

        if (!existe) {
          // Nueva licitacion — insertar normalmente
          db.prepare(`INSERT INTO licitaciones
            (portal_url, portal_nombre, titulo, dependencia, tipo, score, marcas,
             junta_aclaraciones, fecha_entrega, fallo, justificacion, hash)
            VALUES
            (@portal_url, @portal_nombre, @titulo, @dependencia, @tipo, @score, @marcas,
             @junta_aclaraciones, @fecha_entrega, @fallo, @justificacion, @hash)
          `).run(resultado);
        } else {
          // Ya existe — solo actualizar fechas SI no fue evaluada manualmente
          const fueEvaluada = existe.validado === 1 || existe.es_relevante !== null;

          if (!fueEvaluada) {
            // No evaluada: actualizar fechas y score normalmente
            const tieneFechasNuevas =
              (resultado.junta_aclaraciones && resultado.junta_aclaraciones !== 'No especificada') ||
              (resultado.fecha_entrega && resultado.fecha_entrega !== 'No especificada') ||
              (resultado.fallo && resultado.fallo !== 'No especificada');

            if (tieneFechasNuevas) {
              db.prepare(`UPDATE licitaciones SET
                junta_aclaraciones=?, fecha_entrega=?, fallo=?, score=?
                WHERE hash=?`).run(
                resultado.junta_aclaraciones, resultado.fecha_entrega,
                resultado.fallo, resultado.score, resultado.hash
              );
            }
          } else {
            // Ya fue evaluada — solo actualizar fechas si mejoran, NUNCA tocar score ni evaluacion
            const tieneFechasNuevas =
              (resultado.junta_aclaraciones && resultado.junta_aclaraciones !== 'No especificada' &&
               (!existe.junta_aclaraciones || existe.junta_aclaraciones === 'No especificada')) ||
              (resultado.fecha_entrega && resultado.fecha_entrega !== 'No especificada' &&
               (!existe.fecha_entrega || existe.fecha_entrega === 'No especificada')) ||
              (resultado.fallo && resultado.fallo !== 'No especificada' &&
               (!existe.fallo || existe.fallo === 'No especificada'));

            if (tieneFechasNuevas) {
              db.prepare(`UPDATE licitaciones SET
                junta_aclaraciones=CASE WHEN junta_aclaraciones='No especificada' OR junta_aclaraciones IS NULL THEN ? ELSE junta_aclaraciones END,
                fecha_entrega=CASE WHEN fecha_entrega='No especificada' OR fecha_entrega IS NULL THEN ? ELSE fecha_entrega END,
                fallo=CASE WHEN fallo='No especificada' OR fallo IS NULL THEN ? ELSE fallo END
                WHERE hash=?`).run(
                resultado.junta_aclaraciones, resultado.fecha_entrega,
                resultado.fallo, resultado.hash
              );
            }
          }
        }
      } catch(e) {
        console.log('  Error BD: ' + e.message.substring(0, 60));
      }

      if (esRelevante) {
        relevantes++;
        nuevasRelevantes.push(resultado);
      }
    }

    db.prepare(`UPDATE portales SET
      ultimo_scan = datetime('now','localtime'),
      total_encontradas = total_encontradas + ?,
      total_relevantes = total_relevantes + ?
      WHERE url = ?
    `).run(resultados.length, resultados.filter(r => ['Alto','Medio'].includes(r.score)).length, portal.url);

    console.log('Progreso: ' + procesados + '/' + portalesActivos.length);
    await sleep(DELAY_ENTRE_PORTALES);
  }

  const duracion = Math.round((Date.now() - inicio) / 1000);
  db.prepare('INSERT INTO scans (portales_procesados, licitaciones_encontradas, licitaciones_relevantes, duracion_segundos) VALUES (?,?,?,?)').run(procesados, encontradas, relevantes, duracion);

  console.log('\nScan completado en ' + duracion + 's');
  console.log('Portales: ' + procesados + ' | Encontradas: ' + encontradas + ' | Relevantes: ' + relevantes);

  const soloAltoMedio = nuevasRelevantes.filter(l => ['Alto', 'Medio'].includes(l.score));
  if (soloAltoMedio.length > 0) await enviarResumen(soloAltoMedio);

  return { procesados, encontradas, relevantes };
}

if (require.main === module) {
  ejecutarScan().then(() => process.exit(0)).catch(console.error);
}

module.exports = { ejecutarScan, inicializarPortales };
