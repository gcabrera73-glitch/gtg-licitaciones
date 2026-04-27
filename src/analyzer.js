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
          return data.text.substring(0, 40000);
        }
        return null;
      } catch(e) { return null; }
    }

    if (url.endsWith('.docx') || contentType.includes('officedocument')) {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: Buffer.from(response.data) });
        if (result.value && result.value.trim().length > 50) {
          return result.value.substring(0, 40000);
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
      .substring(0, 40000);

    if (links.length > 0) {
      const pdfsTI = links.filter(l => /firewall|nac|red|lan|wlan|centro.*datos|internet|telefonia|videoconfer|computo|cctv|seguridad/i.test(l));
      const pdfsTexto = pdfsTI.length > 0 ? pdfsTI : links.slice(0, 8);
      texto += '\n\nPDFs de convocatorias en esta pagina:\n' + pdfsTexto.join('\n');
    }
    return texto;
  } catch (e) {
    return null;
  }
}

async function leerURLconClaude(url) {
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

GTG busca: switches, routers, firewalls, WiFi, CCTV, videovigilancia, cableado estructurado, fibra optica, NOC, call center, mesa de ayuda, soporte tecnico, servicio administrado, mantenimiento de red, telecomunicaciones, infraestructura TI, computo, redes, internet, enlaces, videoconferencia, seguridad informatica, licencias software, servidores, centros de datos.
Marcas prioritarias: Huawei, Ruckus, H3C, Ivanti, Proactivanet. Marcas secundarias (score Revisar): Cisco, Fortinet, HP, Dell, Lenovo.
${criteriosExtra ? 'APRENDIZAJE - palabras con mayor relevancia: ' + criteriosExtra : ''}

REGLAS:
- Incluye licitaciones de 2026 y tambien de 2025 si no tienen fallo publicado
- Descarta SOLO si el numero contiene /2025 Y ya tiene acta de fallo publicada
- Descarta si el titulo dice "adjudicada", "desierta", "cancelada"
- NO incluyas: limpieza, alimentos, uniformes, vehiculos, obras civiles, papeleria, medicamentos, seguros, combustible

IMPORTANTE PARA url_detalle:
- Si hay links a licitaciones individuales, usa esa URL
- Si la pagina es tipo Sinaloa (tabla con columnas Junta/Apertura/Fallo), usa null
- Si no hay URL especifica, usa null

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

Extrae las fechas buscando CUALQUIERA de estos patrones:
- "Junta de aclaraciones" o "Aclaracion de bases" -> junta_aclaraciones
- "Acto de presentacion", "Apertura de proposiciones", "Entrega de propuestas" -> fecha_entrega
- "Acto de fallo", "Fallo", "Comunicacion de fallo" -> fallo
- "Vigencia: DD al DD de mes de YYYY" -> usa la fecha final como fecha_entrega
- "Fecha limite", "Fecha de cierre", "Fecha de recepcion" -> fecha_entrega
- Fechas en formato "DD de mes de YYYY", "DD/MM/YYYY", o "YYYY-MM-DD"

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
        id_ley: null, id_tipo_procedimiento: null, id_tipo_contratacion: null,
        fecha_apertura_inicio: null, fecha_apertura_fin: null,
        fecha_publicacion_inicio: null, fecha_publicacion_fin: null,
        id_estatus: 1, id_proceso: 0, nombre_procedimiento: keywords,
        numero_procedimiento: null, id_entidad_federativa: [], id_tipo_dependencia: [],
        id_p_especifica: [], estatus_alterno: [], compra_consolidada: false,
        credito_externo: null, exclusivo_mipymes: null, id_caracter_procedimiento: null,
        id_forma_participacion: null, codigo_expediente: null, codigo_procedimiento: null
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
    const lista = Array.isArray(data.data || data.expedientes || data.results || data) ? (data.data || data.expedientes || data.results || data) : [];
    for (const exp of lista) {
      const titulo = exp.nombre_procedimiento || exp.titulo || '';
      const numero = exp.numero_procedimiento || exp.codigo_procedimiento || '';
      const urlDetalle = exp.id_expediente ? 'https://upcp-compranet.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/' + exp.id_expediente + '/procedimiento' : 'https://upcp-compranet.buengobierno.gob.mx/sitiopublico/';
      resultados.push({
        titulo, dependencia: exp.nombre_dependencia || '', tipo: 'No determinado', score: 'Revisar', marcas: 'Ninguna',
        junta_aclaraciones: exp.fecha_junta_aclaraciones || 'No especificada',
        fecha_entrega: exp.fecha_apertura_proposiciones || 'No especificada',
        fallo: exp.fecha_fallo || 'No especificada',
        justificacion: 'Licitacion vigente en ComprasMX: ' + keywords,
        numero_licitacion: numero, portal_url: urlDetalle, portal_nombre: 'ComprasMX Federal',
        hash: crypto.createHash('md5').update('comprasmx' + (numero || titulo)).digest('hex')
      });
    }
    console.log('  ComprasMX [' + keywords + ']: ' + resultados.length + ' resultados');
  } catch(e) { console.log('  Error ComprasMX: ' + e.message.substring(0, 80)); }
  return resultados;
}

