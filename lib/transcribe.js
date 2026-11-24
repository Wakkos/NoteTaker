const fs = require('fs');

/*
 * Motor de transcripción intercambiable. Cada proveedor recibe un archivo de audio
 * y devuelve el mismo formato:
 *   { provider, model, language, duration, segments: [{ start, end, speaker, text }] }
 * Para probar otro servicio, se añade aquí otra función con la misma firma.
 */

/** Une frases seguidas del mismo hablante en un solo bloque. */
function mergeSegments(utterances) {
  const out = [];
  for (const u of utterances) {
    const text = (u.text || '').trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === u.speaker && u.start - last.end < 2) {
      last.text += ' ' + text;
      last.end = u.end;
    } else {
      out.push({ start: u.start, end: u.end, speaker: u.speaker, text });
    }
  }
  return out;
}

function parseDeepgram(json, language) {
  const utterances = (json.results?.utterances || []).map((u) => ({
    start: u.start,
    end: u.end,
    speaker: u.speaker ?? 0,
    text: u.transcript,
  }));
  return {
    provider: 'deepgram',
    model: 'nova-3',
    language: json.results?.channels?.[0]?.detected_language || language,
    duration: json.metadata?.duration ?? null,
    segments: mergeSegments(utterances),
  };
}

async function deepgram(file, { apiKey, language, keyterms }) {
  if (!apiKey) throw new Error('Falta la clave de Deepgram (Ajustes)');
  const q = new URLSearchParams({
    model: 'nova-3',
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
    utterances: 'true',
  });
  if (language === 'auto') q.set('detect_language', 'true');
  else q.set('language', language);
  for (const k of keyterms || []) q.append('keyterm', k);

  const res = await fetch(`https://api.deepgram.com/v1/listen?${q}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/ogg' },
    body: fs.readFileSync(file),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Deepgram ${res.status}: ${body.slice(0, 300)}`);
  }
  return parseDeepgram(await res.json(), language);
}

const providers = { deepgram };

function transcribe(file, opts, provider = 'deepgram') {
  return providers[provider](file, opts);
}

const pad = (n) => String(n).padStart(2, '0');
function clock(sec) {
  const s = Math.floor(sec || 0);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const speakerName = (speakers, id) => (speakers && speakers[id]) || `Hablante ${Number(id) + 1}`;

/** Texto plano listo para copiar (por ejemplo, para pegárselo a Claude). */
function toMarkdown(meta, transcript) {
  const lines = [`# ${meta.title}`, '', `${new Date(meta.createdAt).toLocaleString('es-ES')}`, ''];
  for (const s of transcript.segments) {
    lines.push(`**${speakerName(meta.speakers, s.speaker)}** [${clock(s.start)}]`, s.text, '');
  }
  return lines.join('\n');
}

module.exports = { transcribe, toMarkdown, clock, speakerName, mergeSegments, parseDeepgram };
