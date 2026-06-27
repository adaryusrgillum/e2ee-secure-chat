const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  register: (username, serverUrl) => ipcRenderer.invoke('register', username, serverUrl),
  sendMessage: (target, msg) => ipcRenderer.send('send-message', target, msg),
  inviteUser: () => ipcRenderer.send('invite-user'),
  onRegistered: (callback) => ipcRenderer.on('registered', () => callback()),
  onRegistrationError: (callback) => ipcRenderer.on('registration-error', (event, err) => callback(err)),
  onReceiveMessage: (callback) => ipcRenderer.on('receive-message', (event, from, msg) => callback(from, msg))
});
