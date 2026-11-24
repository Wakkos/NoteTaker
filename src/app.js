const $ = (s) => document.querySelector(s);

const state = { items: [], selected: null, query: '', rec: null, justAdded: new Set() };

const COLORS = ['#f28c28', '#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#facc15', '#22d3ee', '#fb7185'];
const STATUS = {
  recording: 'Grabando',
  processing: 'Preparando audio',
  queued: 'En cola',
  transcribing: 'Transcribiendo',
  pending: 'Sin transcribir',
  done: '',
  error: 'Error',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const clock = (sec) => {
  const s = Math.floor(sec || 0);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const when = (iso) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dur = (sec) => {
  if (!sec) return '';
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4500);
}

// ---------- Lista ----------
async function refresh() {
  state.items = await api.list(state.query);
  renderList();
}

function renderList() {
  const ul = $('#list');
  ul.innerHTML = state.items
    .map(
      (m) => `<li data-id="${m.id}" class="${m.id === state.selected ? 'sel' : ''} ${state.justAdded.has(m.id) ? 'new' : ''}">
        <span class="dot ${m.status}" title="${STATUS[m.status] || ''}"></span>
        <span class="t">${esc(m.title)}</span>
        <span class="d">${when(m.createdAt)}${m.duration ? ' · ' + dur(m.duration) : ''}</span>
        ${m.snippet ? `<span class="snip">${highlight(esc(m.snippet))}</span>` : ''}
      </li>`
    )
    .join('');
  state.justAdded.clear();
  $('#empty').hidden = state.items.length > 0 || !!state.query;
}

function highlight(html) {
  const q = state.query.trim();
  if (!q) return html;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.replace(re, (m) => `<mark>${m}</mark>`);
}

$('#list').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) select(li.dataset.id);
});

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value;
    refresh().then(() => state.selected && renderDetail());
  }, 180);
});

// ---------- Detalle ----------
async function select(id) {
  state.selected = id;
  renderList();
  await renderDetail();
}

async function renderDetail() {
  const el = $('#detail');
  if (!state.selected) return (el.innerHTML = '');
  const { meta, transcript } = await api.get(state.selected);
  if (!meta) return (el.innerHTML = '');

  const working = ['recording', 'processing', 'queued', 'transcribing'].includes(meta.status);
  const canTranscribe = !working && meta.status !== 'recording';

  el.innerHTML = `
    <div class="head">
      <input class="title" id="title" value="${esc(meta.title)}" spellcheck="false" />
    </div>
    <div class="sub">
      <span>${new Date(meta.createdAt).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</span>
      ${meta.duration ? `<span>${dur(meta.duration)}</span>` : ''}
      ${meta.originalName ? `<span>${esc(meta.originalName)}</span>` : ''}
      <select id="lang" ${working ? 'disabled' : ''}>
        <option value="es">Español</option><option value="en">Inglés</option><option value="auto">Detectar</option>
      </select>
      ${canTranscribe ? `<button class="btn" id="do-tx">${transcript ? 'Volver a transcribir' : 'Transcribir'}</button>` : ''}
      ${transcript ? `<button class="btn" id="copy" title="Copiar transcripción"><svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>Copiar</button>` : ''}
      <button class="btn" id="folder" title="Abrir carpeta"><svg viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg></button>
    </div>
    ${meta.error ? `<p class="err">${esc(meta.error)}</p>` : ''}
    ${
      working
        ? `<p class="waiting"><span class="dot ${meta.status}"></span>${STATUS[meta.status]}</p>`
        : transcript
        ? renderTranscript(meta, transcript)
        : ''
    }`;

  $('#lang').value = meta.language || 'es';
  $('#lang').onchange = (e) => api.update(meta.id, { language: e.target.value });
  const title = $('#title');
  title.onkeydown = (e) => e.key === 'Enter' && title.blur();
  title.onblur = () => title.value.trim() && title.value !== meta.title && api.update(meta.id, { title: title.value.trim() });
  $('#folder').onclick = () => api.openFolder(meta.id);
  if ($('#do-tx')) $('#do-tx').onclick = () => api.transcribe(meta.id);
  if ($('#copy'))
    $('#copy').onclick = async (e) => {
      const b = e.currentTarget;
      await api.copy(meta.id);
      b.classList.add('ok');
      b.lastChild.textContent = 'Copiado';
      setTimeout(() => {
        b.classList.remove('ok');
        b.lastChild.textContent = 'Copiar';
      }, 1500);
    };

  el.querySelectorAll('.who').forEach((w) => w.style.setProperty('--c', w.dataset.c));
  el.querySelectorAll('.who input').forEach((inp) => {
    inp.onkeydown = (e) => e.key === 'Enter' && inp.blur();
    inp.onchange = () => {
      const speakers = { ...meta.speakers, [inp.dataset.sp]: inp.value.trim() || undefined };
      api.update(meta.id, { speakers });
    };
  });
}

