const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 DUAL FIREBASE ADMIN INITIALIZATION
// ==========================================
console.log("[⚙️ SYSTEM] Initializing Firebase Admin SDKs...");

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

// ==============================================================
// 🚀 HYBRID LAYER 3: FIRESTORE END-ROOM-REQUEST LISTENER
// ==============================================================
console.log("[🔥 SYSTEM] Starting Firestore 'EndRoomRequest' Watcher...");
firestore.collection('EndRoomRequest').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(async change => {
    if (change.type === 'added') {
      const data = change.doc.data();
      console.log(`\n[🔥 HYBRID FALLBACK DETECTED] Action: '${data.action}' triggered by ${data.by} for Room: ${data.roomId}`);
      
      // 1. Wipe the room
      await forceWipeRoom(data.roomId, `Firestore Hybrid Request (${data.action})`);
      
      // 2. Alert the room just in case Socket/WebRTC failed
      let title = data.action === 'next' ? "Stranger left" : "Call ended";
      let msg = data.action === 'next' ? "User is looking for someone else" : "The user has ended the call";
      
      if (data.action === 'disconnected') {
        title = "Connection Lost ⚠️";
        msg = "User has lost the connection";
      }

      io.to(data.roomId).emit('call_alert', { title: title, message: msg });
      
      // 3. Delete the request document so it doesn't process again
      try {
        await change.doc.ref.delete();
        console.log(`[🗑️ HYBRID CLEANUP] Deleted EndRoomRequest document for room ${data.roomId}`);
      } catch (err) {
        console.log(`[❌ HYBRID ERROR] Failed to delete EndRoomRequest doc:`, err.message);
      }
    }
  });
});

// ==============================================================
// 🚀 CORE FUNCTION: AGGRESSIVE PROMISE-BASED WIPE
// ==============================================================
async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId) return;
  console.log(`\n[🛠️ DB WIPE INITIATED] Source: ${triggerMethod} | Target Room: ${roomId}`);
  
  try {
    const roomRef = firestore.collection('room').doc(roomId);
    const deletePromises = [];

    console.log(`[🔍 DB SCAN] Fetching callerCandidates for room ${roomId}...`);
    const callerCands = await roomRef.collection('callerCandidates').get();
    let callerCount = 0;
    callerCands.forEach(doc => { deletePromises.push(doc.ref.delete()); callerCount++; });
    console.log(`[📌 DB QUEUE] Queued ${callerCount} callerCandidates for deletion.`);

    console.log(`[🔍 DB SCAN] Fetching calleeCandidates for room ${roomId}...`);
    const calleeCands = await roomRef.collection('calleeCandidates').get();
    let calleeCount = 0;
    calleeCands.forEach(doc => { deletePromises.push(doc.ref.delete()); calleeCount++; });
    console.log(`[📌 DB QUEUE] Queued ${calleeCount} calleeCandidates for deletion.`);

    console.log(`[⏳ DB ACTION] Executing Promise.all deletion for subcollections...`);
    await Promise.all(deletePromises);
    
    console.log(`[⏳ DB ACTION] Deleting main room document...`);
    await roomRef.delete();
    
    console.log(`[✅ WIPE SUCCESSFUL] Completely eradicated Room ${roomId} from Firestore!\n`);
  } catch (error) {
    console.log(`[❌ WIPE FATAL ERROR] Failed to clean room ${roomId}:`, error.message);
  }
}

