const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 DUAL FIREBASE ADMIN INITIALIZATION
// ==========================================
console.log("[⚙️ SYSTEM] Initializing Firebase Admin SDKs...");

// 1. Realtime Database (Presence & Subscriptions)
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

// 3. Voice Firestore (Voice Rooms & Queues - thirdDb)
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

// A. Watch Video DB EndRoomRequests
firestore.collection('EndRoomRequest').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(async change => {
    if (change.type === 'added') {
      const data = change.doc.data();
      console.log(`\n[🔥 VIDEO HYBRID FALLBACK] Action: '${data.action}' by ${data.by} for Room: ${data.roomId}`);
      await forceWipeRoom(data.roomId, `Video Firestore Request (${data.action})`);
      io.to(data.roomId).emit('call_alert', { 
        title: data.action === 'next' ? "Stranger left" : "Call ended", 
        message: data.action === 'next' ? "User is looking for someone else" : "The user has ended the call" 
      });
      try { await change.doc.ref.delete(); } catch (err) {}
    }
  });
});

// B. Watch Voice DB EndRoomRequests (thirdDb / voiceroom)
voiceFirestore.collection('EndRoomRequest').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(async change => {
    if (change.type === 'added') {
      const data = change.doc.data();
      console.log(`\n[🔥 VOICE HYBRID FALLBACK] Action: '${data.action}' by ${data.by} for Voice Room: ${data.roomId}`);
      await forceWipeRoom(data.roomId, `Voice Firestore Request (${data.action})`);
      io.to(data.roomId).emit('call_alert', { 
        title: data.action === 'next' ? "Stranger left" : "Call ended", 
        message: data.action === 'next' ? "User is looking for someone else" : "The user has ended the call" 
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
  
  const wipeCollection = async (dbInstance, collectionName) => {
      try {
        const roomRef = dbInstance.collection(collectionName).doc(roomId);
        const deletePromises = [];
        let callerCount = 0;
        let calleeCount = 0;

        const callerCands = await roomRef.collection('callerCandidates').get();
        callerCands.forEach(doc => { deletePromises.push(doc.ref.delete()); callerCount++; });

        const calleeCands = await roomRef.collection('calleeCandidates').get();
        calleeCands.forEach(doc => { deletePromises.push(doc.ref.delete()); calleeCount++; });

        await Promise.all(deletePromises);
        await roomRef.delete();
        
        if (callerCount > 0 || calleeCount > 0 || true) {
            console.log(`[✅ WIPE SUCCESSFUL] Eradicated ${collectionName}/${roomId}!`);
        }
      } catch (error) {}
  };

  // Wipe from both Video ('room') and Voice ('voiceroom') databases simultaneously
  await Promise.all([
      wipeCollection(firestore, 'room'),
      wipeCollection(voiceFirestore, 'voiceroom')
  ]);
  
  console.log(`[✅ WIPE OPERATION COMPLETED] Room ${roomId} safely processed.\n`);
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

  socket.on('room_established', (data) => {
    console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} has joined room ${data.roomId}\n`);
  });

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
// 🚀 SERVER PING CHECKER
// ==============================================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 60000; 
    
    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING DEAD] User ${user.email || user.uid} timed out.`);
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
    console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Reason: ${reason}`);
    
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}
    
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
          const caller = data.caller;
          const callee = data.callee;
          
          if (!caller || !callee) {
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

          const callerActive = await isUserActive(caller);
          const calleeActive = await isUserActive(callee);

          if (!callerActive || !calleeActive) {
             console.log(`\n[👻 INACTIVE USER DETECTED] ${collectionName} ${docRef.id} contains a disconnected user.`);
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

app.get('/', (req, res) => res.send('MeetVibe Master Dual-DB Hybrid Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));