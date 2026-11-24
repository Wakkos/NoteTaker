const { spawn } = require('child_process');
const fs = require('fs');

const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

// Voz: mono, 16 kHz, Opus 32 kbps (~14 MB por hora). Suficiente para transcribir y guardar.
const OUT = ['-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k'];

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg salió con código ${code}`))));
  });
}

const nonEmpty = (f) => fs.existsSync(f) && fs.statSync(f).size > 0;

/** Extrae/convierte el audio de cualquier archivo de audio o vídeo. */
function toAudio(input, output) {
  return run(['-i', input, '-vn', ...OUT, output]);
}

/** Mezcla las pistas (micro + sistema) en un único audio para transcribir. */
async function mix(inputs, output) {
  const files = inputs.filter(nonEmpty);
  if (!files.length) throw new Error('La grabación está vacía');
  if (files.length === 1) return toAudio(files[0], output);
  return run([
    ...files.flatMap((f) => ['-i', f]),
    '-filter_complex', `amix=inputs=${files.length}:duration=longest:normalize=0`,
    ...OUT,
    output,
  ]);
}

module.exports = { toAudio, mix };
