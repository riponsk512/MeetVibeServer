// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const admin = require('firebase-admin');

// // ==========================================
// // 🔑 DUAL FIREBASE ADMIN INITIALIZATION
// // ==========================================
// console.log("[⚙️ SYSTEM] Initializing Firebase Admin SDKs...");

// // 1. Realtime Database (Presence & Subscriptions)
// const rtdbServiceAccount = require('./serviceAccountKey.json');
// const rtdbApp = admin.initializeApp({
//    credential: admin.credential.cert(rtdbServiceAccount),
//   databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com" // ⚠️ REPLACE WITH YOUR RTDB URL
// }, 'rtdbApp');
// const rtdb = rtdbApp.database();
// const firestoreServiceAccount = require('./videoChatfirestoreServiceAccountKey.json');
// const firestoreApp = admin.initializeApp({
//   credential: admin.credential.cert(firestoreServiceAccount)
// }, 'firestoreApp');
// const firestore = firestoreApp.firestore();

// // 3. Voice Firestore (Voice Rooms & Queues - thirdDb)
// const voiceFirestoreServiceAccount = require('./voiceCallfirestoreServiceAccountKey.json');
// const voiceFirestoreApp = admin.initializeApp({
//   credential: admin.credential.cert(voiceFirestoreServiceAccount)
// }, 'voiceFirestoreApp');
// const voiceFirestore = voiceFirestoreApp.firestore();

// const app = express();
// app.use(cors());

// const server = http.createServer(app);
// const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// const activeUsers = new Map();

// // ==============================================================
// // 🚀 DUAL-DATABASE HYBRID END-ROOM-REQUEST LISTENERS
// // ==============================================================
// console.log("[🔥 SYSTEM] Starting Firestore 'EndRoomRequest' Watchers for Video & Voice...");

// // 🎥 A. Watch VIDEO DB EndRoomRequests
// firestore.collection('EndRoomRequest').onSnapshot(snapshot => {
//   snapshot.docChanges().forEach(async change => {
//     if (change.type === 'added') {
//       const data = change.doc.data();
//       console.log(`\n[🔥 VIDEO HYBRID FALLBACK] Action: '${data.action}' triggered by ${data.by} for Room: ${data.roomId}`);
      
//       await forceWipeRoom(data.roomId, `Video Firestore Request (${data.action})`);
      
//       let title = data.action === 'next' ? "Stranger left" : "Call ended";
//       let msg = data.action === 'next' ? "User is looking for someone else" : "The user has ended the call";
      
//       if (data.action === 'disconnected' || data.action === 'background') {
//         title = "Connection Lost ⚠️";
//         msg = "User has lost the connection";
//       }

//       io.to(data.roomId).emit('call_alert', { title: title, message: msg });
      
//       try { await change.doc.ref.delete(); } catch (err) { }
//     }
//   });
// });

// // 🎙️ B. Watch VOICE DB EndRoomRequests (thirdDb)
// voiceFirestore.collection('EndRoomRequest').onSnapshot(snapshot => {
//   snapshot.docChanges().forEach(async change => {
//     if (change.type === 'added') {
//       const data = change.doc.data();
//       console.log(`\n[🔥 VOICE HYBRID FALLBACK] Action: '${data.action}' triggered by ${data.by} for Voice Room: ${data.roomId}`);
      
//       await forceWipeRoom(data.roomId, `Voice Firestore Request (${data.action})`);
      
//       let title = data.action === 'next' ? "Stranger left" : "Call ended";
//       let msg = data.action === 'next' ? "User is looking for someone else" : "The user has ended the call";
      
//       if (data.action === 'disconnected' || data.action === 'background') {
//         title = "Connection Lost ⚠️";
//         msg = "User has lost the connection";
//       }

//       io.to(data.roomId).emit('call_alert', { title: title, message: msg });
      
//       try { await change.doc.ref.delete(); } catch (err) { }
//     }
//   });
// });

// // ==============================================================
// // 🚀 CORE FUNCTION: CROSS-DATABASE AGGRESSIVE WIPE
// // ==============================================================
// async function forceWipeRoom(roomId, triggerMethod) {
//   if (!roomId) return;
//   console.log(`\n[🛠️ DB WIPE INITIATED] Source: ${triggerMethod} | Target Room: ${roomId}`);
  
//   // Dynamic function that targets a specific database and collection
//   const wipeCollection = async (dbInstance, collectionName) => {
//       try {
//         const roomRef = dbInstance.collection(collectionName).doc(roomId);
//         const deletePromises = [];
//         let callerCount = 0; let calleeCount = 0;

//         const callerCands = await roomRef.collection('callerCandidates').get();
//         callerCands.forEach(doc => { deletePromises.push(doc.ref.delete()); callerCount++; });

