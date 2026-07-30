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

// 🚀 SERVER FUNCTION: INSTANTLY WIPES ROOM & ALL CANDIDATES FROM FIRESTORE
async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId) return;
  try {
    console.log(`\n[🗑️ FIRESTORE WIPE] Trigger: ${triggerMethod} | Room ID: ${roomId}`);
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

    // 3. Commit batch & delete room document
    await batch.commit();
    await roomRef.delete();
    
    console.log(`[✅ WIPE SUCCESS] Room ${roomId} wiped! (callerCandidates: ${callerCount}, calleeCandidates: ${calleeCount})\n`);
  } catch (error) {
    console.log(`[❌ WIPE ERROR] Failed to clean room ${roomId}:`, error.message);
  }
}

io.on('connection', (socket) => {
  console.log(`[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  // 1. Register User
  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
    console.log(`[👤 USER REGISTERED] Email: ${email} | Socket: ${socket.id} | Screen: ${screen}`);
    try { await rtdb.ref(`users/${uid}`).update({ IsActive: true }); } catch (error) {}
  });

  // 2. Queue Status Update
  socket.on('set_queue_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.inQueue = data.inQueue;
      if (data.email) user.email = data.email;
      console.log(`[🎯 QUEUE STATUS] ${user.email || socket.id} is ${data.inQueue ? 'Searching in Queue' : 'Idle'}`);
    }
  });

  // 3. Room Status Update (Joins Socket Room)
  socket.on('set_room_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      if (user.roomId) socket.leave(user.roomId); 
      user.roomId = data.roomId;
      if (data.roomId) {
        socket.join(data.roomId);
        console.log(`[📞 ROOM JOINED] ${user.email || socket.id} joined Socket Room: ${data.roomId}`);
      }
    }
  });

  // ==============================================================
  // 🚀 METHOD 1: END BUTTON CLICKED
  // ==============================================================
  socket.on('videoend', async ({ roomId }) => {
    console.log(`[🛑 SOCKET EVENT] 'videoend' received for Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "User has End the call" });
    await forceWipeRoom(roomId, 'videoend');
  });

  // ==============================================================
  // 🚀 METHOD 2: NEXT BUTTON CLICKED
  // ==============================================================
  socket.on('videonext', async ({ roomId }) => {
    console.log(`[⏭️ SOCKET EVENT] 'videonext' received for Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking someone else" });
    await forceWipeRoom(roomId, 'videonext');
  });

  // ==============================================================
  // 🚀 METHOD 3: GOES TO BACKGROUND OR KILLS APP
  // ==============================================================
  socket.on('videobackground', async ({ roomId }) => {
    console.log(`[📱 SOCKET EVENT] 'videobackground' received for Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "User has End the call" });
    await forceWipeRoom(roomId, 'videobackground');
  });

  // ==============================================================
  // 🚀 METHOD 4: INTERNET LOST / NETWORK SWITCHED
  // ==============================================================
  socket.on('checkInternet', async ({ roomId }) => {
    console.log(`[📶 SOCKET EVENT] 'checkInternet' received for Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
    await forceWipeRoom(roomId, 'checkInternet');
  });

  // Manual destroy fallback
  socket.on('destroy_room', async ({ roomId }) => {
    console.log(`[⚡ SOCKET EVENT] 'destroy_room' fallback for Room: ${roomId}`);
    await forceWipeRoom(roomId, 'destroy_room');
  });

  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) activeUsers.get(socket.id).lastPing = Date.now();
  });

  socket.on('ad_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.isWatchingAd = data.isWatchingAd;
      user.lastPing = Date.now();
      console.log(`[📺 AD STATUS] ${user.email || socket.id} is Watching Ad: ${data.isWatchingAd}`);
    }
  });

  socket.on('manual_disconnect', async () => {
    console.log(`[⚠️ MANUAL DISCONNECT] Socket: ${socket.id}`);
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  socket.on('disconnect', () => {
    console.log(`[🔌 SOCKET DISCONNECTED] ID: ${socket.id}`);
    handleUserDrop(socket.id, 'Socket Connection Lost');
  });
});

// 🚀 4-SECOND PING MONITORING LOOP (For Forced App Kills)
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 8000; // 8s threshold allows exactly 1 missed ping
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING TIMEOUT] User ${user.email || user.uid} missed pings for >${timeoutThreshold/1000}s`);
      
      if (user.roomId) {
        io.to(user.roomId).emit('call_alert', { title: "Call ended", message: "User has End the call" });
        await forceWipeRoom(user.roomId, 'Ping Timeout / App Killed');
      }

      await handleUserDrop(socketId, 'Missed Ping Timeout');
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
        console.log(`[🔥 QUEUE CLEANUP] Removed ${user.email} from randomQueue.`);
      } catch (error) {}
    }

    activeUsers.delete(socketId);
  }
}

// 📅 1. STALE RANDOM QUEUE SWEEPER (Every 30 Minutes)
setInterval(async () => {
  try {
    const snapshot = await firestore.collection('randomQueue').get();
    if (snapshot.empty) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); 
    let cleaned = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      let docCreatedDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (docCreatedDate && docCreatedDate < todayStart) {
        await firestore.collection('randomQueue').doc(doc.id).delete();
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`[🧹 QUEUE SWEEPER] Cleaned ${cleaned} stale queue records.`);
  } catch (error) {}
}, 30 * 60 * 1000);

// 💎 2. TOTAL SUBSCRIPTION SWEEPER (Every 1 Minute)
setInterval(async () => {
  try {
    const snap = await rtdb.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) return;
    const subscriptions = snap.val();
    const now = new Date(); 
    let expiredCount = 0;
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
          expiredCount++;
        }
      }
    }
    if (expiredCount > 0) console.log(`[💎 SUBSCRIPTION SWEEPER] Processed & expired ${expiredCount} subscriptions.`);
  } catch (error) {}
}, 60000); 

app.get('/', (req, res) => res.send('MeetVibe Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));