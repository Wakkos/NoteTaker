const fs = require('fs');
const path = require('path');
const { toMarkdown } = require('./transcribe');

/*
 * Cada grabación es una carpeta dentro de la biblioteca:
 *   meta.json        título, fecha, estado, nombres de hablantes…
 *   mic.webm         pista de tu micrófono (solo grabaciones)
 *   system.webm      pista del audio del sistema (solo grabaciones)
 *   audio.ogg        audio final que se transcribe y se guarda
 *   transcript.json  segmentos con tiempos y hablantes
 *   transcript.md    texto listo para copiar
 */

let root = null;
const setRoot = (dir) => {
  root = dir;
  fs.mkdirSync(root, { recursive: true });
};
const dirOf = (id) => path.join(root, id);
const fileOf = (id, name) => path.join(dirOf(id), name);

const pad = (n) => String(n).padStart(2, '0');
function newId(date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

function readJSON(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function create(fields) {
  const id = newId();
  fs.mkdirSync(dirOf(id), { recursive: true });
  const meta = {
    id,
    title: fields.title || 'Sin título',
    createdAt: new Date().toISOString(),
    source: fields.source, // 'recording' | 'import'
    originalName: fields.originalName || null,
    language: fields.language || 'es',
    status: fields.status || 'pending',
    error: null,
    duration: null,
    speakers: {},
  };
  save(meta);
  return meta;
}

function save(meta) {
  fs.writeFileSync(fileOf(meta.id, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

function getMeta(id) {
  return readJSON(fileOf(id, 'meta.json'));
}

function update(id, patch) {
  const meta = { ...getMeta(id), ...patch };
  save(meta);
  const transcript = getTranscript(id);
  if (transcript) fs.writeFileSync(fileOf(id, 'transcript.md'), toMarkdown(meta, transcript));
  return meta;
}

function getTranscript(id) {
  return readJSON(fileOf(id, 'transcript.json'));
}

function saveTranscript(id, transcript) {
  fs.writeFileSync(fileOf(id, 'transcript.json'), JSON.stringify(transcript, null, 2));
  const meta = update(id, { duration: transcript.duration, status: 'done', error: null });
  return meta;
}

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function list(query = '') {
  if (!fs.existsSync(root)) return [];
  const q = norm(query.trim());
  const items = [];
  for (const id of fs.readdirSync(root)) {
    const meta = getMeta(id);
    if (!meta) continue;
    if (q) {
      const inTitle = norm(meta.title).includes(q);
      let snippet = null;
      if (!inTitle) {
        const t = getTranscript(id);
        const seg = t?.segments.find((s) => norm(s.text).includes(q));
        if (!seg) continue;
        const i = norm(seg.text).indexOf(q);
        snippet = (i > 40 ? '…' : '') + seg.text.slice(Math.max(0, i - 40), i + q.length + 60);
      }
      items.push({ ...meta, snippet });
    } else {
      items.push(meta);
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

module.exports = { setRoot, dirOf, fileOf, create, save, getMeta, update, getTranscript, saveTranscript, list };
