const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/data/gtg.db';
const fs = require('fs');
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS licitaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portal_url TEXT NOT NULL,
    portal_nombre TEXT,
    titulo TEXT,
    dependencia TEXT,
    tipo TEXT,
    score TEXT,
    marcas TEXT,
    junta_aclaraciones TEXT,
    fecha_entrega TEXT,
    fallo TEXT,
    justificacion TEXT,
    validado INTEGER DEFAULT 0,
    es_relevante INTEGER DEFAULT NULL,
    fecha_deteccion TEXT DEFAULT (datetime('now','localtime')),
    hash TEXT UNIQUE,
    comentario TEXT
  );

  CREATE TABLE IF NOT EXISTS portales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    nombre TEXT,
    categoria TEXT,
    activo INTEGER DEFAULT 1,
    ultimo_scan TEXT,
    total_encontradas INTEGER DEFAULT 0,
    total_relevantes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT DEFAULT (datetime('now','localtime')),
    portales_procesados INTEGER,
    licitaciones_encontradas INTEGER,
    licitaciones_relevantes INTEGER,
    duracion_segundos INTEGER
  );
`);

module.exports = db;
