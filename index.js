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

// 🚀 INSTANT DB WIPE FUNCTION FOR ROOMS & SUBCOLLECTIONS
async function forceWipeRoom(roomId) {
  if (!roomId) return;
  try {
    const roomRef = firestore.collection('room').doc(roomId);
    const batch = firestore.batch();

    const callerCands = await roomRef.collection('callerCandidates').get();
    callerCands.forEach(doc => batch.delete(doc.ref));

    const calleeCands = await roomRef.collection('calleeCandidates').get();
    calleeCands.forEach(doc => batch.delete(doc.ref));

    await batch.commit();
    await roomRef.delete();
    console.log(`[✅ FIRESTORE WIPE] Room ${roomId} and all collections destroyed.`);
  } catch (error) {
    console.log(`[❌ FIRESTORE ERROR] Failed to clean room ${roomId}:`, error);
  }
}

io.on('connection', (socket) => {
  console.log(`[🔌 CONNECTED] Socket ID: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
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
      const user = activeUsers.get(socket.id);
      if (user.roomId) socket.leave(user.roomId); 
      user.roomId = data.roomId;
      if (data.roomId) socket.join(data.roomId); // Join room so server can broadcast directly to them
    }
  });

  // =========================================================
  // 🚀 1. USER CLICKS END BUTTON
  // =========================================================
  socket.on('videoend', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "User has End the call" });
    await forceWipeRoom(roomId);
  });

  // =========================================================
  // 🚀 2. USER CLICKS NEXT BUTTON
  // =========================================================
  socket.on('videonext', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking someone else" });
    await forceWipeRoom(roomId);
  });

  // =========================================================
  // 🚀 3. USER GOES TO BACKGROUND OR KILLS APP
  // =========================================================
  socket.on('videobackground', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "User has End the call" });
    await forceWipeRoom(roomId);
  });

  // =========================================================
  // 🚀 4. USER LOST INTERNET
  // =========================================================
  socket.on('checkInternet', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Connection Lost", message: "User has lost the connection" });
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
    await handleUserDrop(socket.id);
  });

  socket.on('disconnect', () => {
    handleUserDrop(socket.id);
  });
});

// 🚀 4-SECOND SERVER PING LOOP FOR KILLED APPS
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 8000; 
    if (now - user.lastPing > timeoutThreshold) {
      if (user.roomId) {
        // If app was forcefully killed, alert partner
        io.to(user.roomId).emit('call_alert', { title: "Call ended", message: "User has End the call" });
        await forceWipeRoom(user.roomId);
      }
      await handleUserDrop(socketId);
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

async function handleUserDrop(socketId) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}
    if (user.email && user.inQueue) {
      try { await firestore.collection('randomQueue').doc(user.email).delete(); } catch (error) {}
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