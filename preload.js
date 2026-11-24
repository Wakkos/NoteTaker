const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  settingsGet: call('settings:get'),
  settingsSet: call('settings:set'),
  pickFolder: call('settings:pickFolder'),
  list: call('lib:list'),
  get: call('lib:get'),
  recStart: call('rec:start'),
  recChunk: call('rec:chunk'),
  recStop: call('rec:stop'),
  importPick: call('import:pick'),
  importFiles: call('import:files'),
  pathFor: (file) => webUtils.getPathForFile(file),
  update: call('item:update'),
  transcribe: call('item:transcribe'),
  copy: call('item:copy'),
  openFolder: call('item:openFolder'),
  onChanged: (cb) => ipcRenderer.on('item:changed', (e, meta) => cb(meta)),
});