//         const calleeCands = await roomRef.collection('calleeCandidates').get();
//         calleeCands.forEach(doc => { deletePromises.push(doc.ref.delete()); calleeCount++; });

//         await Promise.all(deletePromises);
        
//         // Delete parent document (whether it officially exists or is an italic ghost)
//         await roomRef.delete();
        
//         if (callerCount > 0 || calleeCount > 0) {
//             console.log(`[✅ WIPE SUCCESSFUL] Completely eradicated ${collectionName}/${roomId}! (Cleaned ${callerCount} caller / ${calleeCount} callee signals)`);
//         }
//       } catch (error) {}
//   };

//   // 🚀 MAGIC: Run the wipe on BOTH databases simultaneously!
//   await Promise.all([
//       wipeCollection(firestore, 'room'),               // Video DB
//       wipeCollection(voiceFirestore, 'voiceroom')      // Voice DB
//   ]);
  
//   console.log(`[✅ WIPE OPERATION COMPLETED] Room ${roomId} safely processed.\n`);
// }

// // ==============================================================
// // 🚀 SOCKET.IO CONNECTIONS & HYBRID LAYER 2
// // ==============================================================
// io.on('connection', (socket) => {
//   console.log(`[🔌 NEW SOCKET CONNECTED] ID: ${socket.id}`);

//   socket.on('register_user', async (data) => {
//     const { uid, email, screen } = data;
//     if (!uid) return;
//     activeUsers.set(socket.id, { uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null });
//     console.log(`[👤 USER ONLINE] Email: ${email} | Socket: ${socket.id} | Screen: ${screen}`);
//     try { await rtdb.ref(`users/${uid}`).update({ IsActive: true }); } catch (error) {}
//   });

//   socket.on('set_queue_status', (data) => {
//     if (activeUsers.has(socket.id)) {
//       const user = activeUsers.get(socket.id);
//       user.inQueue = data.inQueue;
//       if (data.email) user.email = data.email;
//       console.log(`[🎯 QUEUE UPDATE] ${user.email} is ${data.inQueue ? 'SEARCHING' : 'IDLE'}`);
//     }
//   });

//   socket.on('set_room_status', (data) => {
//     if (activeUsers.has(socket.id)) {
//       const user = activeUsers.get(socket.id);
//       if (user.roomId) socket.leave(user.roomId); 
//       user.roomId = data.roomId;
//       if (data.roomId) {
//         socket.join(data.roomId); 
//       }
//     }
//   });

//   socket.on('room_established', (data) => {
//     console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} has joined room ${data.roomId}\n`);
//   });

//   socket.on('videoend', async ({ roomId }) => {
//     console.log(`[🛑 SOCKET ACTION] 'videoend' triggered for room ${roomId}`);
//     socket.to(roomId).emit('call_alert', { title: "Call ended", message: "The user has ended the call" });
//     await forceWipeRoom(roomId, 'Socket videoend');
//   });

//   socket.on('videonext', async ({ roomId }) => {
//     console.log(`[⏭️ SOCKET ACTION] 'videonext' triggered for room ${roomId}`);
//     socket.to(roomId).emit('call_alert', { title: "Stranger left", message: "User is looking for someone else" });
//     await forceWipeRoom(roomId, 'Socket videonext');
//   });

//   socket.on('videobackground', async ({ roomId }) => {
//     console.log(`[📱 SOCKET ACTION] 'videobackground' triggered for room ${roomId}`);
//     socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
//     await forceWipeRoom(roomId, 'Socket videobackground');
//   });

//   socket.on('checkInternet', async ({ roomId }) => {
//     console.log(`[📶 SOCKET ACTION] 'checkInternet' triggered for room ${roomId}`);
//     socket.to(roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
//     await forceWipeRoom(roomId, 'Socket checkInternet');
//   });

//   socket.on('ping', () => {
//     if (activeUsers.has(socket.id)) {
//       activeUsers.get(socket.id).lastPing = Date.now();
//     }
//   });

//   socket.on('ad_status', (data) => {
//     if (activeUsers.has(socket.id)) {
//       const user = activeUsers.get(socket.id);
//       user.isWatchingAd = data.isWatchingAd;
//       user.lastPing = Date.now();
//     }
//   });

//   socket.on('manual_disconnect', async () => {
//     console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} (App killed/backgrounded)`);
//     await handleUserDrop(socket.id, "App Backgrounded/Closed");
//   });

//   socket.on('disconnect', async () => {
//     console.log(`[🔌 SOCKET LOST] ID: ${socket.id}`);
//     await handleUserDrop(socket.id, "Socket Disconnected");
//   });
// });