async function analizarSinaloa(url, nombrePortal, htmlContenido) {
  const resultados = [];
  const palabrasTI = [
    'telecomunicacion', 'internet dedicado', 'red de datos', 'redes de computo',
    'infraestructura de red', 'computo y comunicaciones', 'tecnologias de informacion',
    'firewall', 'switch ', 'router', 'wi-fi', 'wifi', 'cctv', 'videovigilancia',
    'fibra optica', 'noc ', 'mesa de servicio', 'mesa de ayuda',
    'soporte tecnico', 'mantenimiento de equipo de computo',
    'mantenimiento de red', 'licenciamiento', 'licencias de software',
    'sistema de videovigilancia', 'equipo de radiocomunicacion',
    'enlaces de datos', 'servicio de conectividad', 'seguridad informatica'
  ];
  try {
    const response = await axios.get(url, { timeout: 25000, headers: HEADERS, maxRedirects: 5, responseType: 'arraybuffer' });
    const html = Buffer.from(response.data).toString('utf-8');
    const filas = html.split('<tr').slice(1);
    for (const fila of filas) {
      const filaLower = fila.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const esTI = palabrasTI.some(p => new RegExp(p, 'i').test(filaLower));
      if (!esTI) continue;
      if (fila.toLowerCase().includes('acta de fallo') || fila.toLowerCase().includes('acta_de_fallo')) continue;
      const tieneAñoViejo = /\/202[0-4]|-202[0-4]|_202[0-4]/.test(fila);
      if (tieneAñoViejo) continue;
      const tituloMatch = fila.match(/<td[^>]*>([^<]{20,200})<\/td>/);
      const titulo = tituloMatch ? tituloMatch[1].trim() : 'Licitacion Sinaloa';
      const resumenMatch = fila.match(/resumen[^<]*<\/a>/i);
      let urlDetalle = null;
      if (resumenMatch) {
        const hrefMatch = fila.match(/href=["']([^"']*\.docx[^"']*)/i);
        if (hrefMatch) urlDetalle = hrefMatch[1].startsWith('http') ? hrefMatch[1] : 'https://compranet.sinaloa.gob.mx' + hrefMatch[1];
      }
      if (!urlDetalle) {
        const convMatch = fila.match(/convocatoria[^<]*href=["']([^"']*\.docx)/i) || fila.match(/href=["']([^"']*\.docx)[^"']*"[^>]*>\s*(?:convocatoria|resumen)/i);
        if (convMatch) urlDetalle = convMatch[1].startsWith('http') ? convMatch[1] : 'https://compranet.sinaloa.gob.mx' + convMatch[1];
      }
      console.log('  Sinaloa TI vigente: ' + titulo.substring(0, 60));
      if (urlDetalle) {
        await new Promise(r => setTimeout(r, 2000));
        const contenidoDoc = await fetchContenido(urlDetalle);
        if (contenidoDoc && contenidoDoc.length > 100) {
          const respFechas = await llamarIA(PROMPT_DETALLE(urlDetalle, nombrePortal, contenidoDoc), 700);
          const jsonFechas = limpiarJSON(respFechas);
          if (jsonFechas) {
            const detalle = JSON.parse(jsonFechas);
            const lics = detalle.licitaciones || [detalle];
            for (const lic of lics) {
              if (!lic.titulo || lic.score === 'No relevante') continue;
              if (licitacionVencida(lic)) { console.log('  Vencida Sinaloa: ' + (lic.titulo||'').substring(0,50)); continue; }
              lic.portal_url = urlDetalle; lic.portal_nombre = nombrePortal;
              lic.hash = crypto.createHash('md5').update(url + titulo).digest('hex');
              resultados.push(lic);
            }
            continue;
          }
        }
      }
      resultados.push({ titulo, dependencia: nombrePortal, tipo: 'No determinado', score: 'Medio', marcas: 'Ninguna', junta_aclaraciones: 'No especificada', fecha_entrega: 'No especificada', fallo: 'No especificada', justificacion: 'Licitacion TI vigente en Sinaloa', portal_url: url, portal_nombre: nombrePortal, hash: crypto.createHash('md5').update(url + titulo).digest('hex') });
    }
    console.log('  ' + nombrePortal + ': ' + resultados.length + ' relevantes vigentes');
  } catch(e) { console.log('  Error Sinaloa: ' + e.message.substring(0, 80)); }
  return resultados;
}

async function analizarCIBNOR(url, nombrePortal) {
  const resultados = [];
  try {
    const response = await axios.get(url, { timeout: 25000, headers: HEADERS, maxRedirects: 5, responseType: 'arraybuffer' });
    const html = Buffer.from(response.data).toString('utf-8');
    const linkRegex = /href=["']([^"']*\/files\/admon\/convocatorias\/[^"']*\.pdf[^"']*)/gi;
    const links = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let pdfUrl = m[1];
      if (!pdfUrl.startsWith('http')) pdfUrl = 'https://cibnor.mx' + pdfUrl;
      links.push(pdfUrl);
    }
    const links2026 = [...new Set(links.filter(l => l.includes('2026') || l.includes('-26_') || l.includes('-26.') || l.includes('_26_') || /-N-\d{2}-26/i.test(l)))];
    console.log('  CIBNOR PDFs 2026 encontrados: ' + links2026.length);
    for (const pdfUrl of links2026) {
      await new Promise(r => setTimeout(r, 12000));
      try {
        const contenidoPDF = await fetchContenido(pdfUrl);
        if (!contenidoPDF || contenidoPDF.length < 100) continue;
        const respFechas = await llamarIA(PROMPT_DETALLE(pdfUrl, nombrePortal, contenidoPDF), 700);
        const jsonFechas = limpiarJSON(respFechas);
        if (!jsonFechas) continue;
        const detalle = JSON.parse(jsonFechas);
        const lics = detalle.licitaciones || [detalle];
        for (const lic of lics) {
          if (!lic.titulo || lic.score === 'No relevante') continue;
          console.log('  CIBNOR Fechas - Fallo: ' + lic.fallo + ' | Entrega: ' + lic.fecha_entrega);
          if (licitacionVencida(lic)) { console.log('  Vencida CIBNOR: ' + (lic.titulo||'').substring(0, 50)); continue; }
          lic.portal_url = pdfUrl; lic.portal_nombre = nombrePortal;
          lic.hash = crypto.createHash('md5').update(pdfUrl + (lic.titulo||'')).digest('hex');
          resultados.push(lic);
        }
      } catch(e) { console.log('  Error CIBNOR PDF: ' + e.message.substring(0, 60)); }
    }
    console.log('  ' + nombrePortal + ': ' + resultados.length + ' relevantes vigentes');
  } catch(e) { console.log('  Error CIBNOR: ' + e.message.substring(0, 80)); }
  return resultados;
}

async function analizarPuebla(url, nombrePortal) {
  const resultados = [];
  try {
    const response = await axios.get(url, { timeout: 25000, headers: HEADERS, maxRedirects: 5, responseType: 'arraybuffer' });
    const html = Buffer.from(response.data).toString('utf-8');
    const linkRegex = /href=["']([^"']*\/images\/[^"']*\.pdf[^"']*)/gi;
    const todosLinks = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let pdfUrl = m[1];
      if (!pdfUrl.startsWith('http')) pdfUrl = 'https://licitaciones.puebla.gob.mx' + pdfUrl;
      todosLinks.push(pdfUrl);
    }
    const palabrasTI = /tecnolog|tic_|_tic|computo|telecomunicac|internet|red_lan|redes|firewall|switch|router|wifi|cctv|videovigilancia|fibra|soporte_tecnico|soporte_empresarial|infraestructura.*red|licencias|software|servidor|seguridad.*informatica|satelital|equipos_menores/i;
    const pdfsTI = todosLinks.filter(l => palabrasTI.test(l) && l.includes('2026'));
    console.log('  Puebla PDFs TI encontrados: ' + pdfsTI.length + ' de ' + todosLinks.length + ' totales');
    for (const pdfUrl of pdfsTI) {
      await new Promise(r => setTimeout(r, 8000));
      try {
        const contenidoPDF = await fetchContenido(pdfUrl);
        if (!contenidoPDF || contenidoPDF.length < 100) continue;
        const respFechas = await llamarIA(PROMPT_DETALLE(pdfUrl, nombrePortal, contenidoPDF), 700);
        const jsonFechas = limpiarJSON(respFechas);
        if (!jsonFechas) continue;
        const detalle = JSON.parse(jsonFechas);
        const lics = detalle.licitaciones || [detalle];
        for (const lic of lics) {
          if (!lic.titulo || lic.score === 'No relevante') continue;
          console.log('  Puebla Fechas - Fallo: ' + lic.fallo + ' | Entrega: ' + lic.fecha_entrega);
          lic.portal_url = pdfUrl; lic.portal_nombre = nombrePortal;
          lic.hash = crypto.createHash('md5').update(pdfUrl + (lic.titulo || '')).digest('hex');
          if (licitacionVencida(lic)) { console.log('  Vencida Puebla: ' + (lic.titulo || '').substring(0, 50)); lic.score = 'Vencida'; }
          resultados.push(lic);
        }
      } catch(e) { console.log('  Error Puebla PDF: ' + e.message.substring(0, 60)); }
    }
    console.log('  ' + nombrePortal + ': ' + resultados.filter(r => r.score !== 'Vencida').length + ' relevantes vigentes de ' + resultados.length);
  } catch(e) { console.log('  Error Puebla: ' + e.message.substring(0, 80)); }
  return resultados.filter(r => r.score !== 'Vencida');
}

async function analizarCDMX(url, nombrePortal) {
  const resultados = [];
  try {
    const response = await axios.get(url, { timeout: 25000, headers: HEADERS, maxRedirects: 5, responseType: 'arraybuffer' });
    const html = Buffer.from(response.data).toString('utf-8');
    const bloques = html.split('<h5>').slice(1);
    const palabrasTI = /tecnolog|computo|telecomunicac|internet|red |redes|firewall|switch|router|wifi|cctv|videovigilancia|fibra|noc|soporte.tecnico|infraestructura.*red|licencias|software|servidor|seguridad.informatica|satelital|c5|comando.*control|comunicaciones.*ciudadano/i;
    for (const bloque of bloques) {
      const tituloMatch = bloque.match(/^([^<]+)/);
      if (!tituloMatch) continue;
      const titulo = tituloMatch[1].trim();
      if (!palabrasTI.test(titulo)) continue;
      const fechaMatch = bloque.match(/Presentaci[oó]n de propuestas[\s\S]*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/i);
      const fechaPropuesta = fechaMatch ? fechaMatch[1] : 'No especificada';
      const convMatch = bloque.match(/Entidad convocante[\s\S]*?<[^>]+>\s*([^<]{5,100})\s*</i);
      const convocante = convMatch ? convMatch[1].trim() : nombrePortal;
      const urlMatch = bloque.match(/href=["']([^"']*detalle_convocatoria[^"']*)/i);
      const urlDetalle = urlMatch ? 'https://concursodigital.finanzas.cdmx.gob.mx' + urlMatch[1] : url;
      const fechaObj = fechaPropuesta !== 'No especificada' ? new Date(fechaPropuesta) : null;
      if (fechaObj && fechaObj < HOY) { console.log('  Vencida CDMX: ' + titulo.substring(0, 60)); continue; }
      console.log('  CDMX TI vigente: ' + titulo.substring(0, 60));
      console.log('  Fechas CDMX - Propuestas: ' + fechaPropuesta);
      resultados.push({
        titulo, dependencia: convocante, tipo: 'No determinado', score: 'Medio', marcas: 'Ninguna',
        junta_aclaraciones: 'No especificada', fecha_entrega: fechaPropuesta, fallo: 'No especificada',
        justificacion: 'Licitacion TI vigente en Concurso Digital CDMX',
        numero_licitacion: 'No especificado', portal_url: urlDetalle, portal_nombre: nombrePortal,
        hash: crypto.createHash('md5').update(urlDetalle + titulo).digest('hex')
      });
    }
    console.log('  ' + nombrePortal + ': ' + resultados.length + ' relevantes vigentes');
  } catch(e) { console.log('  Error CDMX: ' + e.message.substring(0, 80)); }
  return resultados;
}


async function analizarDurango(url, nombrePortal) {
  const resultados = [];
  try {
    // Leer índice de procedimientos
    const response = await axios.get(url, { timeout: 25000, headers: HEADERS, maxRedirects: 5, responseType: 'arraybuffer' });
    const html = Buffer.from(response.data).toString('utf-8');

    // Extraer IDs de licitaciones del índice — patrón /ProcedimientosDeContratacion/NNNN
    const idRegex = /ProcedimientosDeContratacion\/(d+)/g;
    const ids = [];
    let m;
    while ((m = idRegex.exec(html)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }

    const palabrasTI = /tecnolog|computo|telecomunicac|internet|red |redes|firewall|switch|router|wifi|cctv|videovigilancia|fibra|noc|soporte.tecnico|infraestructura.*red|licencias|software|servidor|seguridad.informatica|satelital|c5|comunicaciones|conectividad/i;

    console.log('  Durango procedimientos encontrados: ' + ids.length);

    for (const id of ids) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const detUrl = 'https://comprasestatal.durango.gob.mx/consulta/ProcedimientosDeContratacion/' + id;
        const detResp = await axios.get(detUrl, { timeout: 20000, headers: HEADERS, responseType: 'arraybuffer' });
        const detHtml = Buffer.from(detResp.data).toString('utf-8');

        // Extraer descripción
        const descMatch = detHtml.match(/Descripci[oó]n:[\s\S]*?<\/dt>[\s\S]*?<dd[^>]*>\s*([^<]{10,300})\s*<\/dd>/i);
        const titulo = descMatch ? descMatch[1].trim() : '';
        if (!titulo || !palabrasTI.test(titulo)) continue;

        // Extraer fechas directamente del HTML
        const juntaMatch = detHtml.match(/Junta de[\s\S]*?Aclaraciones:[\s\S]*?<dd[^>]*>\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/i);
        const aperturaMatch = detHtml.match(/Apertura de[\s\S]*?Proposiciones:[\s\S]*?<dd[^>]*>\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/i);
        const falloMatch = detHtml.match(/Evento de[\s\S]*?Fallo:[\s\S]*?<dd[^>]*>\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/i);
        const depMatch = detHtml.match(/Unidad Compradora:[\s\S]*?<\/dt>[\s\S]*?<dd[^>]*>[\s\S]*?-\s*([^<]{5,100})<\/dd>/i);

        const junta = juntaMatch ? juntaMatch[1] : 'No especificada';
        const apertura = aperturaMatch ? aperturaMatch[1] : 'No especificada';
        const fallo = falloMatch ? falloMatch[1] : 'No especificada';
        const dependencia = depMatch ? depMatch[1].trim() : nombrePortal;

        // Verificar si está vencida
        const fechaRef = parsearFecha(fallo) || parsearFecha(apertura);
        if (fechaRef && fechaRef < HOY) {
          console.log('  Vencida Durango: ' + titulo.substring(0, 60));
          continue;
        }

        console.log('  Durango TI vigente: ' + titulo.substring(0, 60));
        console.log('  Fechas Durango - Fallo: ' + fallo + ' | Apertura: ' + apertura);

        resultados.push({
          titulo, dependencia, tipo: 'No determinado', score: 'Medio', marcas: 'Ninguna',
          junta_aclaraciones: junta, fecha_entrega: apertura, fallo,
          justificacion: 'Licitacion TI vigente en Durango',
          numero_licitacion: 'No especificado', portal_url: detUrl, portal_nombre: nombrePortal,
          hash: crypto.createHash('md5').update(detUrl + titulo).digest('hex')
        });
      } catch(e) {}
    }
    console.log('  ' + nombrePortal + ': ' + resultados.length + ' relevantes vigentes');
  } catch(e) { console.log('  Error Durango: ' + e.message.substring(0, 80)); }
  return resultados;
}

