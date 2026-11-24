const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'settings.json');

const defaults = () => ({
  deepgramKey: '',
  language: 'es', // 'es' | 'en' | 'auto'
  keyterms: [],
  libraryDir: path.join(app.getPath('documents'), 'Grabador'),
});

function get() {
  try {
    return { ...defaults(), ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    return defaults();
  }
}

function set(patch) {
  const next = { ...get(), ...patch };
  next.keyterms = (next.keyterms || []).map((k) => String(k).trim()).filter(Boolean);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}

module.exports = { get, set };