// // ==============================================================
// // 🚀 SERVER PING CHECKER (Detects Dead/Killed Apps)
// // ==============================================================
// setInterval(async () => {
//   const now = Date.now();
//   for (const [socketId, user] of activeUsers.entries()) {
//     const timeoutThreshold = user.isWatchingAd ? 120000 : 60000; 
    
//     if (now - user.lastPing > timeoutThreshold) {
//       console.log(`[🕒 PING DEAD] User ${user.email || user.uid} timed out. Missing pings for >60s.`);
      
//       if (user.roomId) {
//         console.log(`[🚨 ALERTING PARTNER] Broadcasting disconnect to Room ${user.roomId}`);
//         io.to(user.roomId).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
//         await forceWipeRoom(user.roomId, 'Server Ping Timeout');
//       }

//       await handleUserDrop(socketId, "Server Ping Timeout");
//       io.to(socketId).emit('force_disconnect');
//     }
//   }
// }, 5000);

// async function handleUserDrop(socketId, reason) {
//   if (activeUsers.has(socketId)) {
//     const user = activeUsers.get(socketId);
//     console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Reason: ${reason}`);
    
//     try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (error) {}
    
//     // 🚀 DUAL-DATABASE QUEUE CLEANUP
//     if (user.email && user.inQueue) {
//       try { await firestore.collection('randomQueue').doc(user.email).delete(); } catch (error) {}
//       try { await voiceFirestore.collection('voicerandomQueue').doc(user.email).delete(); } catch (error) {}
//     }
    
//     activeUsers.delete(socketId);
//   }
// }

// // ==============================================================
// // 👻 THE ULTIMATE GHOST ROOM SWEEPER (DUAL DATABASE - Every 15s)
// // ==============================================================
// setInterval(async () => {
//   const ghostSweeper = async (dbInstance, collectionName) => {
//       try {
//         const docRefs = await dbInstance.collection(collectionName).listDocuments();

//         for (const docRef of docRefs) {
//           const docSnap = await docRef.get();

//           if (!docSnap.exists) {
//              console.log(`\n[👻 ITALIC GHOST DETECTED] Found orphaned ghost ${collectionName}: ${docRef.id}`);
//              await forceWipeRoom(docRef.id, 'Italic Ghost Sweeper');
//              continue;
//           }

//           const data = docSnap.data();
//           const caller = data.caller;
//           const callee = data.callee;
          
//           if (!caller || !callee) {
//               await forceWipeRoom(docRef.id, 'Malformed Room Sweeper');
//               continue;
//           }

//           const isUserActive = async (email) => {
//              const q = rtdb.ref('users').orderByChild('email').equalTo(email);
//              const snap = await q.once('value');
//              if (!snap.exists()) return false;
//              const val = snap.val();
//              const uid = Object.keys(val)[0];
//              return val[uid].IsActive === true;
//           };

//           const callerActive = await isUserActive(caller);
//           const calleeActive = await isUserActive(callee);

//           if (!callerActive || !calleeActive) {
//              console.log(`\n[👻 INACTIVE USER DETECTED] ${collectionName} ${docRef.id} contains a disconnected user.`);
//              io.to(docRef.id).emit('call_alert', { title: "Connection Lost ⚠️", message: "User has lost the connection" });
//              await forceWipeRoom(docRef.id, 'Ghost Sweeper (IsActive == false)');
//           }
//         }
//       } catch (err) {}
//   };

//   // Sweep both Video and Voice rooms!
//   await ghostSweeper(firestore, 'room');
//   await ghostSweeper(voiceFirestore, 'voiceroom');

// }, 15000); 

// // ==============================================================
// // 📅 STALE QUEUE SWEEPER (DUAL DATABASE)
// // ==============================================================
// setInterval(async () => {
//   const queueSweeper = async (dbInstance, collectionName) => {
//       try {
//         const snapshot = await dbInstance.collection(collectionName).get();
//         if (snapshot.empty) return;
//         const todayStart = new Date();
//         todayStart.setHours(0, 0, 0, 0); 
//         let cleaned = 0;
        
//         for (const doc of snapshot.docs) {
//           const data = doc.data();
//           let docCreatedDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
//           if (docCreatedDate && docCreatedDate < todayStart) {
//             await dbInstance.collection(collectionName).doc(doc.id).delete();
//             cleaned++;
//           }
//         }
//         if (cleaned > 0) console.log(`[🧹 STALE QUEUE SWEEP] Cleaned ${cleaned} records from ${collectionName}.`);
//       } catch (error) {}
//   };

//   // Sweep both Video and Voice Queues!
//   await queueSweeper(firestore, 'randomQueue');
//   await queueSweeper(voiceFirestore, 'voicerandomQueue');

// }, 30 * 60 * 1000);

