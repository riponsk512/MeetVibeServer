const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 DUAL FIREBASE ADMIN INITIALIZATION
// ==========================================

// APP 1: Realtime Database (User Status & Subscriptions)
const rtdbServiceAccount = require('./serviceAccountKey.json');
const rtdbApp = admin.initializeApp({
   credential: admin.credential.cert(rtdbServiceAccount),
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com" // ⚠️ REPLACE WITH YOUR RTDB URL
}, 'rtdbApp');
const rtdb = rtdbApp.database();

// APP 2: Cloud Firestore (MeetVibeVideoChatDb -> randomQueue & room)
const firestoreServiceAccount = require('./videoChatfirestoreServiceAccountKey.json');
const firestoreApp = admin.initializeApp({
  credential: admin.credential.cert(firestoreServiceAccount)
}, 'firestoreApp');
const firestore = firestoreApp.firestore();

// ==========================================
// 🚀 SERVER & SOCKET SETUP
// ==========================================
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`\n[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    
    activeUsers.set(socket.id, { 
      uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null 
    });

    try {
      await rtdb.ref(`users/${uid}`).update({ IsActive: true });
    } catch (error) { console.log(`[❌ RTDB ERROR]`, error); }
  });

  socket.on('set_queue_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.inQueue = data.inQueue;
      if (data.email) user.email = data.email;
    }
  });

  socket.on('set_room_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.roomId = data.roomId;
    }
  });

  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).lastPing = Date.now();
    }
  });

  socket.on('ad_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.isWatchingAd = data.isWatchingAd;
      user.lastPing = Date.now();
    }
  });

  socket.on('manual_disconnect', async () => {
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  socket.on('disconnect', () => {
    handleUserDrop(socket.id, 'Socket Connection Lost');
  });
});

// ==========================================
// 🚨 HEARTBEAT SWEEPER (Runs every 4s)
// ==========================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 15000; 

    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 TIMEOUT] ${user.email || user.uid} missed pings.`);
      await handleUserDrop(socketId, 'Missed Ping (Internet Drop / App Killed)');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

// ==========================================
// 🧹 USER DROP HANDLER (RTDB + FIRESTORE CLEANUP)
// ==========================================
async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🛑 DROPPING USER] ${user.email || user.uid} | Reason: ${reason}`);

    try {
      if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false });
    } catch (error) {}

    if (user.email && user.inQueue) {
      try { await firestore.collection('randomQueue').doc(user.email).delete(); } catch (error) {}
    }

    if (user.roomId) {
      try {
        await firestore.collection('room').doc(user.roomId).delete();
        console.log(`[📞 FIRESTORE] Deleted room ${user.roomId} because participant dropped!`);
      } catch (error) {}
    }

    activeUsers.delete(socketId);
  }
}

// ==========================================
// 📅 STALE QUEUE SWEEPER (FIRESTORE)
// ==========================================
async function sweepOldQueueDocs() {
  try {
    const snapshot = await firestore.collection('randomQueue').get();
    if (snapshot.empty) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); 
    for (const doc of snapshot.docs) {
      const data = doc.data();
      let docCreatedDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (docCreatedDate && docCreatedDate < todayStart) {
        await firestore.collection('randomQueue').doc(doc.id).delete();
      }
    }
  } catch (error) {}
}
setInterval(sweepOldQueueDocs, 30 * 60 * 1000);

// ==========================================
// 💎 TOTAL SUBSCRIPTION SWEEPER (RTDB)
// ==========================================
async function sweepSubscriptions() {
  try {
    const snap = await rtdb.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) return;
    const subscriptions = snap.val();
    const now = new Date(); 
    for (const [dateKey, subData] of Object.entries(subscriptions)) {
      const parts = dateKey.split('-');
      if (parts.length >= 7) {
        const expDate = new Date(parts[2], parts[1]-1, parts[0], parts[3], parts[4], parts[5], parts[6]);
        if (expDate <= now) {
          if (subData.userId) {
            await rtdb.ref(`users/${subData.userId}/Subscription`).remove();
            await rtdb.ref(`users/${subData.userId}`).update({ IsVip: false }); 
          }
          await rtdb.ref(`TotalSubscriptions/${dateKey}`).remove();
        }
      }
    }
  } catch (error) {}
}
setInterval(sweepSubscriptions, 60000); 

app.get('/', (req, res) => res.send('MeetVibe Dual-Admin Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));