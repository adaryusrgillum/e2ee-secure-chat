const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
const users = new Map(); // username -> { ws, publicKey }

console.log('E2EE Relay Server running on ws://localhost:8080');

wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'register') {
        currentUser = data.username;
        users.set(currentUser, { ws, publicKey: data.publicKey });
        console.log(`[+] User registered: ${currentUser}`);
        ws.send(JSON.stringify({ type: 'server_msg', msg: 'Registered successfully.' }));
      } 
      else if (data.type === 'lookup') {
        const targetUser = users.get(data.target);
        if (targetUser) {
          ws.send(JSON.stringify({
            type: 'lookup_reply',
            target: data.target,
            publicKey: targetUser.publicKey
          }));
        } else {
          ws.send(JSON.stringify({ type: 'error', msg: `User ${data.target} not found.` }));
        }
      }
      else if (data.type === 'message') {
        const targetUser = users.get(data.to);
        if (targetUser) {
          console.log(`[*] Routing encrypted message from ${data.from} to ${data.to}`);
          targetUser.ws.send(JSON.stringify({
            type: 'message',
            from: data.from,
            payload: data.payload
          }));
        } else {
          ws.send(JSON.stringify({ type: 'error', msg: `User ${data.to} is offline.` }));
        }
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    if (currentUser) {
      users.delete(currentUser);
      console.log(`[-] User disconnected: ${currentUser}`);
    }
  });
});