// // ==============================================================
// // 💎 VIP SUBSCRIPTION SWEEPER
// // ==============================================================
// setInterval(async () => {
//   try {
//     const snap = await rtdb.ref('TotalSubscriptions').once('value');
//     if (!snap.exists()) return;
//     const subscriptions = snap.val();
//     const now = new Date(); 
//     let expCount = 0;
//     for (const [dateKey, subData] of Object.entries(subscriptions)) {
//       const parts = dateKey.split('-');
//       if (parts.length >= 7) {
//         const expDate = new Date(parts[2], parts[1]-1, parts[0], parts[3], parts[4], parts[5], parts[6]);
//         if (expDate <= now) {
//           if (subData.userId) {
//             await rtdb.ref(`users/${subData.userId}/Subscription`).remove();
//             await rtdb.ref(`users/${subData.userId}`).update({ IsVip: false }); 
//           }
//           await rtdb.ref(`TotalSubscriptions/${dateKey}`).remove();
//           expCount++;
//         }
//       }
//     }
//     if (expCount > 0) console.log(`[💎 VIP SWEEP] Expired ${expCount} subscriptions.`);
//   } catch (error) {}
// }, 60000); 

// app.get('/', (req, res) => res.send('MeetVibe Master Dual-DB Hybrid Server Running 🚀'));
// const PORT = process.env.PORT || 3000;
// server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));




const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 QUAD FIREBASE ADMIN INITIALIZATION
// ==========================================
console.log("[⚙️ SYSTEM] Initializing Quad Firebase Admin SDKs (RTDB, Video, Voice, Chat)...");

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


// 3. Voice Firestore (thirdDb: voiceroom & voicerandomQueue)
const voiceFirestoreServiceAccount = require('./voiceCallfirestoreServiceAccountKey.json');
const voiceFirestoreApp = admin.initializeApp({
  credential: admin.credential.cert(voiceFirestoreServiceAccount)
}, 'voiceFirestoreApp');
const voiceFirestore = voiceFirestoreApp.firestore();

// 4. Chat Firestore (fourthDb: chatroom & randomChatQueue)
const chatFirestoreServiceAccount = require('./chatFirestoreServiceAccountKey.json');
const chatFirestoreApp = admin.initializeApp({
  credential: admin.credential.cert(chatFirestoreServiceAccount)
}, 'chatFirestoreApp');
const chatFirestore = chatFirestoreApp.firestore();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const activeUsers = new Map();
const wipingRooms = new Set();
const pendingRoomDrops = new Map(); // roomId -> timeoutId
const protectedRoomsUntil = new Map(); // roomId -> timestampMs

const TERMINAL_STATUSES = ['ended', 'next', 'background', 'disconnected'];

// ==============================================================
// 🚀 HELPERS: ALERTS & PRESENCE CHECK
// ==============================================================
function getAlertPayload(action) {
  if (action === 'next') {
    return { title: "Stranger left", message: "User is looking for someone else" };
  }
  if (action === 'disconnected' || action === 'background') {
    return { title: "Connection Lost ⚠️", message: "User has lost the connection" };
  }
  return { title: "Call ended", message: "The user has ended the call" };
}

function isTerminalRoomState(data) {
  if (!data) return false;
  if (data.endedBy) return true;
  if (data.status && TERMINAL_STATUSES.includes(String(data.status).toLowerCase())) {
    return true;
  }
  return false;
}

function isRoomProtectedForGallery(roomId) {
  if (!roomId) return false;
  const until = protectedRoomsUntil.get(roomId);
  if (until && Date.now() < until) return true;
  for (const u of activeUsers.values()) {
    if (u.roomId === roomId && u.isWatchingAd) return true;
  }
  return false;
}

function isUserConnectedOnAnySocket(email, uid = null) {
  const targetEmail = email ? String(email).toLowerCase() : null;
  for (const u of activeUsers.values()) {
    if (uid && u.uid === uid) return true;
    if (targetEmail && u.email && String(u.email).toLowerCase() === targetEmail) return true;
  }
  return false;
}

function isRoomOccupiedOnSocket(roomId) {
  if (!roomId) return false;
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  if (roomSockets && roomSockets.size > 0) return true;
  for (const u of activeUsers.values()) {
    if (u.roomId === roomId) return true;
  }
  return false;
}

async function isUserActiveInRTDB(email, uid = null) {
  try {
    if (isUserConnectedOnAnySocket(email, uid)) return true;
    if (uid) {
      const snap = await rtdb.ref(`users/${uid}/IsActive`).once('value');
      if (snap.exists()) return snap.val() !== false;
    }
    if (!email) return true;
    const snap = await rtdb.ref('users').orderByChild('email').equalTo(email).once('value');
    // ⚠️ Never return false if query returns empty (email casing or missing index)
    if (!snap.exists()) return true;
    const val = snap.val();
    const firstUid = Object.keys(val)[0];
    return val[firstUid]?.IsActive !== false;
  } catch (e) {
    return true;
  }
}