// ==============================================================
// 🚀 SOCKET.IO CONNECTIONS & HYBRID LAYER 2
// ==============================================================
io.on('connection', (socket) => {
  console.log(`[🔌 NEW SOCKET CONNECTED] ID: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
    console.log(`[👤 USER ONLINE] Email: ${email} | Socket: ${socket.id} | Screen: ${screen}`);
    try { await rtdb.ref(`users/${uid}`).update({ IsActive: true }); } catch (error) {}
  });

  socket.on('set_queue_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.inQueue = data.inQueue;
      if (data.email) user.email = data.email;
      console.log(`[🎯 QUEUE UPDATE] ${user.email} is ${data.inQueue ? 'SEARCHING' : 'IDLE'}`);
    }
  });

  socket.on('set_room_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      if (user.roomId) socket.leave(user.roomId); 
      user.roomId = data.roomId;
      if (data.roomId) {
        socket.join(data.roomId); 
        console.log(`[🚪 SOCKET ROOM JOINED] ${user.email} joined Socket Room: ${data.roomId}`);
      }
    }
  });

  // 🚀 EXACT LOG YOU REQUESTED FOR JOINING
  socket.on('room_established', (data) => {
    console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} have joined ${data.roomId} room\n`);
  });

  // 🚀 HYBRID 2: SOCKET TRIGGERS
  socket.on('videoend', async ({ roomId }) => {
    console.log(`[🛑 SOCKET ACTION] 'videoend' triggered for room ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'Socket videoend');
  });

  socket.on('videonext', async ({ roomId }) => {
    console.log(`[⏭️ SOCKET ACTION] 'videonext' triggered for room ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking for someone else" });
    await forceWipeRoom(roomId, 'Socket videonext');
  });

  socket.on('videobackground', async ({ roomId }) => {
    console.log(`[📱 SOCKET ACTION] 'videobackground' triggered for room ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'Socket videobackground');
  });

  socket.on('checkInternet', async ({ roomId }) => {
    console.log(`[📶 SOCKET ACTION] 'checkInternet' triggered for room ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
    await forceWipeRoom(roomId, 'Socket checkInternet');
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
      console.log(`[📺 AD STATUS] ${user.email} watching ad: ${data.isWatchingAd}`);
    }
  });

  socket.on('manual_disconnect', async () => {
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} (App killed/backgrounded)`);
    await handleUserDrop(socket.id, "App Backgrounded/Closed");
  });

  socket.on('disconnect', async () => {
    console.log(`[🔌 SOCKET LOST] ID: ${socket.id} (No Internet / Hard Crash)`);
    await handleUserDrop(socket.id, "Socket Disconnected");
  });
});

// ==============================================================
// 🚀 SERVER PING CHECKER (Detects Dead/Killed Apps)
// ==============================================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 20000; // 20 Seconds Buffer
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING DEAD] User ${user.email || user.uid} timed out. Missing pings for >20s.`);
      
      if (user.roomId) {
        console.log(`[🚨 ALERTING PARTNER] Broadcasting disconnect to Room ${user.roomId}`);
        io.to(user.roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
        await forceWipeRoom(user.roomId, 'Server Ping Timeout');
      }

      await handleUserDrop(socketId, "Server Ping Timeout");
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Reason: ${reason}`);
    
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}
    
    if (user.email && user.inQueue) {
      try { 
        await firestore.collection('randomQueue').doc(user.email).delete(); 
        console.log(`[🔥 QUEUE CLEANED] Removed ${user.email} from RandomQueue.`);
      } catch (error) {}
    }
    
    activeUsers.delete(socketId);
  }
}

// ==============================================================
// 📅 STALE QUEUE SWEEPER (30 MIN)
// ==============================================================
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
    if (cleaned > 0) console.log(`[🧹 STALE QUEUE SWEEP] Cleaned ${cleaned} records.`);
  } catch (error) {}
}, 30 * 60 * 1000);

// ==============================================================
// 💎 SUBSCRIPTION SWEEPER (1 MIN)
// ==============================================================
setInterval(async () => {
  try {
    const snap = await rtdb.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) return;
    const subscriptions = snap.val();
    const now = new Date(); 
    let expCount = 0;
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
          expCount++;
        }
      }
    }
    if (expCount > 0) console.log(`[💎 VIP SWEEP] Expired ${expCount} subscriptions.`);
  } catch (error) {}
}, 60000); 

app.get('/', (req, res) => res.send('MeetVibe Hybrid Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));