async function analizarGuadalajara(url, nombrePortal) {
  const resultados = [];
  try {
    const response = await axios.get(url, { timeout: 25000, headers: HEADERS, maxRedirects: 5, responseType: 'arraybuffer' });
    const html = Buffer.from(response.data).toString('utf-8');

    const palabrasTI = /tecnolog|computo|telecomunicac|internet|red |redes|firewall|switch|router|wifi|cctv|videovigilancia|fibra|noc|soporte|software|servidor|seguridad|satelital|c5|conectividad|repetidores|plataforma|audiovisual|monitoreo|infraestructura/i;

    // Dividir por filas de tabla
    const filas = html.split('<tr').slice(1);
    const licitacionesTI = [];

    for (const fila of filas) {
      const textoFila = fila.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!palabrasTI.test(textoFila)) continue;
      if (textoFila.length < 20) continue;

      // Extraer título (texto más largo sin tags)
      const tituloMatch = textoFila.match(/LICITACI[ÓO]N[^"]{20,300}/i) || textoFila.match(/ENAJENACI[ÓO]N[^"]{20,200}/i);
      if (!tituloMatch) continue;
      const titulo = tituloMatch[0].trim().substring(0, 250);

      // Extraer link al PDF de convocatoria en esa fila
      const pdfMatch = fila.match(/href=["']([^"']*\/sites\/default\/files\/uploads\/[^"']*\.pdf[^"']*)/i);
      const pdfUrl = pdfMatch ? ('https://transparencia.guadalajara.gob.mx' + pdfMatch[1]) : null;

      if (!pdfUrl) continue;
      if (licitacionesTI.some(l => l.pdfUrl === pdfUrl)) continue; // deduplicar

      licitacionesTI.push({ titulo, pdfUrl });
    }

    console.log('  Guadalajara licitaciones TI encontradas: ' + licitacionesTI.length);

    for (const { titulo, pdfUrl } of licitacionesTI) {
      await new Promise(r => setTimeout(r, 8000));
      try {
        const contenidoPDF = await fetchContenido(pdfUrl);
        
        // Si el PDF tiene texto, extraer fechas
        if (contenidoPDF && contenidoPDF.length > 100) {
          const respFechas = await llamarIA(PROMPT_DETALLE(pdfUrl, nombrePortal, contenidoPDF), 700);
          const jsonFechas = limpiarJSON(respFechas);
          if (jsonFechas) {
            const detalle = JSON.parse(jsonFechas);
            const lics = detalle.licitaciones || [detalle];
            for (const lic of lics) {
              if (!lic.titulo || lic.score === 'No relevante') continue;
              console.log('  Guadalajara Fechas - Fallo: ' + lic.fallo + ' | Entrega: ' + lic.fecha_entrega);
              lic.portal_url = pdfUrl; lic.portal_nombre = nombrePortal;
              lic.hash = crypto.createHash('md5').update(pdfUrl + titulo).digest('hex');
              if (licitacionVencida(lic)) { console.log('  Vencida Guadalajara: ' + titulo.substring(0, 50)); continue; }
              if (lic.score === 'Revisar') lic.score = 'Medio';
              resultados.push(lic);
            }
            continue;
          }
        }

        // PDF escaneado o sin texto — agregar sin fechas con score Medio
        console.log('  Guadalajara sin fechas (PDF escaneado): ' + titulo.substring(0, 60));
        resultados.push({
          titulo, dependencia: nombrePortal, tipo: 'No determinado', score: 'Medio', marcas: 'Ninguna',
          junta_aclaraciones: 'No especificada', fecha_entrega: 'No especificada', fallo: 'No especificada',
          justificacion: 'Licitacion TI vigente en Guadalajara - verificar fechas manualmente',
          numero_licitacion: 'No especificado', portal_url: pdfUrl, portal_nombre: nombrePortal,
          hash: crypto.createHash('md5').update(pdfUrl + titulo).digest('hex')
        });
      } catch(e) { console.log('  Error Guadalajara PDF: ' + e.message.substring(0, 60)); }
    }
    console.log('  ' + nombrePortal + ': ' + resultados.length + ' relevantes vigentes');
  } catch(e) { console.log('  Error Guadalajara: ' + e.message.substring(0, 80)); }
  return resultados;
}
async function analizarPortal(url, nombrePortal, criteriosAprendizaje) {
  if (url.startsWith('COMPRASMX_API:')) {
    const keywords = url.replace('COMPRASMX_API:', '');
    const resultados = await consultarComprasMX(keywords);
    const relevantes = [];
    for (const r of resultados) {
      const tituloLower = r.titulo.toLowerCase();
      const palabrasGTG = ['telecomunicacion','telecom','red ','redes','switch','router','firewall','wifi','cctv','videovigilancia','fibra optica','noc','mesa de ayuda','soporte tecnico','mantenimiento','infraestructura ti','computo','ciberseguridad','huawei','cisco','fortinet','ruckus'];
      const relevante = palabrasGTG.some(p => tituloLower.includes(p));
      if (relevante) {
        r.score = 'Medio';
        if (!licitacionVencida(r)) relevantes.push(r);
        else console.log('  Vencida ComprasMX: ' + r.titulo.substring(0, 50));
      }
    }
    console.log('  ' + nombrePortal + ': ' + relevantes.length + ' relevantes de ' + resultados.length);
    return relevantes;
  }

  const resultados = [];
  try {
    const contenidoIndice = await fetchContenido(url);
    if (!contenidoIndice) { console.log('  No se pudo acceder a ' + nombrePortal); return []; }

    if (url.includes('compranet.sinaloa.gob.mx')) return await analizarSinaloa(url, nombrePortal, contenidoIndice);
    if (url.includes('cibnor.mx')) return await analizarCIBNOR(url, nombrePortal);
    if (url.includes('licitaciones.puebla.gob.mx')) return await analizarPuebla(url, nombrePortal);
    if (url.includes('concursodigital.finanzas.cdmx.gob.mx')) return await analizarCDMX(url, nombrePortal);
    if (url.includes('comprasestatal.durango.gob.mx')) return await analizarDurango(url, nombrePortal);
    if (url.includes('transparencia.guadalajara.gob.mx')) return await analizarGuadalajara(url, nombrePortal);

    const respuestaIndice = await llamarIA(PROMPT_INDICE(url, nombrePortal, contenidoIndice, criteriosAprendizaje), 1500);
    const jsonIndice = limpiarJSON(respuestaIndice);
    if (!jsonIndice) { console.log('  Sin JSON en indice de ' + nombrePortal); return []; }

    const indice = JSON.parse(jsonIndice);
    const AÑO_MIN = 2025;
    const licitaciones = (indice.licitaciones || []).filter(lic => {
      const texto = (lic.titulo || '') + (lic.resumen || '');
      const añoMatch = texto.match(/[\/\-_](20\d{2})[^\d]/);
      if (añoMatch) {
        const año = parseInt(añoMatch[1]);
        if (año < AÑO_MIN) { console.log('  Descartada por año ' + año + ': ' + texto.substring(0, 50)); return false; }
      }
      return true;
    });

    if (licitaciones.length === 0) { console.log('  Sin relevantes en ' + nombrePortal); return []; }
    console.log('  ' + nombrePortal + ': ' + licitaciones.length + ' relevantes detectadas');

    const urlsUnicas = [...new Set(licitaciones.map(l => l.url_detalle).filter(u => u && u !== 'null' && u.startsWith('http')))];
    const licitacionesSinUrl = licitaciones.filter(l => !l.url_detalle || l.url_detalle === 'null' || !l.url_detalle.startsWith('http'));

    for (const urlDetalle of urlsUnicas) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        let resultado = null;
        if (urlDetalle.toLowerCase().includes('.pdf')) {
          console.log('  Leyendo PDF con Claude: ' + urlDetalle.substring(0, 60));
          const datosClaudeURL = await leerURLconClaude(urlDetalle);
          if (datosClaudeURL) {
            resultado = {
              titulo: datosClaudeURL.titulo || licitaciones.find(l => l.url_detalle === urlDetalle)?.titulo || 'Sin titulo',
              dependencia: nombrePortal, tipo: 'No determinado',
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
        if (!resultado) {
          const contenidoDetalle = await fetchContenido(urlDetalle);
          if (!contenidoDetalle) continue;
          const respuestaDetalle = await llamarIA(PROMPT_DETALLE(urlDetalle, nombrePortal, contenidoDetalle), 1500);
          const jsonDetalle = limpiarJSON(respuestaDetalle);
          if (!jsonDetalle) continue;
          const detalle = JSON.parse(jsonDetalle);
          const lics = detalle.licitaciones || [detalle];
          for (const lic of lics) {
            if (!lic.titulo || lic.score === 'No relevante') continue;
            console.log('  Fechas fetch - Fallo: ' + lic.fallo + ' | Entrega: ' + lic.fecha_entrega);
            lic.portal_url = urlDetalle; lic.portal_nombre = nombrePortal;
            lic.hash = crypto.createHash('md5').update(urlDetalle + (lic.titulo || '') + (lic.numero_licitacion || '')).digest('hex');
            if (licitacionVencida(lic)) { console.log('  Vencida: ' + (lic.titulo || '').substring(0, 50)); lic.score = 'Vencida'; }
            resultados.push(lic);
          }
          continue;
        }
        if (resultado) {
          if (licitacionVencida(resultado)) { console.log('  Vencida (PDF): ' + resultado.titulo.substring(0, 50)); }
          else {
            resultado.portal_nombre = nombrePortal;
            resultado.hash = crypto.createHash('md5').update(urlDetalle + (resultado.titulo || '')).digest('hex');
            resultados.push(resultado);
          }
        }
      } catch(e) { console.log('  Error en detalle: ' + e.message.substring(0, 60)); }
    }

    for (const lic of licitacionesSinUrl) {
      resultados.push({ titulo: lic.titulo, dependencia: nombrePortal, tipo: 'No determinado', score: lic.score_preliminar || 'Revisar', marcas: 'Ninguna', junta_aclaraciones: 'No especificada', fecha_entrega: 'No especificada', fallo: 'No especificada', justificacion: lic.resumen || 'Detectada en indice sin link de detalle', numero_licitacion: 'No especificado', portal_url: url, portal_nombre: nombrePortal, hash: crypto.createHash('md5').update(url + (lic.titulo || '') + Date.now().toString()).digest('hex') });
    }
  } catch (error) { console.error('Error analizando ' + nombrePortal + ': ' + error.message.substring(0, 100)); }

  return resultados;
}

module.exports = { analizarPortal };