async function removeUserFromAllQueues(email) {
  if (!email) return;
  await Promise.all([
    firestore.collection('randomQueue').doc(email).delete().catch(() => {}),
    voiceFirestore.collection('voicerandomQueue').doc(email).delete().catch(() => {}),
    chatFirestore.collection('randomChatQueue').doc(email).delete().catch(() => {})
  ]);
}

// ==============================================================
// 🚀 CORE FUNCTION: CROSS-DATABASE AGGRESSIVE WIPE
// ==============================================================
async function wipeSingleCollection(
  dbInstance,
  collectionName,
  roomId,
  callerSubName = 'callerCandidates',
  calleeSubName = 'calleeCandidates'
) {
  try {
    const roomRef = dbInstance.collection(collectionName).doc(roomId);
    const deletePromises = [];
    let callerCount = 0;
    let calleeCount = 0;

    const callerCands = await roomRef.collection(callerSubName).get();
    callerCands.forEach(doc => {
      deletePromises.push(doc.ref.delete());
      callerCount++;
    });

    const calleeCands = await roomRef.collection(calleeSubName).get();
    calleeCands.forEach(doc => {
      deletePromises.push(doc.ref.delete());
      calleeCount++;
    });

    await Promise.all(deletePromises);
    await roomRef.delete();

    return { callerCount, calleeCount };
  } catch (error) {
    return { callerCount: 0, calleeCount: 0 };
  }
}

async function forceWipeRoom(roomId, triggerMethod) {
  if (!roomId || wipingRooms.has(roomId)) return;
  wipingRooms.add(roomId);

  if (pendingRoomDrops.has(roomId)) {
    clearTimeout(pendingRoomDrops.get(roomId));
    pendingRoomDrops.delete(roomId);
  }
  protectedRoomsUntil.delete(roomId);

  console.log(`\n[🛠️ DB WIPE INITIATED] Source: ${triggerMethod} | Target Room: ${roomId}`);

  try {
    const [videoRes, voiceRes, chatRes] = await Promise.all([
      wipeSingleCollection(firestore, 'room', roomId, 'callerCandidates', 'calleeCandidates'),
      wipeSingleCollection(voiceFirestore, 'voiceroom', roomId, 'callerCandidates', 'calleeCandidates'),
      wipeSingleCollection(chatFirestore, 'chatroom', roomId, 'chatCallerCandidates', 'chatCalleeCandidates')
    ]);

    console.log(
      `[✅ WIPE PASS 1 COMPLETE] Room: ${roomId} | ` +
      `Video(${videoRes.callerCount}/${videoRes.calleeCount}) | ` +
      `Voice(${voiceRes.callerCount}/${voiceRes.calleeCount}) | ` +
      `Chat(${chatRes.callerCount}/${chatRes.calleeCount})`
    );

    setTimeout(async () => {
      try {
        await Promise.all([
          wipeSingleCollection(firestore, 'room', roomId, 'callerCandidates', 'calleeCandidates'),
          wipeSingleCollection(voiceFirestore, 'voiceroom', roomId, 'callerCandidates', 'calleeCandidates'),
          wipeSingleCollection(chatFirestore, 'chatroom', roomId, 'chatCallerCandidates', 'chatCalleeCandidates')
        ]);
      } catch (e) {} finally {
        wipingRooms.delete(roomId);
      }
    }, 2500);

  } catch (err) {
    console.log(`[❌ WIPE ERROR] Room ${roomId}:`, err.message);
    wipingRooms.delete(roomId);
  }
}

// ==============================================================
// 🚀 HYBRID LAYER A: LIVE ROOM STATUS WATCHERS
// ==============================================================
function attachRoomStatusWatcher(dbInstance, collectionName, label) {
  dbInstance.collection(collectionName).onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      const roomId = change.doc.id;
      const data = change.doc.data() || {};

      if (change.type === 'added') {
        console.log(`[📞 ${label} ROOM CREATED] ID: ${roomId} | Caller: ${data.caller || 'N/A'} | Callee: ${data.callee || 'N/A'}`);
      }

      if ((change.type === 'added' || change.type === 'modified') && isTerminalRoomState(data)) {
        const action = (data.status && TERMINAL_STATUSES.includes(String(data.status).toLowerCase()))
          ? String(data.status).toLowerCase()
          : 'ended';

        if (action === 'background' && isRoomProtectedForGallery(roomId)) {
          return;
        }

        console.log(`\n[⚡ ${label} STATUS TRIGGER] Room ${roomId} marked as '${action}' by ${data.endedBy || 'user'}`);
        io.to(roomId).emit('call_alert', getAlertPayload(action));

        setTimeout(() => {
          forceWipeRoom(roomId, `${label} Status Field (${action})`);
        }, 600);
      }
    });
  }, err => {
    console.log(`[❌ WATCHER ERROR] ${collectionName}:`, err.message);
  });
}

