// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app');
const btnConnect = document.getElementById('btn-connect');
const btnInvite = document.getElementById('btn-invite');
const btnSend = document.getElementById('btn-send');
const inputUsername = document.getElementById('login-username');
const inputServer = document.getElementById('login-server');
const inputChat = document.getElementById('chat-input');
const loginError = document.getElementById('login-error');
const contactList = document.getElementById('contact-list');
const messagesContainer = document.getElementById('messages-container');
const currentChatTitle = document.getElementById('current-chat-title');

// State
let contacts = new Set();
let activeContact = null;
let chatHistory = {}; // { username: [{from: 'me'|'them', text: 'hi'}] }

// --- Initialization ---

btnConnect.addEventListener('click', async () => {
  const username = inputUsername.value.trim();
  const server = inputServer.value.trim();
  
  if (!username || !server) {
    loginError.textContent = "Please fill in all fields.";
    return;
  }

  btnConnect.textContent = "Connecting...";
  btnConnect.disabled = true;

  const result = await window.api.register(username, server);
  if (!result.success) {
    loginError.textContent = result.error;
    btnConnect.textContent = "Connect & Generate Keys";
    btnConnect.disabled = false;
  }
});

window.api.onRegistered(() => {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
});

window.api.onRegistrationError((err) => {
  loginError.textContent = "Connection Error: " + err;
  btnConnect.textContent = "Connect & Generate Keys";
  btnConnect.disabled = false;
});

// --- Chat Logic ---

window.api.onReceiveMessage((from, msg) => {
  addContact(from);
  saveMessage(from, 'them', msg);
  
  if (activeContact === from) {
    renderMessages(from);
  }
});

btnSend.addEventListener('click', () => {
  const msg = inputChat.value.trim();
  if (!msg || !activeContact) return;

  window.api.sendMessage(activeContact, msg);
  saveMessage(activeContact, 'me', msg);
  renderMessages(activeContact);
  inputChat.value = '';
});

inputChat.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') btnSend.click();
});

btnInvite.addEventListener('click', () => {
  window.api.inviteUser();
});

// --- UI Helpers ---

function addContact(username) {
  if (contacts.has(username)) return;
  contacts.add(username);
  
  const div = document.createElement('div');
  div.className = 'contact';
  div.innerHTML = `
    <div class="avatar">${username.charAt(0).toUpperCase()}</div>
    <div class="name">${username}</div>
  `;
  
  div.addEventListener('click', () => {
    document.querySelectorAll('.contact').forEach(c => c.classList.remove('active'));
    div.classList.add('active');
    activeContact = username;
    currentChatTitle.textContent = `Chatting securely with ${username}`;
    inputChat.disabled = false;
    btnSend.disabled = false;
    renderMessages(username);
  });

  contactList.appendChild(div);
}

function saveMessage(contact, from, text) {
  if (!chatHistory[contact]) chatHistory[contact] = [];
  chatHistory[contact].push({ from, text });
}

function renderMessages(contact) {
  messagesContainer.innerHTML = '';
  const msgs = chatHistory[contact] || [];
  
  msgs.forEach(m => {
    const div = document.createElement('div');
    div.className = `msg ${m.from === 'me' ? 'sent' : 'received'}`;
    div.textContent = m.text;
    messagesContainer.appendChild(div);
  });
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Dev utility: Add a dummy contact so you can send a message to someone you haven't received from yet
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'n') {
    const name = prompt("Enter username to chat with:");
    if (name) addContact(name);
  }
});
