require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const GTG_SYSTEM_PROMPT = `Eres un analizador experto de licitaciones públicas para GTG, empresa especializada en redes, telecomunicaciones y seguridad TI con sede en CDMX.

PERFIL GTG:
- Switches, routers, firewalls, WiFi indoor/outdoor, CCTV, videovigilancia
- Cableado estructurado, fibra óptica, infraestructura de red
- Mesa de ayuda, NOC, call center, soporte técnico
- Modelos: Servicio Administrado (pago mensual con equipo + ingeniería) y Mantenimiento (sin cambio de equipo)
- Marcas prioritarias: Huawei, Ruckus, H3C, Ivanti, Proactivanet
- Marcas secundarias (no vende pero revisa): Cisco, Fortinet
- Cobertura: todo México, cualquier dependencia

PALABRAS CLAVE POSITIVAS:
switch, router, firewall, wifi, wireless, access point, punto de acceso, red inalámbrica, CCTV, videovigilancia, cámaras de seguridad, cableado estructurado, fibra óptica, infraestructura de red, telecomunicaciones, seguridad perimetral, NOC, centro de monitoreo, call center, mesa de ayuda, help desk, soporte técnico, mantenimiento correctivo, mantenimiento preventivo, servicio administrado, arrendamiento de equipo, contrato plurianual, renovación tecnológica, sustitución de infraestructura, gestión de activos TI, radiocomunicación, repetidores, conectividad

CRITERIOS DE SCORE:
- "Alto": TI/redes + modelo servicio administrado o mantenimiento + tecnología alineada con GTG
- "Medio": claramente TI pero encaje parcial con modelos GTG
- "Revisar": aparece Cisco/Fortinet o objeto ambiguo pero potencialmente relevante
- "No relevante": sin relación con TI, redes o telecomunicaciones

INSTRUCCIONES:
1. Analiza el contenido del portal
2. Identifica SOLO convocatorias VIGENTES (no fallos, no licitaciones pasadas)
3. Si hay múltiples licitaciones relevantes, reporta la más importante e indica cuántas hay en total
4. Si no hay licitaciones vigentes relevantes, reporta score "No relevante"

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "titulo": "Objeto de la licitación más relevante (máx 100 chars)",
  "dependencia": "Institución convocante",
  "tipo": "Servicio administrado | Mantenimiento | Compra de equipo | No determinado",
  "score": "Alto | Medio | Revisar | No relevante",
  "marcas": "Marcas detectadas separadas por coma, o 'Ninguna'",
  "junta_aclaraciones": "Fecha o 'No especificada'",
  "fecha_entrega": "Fecha o 'No especificada'",
  "fallo": "Fecha o 'No especificada'",
  "justificacion": "Razón del score en máx 150 chars",
  "total_relevantes": 0
}`;

async function analizarPortal(url, nombrePortal) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: GTG_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Analiza este portal de licitaciones y extrae las convocatorias vigentes relevantes para GTG.\n\nPortal: ${nombrePortal}\nURL: ${url}\n\nVisita la URL y analiza su contenido. Responde solo con el JSON solicitado.`
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        timeout: 60000
      }
    );

    let textoRespuesta = '';
    for (const block of response.data.content || []) {
      if (block.type === 'text') textoRespuesta += block.text;
    }

    const jsonMatch = textoRespuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Respuesta sin JSON válido');

    const resultado = JSON.parse(jsonMatch[0]);
    resultado.portal_url = url;
    resultado.portal_nombre = nombrePortal;
    resultado.hash = crypto.createHash('md5').update(url + resultado.titulo).digest('hex');
    return resultado;

  } catch (error) {
    console.error(`Error analizando ${url}:`, error.message);
    return {
      portal_url: url,
      portal_nombre: nombrePortal,
      titulo: 'Error al analizar',
      dependencia: nombrePortal,
      tipo: 'No determinado',
      score: 'Error',
      marcas: 'Ninguna',
      junta_aclaraciones: 'No especificada',
      fecha_entrega: 'No especificada',
      fallo: 'No especificada',
      justificacion: `Error: ${error.message.substring(0, 100)}`,
      total_relevantes: 0,
      hash: crypto.createHash('md5').update(url + Date.now()).digest('hex')
    };
  }
}

module.exports = { analizarPortal };
