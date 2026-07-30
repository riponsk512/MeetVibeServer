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

// 🚀 BULLETPROOF DATABASE WIPE (Removes Room + All Subcollections)
async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId) return;
  try {
    console.log(`\n[🗑️ DB WIPE STARTED] Trigger: ${triggerMethod} | Room: ${roomId}`);
    const roomRef = firestore.collection('room').doc(roomId);

    // Using Promise.all instead of Batch to prevent silent failures
    const deletePromises = [];

    // 1. Fetch & Destroy Caller Candidates
    const callerCands = await roomRef.collection('callerCandidates').get();
    let callerCount = 0;
    callerCands.forEach(doc => {
      deletePromises.push(doc.ref.delete());
      callerCount++;
    });

    // 2. Fetch & Destroy Callee Candidates
    const calleeCands = await roomRef.collection('calleeCandidates').get();
    let calleeCount = 0;
    calleeCands.forEach(doc => {
      deletePromises.push(doc.ref.delete());
      calleeCount++;
    });

    // 3. Wait for all subcollection documents to be entirely deleted
    await Promise.all(deletePromises);
    
    // 4. Finally delete the parent room
    await roomRef.delete();
    
    console.log(`[✅ WIPE SUCCESS] Eradicated Room ${roomId}! (CallerCands: ${callerCount}, CalleeCands: ${calleeCount})\n`);
  } catch (error) {
    console.log(`[❌ WIPE ERROR] Failed to clean room ${roomId}:`, error.message);
  }
}

io.on('connection', (socket) => {
  console.log(`[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
    console.log(`[👤 ONLINE] Email: ${email} | Socket: ${socket.id}`);
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
      if (data.roomId) {
        socket.join(data.roomId); // Join specific room for alerts
        console.log(`[📞 ROOM JOINED] Socket ${socket.id} joined Room: ${data.roomId}`);
      }
    }
  });

  // =========================================================
  // 🚀 1. USER CLICKED END BUTTON
  // =========================================================
  socket.on('videoend', async ({ roomId }) => {
    console.log(`[🛑 ACTION: END] Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'videoend');
  });

  // =========================================================
  // 🚀 2. USER CLICKED NEXT BUTTON
  // =========================================================
  socket.on('videonext', async ({ roomId }) => {
    console.log(`[⏭️ ACTION: NEXT] Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking for someone else" });
    await forceWipeRoom(roomId, 'videonext');
  });

  // =========================================================
  // 🚀 3. USER GOES TO BACKGROUND OR KILLS APP
  // =========================================================
  socket.on('videobackground', async ({ roomId }) => {
    console.log(`[📱 ACTION: BACKGROUND] Room: ${roomId}`);
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'videobackground');
  });

  // =========================================================
  // 🚀 4. USER LOST INTERNET
  // =========================================================
  socket.on('checkInternet', async ({ roomId }) => {
    console.log(`[📶 ACTION: NO INTERNET] Room: ${roomId}`);
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
    console.log(`[⚠️ APP KILLED/BACKGROUND] Socket: ${socket.id}`);
    await handleUserDrop(socket.id);
  });

  socket.on('disconnect', () => {
    console.log(`[🔌 DISCONNECTED] ID: ${socket.id}`);
    handleUserDrop(socket.id);
  });
});

// 🚀 4-SECOND PING CHECKER (Triggers if app is killed entirely)
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 15000; 
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING TIMEOUT] User ${user.email || user.uid} dropped.`);
      
      // If they had a room and the ping died (App Killed), tell the other user!
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

// 📅 STALE QUEUE SWEEPER
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

// 💎 SUBSCRIPTION SWEEPER
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
    if (expiredCount > 0) console.log(`[💎 SUBSCRIPTION SWEEPER] Expired ${expiredCount} subscriptions.`);
  } catch (error) {}
}, 60000); 

app.get('/', (req, res) => res.send('MeetVibe Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));