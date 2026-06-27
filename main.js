const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

let mainWindow;
let ws = null;
let username = '';
let serverUrl = '';

// Cryptography State
let ecdh = null;
let myPublicKeyBase64 = '';
const knownPublicKeys = new Map();
const pendingMessages = [];
const pendingIncomingMessages = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    backgroundColor: '#1e1e24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('register', (event, user, url) => {
  username = user;
  serverUrl = url;

  // Generate keys using a curve supported by Electron (BoringSSL)
  ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  myPublicKeyBase64 = ecdh.getPublicKey('base64');

  // Connect to server
  try {
    ws = new WebSocket(serverUrl);
  } catch (err) {
    return { success: false, error: err.message };
  }

  ws.on('error', (err) => {
    mainWindow.webContents.send('registration-error', err.message || 'Failed to connect to server.');
  });

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'register',
      username: username,
      publicKey: myPublicKeyBase64
    }));
  });

  ws.on('message', (dataStr) => {
    const data = JSON.parse(dataStr);

    if (data.type === 'server_msg' || data.type === 'error') {
      console.log(`[Server] ${data.msg}`);
      if (data.msg === 'Registered successfully.') {
        mainWindow.webContents.send('registered');
      }
    } 
    else if (data.type === 'lookup_reply') {
      knownPublicKeys.set(data.target, data.publicKey);
      
      // Send pending outgoing
      const toSend = pendingMessages.filter(m => m.to === data.target);
      for (const m of toSend) {
        encryptAndSend(m.to, m.msgText);
        pendingMessages.splice(pendingMessages.indexOf(m), 1);
      }

      // Decrypt pending incoming
      const toDecrypt = pendingIncomingMessages.filter(m => m.from === data.target);
      for (const m of toDecrypt) {
        handleIncomingMessage(m.from, m.payload);
        pendingIncomingMessages.splice(pendingIncomingMessages.indexOf(m), 1);
      }
    }
    else if (data.type === 'message') {
      handleIncomingMessage(data.from, data.payload);
    }
  });

  return { success: true };
});

ipcMain.on('send-message', (event, targetUser, msgText) => {
  encryptAndSend(targetUser, msgText);
});

ipcMain.on('invite-user', () => {
  const subject = encodeURIComponent("Join my secure chat server!");
  const body = encodeURIComponent(`Hey!\n\nJoin me on my End-to-End Encrypted chat server.\n\n1. Download the App here: [INSERT DOWNLOAD LINK HERE]\n2. Server URL: ${serverUrl}\n\nDownload the app and connect using this URL to chat securely.`);
  shell.openExternal(`mailto:?subject=${subject}&body=${body}`);
});

function encryptAndSend(targetUser, msgText) {
  const targetPublicKey = knownPublicKeys.get(targetUser);
  if (!targetPublicKey) {
    pendingMessages.push({ to: targetUser, msgText });
    ws.send(JSON.stringify({ type: 'lookup', target: targetUser }));
    return;
  }

  try {
    const sharedSecret = ecdh.computeSecret(targetPublicKey, 'base64');
    const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();
    
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    
    let encrypted = cipher.update(msgText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    ws.send(JSON.stringify({
      type: 'message',
      from: username,
      to: targetUser,
      payload: {
        iv: iv.toString('base64'),
        encrypted: encrypted,
        authTag: authTag
      }
    }));
  } catch (err) {
    console.error('Encryption error:', err);
  }
}

function handleIncomingMessage(fromUser, payload) {
  const senderPublicKey = knownPublicKeys.get(fromUser);
  if (!senderPublicKey) {
    pendingIncomingMessages.push({ from: fromUser, payload });
    ws.send(JSON.stringify({ type: 'lookup', target: fromUser }));
    return;
  }

  try {
    const sharedSecret = ecdh.computeSecret(senderPublicKey, 'base64');
    const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();
    
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(payload.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Notify Renderer
    mainWindow.webContents.send('receive-message', fromUser, decrypted);

    // Desktop Notification if window is not focused
    if (!mainWindow.isFocused()) {
      new Notification({
        title: `Secure Message from ${fromUser}`,
        body: decrypted
      }).show();
    }
  } catch (err) {
    console.error('Decryption failed:', err);
  }
}
