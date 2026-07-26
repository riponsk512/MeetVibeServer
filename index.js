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

// 🚀 CORE FUNCTION: INSTANTLY WIPES ROOM & SUBCOLLECTIONS
async function forceWipeRoom(roomId) {
  if (!roomId) return;
  try {
    const roomRef = firestore.collection('room').doc(roomId);
    const batch = firestore.batch();

    // 1. Queue deletion of all callerCandidates
    const callerCands = await roomRef.collection('callerCandidates').get();
    callerCands.forEach(doc => batch.delete(doc.ref));

    // 2. Queue deletion of all calleeCandidates
    const calleeCands = await roomRef.collection('calleeCandidates').get();
    calleeCands.forEach(doc => batch.delete(doc.ref));

    // 3. Execute batch & delete main document
    await batch.commit();
    await roomRef.delete();
    
    console.log(`[📞 FIRESTORE] Instantly wiped Room ID: ${roomId} and all candidates!`);
  } catch (error) {
    console.log(`[❌ FIRESTORE ROOM ERROR] Failed to clean room ${roomId}:`, error);
  }
}

io.on('connection', (socket) => {
  console.log(`\n[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
    console.log(`[👤 REGISTERED] Email: ${email} | Screen: ${screen}`);
    try { await rtdb.ref(`users/${uid}`).update({ IsActive: true }); } catch (error) {}
  });

  socket.on('set_queue_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.inQueue = data.inQueue;
      if (data.email) user.email = data.email;
      console.log(`[🎯 QUEUE STATUS] ${user.email} is ${data.inQueue ? 'Searching' : 'Not Searching'}`);
    }
  });

  socket.on('set_room_status', (data) => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).roomId = data.roomId;
      console.log(`[📞 ROOM STATUS] User joined room: ${data.roomId}`);
    }
  });

  // 🚀 SOCKET LISTENER: TRIGGERED INSTANTLY BY CLIENT ON END/NEXT/BACKGROUND
  socket.on('destroy_room', async ({ roomId }) => {
    console.log(`[🗑️ DESTROY ROOM COMMAND] Received command to delete room: ${roomId}`);
    await forceWipeRoom(roomId);
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
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} intentionally dropped.`);
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  socket.on('disconnect', () => {
    console.log(`[🔌 DISCONNECTED] Socket ID: ${socket.id}`);
    handleUserDrop(socket.id, 'Socket Connection Lost');
  });
});

setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 15000; 
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 TIMEOUT] User ${user.email || user.uid} missed pings for over ${timeoutThreshold/1000}s`);
      await handleUserDrop(socketId, 'Missed Ping (Internet Drop / App Killed)');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🛑 DROPPING USER] ${user.email || user.uid} | Reason: ${reason}`);

    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}

    if (user.email && user.inQueue) {
      try { 
        await firestore.collection('randomQueue').doc(user.email).delete(); 
        console.log(`[🔥 FIRESTORE] Deleted ${user.email} from randomQueue.`);
      } catch (error) {}
    }

    if (user.roomId) {
      await forceWipeRoom(user.roomId);
    }

    activeUsers.delete(socketId);
  }
}

// 📅 STALE QUEUE SWEEPER (FIRESTORE)
setInterval(async () => {
  try {
    const snapshot = await firestore.collection('randomQueue').get();
    if (snapshot.empty) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); 
    let count = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      let docCreatedDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (docCreatedDate && docCreatedDate < todayStart) {
        await firestore.collection('randomQueue').doc(doc.id).delete();
        count++;
      }
    }
    if(count > 0) console.log(`[🧹 SWEEPER] Removed ${count} old queue entries.`);
  } catch (error) {}
}, 30 * 60 * 1000);

// 💎 TOTAL SUBSCRIPTION SWEEPER (RTDB)
setInterval(async () => {
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
}, 60000); 

app.get('/', (req, res) => res.send('MeetVibe Dual-Admin Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));