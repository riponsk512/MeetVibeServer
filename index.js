const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

console.log("[⚙️ SYSTEM] Initializing Firebase Admin SDKs...");

// ==========================================
// 🔑 1. REALTIME DATABASE (Presence & Users)
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

// ==========================================
// 🔑 3. VOICE FIRESTORE (Voice Rooms - thirdDb)
// ==========================================
const voiceFirestoreServiceAccount = require('./voiceCallfirestoreServiceAccountKey.json');
const voiceFirestoreApp = admin.initializeApp({
  credential: admin.credential.cert(voiceFirestoreServiceAccount)
}, 'voiceFirestoreApp');
const voiceFirestore = voiceFirestoreApp.firestore();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const activeUsers = new Map();

// ==============================================================
// 🚀 DUAL-DATABASE HYBRID END-ROOM-REQUEST LISTENERS
// ==============================================================
console.log("[🔥 SYSTEM] Starting Firestore 'EndRoomRequest' Watchers for Video & Voice...");

// 🎥 A. Watch VIDEO DB EndRoomRequests
firestore.collection('EndRoomRequest').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(async change => {
    if (change.type === 'added') {
      const data = change.doc.data();
      console.log(`\n[🔥 VIDEO HYBRID FALLBACK] Action: '${data.action}' by ${data.by} for Room: ${data.roomId}`);
      await forceWipeRoom(data.roomId, `Video Firestore Request (${data.action})`);
      
      io.to(data.roomId).emit('call_alert', { 
        title: (data.action === 'disconnected' || data.action === 'background') ? "Connection Lost ⚠️" : (data.action === 'next' ? "Stranger left" : "Call ended"), 
        message: (data.action === 'disconnected' || data.action === 'background') ? "User has lost the connection" : (data.action === 'next' ? "User is looking for someone else" : "The user has ended the call")
      });
      try { await change.doc.ref.delete(); } catch (err) {}
    }
  });
});

// 🎙️ B. Watch VOICE DB EndRoomRequests (thirdDb)
voiceFirestore.collection('EndRoomRequest').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(async change => {
    if (change.type === 'added') {
      const data = change.doc.data();
      console.log(`\n[🔥 VOICE HYBRID FALLBACK] Action: '${data.action}' by ${data.by} for Voice Room: ${data.roomId}`);
      await forceWipeRoom(data.roomId, `Voice Firestore Request (${data.action})`);
      
      io.to(data.roomId).emit('call_alert', { 
        title: (data.action === 'disconnected' || data.action === 'background') ? "Connection Lost ⚠️" : (data.action === 'next' ? "Stranger left" : "Call ended"), 
        message: (data.action === 'disconnected' || data.action === 'background') ? "User has lost the connection" : (data.action === 'next' ? "User is looking for someone else" : "The user has ended the call")
      });
      try { await change.doc.ref.delete(); } catch (err) {}
    }
  });
});

// ==============================================================
// 🚀 CORE FUNCTION: CROSS-DATABASE AGGRESSIVE WIPE
// ==============================================================
async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId) return;
  console.log(`\n[🛠️ DB WIPE INITIATED] Source: ${triggerMethod} | Target Room: ${roomId}`);
  
  // Dynamic function that accepts the target database
  const wipeCollection = async (dbInstance, collectionName) => {
      try {
        const roomRef = dbInstance.collection(collectionName).doc(roomId);
        const deletePromises = [];
        let callerCount = 0; let calleeCount = 0;

        const callerCands = await roomRef.collection('callerCandidates').get();
        callerCands.forEach(doc => { deletePromises.push(doc.ref.delete()); callerCount++; });

        const calleeCands = await roomRef.collection('calleeCandidates').get();
        calleeCands.forEach(doc => { deletePromises.push(doc.ref.delete()); calleeCount++; });

        await Promise.all(deletePromises);
        await roomRef.delete();
        
        if (callerCount > 0 || calleeCount > 0) {
            console.log(`[✅ WIPE SUCCESSFUL] Eradicated ${collectionName}/${roomId}!`);
        }
      } catch (error) {}
  };

  // 🚀 SWEEP BOTH DBs SIMULTANEOUSLY! 
  await Promise.all([
      wipeCollection(firestore, 'room'),               // Video DB
      wipeCollection(voiceFirestore, 'voiceroom')      // Voice DB
  ]);
  
  console.log(`[✅ WIPE OPERATION COMPLETED] Room ${roomId} safely processed.\n`);
}

