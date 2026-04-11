require('dotenv').config();
const nodemailer = require('nodemailer');

function scoreColor(score) {
  const map = {
    'Alto': '#27500A', 'Medio': '#633806',
    'Revisar': '#0C447C', 'No relevante': '#791F1F'
  };
  return map[score] || '#444';
}

function scoreBg(score) {
  const map = {
    'Alto': '#EAF3DE', 'Medio': '#FAEEDA',
    'Revisar': '#E6F1FB', 'No relevante': '#FCEBEB'
  };
  return map[score] || '#f5f5f5';
}

function tipoBg(tipo) {
  const map = {
    'Servicio administrado': '#EEEDFE',
    'Mantenimiento': '#FAEEDA',
    'Compra de equipo': '#E1F5EE'
  };
  return map[tipo] || '#f5f5f5';
}

function tipoColor(tipo) {
  const map = {
    'Servicio administrado': '#3C3489',
    'Mantenimiento': '#633806',
    'Compra de equipo': '#085041'
  };
  return map[tipo] || '#444';
}

function generarHTML(licitaciones) {
  const fecha = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const altas = licitaciones.filter(l => l.score === 'Alto');
  const medias = licitaciones.filter(l => l.score === 'Medio');
  const revisar = licitaciones.filter(l => l.score === 'Revisar');

  const tarjetas = licitaciones.map(l => `
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <div style="flex:1;">
          <div style="font-size:13px;color:#888;margin-bottom:2px;">${l.portal_nombre}</div>
          <div style="font-size:15px;font-weight:500;color:#1a1a1a;">${l.titulo}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span style="background:${scoreBg(l.score)};color:${scoreColor(l.score)};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:500;">${l.score}</span>
          <span style="background:${tipoBg(l.tipo)};color:${tipoColor(l.tipo)};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:500;">${l.tipo}</span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="color:#888;padding:3px 0;width:40%;">Dependencia</td>
          <td style="color:#1a1a1a;font-weight:500;">${l.dependencia}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:3px 0;">Marcas detectadas</td>
          <td style="color:#1a1a1a;font-weight:500;">${l.marcas}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:3px 0;">Junta de aclaraciones</td>
          <td style="color:#1a1a1a;font-weight:500;">${l.junta_aclaraciones}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:3px 0;">Entrega de propuestas</td>
          <td style="color:#1a1a1a;font-weight:500;">${l.fecha_entrega}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:3px 0;">Fallo</td>
          <td style="color:#1a1a1a;font-weight:500;">${l.fallo}</td>
        </tr>
      </table>
      <div style="margin-top:8px;padding:8px;background:#f8f8f8;border-radius:4px;font-size:12px;color:#555;">${l.justificacion}</div>
      <div style="margin-top:8px;">
        <a href="${l.portal_url}" style="font-size:12px;color:#185FA5;">Ver licitación →</a>
      </div>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;background:#f5f5f5;">
  <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <div style="width:40px;height:40px;background:#E6F1FB;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:14px;color:#0C447C;">GT</div>
      <div>
        <div style="font-size:16px;font-weight:500;color:#1a1a1a;">GTG — Resumen diario de licitaciones</div>
        <div style="font-size:13px;color:#888;">${fecha}</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <div style="background:#EAF3DE;border-radius:8px;padding:10px 16px;text-align:center;">
        <div style="font-size:22px;font-weight:500;color:#27500A;">${altas.length}</div>
        <div style="font-size:11px;color:#3B6D11;">Score Alto</div>
      </div>
      <div style="background:#FAEEDA;border-radius:8px;padding:10px 16px;text-align:center;">
        <div style="font-size:22px;font-weight:500;color:#633806;">${medias.length}</div>
        <div style="font-size:11px;color:#854F0B;">Score Medio</div>
      </div>
      <div style="background:#E6F1FB;border-radius:8px;padding:10px 16px;text-align:center;">
        <div style="font-size:22px;font-weight:500;color:#0C447C;">${revisar.length}</div>
        <div style="font-size:11px;color:#185FA5;">Revisar</div>
      </div>
      <div style="background:#f5f5f5;border-radius:8px;padding:10px 16px;text-align:center;">
        <div style="font-size:22px;font-weight:500;color:#444;">${licitaciones.length}</div>
        <div style="font-size:11px;color:#888;">Total</div>
      </div>
    </div>
  </div>

  <div style="background:#fff;border-radius:12px;padding:24px;">
    <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:16px;">Licitaciones encontradas</div>
    ${tarjetas}
  </div>

  <div style="text-align:center;padding:16px;font-size:12px;color:#aaa;">
    Sistema GTG de monitoreo de licitaciones · Generado automáticamente
  </div>
</body>
</html>`;
}

async function enviarResumen(licitaciones) {
  if (!process.env.EMAIL_FROM || !process.env.EMAIL_TO || !process.env.EMAIL_PASS) {
    console.log('Email no configurado, saltando envío');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASS }
  });

  const altas = licitaciones.filter(l => l.score === 'Alto').length;
  const asunto = `GTG Licitaciones — ${licitaciones.length} nuevas (${altas} score Alto) · ${new Date().toLocaleDateString('es-MX')}`;

  await transporter.sendMail({
    from: `"GTG Licitaciones" <${process.env.EMAIL_FROM}>`,
    to: process.env.EMAIL_TO,
    subject: asunto,
    html: generarHTML(licitaciones)
  });

  console.log(`Correo enviado a ${process.env.EMAIL_TO}`);
}

module.exports = { enviarResumen };
