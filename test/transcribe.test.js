// Pruebas sin red ni Electron: formato de Deepgram, unión de segmentos y biblioteca.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDeepgram, toMarkdown, clock } = require('../lib/transcribe');
const library = require('../lib/library');

const fake = {
  metadata: { duration: 125.4 },
  results: {
    channels: [{ alternatives: [{ transcript: '' }] }],
    utterances: [
      { start: 0.5, end: 3.2, speaker: 0, transcript: 'Hola, ¿empezamos con EVA?' },
      { start: 3.4, end: 6.0, speaker: 0, transcript: 'Tengo el informe de P6.' },
      { start: 6.5, end: 9.0, speaker: 1, transcript: 'Sí, adelante.' },
      { start: 9.1, end: 9.4, speaker: 1, transcript: '   ' },
      { start: 70, end: 75, speaker: 0, transcript: 'Una cosa más.' },
    ],
  },
};

const t = parseDeepgram(fake, 'es');
assert.strictEqual(t.duration, 125.4);
assert.strictEqual(t.language, 'es');
assert.strictEqual(t.segments.length, 3, 'une frases seguidas del mismo hablante y descarta vacías');
assert.strictEqual(t.segments[0].text, 'Hola, ¿empezamos con EVA? Tengo el informe de P6.');
assert.strictEqual(t.segments[2].start, 70);
assert.strictEqual(clock(3725), '01:02:05');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabador-'));
library.setRoot(dir);
const meta = library.create({ title: 'Reunión con Sebastian', source: 'import', status: 'processing' });
library.saveTranscript(meta.id, t);
library.update(meta.id, { speakers: { 0: 'Daniel' } });

const md = fs.readFileSync(library.fileOf(meta.id, 'transcript.md'), 'utf8');
assert.ok(md.includes('**Daniel** [00:00:00]'));
assert.ok(md.includes('**Hablante 2** [00:00:06]'));
assert.strictEqual(library.getMeta(meta.id).status, 'done');

assert.strictEqual(library.list('sebastian').length, 1, 'busca por título');
const hit = library.list('informe de p6');
assert.strictEqual(hit.length, 1, 'busca dentro de la transcripción');
assert.ok(hit[0].snippet.includes('informe'));
assert.strictEqual(library.list('adelánte').length, 1, 'ignora tildes');
assert.strictEqual(library.list('nada que ver').length, 0);

assert.strictEqual(toMarkdown(library.getMeta(meta.id), t), md);
console.log('ok');
