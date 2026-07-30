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

// 🚀 BULLETPROOF DATABASE WIPE
async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId) return;
  try {
    console.log(`\n[🗑️ DB WIPE] Trigger: ${triggerMethod} | Room: ${roomId}`);
    const roomRef = firestore.collection('room').doc(roomId);
    const deletePromises = [];

    const callerCands = await roomRef.collection('callerCandidates').get();
    callerCands.forEach(doc => deletePromises.push(doc.ref.delete()));

    const calleeCands = await roomRef.collection('calleeCandidates').get();
    calleeCands.forEach(doc => deletePromises.push(doc.ref.delete()));

    await Promise.all(deletePromises);
    await roomRef.delete();
    
    console.log(`[✅ WIPE SUCCESS] Eradicated Room ${roomId} and all collections.\n`);
  } catch (error) {
    console.log(`[❌ WIPE ERROR] Failed to clean room ${roomId}:`, error.message);
  }
}

io.on('connection', (socket) => {
  console.log(`[🔌 CONNECTED] Socket: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
    console.log(`[👤 ONLINE] Email: ${email}`);
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
      if (data.roomId) socket.join(data.roomId); 
    }
  });

  socket.on('videoend', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'videoend');
  });

  socket.on('videonext', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking for someone else" });
    await forceWipeRoom(roomId, 'videonext');
  });

  socket.on('videobackground', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'videobackground');
  });

  socket.on('checkInternet', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
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
    console.log(`[⚠️ BACKGROUND/KILLED] Socket: ${socket.id}`);
    await handleUserDrop(socket.id);
  });

  socket.on('disconnect', () => {
    handleUserDrop(socket.id);
  });
});

// 🚀 SERVER PING CHECKER (Increased to 20s to prevent false drops during video load)
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 20000; // 20 Seconds!
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING TIMEOUT] User ${user.email} dropped.`);
      if (user.roomId) {
        io.to(user.roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
        await forceWipeRoom(user.roomId, 'Server Ping Timeout');
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

app.get('/', (req, res) => res.send('MeetVibe Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));