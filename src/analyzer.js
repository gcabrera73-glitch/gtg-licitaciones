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
        if (data.text && data.text.trim().length > 100) {
          return data.text.substring(0, 12000);
        }
        return null; // PDF escaneado sin texto
      } catch(e) { return null; }
    }

    // Leer DOCX
    if (url.endsWith('.docx') || contentType.includes('officedocument')) {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: Buffer.from(response.data) });
        if (result.value && result.value.trim().length > 50) {
          return result.value.substring(0, 12000);
        }
      } catch(e) {}
      return null;
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

async function leerURLconClaude(url) {
  // Usa la API de Claude con tool de web_search para leer el URL directamente
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Lee el contenido de esta URL y extrae SOLO las fechas importantes de la licitacion: ${url}

Busca: Junta de aclaraciones, Apertura de proposiciones/Entrega, Fallo.
Responde SOLO con JSON:
{"junta_aclaraciones":"fecha o No especificada","fecha_entrega":"fecha o No especificada","fallo":"fecha o No especificada","titulo":"titulo de la licitacion","vigente":true}`
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 45000
      }
    );

    let texto = '';
    for (const block of response.data.content || []) {
      if (block.type === 'text') texto += block.text;
    }
    const json = limpiarJSON(texto);
    if (json) return JSON.parse(json);
    return null;
  } catch(e) {
    return null;
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

REGLAS:
- Incluye licitaciones de 2026 y tambien de 2025 si no tienen fallo publicado
- Descarta SOLO si el numero contiene /2025 Y ya tiene acta de fallo publicada
- Descarta si el titulo dice "adjudicada", "desierta", "cancelada"
- NO incluyas: limpieza, alimentos, uniformes, vehiculos, obras civiles, papeleria, medicamentos, seguros, combustible

IMPORTANTE PARA url_detalle:
- Si hay links a licitaciones individuales, usa esa URL
- Si la pagina es tipo Sinaloa (tabla con columnas Junta/Apertura/Fallo), usa null — las fechas se determinan por presencia de documentos
- Si no hay URL especifica, usa null

PARA PORTALES TIPO SINALOA (tabla con documentos por columna):
- Si la licitacion tiene columna FALLO con documento = ya adjudicada, DESCARTAR
- Si la licitacion NO tiene FALLO pero tiene ACTA APERTURA = proceso cerrado, DESCARTAR  
- Si la licitacion solo tiene CONVOCATORIA sin actas = VIGENTE, incluir
- Extrae la descripcion completa de la licitacion como resumen

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
      "url_detalle": "url completa al PDF de convocatoria o pagina de detalle o null",
      "score_preliminar": "Alto|Medio|Revisar",
      "resumen": "descripcion max 100 chars"
    }
  ]
}
Si no hay relevantes: {"total_relevantes": 0, "licitaciones": []}`;

const PROMPT_DETALLE = (url, nombre, contenido) => `Analiza este contenido de licitacion publica para GTG (empresa de redes TI en Mexico).
Fecha de hoy: ${HOY.toLocaleDateString('es-MX')}.

Extrae las fechas buscando estos patrones:
- "Junta de aclaraciones" o "Aclaracion de bases" -> junta_aclaraciones
- "Acto de presentacion", "Apertura de proposiciones", "Entrega de propuestas" -> fecha_entrega
- "Acto de fallo", "Fallo" -> fallo
- Fechas en formato "DD de mes de YYYY" o "DD/MM/YYYY"

Portal: ${nombre}
URL: ${url}
Contenido:
${contenido}

Responde SOLO con JSON valido:
{
  "licitaciones": [
    {
      "titulo": "titulo completo",
      "numero_licitacion": "numero o No especificado",
      "dependencia": "institucion",
      "tipo": "Servicio administrado|Mantenimiento|Compra de equipo|No determinado",
      "score": "Alto|Medio|Revisar|No relevante",
      "marcas": "marcas o Ninguna",
      "junta_aclaraciones": "fecha exacta como aparece en el texto o No especificada",
      "fecha_entrega": "fecha exacta como aparece en el texto o No especificada",
      "fallo": "fecha exacta como aparece en el texto o No especificada",
      "justificacion": "razon max 120 chars"
    }
  ]
}`;


async function consultarComprasMX(keywords) {
  const resultados = [];
  try {
    const response = await axios.post(
      'https://upcp-cnetservicios.buengobierno.gob.mx/whitney/sitiopublico/expedientes?rows=100&page=1',
      {
        id_ley: null,
        id_tipo_procedimiento: null,
        id_tipo_contratacion: null,
        fecha_apertura_inicio: null,
        fecha_apertura_fin: null,
        fecha_publicacion_inicio: null,
        fecha_publicacion_fin: null,
        id_estatus: 1,
        id_proceso: 0,
        nombre_procedimiento: keywords,
        numero_procedimiento: null,
        id_entidad_federativa: [],
        id_tipo_dependencia: [],
        id_p_especifica: [],
        estatus_alterno: [],
        compra_consolidada: false,
        credito_externo: null,
        exclusivo_mipymes: null,
        id_caracter_procedimiento: null,
        id_forma_participacion: null,
        codigo_expediente: null,
        codigo_procedimiento: null
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://upcp-compranet.buengobierno.gob.mx',
          'Referer': 'https://upcp-compranet.buengobierno.gob.mx/'
        },
        timeout: 30000
      }
    );

    const data = response.data;
    const expedientes = data.data || data.expedientes || data.results || data || [];
    const lista = Array.isArray(expedientes) ? expedientes : [];

    for (const exp of lista) {
      const titulo = exp.nombre_procedimiento || exp.titulo || exp.descripcion || '';
      const numero = exp.numero_procedimiento || exp.codigo_procedimiento || '';
      const dependencia = exp.nombre_dependencia || exp.institucion || exp.unidad_compradora || '';
      const fechaApertura = exp.fecha_apertura_proposiciones || exp.fecha_apertura || '';
      const fechaFallo = exp.fecha_fallo || '';
      const fechaJunta = exp.fecha_junta_aclaraciones || '';
      const urlDetalle = exp.id_expediente ?
        'https://upcp-compranet.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/' + exp.id_expediente + '/procedimiento' :
        'https://upcp-compranet.buengobierno.gob.mx/sitiopublico/';

      resultados.push({
        titulo: titulo,
        dependencia: dependencia,
        tipo: 'No determinado',
        score: 'Revisar',
        marcas: 'Ninguna',
        junta_aclaraciones: fechaJunta || 'No especificada',
        fecha_entrega: fechaApertura || 'No especificada',
        fallo: fechaFallo || 'No especificada',
        justificacion: 'Licitacion vigente en ComprasMX: ' + keywords,
        numero_licitacion: numero,
        portal_url: urlDetalle,
        portal_nombre: 'ComprasMX Federal',
        hash: crypto.createHash('md5').update('comprasmx' + (numero || titulo)).digest('hex')
      });
    }
    console.log('  ComprasMX [' + keywords + ']: ' + resultados.length + ' resultados');
  } catch(e) {
    console.log('  Error ComprasMX: ' + e.message.substring(0, 80));
  }
  return resultados;
}