attachRoomStatusWatcher(firestore, 'room', 'VIDEO');
attachRoomStatusWatcher(voiceFirestore, 'voiceroom', 'VOICE');
attachRoomStatusWatcher(chatFirestore, 'chatroom', 'CHAT');

// ==============================================================
// 🚀 HYBRID LAYER B: END-ROOM-REQUEST WATCHERS
// ==============================================================
function attachEndRequestWatcher(dbInstance, label) {
  dbInstance.collection('EndRoomRequest').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        const data = change.doc.data() || {};

        if (data.action === 'background' && isRoomProtectedForGallery(data.roomId)) {
          try { await change.doc.ref.delete(); } catch (err) {}
          return;
        }

        console.log(`\n[🔥 ${label} END-REQUEST] Action: '${data.action}' by ${data.by} for Room: ${data.roomId}`);

        if (data.roomId) {
          io.to(data.roomId).emit('call_alert', getAlertPayload(data.action));
          await forceWipeRoom(data.roomId, `${label} EndRoomRequest (${data.action})`);
        }

        try { await change.doc.ref.delete(); } catch (err) {}
      }
    });
  }, err => {
    console.log(`[❌ END-REQUEST WATCHER ERROR] ${label}:`, err.message);
  });
}

attachEndRequestWatcher(firestore, 'VIDEO');
attachEndRequestWatcher(voiceFirestore, 'VOICE');
attachEndRequestWatcher(chatFirestore, 'CHAT');

// ==============================================================
// 🚀 SOCKET.IO CONNECTIONS & AUTO-RECOVERY
// ==============================================================
io.on('connection', (socket) => {
  console.log(`[🔌 NEW SOCKET CONNECTED] ID: ${socket.id}`);

  const ensureSocketUser = (data = {}) => {
    if (!activeUsers.has(socket.id)) {
      activeUsers.set(socket.id, {
        uid: data.uid || null,
        email: data.email || null,
        screen: data.screen || 'Home',
        lastPing: Date.now(),
        isWatchingAd: false,
        inQueue: false,
        roomId: data.roomId || null
      });
    }
    const user = activeUsers.get(socket.id);
    if (data.uid) user.uid = data.uid;
    if (data.email) user.email = data.email;
    if (data.screen) user.screen = data.screen;
    user.lastPing = Date.now();
    return user;
  };

  socket.on('register_user', async (data = {}) => {
    const user = ensureSocketUser(data);
    if (data.roomId) {
      user.roomId = data.roomId;
      socket.join(data.roomId);
      if (pendingRoomDrops.has(data.roomId)) {
        clearTimeout(pendingRoomDrops.get(data.roomId));
        pendingRoomDrops.delete(data.roomId);
      }
    }
    console.log(`[👤 USER ONLINE] Email: ${user.email} | Socket: ${socket.id} | Screen: ${user.screen}`);
    if (user.uid) {
      try { await rtdb.ref(`users/${user.uid}`).update({ IsActive: true }); } catch (error) {}
    }
  });

  socket.on('set_queue_status', (data = {}) => {
    const user = ensureSocketUser(data);
    user.inQueue = !!data.inQueue;
  });

  socket.on('set_room_status', async (data = {}) => {
    const user = ensureSocketUser(data);
    if (user.roomId && user.roomId !== data.roomId) {
      socket.leave(user.roomId);
    }
    user.roomId = data.roomId || null;

    if (data.roomId) {
      user.inQueue = false;
      socket.join(data.roomId);

      if (pendingRoomDrops.has(data.roomId)) {
        clearTimeout(pendingRoomDrops.get(data.roomId));
        pendingRoomDrops.delete(data.roomId);
        console.log(`[🛡️ DROP CANCELLED] User ${user.email || socket.id} active in Room: ${data.roomId}`);
      }

      if (user.email) {
        await removeUserFromAllQueues(user.email);
      }
    }
  });

  socket.on('room_established', (data) => {
    if (!data) return;
    if (data.roomId && pendingRoomDrops.has(data.roomId)) {
      clearTimeout(pendingRoomDrops.get(data.roomId));
      pendingRoomDrops.delete(data.roomId);
    }
    console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} has joined room ${data.roomId}\n`);
  });

  socket.on('videoend', async ({ roomId } = {}) => {
    if (!roomId) return;
    socket.to(roomId).emit('call_alert', getAlertPayload('ended'));
    await forceWipeRoom(roomId, 'Socket videoend');
  });

  socket.on('videonext', async ({ roomId } = {}) => {
    if (!roomId) return;
    socket.to(roomId).emit('call_alert', getAlertPayload('next'));
    await forceWipeRoom(roomId, 'Socket videonext');
  });

  socket.on('videobackground', async ({ roomId } = {}) => {
    if (!roomId) return;
    const user = activeUsers.get(socket.id);
    if (user?.isWatchingAd || isRoomProtectedForGallery(roomId)) {
      return;
    }
    socket.to(roomId).emit('call_alert', getAlertPayload('background'));
    await forceWipeRoom(roomId, 'Socket videobackground');
  });

  socket.on('checkInternet', async ({ roomId } = {}) => {
    if (!roomId) return;
    socket.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
    await forceWipeRoom(roomId, 'Socket checkInternet');
  });

  socket.on('ping', (data = {}) => {
    const user = ensureSocketUser(data);
    if (data.roomId && user.roomId !== data.roomId) {
      user.roomId = data.roomId;
      socket.join(data.roomId);
    }
    if (user.roomId && pendingRoomDrops.has(user.roomId)) {
      clearTimeout(pendingRoomDrops.get(user.roomId));
      pendingRoomDrops.delete(user.roomId);
    }
  });

  socket.on('ad_status', async (data = {}) => {
    const user = ensureSocketUser(data);
    user.isWatchingAd = !!data.isWatchingAd;

    const targetRoomId = data.roomId || user.roomId;
    if (targetRoomId && user.isWatchingAd) {
      protectedRoomsUntil.set(targetRoomId, Date.now() + 25000);
    }

    if (user.uid && user.isWatchingAd) {
      try { await rtdb.ref(`users/${user.uid}`).update({ IsActive: true }); } catch (e) {}
    }
  });

  socket.on('manual_disconnect', async () => {
    const user = activeUsers.get(socket.id);
    if (user?.isWatchingAd || (user?.roomId && isRoomProtectedForGallery(user.roomId))) {
      if (user) user.lastPing = Date.now();
      return;
    }
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} (App backgrounded/closed)`);
    await handleUserDrop(socket.id, "App Backgrounded/Closed");
  });

  socket.on('disconnect', async () => {
    console.log(`[🔌 SOCKET LOST] ID: ${socket.id}`);
    await handleUserDrop(socket.id, "Socket Disconnected");
  });
});

