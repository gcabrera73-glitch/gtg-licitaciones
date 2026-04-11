require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const GTG_SYSTEM_PROMPT = `Eres un analizador experto de licitaciones públicas para GTG, empresa de redes, telecomunicaciones y seguridad TI en CDMX.

PERFIL GTG - busca esto:
- Switches, routers, firewalls, WiFi, CCTV, videovigilancia
- Cableado estructurado, fibra óptica, infraestructura de red
- Mesa de ayuda, NOC, call center, soporte técnico
- Servicio administrado, mantenimiento de red, renovación tecnológica
- Marcas prioritarias: Huawei, Ruckus, H3C, Ivanti, Proactivanet
- Marcas secundarias (score Revisar): Cisco, Fortinet

SCORE:
- Alto: TI/redes + servicio administrado o mantenimiento alineado con GTG
- Medio: TI pero encaje parcial
- Revisar: Cisco/Fortinet o ambiguo relevante
- No relevante: sin relacion con TI o redes

Responde SOLO con JSON valido, sin markdown ni texto extra:
{"titulo":"texto","dependencia":"texto","tipo":"Servicio administrado|Mantenimiento|Compra de equipo|No determinado","score":"Alto|Medio|Revisar|No relevante","marcas":"texto o Ninguna","junta_aclaraciones":"fecha o No especificada","fecha_entrega":"fecha o No especificada","fallo":"fecha o No especificada","justificacion":"texto max 120 chars","total_relevantes":0}`;

async function fetchContenido(url) {
  try {
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      maxRedirects: 5,
    });
    let texto = String(response.data)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000);
    return texto;
  } catch (e) {
    return null;
  }
}

async function analizarPortal(url, nombrePortal) {
  try {
    const contenido = await fetchContenido(url);
    if (!contenido) return errorResult(url, nombrePortal, 'No se pudo acceder al portal');

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: GTG_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: 'Portal: ' + nombrePortal + '\nURL: ' + url + '\n\nCONTENIDO:\n' + contenido + '\n\nResponde solo con el JSON.'
        }]
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

    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Sin JSON en respuesta');

    const resultado = JSON.parse(match[0]);
    resultado.portal_url = url;
    resultado.portal_nombre = nombrePortal;
    resultado.hash = crypto.createHash('md5').update(url + (resultado.titulo || '')).digest('hex');
    return resultado;

  } catch (error) {
    console.error('Error analizando ' + nombrePortal + ':', error.message);
    return errorResult(url, nombrePortal, error.message.substring(0, 100));
  }
}

function errorResult(url, nombre, msg) {
  return {
    portal_url: url, portal_nombre: nombre,
    titulo: 'Error al analizar', dependencia: nombre,
    tipo: 'No determinado', score: 'Error', marcas: 'Ninguna',
    junta_aclaraciones: 'No especificada', fecha_entrega: 'No especificada',
    fallo: 'No especificada', justificacion: msg, total_relevantes: 0,
    hash: crypto.createHash('md5').update(url + Date.now().toString()).digest('hex')
  };
}

module.exports = { analizarPortal };