function renderTranscript(meta, t) {
  if (!t.segments.length) return '<p class="waiting">No se ha detectado voz.</p>';
  const name = (sp) => meta.speakers?.[sp] || `Hablante ${Number(sp) + 1}`;
  return `<div class="tx">${t.segments
    .map(
      (s) => `<div class="seg">
        <div class="who" data-c="${COLORS[s.speaker % COLORS.length]}">
          <input data-sp="${s.speaker}" value="${esc(name(s.speaker))}" spellcheck="false" />
          <time>${clock(s.start)}</time>
        </div>
        <p>${highlight(esc(s.text))}</p>
      </div>`
    )
    .join('')}</div>`;
}

api.onChanged((meta) => {
  const i = state.items.findIndex((m) => m.id === meta.id);
  if (i >= 0) state.items[i] = { ...state.items[i], ...meta };
  else if (!state.query) {
    state.items.unshift(meta);
    state.justAdded.add(meta.id);
  }
  renderList();
  if (meta.id === state.selected) {
    // No repintar mientras se edita un campo de este elemento.
    if (!document.activeElement?.closest?.('#detail input')) renderDetail();
  }
});

// ---------- Grabación ----------
async function startRecording() {
  const btn = $('#rec');
  btn.classList.add('starting');
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    let system = null;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      display.getVideoTracks().forEach((t) => t.stop());
      if (display.getAudioTracks().length) system = new MediaStream(display.getAudioTracks());
    } catch {
      /* se avisa abajo */
    }
    if (!system) toast('No se pudo capturar el audio del sistema: solo se graba tu micrófono');

    const title = `Reunión ${new Date().toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    const meta = await api.recStart(title);

    const ctx = new AudioContext();
    const tracks = [
      ['mic', mic],
      ['system', system],
    ]
      .filter(([, s]) => s)
      .map(([name, stream]) => {
        const r = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 });
        let chain = Promise.resolve();
        r.ondataavailable = (e) => {
          if (!e.data.size) return;
          chain = chain.then(async () => api.recChunk(meta.id, name, await e.data.arrayBuffer()));
        };
        const done = new Promise((res) => (r.onstop = () => chain.then(res)));
        r.start(1000);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        return { name, stream, r, done, analyser };
      });

    state.rec = { id: meta.id, tracks, ctx, started: Date.now() };
    state.selected = meta.id;
    btn.classList.add('on');
    btn.title = 'Parar (Ctrl+R)';
    $('#live').hidden = false;
    $('#lvl-system').parentElement.classList.toggle('dead', !system);
    tick();
  } catch (e) {
    toast(`No se pudo empezar a grabar: ${e.message}`);
  } finally {
    btn.classList.remove('starting');
  }
}

function tick() {
  const rec = state.rec;
  if (!rec) return;
  $('#timer').textContent = clock((Date.now() - rec.started) / 1000);
  const buf = new Uint8Array(256);
  for (const name of ['mic', 'system']) {
    const t = rec.tracks.find((x) => x.name === name);
    let v = 0;
    if (t) {
      t.analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
      v = Math.min(100, (peak / 128) * 160);
    }
    $(`#lvl-${name}`).style.setProperty('--v', `${v}%`);
  }
  requestAnimationFrame(tick);
}

async function stopRecording() {
  const rec = state.rec;
  state.rec = null;
  $('#rec').classList.remove('on');
  $('#rec').title = 'Grabar (Ctrl+R)';
  $('#live').hidden = true;
  rec.tracks.forEach((t) => t.r.stop());
  await Promise.all(rec.tracks.map((t) => t.done));
  rec.tracks.forEach((t) => t.stream.getTracks().forEach((x) => x.stop()));
  rec.ctx.close();
  await api.recStop(rec.id);
}

const toggleRec = () => (state.rec ? stopRecording() : startRecording());
$('#rec').onclick = toggleRec;
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    toggleRec();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (state.rec) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- Importar ----------
async function afterImport(metas) {
  if (metas.length) select(metas[0].id);
}
$('#import').onclick = async () => afterImport(await api.importPick());

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  dragDepth++;
  $('#drop').hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $('#drop').hidden = true;
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').hidden = true;
  const paths = [...e.dataTransfer.files].map((f) => api.pathFor(f)).filter(Boolean);
  if (paths.length) afterImport(await api.importFiles(paths));
});

// ---------- Ajustes ----------
const dlg = $('#dlg');
const form = $('#settings-form');
$('#settings').onclick = async () => {
  const s = await api.settingsGet();
  form.deepgramKey.value = s.deepgramKey;
  form.language.value = s.language;
  form.keyterms.value = s.keyterms.join('\n');
  form.libraryDir.value = s.libraryDir;
  dlg.showModal();
};
$('#pick-dir').onclick = async () => {
  const dir = await api.pickFolder();
  if (dir) form.libraryDir.value = dir;
};
dlg.addEventListener('close', async () => {
  if (dlg.returnValue !== 'save') return;
  await api.settingsSet({
    deepgramKey: form.deepgramKey.value.trim(),
    language: form.language.value,
    keyterms: form.keyterms.value.split('\n'),
    libraryDir: form.libraryDir.value,
  });
  await refresh();
});

// ---------- Arranque ----------
(async () => {
  await refresh();
  const s = await api.settingsGet();
  if (!s.deepgramKey) toast('Añade tu clave de Deepgram en Ajustes para poder transcribir');
  if (state.items[0]) select(state.items[0].id);
})();