// ==============================================================
// 🚀 SERVER PING CHECKER & RECONNECT-SAFE USER DROP HANDLER
// ==============================================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 75000;

    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 PING DEAD] User ${user.email || user.uid} timed out.`);
      await handleUserDrop(socketId, "Server Ping Timeout");
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 8000);

async function handleUserDrop(socketId, reason) {
  if (!activeUsers.has(socketId)) return;

  const user = activeUsers.get(socketId);
  activeUsers.delete(socketId);

  // 🛡️ CRITICAL FIX: If this user already reconnected on a new socket ID, ignore the old socket's disconnect!
  if (isUserConnectedOnAnySocket(user.email, user.uid)) {
    console.log(`[🔄 SOCKET HANDOVER] ${user.email || user.uid} is already active on a newer socket. Ignoring old socket drop.`);
    return;
  }

  if (user.isWatchingAd || (user.roomId && isRoomProtectedForGallery(user.roomId))) {
    const roomId = user.roomId;
    if (roomId && !pendingRoomDrops.has(roomId)) {
      const timer = setTimeout(async () => {
        pendingRoomDrops.delete(roomId);
        if (!isUserConnectedOnAnySocket(user.email, user.uid)) {
          io.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
          await forceWipeRoom(roomId, `Gallery Timeout Drop (${user.email})`);
        }
      }, 22000);
      pendingRoomDrops.set(roomId, timer);
    }
    return;
  }

  console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Reason: ${reason}`);

  if (user.email) {
    await removeUserFromAllQueues(user.email);
  }

  if (user.roomId) {
    const roomId = user.roomId;
    if (!pendingRoomDrops.has(roomId)) {
      // Give 12s for transient mobile network switches before declaring a dropped call
      const waitMs = reason === "App Backgrounded/Closed" ? 3000 : 12000;
      const timer = setTimeout(async () => {
        pendingRoomDrops.delete(roomId);
        if (isRoomProtectedForGallery(roomId)) return;
        if (!isUserConnectedOnAnySocket(user.email, user.uid)) {
          try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (e) {}
          io.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
          await forceWipeRoom(roomId, `Confirmed User Drop (${reason})`);
        }
      }, waitMs);
      pendingRoomDrops.set(roomId, timer);
    }
  } else {
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (e) {}
  }
}