// ==============================================================
// 🚀 SOCKET.IO CONNECTIONS 
// ==============================================================
io.on('connection', (socket) => {
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
      if (data.roomId) socket.join(data.roomId); 
    }
  });

  socket.on('room_established', (data) => {
    console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} has joined room ${data.roomId}\n`);
  });

  socket.on('videoend', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
    await forceWipeRoom(roomId, 'Socket videoend');
  });

  socket.on('videonext', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking for someone else" });
    await forceWipeRoom(roomId, 'Socket videonext');
  });

  socket.on('videobackground', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
    await forceWipeRoom(roomId, 'Socket videobackground');
  });

  socket.on('checkInternet', async ({ roomId }) => {
    socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
    await forceWipeRoom(roomId, 'Socket checkInternet');
  });

  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) activeUsers.get(socket.id).lastPing = Date.now();
  });

  socket.on('manual_disconnect', async () => {
    await handleUserDrop(socket.id, "App Backgrounded/Closed");
  });

  socket.on('disconnect', async () => {
    await handleUserDrop(socketId, "Socket Disconnected");
  });
});

// ==============================================================
// 🚀 SERVER PING CHECKER 
// ==============================================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 60000; 
    
    if (now - user.lastPing > timeoutThreshold) {
      if (user.roomId) {
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
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}
    
    // 🚀 DUAL-DATABASE QUEUE CLEANUP
    if (user.email && user.inQueue) {
      try { 
        await firestore.collection('randomQueue').doc(user.email).delete(); 
        await voiceFirestore.collection('voicerandomQueue').doc(user.email).delete(); 
      } catch (error) {}
    }
    activeUsers.delete(socketId);
  }
}

// ==============================================================
// 👻 GHOST ROOM SWEEPER (DUAL DATABASE - Every 15s)
// ==============================================================
setInterval(async () => {
  const ghostSweeper = async (dbInstance, collectionName) => {
      try {
        const docRefs = await dbInstance.collection(collectionName).listDocuments();
        for (const docRef of docRefs) {
          const docSnap = await docRef.get();
          if (!docSnap.exists) {
             await forceWipeRoom(docRef.id, 'Italic Ghost Sweeper');
             continue;
          }
          const data = docSnap.data();
          if (!data.caller || !data.callee) {
              await forceWipeRoom(docRef.id, 'Malformed Room Sweeper');
              continue;
          }

          const isUserActive = async (email) => {
             const q = rtdb.ref('users').orderByChild('email').equalTo(email);
             const snap = await q.once('value');
             if (!snap.exists()) return false;
             const val = snap.val();
             const uid = Object.keys(val)[0];
             return val[uid].IsActive === true;
          };

          const callerActive = await isUserActive(data.caller);
          const calleeActive = await isUserActive(data.callee);

          if (!callerActive || !calleeActive) {
             io.to(docRef.id).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
             await forceWipeRoom(docRef.id, 'Ghost Sweeper (IsActive == false)');
          }
        }
      } catch (err) {}
  };

  await ghostSweeper(firestore, 'room');
  await ghostSweeper(voiceFirestore, 'voiceroom');
}, 15000); 

// ==============================================================
// 📅 STALE QUEUE SWEEPER (DUAL DATABASE)
// ==============================================================
setInterval(async () => {
  const queueSweeper = async (dbInstance, collectionName) => {
      try {
        const snapshot = await dbInstance.collection(collectionName).get();
        if (snapshot.empty) return;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0); 
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          let docCreatedDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          if (docCreatedDate && docCreatedDate < todayStart) {
            await dbInstance.collection(collectionName).doc(doc.id).delete();
          }
        }
      } catch (error) {}
  };

  await queueSweeper(firestore, 'randomQueue');
  await queueSweeper(voiceFirestore, 'voicerandomQueue');
}, 30 * 60 * 1000);

// ==============================================================
// 💎 VIP SUBSCRIPTION SWEEPER
// ==============================================================
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

app.get('/', (req, res) => res.send('MeetVibe Master Dual-DB Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));