async function analizarPortal(url, nombrePortal, criteriosAprendizaje) {
  // Manejo especial para API de ComprasMX
  if (url.startsWith('COMPRASMX_API:')) {
    const keywords = url.replace('COMPRASMX_API:', '');
    const resultados = await consultarComprasMX(keywords);
    // Filtrar con IA para asignar score correcto
    const relevantes = [];
    for (const r of resultados) {
      const tituloLower = r.titulo.toLowerCase();
      const palabrasGTG = ['telecomunicacion','telecom','red ','redes','switch','router','firewall','wifi','cctv','videovigilancia','fibra optica','noc','mesa de ayuda','soporte tecnico','mantenimiento','infraestructura ti','computo','ciberseguridad','huawei','cisco','fortinet','ruckus'];
      const relevante = palabrasGTG.some(p => tituloLower.includes(p));
      if (relevante) {
        r.score = 'Medio';
        // Verificar si está vencida
        if (!licitacionVencida(r)) {
          relevantes.push(r);
        } else {
          console.log('  Vencida ComprasMX: ' + r.titulo.substring(0, 50));
        }
      }
    }
    console.log('  ' + nombrePortal + ': ' + relevantes.length + ' relevantes de ' + resultados.length);
    return relevantes;
  }

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
        let resultado = null;

        // Si es PDF, leer con Claude directamente
        if (urlDetalle.toLowerCase().endsWith('.pdf') || urlDetalle.toLowerCase().includes('.pdf')) {
          console.log('  Leyendo PDF con Claude: ' + urlDetalle.substring(0, 60));
          const datosClaudeURL = await leerURLconClaude(urlDetalle);
          if (datosClaudeURL) {
            resultado = {
              titulo: datosClaudeURL.titulo || licitaciones.find(l => l.url_detalle === urlDetalle)?.titulo || 'Sin titulo',
              dependencia: nombrePortal,
              tipo: 'No determinado',
              score: licitaciones.find(l => l.url_detalle === urlDetalle)?.score_preliminar || 'Medio',
              marcas: 'Ninguna',
              junta_aclaraciones: datosClaudeURL.junta_aclaraciones || 'No especificada',
              fecha_entrega: datosClaudeURL.fecha_entrega || 'No especificada',
              fallo: datosClaudeURL.fallo || 'No especificada',
              justificacion: licitaciones.find(l => l.url_detalle === urlDetalle)?.resumen || '',
              portal_url: urlDetalle,
            };
            console.log('  Fechas Claude - Fallo: ' + resultado.fallo + ' | Entrega: ' + resultado.fecha_entrega);
          }
        }

        // Si no es PDF o Claude no funcionó, usar fetch normal
        if (!resultado) {
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
            console.log('  Fechas fetch - Fallo: ' + lic.fallo + ' | Entrega: ' + lic.fecha_entrega);
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
          continue;
        }

        if (resultado) {
          if (licitacionVencida(resultado)) {
            console.log('  Vencida (PDF): ' + resultado.titulo.substring(0, 50));
          } else {
            resultado.portal_nombre = nombrePortal;
            resultado.hash = crypto.createHash('md5')
              .update(urlDetalle + (resultado.titulo || ''))
              .digest('hex');
            resultados.push(resultado);
          }
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
