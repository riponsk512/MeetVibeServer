const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// 🔑 1. Initialize Firebase Admin (God-Mode)
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Track active users: socket.id -> { uid, email, screen, lastPing }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // 1. Register User (Triggered on App Open)
  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now() });

    try {
      // 🚀 SERVER UPDATE: Force IsActive to true
      await db.ref(`users/${uid}`).update({ IsActive: true });
      console.log(`🟢 User Active: ${email || uid} on screen: ${screen}`);
    } catch (error) { console.log('Error setting active:', error); }
  });

  // 2. ⚡ THE 4-SECOND PING LISTENER
  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).lastPing = Date.now();
    }
  });

  // 3. Instant Manual Disconnect (When app is backgrounded/killed)
  socket.on('manual_disconnect', async () => {
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  // 4. Standard Socket Drop (Network failure)
  socket.on('disconnect', () => {
    handleUserDrop(socket.id, 'Socket Disconnected');
  });
});

// ==========================================
// 🚨 HEARTBEAT SWEEPER (Runs every 4 seconds)
// ==========================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    // If we missed a ping for more than 6 seconds (4s interval + 2s buffer)
    if (now - user.lastPing > 6000) {
      await handleUserDrop(socketId, 'Missed Ping (Internet Drop / App Killed)');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

// Helper to handle drops and set IsActive = false
async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`❌ User Dropped [${reason}]: ${user.email || user.uid}`);

    try {
      await db.ref(`users/${user.uid}`).update({ IsActive: false });
    } catch (error) { console.log('Error setting inactive:', error); }

    activeUsers.delete(socketId);
  }
}

// ==========================================
// 💎 TOTAL SUBSCRIPTION SWEEPER (Runs every 60s)
// ==========================================
async function sweepSubscriptions() {
  try {
    const snap = await db.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) return;

    const subscriptions = snap.val();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Strict Midnight today

    for (const [dateKey, subData] of Object.entries(subscriptions)) {
      // Key Format: DD-MM-YYYY-HH-mm-ss-SSS
      const parts = dateKey.split('-');
      if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS Months are 0-11
        const year = parseInt(parts[2], 10);
        
        const expDate = new Date(year, month, day);
        expDate.setHours(0, 0, 0, 0);

        // If Expired (Past) OR Same Day (Today) -> Delete
        if (expDate <= today) {
          console.log(`🗑️ Removing Expired Sub: ${dateKey}`);
          const uid = subData.userId;

          if (uid) {
            await db.ref(`users/${uid}/Subscription`).remove();
            await db.ref(`users/${uid}`).update({ IsVip: false }); 
          }
          await db.ref(`TotalSubscriptions/${dateKey}`).remove();
        }
      }
    }
  } catch (error) { console.log('Sweeper Error:', error); }
}

setInterval(sweepSubscriptions, 60000); // Runs every 1 minute

// 🚀 Manual Sweeper API (Visit this URL in a browser to force clean)
app.get('/sweep', async (req, res) => {
  await sweepSubscriptions();
  res.send('<h1>🧹 Sweeper Triggered!</h1>');
});

app.get('/', (req, res) => res.send('Heartbeat Server is Running 🚀'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server listening on port ${PORT}`));