const { app, BrowserWindow, ipcMain, dialog, shell, session, desktopCapturer, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./lib/settings');
const library = require('./lib/library');
const media = require('./lib/media');
const { transcribe, toMarkdown } = require('./lib/transcribe');

let win;
const streams = new Map(); // id -> { mic: WriteStream, system: WriteStream }

const emit = (meta) => win && !win.isDestroyed() && win.webContents.send('item:changed', meta);
const setStatus = (id, status, extra = {}) => emit(library.update(id, { status, ...extra }));

// ---------- Cola de trabajo: convertir y transcribir de uno en uno ----------
const queue = [];
let busy = false;
function enqueue(job) {
  queue.push(job);
  pump();
}
async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try {
    await job();
  } finally {
    busy = false;
    pump();
  }
}

async function runTranscription(id) {
  const s = settings.get();
  const meta = library.getMeta(id);
  if (!s.deepgramKey) {
    setStatus(id, 'pending', { error: 'Añade la clave de Deepgram en Ajustes para transcribir' });
    return;
  }
  if (!fs.existsSync(library.fileOf(id, 'audio.ogg'))) {
    setStatus(id, 'error', { error: 'No se encuentra el audio de esta grabación' });
    return;
  }
  setStatus(id, 'transcribing', { error: null });
  try {
    const transcript = await transcribe(library.fileOf(id, 'audio.ogg'), {
      apiKey: s.deepgramKey,
      language: meta.language || s.language,
      keyterms: s.keyterms,
    });
    emit(library.saveTranscript(id, transcript));
  } catch (e) {
    setStatus(id, 'error', { error: e.message });
  }
}

function finalizeRecording(id) {
  enqueue(async () => {
    setStatus(id, 'processing');
    try {
      await media.mix([library.fileOf(id, 'mic.webm'), library.fileOf(id, 'system.webm')], library.fileOf(id, 'audio.ogg'));
    } catch (e) {
      return setStatus(id, 'error', { error: e.message });
    }
    await runTranscription(id);
  });
}

function importFile(file) {
  const meta = library.create({
    title: path.parse(file).name,
    source: 'import',
    originalName: path.basename(file),
    language: settings.get().language,
    status: 'processing',
  });
  emit(meta);
  enqueue(async () => {
    try {
      await media.toAudio(file, library.fileOf(meta.id, 'audio.ogg'));
    } catch (e) {
      return setStatus(meta.id, 'error', { error: `No se pudo leer el audio: ${e.message}` });
    }
    await runTranscription(meta.id);
  });
  return meta;
}

// ---------- Ventana ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 860,
    minHeight: 540,
    backgroundColor: '#121314',
    autoHideMenuBar: true,
    title: 'Grabador',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  library.setRoot(settings.get().libraryDir);

  // Audio del sistema (loopback): todo lo que suena en Windows, venga de Teams, Zoom, Meet…
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
      .catch(() => callback({}));
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) =>
    cb(['media', 'display-capture', 'clipboard-sanitized-write'].includes(permission))
  );

  // Grabaciones que quedaron a medias (cierre o fallo): se rescatan con lo que haya.
  for (const m of library.list()) {
    if (m.status === 'recording' || m.status === 'processing') {
      if (m.source === 'recording') finalizeRecording(m.id);
      else setStatus(m.id, 'error', { error: 'Importación interrumpida, vuelve a importar el archivo' });
    } else if (m.status === 'transcribing') {
      enqueue(() => runTranscription(m.id));
    }
  }

  createWindow();
});

app.on('window-all-closed', () => app.quit());

// ---------- IPC ----------
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (e, patch) => {
  const s = settings.set(patch);
  library.setRoot(s.libraryDir);
  return s;
});
ipcMain.handle('settings:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('lib:list', (e, q) => library.list(q));
ipcMain.handle('lib:get', (e, id) => ({ meta: library.getMeta(id), transcript: library.getTranscript(id) }));

ipcMain.handle('rec:start', (e, title) => {
  const meta = library.create({ title, source: 'recording', language: settings.get().language, status: 'recording' });
  streams.set(meta.id, {
    mic: fs.createWriteStream(library.fileOf(meta.id, 'mic.webm')),
    system: fs.createWriteStream(library.fileOf(meta.id, 'system.webm')),
  });
  emit(meta);
  return meta;
});

ipcMain.handle('rec:chunk', (e, id, track, data) => {
  streams.get(id)?.[track]?.write(Buffer.from(data));
});

ipcMain.handle('rec:stop', async (e, id) => {
  const s = streams.get(id);
  streams.delete(id);
  if (s) await Promise.all(Object.values(s).map((w) => new Promise((r) => w.end(r))));
  finalizeRecording(id);
});

ipcMain.handle('import:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio y vídeo', extensions: ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'opus', 'flac', 'webm', 'mp4', 'mov', 'mkv', 'avi', 'qta', 'caf'] },
      { name: 'Todos', extensions: ['*'] },
    ],
  });
  return r.canceled ? [] : r.filePaths.map(importFile);
});
ipcMain.handle('import:files', (e, files) => files.filter((f) => fs.existsSync(f)).map(importFile));

ipcMain.handle('item:update', (e, id, patch) => {
  const allowed = {};
  for (const k of ['title', 'language', 'speakers']) if (k in patch) allowed[k] = patch[k];
  const meta = library.update(id, allowed);
  emit(meta);
  return meta;
});
ipcMain.handle('item:transcribe', (e, id) => {
  setStatus(id, 'queued', { error: null });
  enqueue(() => runTranscription(id));
});
ipcMain.handle('item:copy', (e, id) => {
  const t = library.getTranscript(id);
  if (t) clipboard.writeText(toMarkdown(library.getMeta(id), t));
  return !!t;
});
ipcMain.handle('item:openFolder', (e, id) => shell.openPath(library.dirOf(id)));
