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
      
      await forceWipeRoom(data.roomId, `Firestore Hybrid Request (${data.action})`);
      
      let title = data.action === 'next' ? "Stranger left" : "Call ended";
      let msg = data.action === 'next' ? "User is looking for someone else" : "The user has ended the call";
      
      if (data.action === 'disconnected' || data.action === 'background') {
        title = "Connection Lost ⚠️";
        msg = "User has lost the connection";
      }

      io.to(data.roomId).emit('call_alert', { title: title, message: msg });
      
      try {
        await change.doc.ref.delete();
      } catch (err) { }
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

    const callerCands = await roomRef.collection('callerCandidates').get();
    let callerCount = 0;
    callerCands.forEach(doc => { deletePromises.push(doc.ref.delete()); callerCount++; });

    const calleeCands = await roomRef.collection('calleeCandidates').get();
    let calleeCount = 0;
    calleeCands.forEach(doc => { deletePromises.push(doc.ref.delete()); calleeCount++; });

    await Promise.all(deletePromises);
    await roomRef.delete();
    
    console.log(`[✅ WIPE SUCCESSFUL] Completely eradicated Room ${roomId} from Firestore! (Cleaned ${callerCount} caller / ${calleeCount} callee signals)\n`);
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
      }
    }
  });

  // 🚀 EXACT LOGGING FORMAT REQUESTED FOR BOTH USERS JOINING
  socket.on('room_established', (data) => {
    console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} has joined room ${data.roomId}\n`);
  });

  // 🚀 SOCKET TRIGGERS FOR FAST DROPS
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
    socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
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
    }
  });

  socket.on('manual_disconnect', async () => {
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} (App killed/backgrounded)`);
    await handleUserDrop(socket.id, "App Backgrounded/Closed");
  });

  socket.on('disconnect', async () => {
    console.log(`[🔌 SOCKET LOST] ID: ${socket.id}`);
    await handleUserDrop(socket.id, "Socket Disconnected");
  });
});

// ==============================================================
// 🚀 SERVER PING CHECKER (Timeout raised to 60s to prevent false drops)
// ==============================================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    // 60 Seconds tolerance. We rely on NetInfo from the client for fast drops!
    const timeoutThreshold = user.isWatchingAd ? 120000 : 60000; 
    
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING DEAD] User ${user.email || user.uid} timed out. Missing pings for >60s.`);
      
      if (user.roomId) {
        console.log(`[🚨 ALERTING PARTNER] Broadcasting disconnect to Room ${user.roomId}`);
        io.to(user.roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
        await forceWipeRoom(user.roomId, 'Server Ping Timeout');
      }

      await handleUserDrop(socketId, "Server Ping Timeout");
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 5000);

async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Reason: ${reason}`);
    
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}
    
    if (user.email && user.inQueue) {
      try { 
        await firestore.collection('randomQueue').doc(user.email).delete(); 
      } catch (error) {}
    }
    
    activeUsers.delete(socketId);
  }
}

// ==============================================================
// 👻 ULTIMATE GHOST ROOM SWEEPER (Checks RTDB 'IsActive' Every 15s)
// ==============================================================
setInterval(async () => {
  try {
    const snapshot = await firestore.collection('room').get();
    if (snapshot.empty) return;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const caller = data.caller;
      const callee = data.callee;
      
      if (!caller || !callee) continue;

      // Check RTDB to see if user is actually active
      const isUserActive = async (email) => {
         const q = rtdb.ref('users').orderByChild('email').equalTo(email);
         const snap = await q.once('value');
         if (!snap.exists()) return false;
         const val = snap.val();
         const uid = Object.keys(val)[0];
         return val[uid].IsActive === true;
      };

      const callerActive = await isUserActive(caller);
      const calleeActive = await isUserActive(callee);

      // 🚀 If EITHER user's database shows IsActive: false, WIPE THE ROOM INSTANTLY
      if (!callerActive || !calleeActive) {
         console.log(`\n[👻 INSTANT GHOST SWEEP] Room ${doc.id} contains an inactive user.`);
         console.log(`- Caller (${caller}): Active=${callerActive}`);
         console.log(`- Callee (${callee}): Active=${calleeActive}`);
         
         io.to(doc.id).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
         await forceWipeRoom(doc.id, 'Ghost Sweeper (IsActive == false)');
      }
    }
  } catch (err) {}
}, 15000); 

// ==============================================================
// 📅 STALE QUEUE & VIP SWEEPERS
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

app.get('/', (req, res) => res.send('MeetVibe Hybrid Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));