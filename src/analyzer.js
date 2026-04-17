require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const HOY = new Date();
const AÑO_ACTUAL = HOY.getFullYear();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,application/pdf',
  'Accept-Language': 'es-MX,es;q=0.9',
};

const MESES = {
  'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
  'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12
};

function parsearFecha(texto) {
  if (!texto || texto === 'No especificada' || texto === 'N/A') return null;
  const m1 = texto.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:del?\s+)?(\d{4})/i);
  if (m1) {
    const mes = MESES[m1[2].toLowerCase()];
    if (mes) return new Date(parseInt(m1[3]), mes - 1, parseInt(m1[1]));
  }
  const m2 = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
  const m3 = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m3) return new Date(parseInt(m3[1]), parseInt(m3[2]) - 1, parseInt(m3[3]));
  return null;
}

function licitacionVencida(resultado) {
  const fallo = parsearFecha(resultado.fallo);
  const entrega = parsearFecha(resultado.fecha_entrega);
  const fechaRef = fallo || entrega;
  if (!fechaRef) return false;
  return fechaRef < HOY;
}

async function fetchContenido(url) {
  try {
    const response = await axios.get(url, {
      timeout: 25000, headers: HEADERS, maxRedirects: 5,
      responseType: 'arraybuffer'
    });
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('pdf')) {
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(response.data);
        return data.text.substring(0, 10000);
      } catch(e) { return null; }
    }

    const html = Buffer.from(response.data).toString('utf-8');
    const links = [];
    const linkRegex = /href=["']([^"']*\.pdf[^"']*)/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let pdfUrl = m[1];
      if (!pdfUrl.startsWith('http')) {
        try {
          const base = new URL(url);
          pdfUrl = pdfUrl.startsWith('/') ? base.origin + pdfUrl : base.origin + '/' + pdfUrl;
        } catch(e) {}
      }
      links.push(pdfUrl);
    }

    let texto = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 12000);

    if (links.length > 0) {
      texto += '\n\nPDFs en esta pagina: ' + links.slice(0, 5).join(', ');
    }
    return texto;
  } catch (e) {
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
  try { JSON.parse(s); return s; } catch(e) {
    s = s.replace(/[\u00C0-\u024F]/g, (c) => {
      const map = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n',
                   'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U','Ñ':'N'};
      return map[c] || c;
    });
    try { JSON.parse(s); return s; } catch(e2) {
      const m2 = s.match(/^(\{[\s\S]*\})/);
      if (!m2) return null;
      let t = m2[1];
      const lc = t.lastIndexOf(',"');
      if (lc > 0) {
        t = t.substring(0, lc) + '}';
        try { JSON.parse(t); return t; } catch(e3) { return null; }
      }
      return null;
    }
  }
}

