const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 DUAL FIREBASE ADMIN INITIALIZATION
// ==========================================
const rtdbServiceAccount = require('./serviceAccountKey.json');
const rtdbApp = admin.initializeApp({
   credential: admin.credential.cert(rtdbServiceAccount),
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com" // ⚠️ REPLACE WITH YOUR RTDB URL
}, 'rtdbApp');
const rtdb = rtdbApp.database();

const firestoreServiceAccount = require('./videoChatfirestoreServiceAccountKey.json');
const firestoreApp = admin.initializeApp({
  credential: admin.credential.cert(firestoreServiceAccount)
}, 'firestoreApp');
const firestore = firestoreApp.firestore();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const activeUsers = new Map();

// 🚀 CORE FUNCTION: INSTANTLY WIPES ROOM & SUBCOLLECTIONS COMPLETELY FOR BOTH USERS
async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId) return;
  try {
    console.log(`\n[🗑️ SERVER WIPE TRIGGERED] Method: ${triggerMethod} | Room ID: ${roomId}`);
    const roomRef = firestore.collection('room').doc(roomId);
    const batch = firestore.batch();

    // 1. Delete all callerCandidates
    const callerCands = await roomRef.collection('callerCandidates').get();
    let callerCount = 0;
    callerCands.forEach(doc => { batch.delete(doc.ref); callerCount++; });

    // 2. Delete all calleeCandidates
    const calleeCands = await roomRef.collection('calleeCandidates').get();
    let calleeCount = 0;
    calleeCands.forEach(doc => { batch.delete(doc.ref); calleeCount++; });

    // 3. Execute batch & delete main document
    await batch.commit();
    await roomRef.delete();
    
    console.log(`[✅ FIRESTORE WIPE SUCCESS] Deleted Room ${roomId} | Caller Candidates: ${callerCount} | Callee Candidates: ${calleeCount}\n`);
  } catch (error) {
    console.log(`[❌ FIRESTORE ERROR] Failed to clean room ${roomId}:`, error);
  }
}

io.on('connection', (socket) => {
  console.log(`[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
    console.log(`[👤 REGISTERED] Email: ${email}`);
    try { await rtdb.ref(`users/${uid}`).update({ IsActive: true }); } catch (error) {}
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
      activeUsers.get(socket.id).roomId = data.roomId;
    }
  });

  // 🚀 THE 4 REQUESTED METHODS FOR INSTANT CLEANUP
  socket.on('videoend', async ({ roomId }) => {
    await forceWipeRoom(roomId, 'videoend');
  });

  socket.on('videonext', async ({ roomId }) => {
    await forceWipeRoom(roomId, 'videonext');
  });

  socket.on('videobackground', async ({ roomId }) => {
    await forceWipeRoom(roomId, 'videobackground');
  });

  socket.on('checkInternet', async ({ roomId }) => {
    await forceWipeRoom(roomId, 'checkInternet');
  });

  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) activeUsers.get(socket.id).lastPing = Date.now();
  });

  socket.on('ad_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.isWatchingAd = data.isWatchingAd;
      user.lastPing = Date.now();
    }
  });

  socket.on('manual_disconnect', async () => {
    console.log(`[⚠️ APP BACKGROUND] Socket ${socket.id} intentionally dropped.`);
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  socket.on('disconnect', () => {
    console.log(`[🔌 DISCONNECTED] Socket ID: ${socket.id} lost connection.`);
    handleUserDrop(socket.id, 'Socket Connection Lost');
  });
});

setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 15000; 
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 TIMEOUT] User ${user.email || user.uid} missed pings for over ${timeoutThreshold/1000}s`);
      await handleUserDrop(socketId, 'Missed Ping');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🛑 DROPPING] ${user.email || user.uid} | Reason: ${reason}`);

    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}

    if (user.email && user.inQueue) {
      try { await firestore.collection('randomQueue').doc(user.email).delete(); } catch (error) {}
    }

    if (user.roomId) {
      await forceWipeRoom(user.roomId, 'Server User Drop Detection');
    }

    activeUsers.delete(socketId);
  }
}

// 📅 STALE QUEUE SWEEPER
setInterval(async () => {
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
}, 30 * 60 * 1000);

app.get('/', (req, res) => res.send('MeetVibe Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));