// ==============================================================
// ⚡ 10-SECOND QUEUE SWEEPER (VIDEO, VOICE & CHAT QUEUES)
// ==============================================================
setInterval(async () => {
  const sweepQueueCollection = async (dbInstance, collectionName, label) => {
    try {
      const snapshot = await dbInstance.collection(collectionName).get();
      if (snapshot.empty) return;

      const now = Date.now();
      let cleaned = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() || {};
        const email = docSnap.id;

        const createdMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
        const ageMs = createdMs ? now - createdMs : 0;

        if (createdMs && ageMs > 20000) {
          await docSnap.ref.delete().catch(() => {});
          cleaned++;
          continue;
        }

        if (createdMs && ageMs > 8000) {
          const active = await isUserActiveInRTDB(email, data.uid);
          if (!active) {
            await docSnap.ref.delete().catch(() => {});
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        console.log(`[⚡ ${label} QUEUE SWEEP] Purged ${cleaned} stale/offline queue docs from ${collectionName}.`);
      }
    } catch (error) {}
  };

  await Promise.all([
    sweepQueueCollection(firestore, 'randomQueue', 'VIDEO'),
    sweepQueueCollection(voiceFirestore, 'voicerandomQueue', 'VOICE'),
    sweepQueueCollection(chatFirestore, 'randomChatQueue', 'CHAT')
  ]);
}, 10000);

// ==============================================================
// 👻 GHOST ROOM SWEEPER (NEVER KILLS ACTIVE HANDSHAKEN CALLS)
// ==============================================================
setInterval(async () => {
  const sweepDatabaseRooms = async (dbInstance, collectionName, label) => {
    try {
      const docRefs = await dbInstance.collection(collectionName).listDocuments();

      for (const docRef of docRefs) {
        const roomId = docRef.id;
        if (
          wipingRooms.has(roomId) ||
          pendingRoomDrops.has(roomId) ||
          isRoomProtectedForGallery(roomId)
        ) {
          continue;
        }

        const docSnap = await docRef.get();

        // CASE 1: Italic Ghost Document (Parent deleted, subcollections remain)
        if (!docSnap.exists) {
          await forceWipeRoom(roomId, `${label} Italic Ghost Sweeper`);
          continue;
        }

        const data = docSnap.data() || {};

        // CASE 2: Document has a terminal status ('ended', 'next', 'background', 'disconnected')
        if (isTerminalRoomState(data)) {
          const action = data.status || 'ended';
          io.to(roomId).emit('call_alert', getAlertPayload(action));
          await forceWipeRoom(roomId, `${label} Lingering Status Sweeper`);
          continue;
        }

        // CASE 3: Malformed room missing caller or callee
        if (!data.caller || !data.callee) {
          await forceWipeRoom(roomId, `${label} Malformed Room Sweeper`);
          continue;
        }

        const createdMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
        const roomAgeMs = createdMs ? Date.now() - createdMs : 0;

        if (roomAgeMs < 40000) continue;

        // CASE 4: Room older than 45s that never completed offer/answer OR chatOffer/chatAnswer handshake
        const hasHandshake = (data.offer && data.answer) || (data.chatOffer && data.chatAnswer);
        if (roomAgeMs > 45000 && !hasHandshake) {
          console.log(`\n[👻 UNFINISHED HANDSHAKE] ${label} ${roomId} stuck without offer/answer for >45s.`);
          io.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
          await forceWipeRoom(roomId, `${label} Unfinished Handshake Sweeper`);
          continue;
        }

        // CASE 5: Only sweep an established room if NEITHER user is connected on Socket.IO anymore
        const callerOnSocket = isUserConnectedOnAnySocket(data.caller);
        const calleeOnSocket = isUserConnectedOnAnySocket(data.callee);
        const roomOccupied = isRoomOccupiedOnSocket(roomId);

        if (!callerOnSocket && !calleeOnSocket && !roomOccupied) {
          console.log(`\n[👻 ABANDONED ROOM] ${label} ${roomId} has no connected users. Wiping...`);
          await forceWipeRoom(roomId, `${label} Abandoned Room Sweeper`);
        }
      }
    } catch (err) {}
  };

  await Promise.all([
    sweepDatabaseRooms(firestore, 'room', 'VIDEO'),
    sweepDatabaseRooms(voiceFirestore, 'voiceroom', 'VOICE'),
    sweepDatabaseRooms(chatFirestore, 'chatroom', 'CHAT')
  ]);
}, 15000);

// ==============================================================
// 💎 VIP SUBSCRIPTION SWEEPER (Every 1 Min)
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
        const expDate = new Date(parts[2], parts[1] - 1, parts[0], parts[3], parts[4], parts[5], parts[6]);
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

app.get('/', (req, res) => res.send('MeetVibe Master Quad-DB Hybrid Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));