async function llamarIA(prompt, maxTokens = 1000) {
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
Marcas prioritarias: Huawei, Ruckus, H3C, Ivanti, Proactivanet. Marcas secundarias (score Revisar): Cisco, Fortinet.
${criteriosExtra ? 'APRENDIZAJE - palabras con mayor relevancia: ' + criteriosExtra : ''}

REGLAS ESTRICTAS:
- Incluye SOLO licitaciones de 2026 — descarta cualquier cosa con /2025, /2024 o año anterior en el numero o titulo
- Si el numero de licitacion contiene "2025" o "2024" (ej: SESESP 02/2025, LPL 123/2025) = DESCARTAR
- Si el titulo dice "adjudicada", "fallo", "desierta", "cancelada" = DESCARTAR
- NO incluyas: limpieza, alimentos, uniformes, vehiculos, obras civiles, papeleria, medicamentos, seguros, combustible
- Solo incluye licitaciones que claramente sean de 2026 o cuyo año no sea visible

IMPORTANTE PARA url_detalle:
- Si la pagina tiene links a licitaciones individuales, usa esa URL
- Si la pagina es una tabla con documentos PDF por licitacion (como Sinaloa), usa el link del PDF de "RESUMEN DE CONVOCATORIA" o "JUNTA DE ACLARACIONES" como url_detalle
- Si no hay ninguna URL especifica, usa null

Portal: ${nombre}
URL: ${url}
Contenido:
${contenido}

Responde SOLO con JSON valido sin texto extra:
{
  "total_relevantes": 0,
  "licitaciones": [
    {
      "titulo": "titulo de la licitacion",
      "url_detalle": "url completa al detalle o PDF de convocatoria o null",
      "score_preliminar": "Alto|Medio|Revisar",
      "resumen": "descripcion max 100 chars"
    }
  ]
}
Si no hay relevantes: {"total_relevantes": 0, "licitaciones": []}`;

const PROMPT_DETALLE = (url, nombre, contenido) => `Analiza esta pagina de licitaciones para GTG (empresa de redes TI en Mexico).

Esta pagina puede tener UNA o VARIAS licitaciones. Extrae TODAS las relevantes para GTG.
GTG busca: telecomunicaciones, redes, WiFi, fibra optica, CCTV, switches, routers, firewalls, NOC, soporte tecnico, servicio administrado, mantenimiento TI.
NO es relevante: limpieza, alimentos, uniformes, vehiculos, obras civiles, papeleria, medicamentos.

Para cada licitacion extrae las fechas buscando estos patrones exactos:
- "Junta de aclaraciones" o "Aclaracion de bases" -> campo junta_aclaraciones
- "Acto de presentacion", "Apertura de proposiciones", "Entrega de propuestas" -> campo fecha_entrega  
- "Acto de fallo", "Comunicacion de fallo", "Fallo" -> campo fallo

Fecha de hoy: ${HOY.toLocaleDateString('es-MX')}.

Portal: ${nombre}
URL: ${url}
Contenido:
${contenido}

Responde SOLO con JSON valido sin texto extra:
{
  "licitaciones": [
    {
      "titulo": "titulo completo",
      "numero_licitacion": "numero o No especificado",
      "dependencia": "institucion",
      "tipo": "Servicio administrado|Mantenimiento|Compra de equipo|No determinado",
      "score": "Alto|Medio|Revisar|No relevante",
      "marcas": "marcas o Ninguna",
      "junta_aclaraciones": "fecha exacta o No especificada",
      "fecha_entrega": "fecha exacta o No especificada",
      "fallo": "fecha exacta o No especificada",
      "justificacion": "razon max 120 chars"
    }
  ]
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
      1500
    );

    const jsonIndice = limpiarJSON(respuestaIndice);
    if (!jsonIndice) {
      console.log('  Sin JSON en indice de ' + nombrePortal);
      return [];
    }

    const indice = JSON.parse(jsonIndice);
    const licitaciones = indice.licitaciones || [];

    if (licitaciones.length === 0) {
      console.log('  Sin relevantes en ' + nombrePortal);
      return [];
    }

    console.log('  ' + nombrePortal + ': ' + licitaciones.length + ' relevantes detectadas');

    const urlsUnicas = [...new Set(
      licitaciones
        .map(l => l.url_detalle)
        .filter(u => u && u !== 'null' && u.startsWith('http'))
    )];

    const licitacionesSinUrl = licitaciones.filter(
      l => !l.url_detalle || l.url_detalle === 'null' || !l.url_detalle.startsWith('http')
    );

    for (const urlDetalle of urlsUnicas) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const contenidoDetalle = await fetchContenido(urlDetalle);
        if (!contenidoDetalle) continue;

        const respuestaDetalle = await llamarIA(
          PROMPT_DETALLE(urlDetalle, nombrePortal, contenidoDetalle),
          1500
        );
        const jsonDetalle = limpiarJSON(respuestaDetalle);
        if (!jsonDetalle) continue;

        const detalle = JSON.parse(jsonDetalle);
        const lics = detalle.licitaciones || [detalle];

        for (const lic of lics) {
          if (!lic.titulo || lic.score === 'No relevante') continue;
          console.log('  Fechas extraidas - Fallo: ' + lic.fallo + ' | Entrega: ' + lic.fecha_entrega);
          if (licitacionVencida(lic)) {
            console.log('  Vencida: ' + (lic.titulo || '').substring(0, 50));
            continue;
          }
          lic.portal_url = urlDetalle;
          lic.portal_nombre = nombrePortal;
          lic.hash = crypto.createHash('md5')
            .update(urlDetalle + (lic.titulo || '') + (lic.numero_licitacion || ''))
            .digest('hex');
          resultados.push(lic);
        }
      } catch(e) {
        console.log('  Error en detalle: ' + e.message.substring(0, 60));
      }
    }

    for (const lic of licitacionesSinUrl) {
      resultados.push({
        titulo: lic.titulo,
        dependencia: nombrePortal,
        tipo: 'No determinado',
        score: lic.score_preliminar || 'Revisar',
        marcas: 'Ninguna',
        junta_aclaraciones: 'No especificada',
        fecha_entrega: 'No especificada',
        fallo: 'No especificada',
        justificacion: lic.resumen || 'Detectada en indice sin link de detalle',
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
