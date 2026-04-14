require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9',
};

async function fetchContenido(url) {
  try {
    const response = await axios.get(url, { timeout: 20000, headers: HEADERS, maxRedirects: 5 });
    return String(response.data)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 10000);
  } catch (e) {
    return null;
  }
}

function limpiarJSON(texto) {
  const match = texto.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  return match[0]
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
}

async function llamarIA(prompt, maxTokens = 800) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      timeout: 30000
    }
  );
  let texto = '';
  for (const block of response.data.content || []) {
    if (block.type === 'text') texto += block.text;
  }
  return texto;
}

const PROMPT_INDICE = (url, nombre, contenido, criteriosExtra) => `Eres un analizador de licitaciones publicas para GTG, empresa de redes TI en Mexico.

GTG busca: switches, routers, firewalls, WiFi, CCTV, videovigilancia, cableado estructurado, fibra optica, NOC, call center, mesa de ayuda, soporte tecnico, servicio administrado, mantenimiento de red, telecomunicaciones, infraestructura TI.
Marcas: Huawei, Ruckus, H3C, Ivanti, Proactivanet (prioritarias). Cisco, Fortinet (revisar).
${criteriosExtra ? 'APRENDIZAJE - estas palabras clave tienen mayor relevancia: ' + criteriosExtra : ''}

Analiza el indice del portal y extrae TODAS las licitaciones relevantes para GTG.

Portal: ${nombre}
URL: ${url}
Contenido:
${contenido}

Responde SOLO con JSON valido, sin texto extra, sin markdown:
{
  "total_relevantes": 0,
  "licitaciones": [
    {
      "titulo": "titulo de la licitacion",
      "url_detalle": "url completa a la licitacion o null si no hay",
      "score_preliminar": "Alto|Medio|Revisar",
      "resumen": "descripcion breve max 100 chars"
    }
  ]
}

Si no hay licitaciones relevantes, devuelve: {"total_relevantes": 0, "licitaciones": []}`;

const PROMPT_DETALLE = (url, nombre, contenido) => `Analiza esta licitacion publica y extrae informacion para GTG (empresa de redes TI).

Portal: ${nombre}
URL: ${url}
Contenido:
${contenido}

Extrae las fechas y detalles importantes. Responde SOLO con JSON valido, sin texto extra:
{
  "titulo": "titulo completo",
  "dependencia": "institucion convocante",
  "tipo": "Servicio administrado|Mantenimiento|Compra de equipo|No determinado",
  "score": "Alto|Medio|Revisar|No relevante",
  "marcas": "marcas detectadas o Ninguna",
  "junta_aclaraciones": "fecha DD/MM/YYYY o No especificada",
  "fecha_entrega": "fecha DD/MM/YYYY o No especificada",
  "fallo": "fecha DD/MM/YYYY o No especificada",
  "justificacion": "razon del score max 120 chars",
  "numero_licitacion": "numero oficial o No especificado"
}`;

async function analizarPortal(url, nombrePortal, criteriosAprendizaje) {
  const resultados = [];

  try {
    const contenidoIndice = await fetchContenido(url);
    if (!contenidoIndice) {
      console.log('  No se pudo acceder a ' + nombrePortal);
      return [];
    }

    const respuestaIndice = await llamarIA(
      PROMPT_INDICE(url, nombrePortal, contenidoIndice, criteriosAprendizaje),
      1200
    );

    const jsonIndice = limpiarJSON(respuestaIndice);
    if (!jsonIndice) {
      console.log('  Sin JSON en indice de ' + nombrePortal);
      return [];
    }

    const indice = JSON.parse(jsonIndice);
    const licitaciones = indice.licitaciones || [];
    const total = indice.total_relevantes || licitaciones.length;

    if (licitaciones.length === 0) {
      console.log('  Sin relevantes en ' + nombrePortal);
      return [];
    }

    console.log('  ' + nombrePortal + ': ' + total + ' relevantes detectadas');

    const conDetalle = licitaciones.slice(0, 10);
    const sinDetalle = licitaciones.slice(10);

    for (const lic of conDetalle) {
      await new Promise(r => setTimeout(r, 3000));
      let resultado = null;

      if (lic.url_detalle && lic.url_detalle !== 'null') {
        try {
          const contenidoDetalle = await fetchContenido(lic.url_detalle);
          if (contenidoDetalle) {
            const respuestaDetalle = await llamarIA(
              PROMPT_DETALLE(lic.url_detalle, nombrePortal, contenidoDetalle),
              600
            );
            const jsonDetalle = limpiarJSON(respuestaDetalle);
            if (jsonDetalle) {
              resultado = JSON.parse(jsonDetalle);
              resultado.portal_url = lic.url_detalle;
            }
          }
        } catch(e) {
          console.log('  Error en detalle: ' + e.message.substring(0, 50));
        }
      }

      if (!resultado) {
        resultado = {
          titulo: lic.titulo,
          dependencia: nombrePortal,
          tipo: 'No determinado',
          score: lic.score_preliminar || 'Medio',
          marcas: 'Ninguna',
          junta_aclaraciones: 'No especificada',
          fecha_entrega: 'No especificada',
          fallo: 'No especificada',
          justificacion: lic.resumen || 'Detectada en indice del portal',
          numero_licitacion: 'No especificado',
          portal_url: url,
        };
      }

      resultado.portal_nombre = nombrePortal;
      resultado.portal_url = resultado.portal_url || url;
      resultado.hash = crypto.createHash('md5')
        .update(resultado.portal_url + (resultado.titulo || ''))
        .digest('hex');
      resultados.push(resultado);
    }

    for (const lic of sinDetalle) {
      resultados.push({
        titulo: lic.titulo,
        dependencia: nombrePortal,
        tipo: 'No determinado',
        score: lic.score_preliminar || 'Revisar',
        marcas: 'Ninguna',
        junta_aclaraciones: 'No especificada',
        fecha_entrega: 'No especificada',
        fallo: 'No especificada',
        justificacion: 'Detectada en indice - supera limite de analisis detallado',
        numero_licitacion: 'No especificado',
        portal_url: url,
        portal_nombre: nombrePortal,
        hash: crypto.createHash('md5').update(url + (lic.titulo || '') + Math.random()).digest('hex'),
      });
    }

  } catch (error) {
    console.error('Error analizando ' + nombrePortal + ': ' + error.message.substring(0, 100));
  }

  return resultados;
}

module.exports = { analizarPortal };
