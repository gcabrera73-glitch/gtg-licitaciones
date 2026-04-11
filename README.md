# GTG — Sistema de Monitoreo de Licitaciones

Sistema automático que monitorea 95 portales de licitaciones públicas en México y filtra las oportunidades relevantes para GTG usando IA.

## Qué hace
- Visita 95 portales gubernamentales y universitarios diariamente
- Analiza cada licitación con los criterios GTG (redes, telecomunicaciones, seguridad TI)
- Asigna score: Alto / Medio / Revisar / No relevante
- Envía resumen por correo cada mañana
- Dashboard web para ver y validar resultados

## Instalación en Railway

### Paso 1 — Subir el código a GitHub
1. Crea una cuenta en github.com si no tienes
2. Crea un repositorio nuevo llamado "gtg-licitaciones"
3. Sube todos estos archivos al repositorio

### Paso 2 — Crear proyecto en Railway
1. Ve a railway.app y entra con tu cuenta
2. Haz clic en "New Project"
3. Selecciona "Deploy from GitHub repo"
4. Conecta tu cuenta de GitHub y selecciona "gtg-licitaciones"
5. Railway detectará automáticamente que es un proyecto Node.js

### Paso 3 — Configurar variables de entorno
En Railway, ve a tu proyecto → Variables, y agrega:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| ANTHROPIC_API_KEY | sk-ant-... | Tu API key de Anthropic |
| EMAIL_FROM | tucorreo@gmail.com | Correo que envía el resumen |
| EMAIL_TO | destino@gtg.com | Correo que recibe el resumen |
| EMAIL_PASS | xxxx xxxx xxxx xxxx | Contraseña de app Gmail* |
| SCAN_HOUR | 7 | Hora del scan automático (formato 24h) |
| PORT | 3000 | Puerto del servidor |

*Para EMAIL_PASS necesitas generar una "App Password" en tu cuenta Gmail:
  Google Account → Security → 2-Step Verification → App Passwords

### Paso 4 — Deploy
Railway hará el deploy automáticamente. En 2-3 minutos tu sistema estará corriendo.

## Uso

### Dashboard
Entra a la URL que te da Railway (algo como gtg-licitaciones.railway.app)
- Verás todas las licitaciones detectadas organizadas por score
- Puedes filtrar por Alto / Medio / Revisar / Sin validar
- Confirma o rechaza cada resultado para que el sistema aprenda

### Scan manual
En el dashboard haz clic en "Escanear ahora" para correr un scan inmediato.

### Scan automático
El sistema corre solo todos los días a la hora configurada en SCAN_HOUR.

## Estructura del proyecto
```
gtg-licitaciones/
├── src/
│   ├── server.js      # Servidor web + dashboard + API
│   ├── scanner.js     # Procesa los 95 portales
│   ├── analyzer.js    # Motor de análisis con IA
│   ├── mailer.js      # Envío de correo diario
│   ├── database.js    # Base de datos SQLite
│   └── portales.js    # Lista de los 95 portales
├── package.json
├── railway.toml
└── .env.example
```

## Costos estimados
- Anthropic API: ~$0.50 USD por scan completo (~$15/mes si corre diario)
- Railway: gratis en plan Hobby hasta $5/mes de uso
- Total estimado: $15-20 USD/mes

## Soporte
Sistema desarrollado específicamente para GTG.
Para agregar o quitar portales, edita src/portales.js
