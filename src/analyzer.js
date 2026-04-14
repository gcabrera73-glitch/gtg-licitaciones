require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const AÑO_ACTUAL = new Date().getFullYear();
const AÑO_MINIMO = AÑO_ACTUAL - 0;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,application/pdf',
  'Accept-Language': 'es-MX,es;q=0.9',
};

async function fetchContenido(url) {
  try {
    const response = await axios.get(url, {
      timeout: 25000, headers: HEADERS, maxRedirects: 5,
      responseType: 'arraybuffer'
    });
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('pdf')) {
      return await extraerTextoPDF(response.data);
    }

    const html = Buffer.from(response.data).toString('utf-8');
    const links = [];
    const linkRegex = /href=["']([^"']*\.pdf[^"']*)/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let pdfUrl = m[1];
      if (!pdfUrl.startsWith('http')) {
        const base = new URL(url);
        pdfUrl = pdfUrl.startsWith('/') ? base.origin + pdfUrl : base.origin + '/' + pdfUrl;
      }
      links.push(pdfUrl);
    }

    let texto = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 10000);

    if (links.length > 0) {
      texto += '\n\nPDFs encontrados en esta pagina: ' + links.slice(0, 5).join(', ');
    }

    return texto;
  } catch (e) {
    return null;
  }
}

async function extraerTextoPDF(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text.substring(0, 10000);
  } catch(e) {
    return null;
  }
}

function limpiarJSON(texto) {
  const match = texto.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  let s = match[0];
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/,\s*}/g, '}');
  s = s.replace(/,\s*]/g, ']');
  try {
    JSON.parse(s);
    return s;
  } catch(e) {
    s = s.replace(/[\u00C0-\u024F]/g, (c) => {
      const map = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n',
                   'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U','Ñ':'N'};
      return map[c] || c;
    });
    try { JSON.parse(s); return s; } catch(e2) {
      const m2 = s.match(/^(\{[\s\S]*\})/);
      if (!m2) return null;
      let truncated = m2[1];
      const lastComma = truncated.lastIndexOf(',"');
      if (lastComma > 0) {
        truncated = truncated.substring(0, lastComma) + '}';
        try { JSON.parse(truncated); return truncated; } catch(e3) { return null; }
      }
      return null;
    }
  }
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
${criteriosExtra ? 'APRENDIZAJE - palabras clave con mayor relevancia: ' + criteriosExtra : ''}

IMPORTANTE: Solo incluye licitaciones del año ${AÑO_ACTUAL}. Descarta cualquier licitacion de ${AÑO_ACTUAL - 1} o anterior.

Analiza el indice del portal y extrae TODAS las licitaciones relevantes para GTG del año ${AÑO_ACTUAL}.

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
      "resumen": "descripcion breve max 100 chars",
      "año": 2026
    }
  ]
}

Si no hay licitaciones relevantes del año ${AÑO_ACTUAL}, devuelve: {"total_relevantes": 0, "licitaciones": []}`;

const PROMPT_DETALLE = (url, nombre, contenido) => `Analiza esta licitacion publica y extrae informacion para GTG (empresa de redes TI).

AÑO ACTUAL: ${AÑO_ACTUAL}. Si la licitacion es de un año anterior, marca score como "No relevante" con justificacion "Licitacion de año anterior".

Portal: ${nombre}
URL: ${url}
Contenido:
${contenido}

Extrae fechas buscando en todo el contenido: tablas, texto libre, PDFs mencionados.
Busca patrones como: "Junta de aclaraciones", "Apertura de propuestas", "Fallo", fechas en formato DD/MM/YYYY o DD de mes de YYYY.

Responde SOLO con JSON valido, sin texto extra:
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
    const licitaciones = (indice.licitaciones || []).filter(l => {
      if (l.año && l.año < AÑO_ACTUAL) return false;
      return true;
    });

    if (licitaciones.length === 0) {
      console.log('  Sin relevantes en ' + nombrePortal);
      return [];
    }

    console.log('  ' + nombrePortal + ': ' + licitaciones.length + ' relevantes detectadas');

    const conDetalle = licitaciones.slice(0, 10);
    const sinDetalle = licitaciones.slice(10);

    for (const lic of conDetalle) {
      await new Promise(r => setTimeout(r, 3000));
      let resultado = null;

      if (lic.url_detalle && lic.url_detalle !== 'null' && lic.url_detalle.startsWith('http')) {
        try {
          const contenidoDetalle = await fetchContenido(lic.url_detalle);
          if (contenidoDetalle) {
            const respuestaDetalle = await llamarIA(
              PROMPT_DETALLE(lic.url_detalle, nombrePortal, contenidoDetalle),
              700
            );
            const jsonDetalle = limpiarJSON(respuestaDetalle);
            if (jsonDetalle) {
              resultado = JSON.parse(jsonDetalle);
              if (resultado.score === 'No relevante') {
                console.log('  Descartada por año anterior: ' + lic.titulo.substring(0, 50));
                continue;
              }
              resultado.portal_url = lic.url_detalle;
            }
          }
        } catch(e) {
          console.log('  Error en detalle: ' + e.message.substring(0, 60));
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
        hash: crypto.createHash('md5')
          .update(url + (lic.titulo || '') + Date.now().toString())
          .digest('hex'),
      });
    }

  } catch (error) {
    console.error('Error analizando ' + nombrePortal + ': ' + error.message.substring(0, 100));
  }

  return resultados;
}

module.exports = { analizarPortal };
