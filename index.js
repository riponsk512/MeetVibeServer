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




// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const admin = require('firebase-admin');

// // ==========================================
// // 🔑 QUAD FIREBASE ADMIN INITIALIZATION
// // ==========================================
// console.log("[⚙️ SYSTEM] Initializing Quad Firebase Admin SDKs (RTDB, Video, Voice, Chat)...");

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


// // 3. Voice Firestore (thirdDb: voiceroom & voicerandomQueue)
// const voiceFirestoreServiceAccount = require('./voiceCallfirestoreServiceAccountKey.json');
// const voiceFirestoreApp = admin.initializeApp({
//   credential: admin.credential.cert(voiceFirestoreServiceAccount)
// }, 'voiceFirestoreApp');
// const voiceFirestore = voiceFirestoreApp.firestore();

// // 4. Chat Firestore (fourthDb: chatroom & randomChatQueue)
// const chatFirestoreServiceAccount = require('./chatFirestoreServiceAccountKey.json');
// const chatFirestoreApp = admin.initializeApp({
//   credential: admin.credential.cert(chatFirestoreServiceAccount)
// }, 'chatFirestoreApp');
// const chatFirestore = chatFirestoreApp.firestore();

// const app = express();
// app.use(cors());

// const server = http.createServer(app);
// const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// const activeUsers = new Map();
// const wipingRooms = new Set();
// const pendingRoomDrops = new Map(); // roomId -> timeoutId
// const protectedRoomsUntil = new Map(); // roomId -> timestampMs

// const TERMINAL_STATUSES = ['ended', 'next', 'background', 'disconnected'];

// // ==============================================================
// // 🚀 HELPERS: ALERTS & PRESENCE CHECK
// // ==============================================================
// function getAlertPayload(action) {
//   if (action === 'next') {
//     return { title: "Stranger left", message: "User is looking for someone else" };
//   }
//   if (action === 'disconnected' || action === 'background') {
//     return { title: "Connection Lost ⚠️", message: "User has lost the connection" };
//   }
//   return { title: "Call ended", message: "The user has ended the call" };
// }

// function isTerminalRoomState(data) {
//   if (!data) return false;
//   if (data.endedBy) return true;
//   if (data.status && TERMINAL_STATUSES.includes(String(data.status).toLowerCase())) {
//     return true;
//   }
//   return false;
// }

// function isRoomProtectedForGallery(roomId) {
//   if (!roomId) return false;
//   const until = protectedRoomsUntil.get(roomId);
//   if (until && Date.now() < until) return true;
//   for (const u of activeUsers.values()) {
//     if (u.roomId === roomId && u.isWatchingAd) return true;
//   }
//   return false;
// }

// function isUserConnectedOnAnySocket(email, uid = null) {
//   const targetEmail = email ? String(email).toLowerCase() : null;
//   for (const u of activeUsers.values()) {
//     if (uid && u.uid === uid) return true;
//     if (targetEmail && u.email && String(u.email).toLowerCase() === targetEmail) return true;
//   }
//   return false;
// }

// function isRoomOccupiedOnSocket(roomId) {
//   if (!roomId) return false;
//   const roomSockets = io.sockets.adapter.rooms.get(roomId);
//   if (roomSockets && roomSockets.size > 0) return true;
//   for (const u of activeUsers.values()) {
//     if (u.roomId === roomId) return true;
//   }
//   return false;
// }

// async function isUserActiveInRTDB(email, uid = null) {
//   try {
//     if (isUserConnectedOnAnySocket(email, uid)) return true;
//     if (uid) {
//       const snap = await rtdb.ref(`users/${uid}/IsActive`).once('value');
//       if (snap.exists()) return snap.val() !== false;
//     }
//     if (!email) return true;
//     const snap = await rtdb.ref('users').orderByChild('email').equalTo(email).once('value');
//     // ⚠️ Never return false if query returns empty (email casing or missing index)
//     if (!snap.exists()) return true;
//     const val = snap.val();
//     const firstUid = Object.keys(val)[0];
//     return val[firstUid]?.IsActive !== false;
//   } catch (e) {
//     return true;
//   }
// }

// async function removeUserFromAllQueues(email) {
//   if (!email) return;
//   await Promise.all([
//     firestore.collection('randomQueue').doc(email).delete().catch(() => {}),
//     voiceFirestore.collection('voicerandomQueue').doc(email).delete().catch(() => {}),
//     chatFirestore.collection('randomChatQueue').doc(email).delete().catch(() => {})
//   ]);
// }

// // ==============================================================
// // 🚀 CORE FUNCTION: CROSS-DATABASE AGGRESSIVE WIPE
// // ==============================================================
// async function wipeSingleCollection(
//   dbInstance,
//   collectionName,
//   roomId,
//   callerSubName = 'callerCandidates',
//   calleeSubName = 'calleeCandidates'
// ) {
//   try {
//     const roomRef = dbInstance.collection(collectionName).doc(roomId);
//     const deletePromises = [];
//     let callerCount = 0;
//     let calleeCount = 0;

//     const callerCands = await roomRef.collection(callerSubName).get();
//     callerCands.forEach(doc => {
//       deletePromises.push(doc.ref.delete());
//       callerCount++;
//     });

//     const calleeCands = await roomRef.collection(calleeSubName).get();
//     calleeCands.forEach(doc => {
//       deletePromises.push(doc.ref.delete());
//       calleeCount++;
//     });

//     await Promise.all(deletePromises);
//     await roomRef.delete();

//     return { callerCount, calleeCount };
//   } catch (error) {
//     return { callerCount: 0, calleeCount: 0 };
//   }
// }

// async function forceWipeRoom(roomId, triggerMethod) {
//   if (!roomId || wipingRooms.has(roomId)) return;
//   wipingRooms.add(roomId);

//   if (pendingRoomDrops.has(roomId)) {
//     clearTimeout(pendingRoomDrops.get(roomId));
//     pendingRoomDrops.delete(roomId);
//   }
//   protectedRoomsUntil.delete(roomId);

//   console.log(`\n[🛠️ DB WIPE INITIATED] Source: ${triggerMethod} | Target Room: ${roomId}`);

//   try {
//     const [videoRes, voiceRes, chatRes] = await Promise.all([
//       wipeSingleCollection(firestore, 'room', roomId, 'callerCandidates', 'calleeCandidates'),
//       wipeSingleCollection(voiceFirestore, 'voiceroom', roomId, 'callerCandidates', 'calleeCandidates'),
//       wipeSingleCollection(chatFirestore, 'chatroom', roomId, 'chatCallerCandidates', 'chatCalleeCandidates')
//     ]);

//     console.log(
//       `[✅ WIPE PASS 1 COMPLETE] Room: ${roomId} | ` +
//       `Video(${videoRes.callerCount}/${videoRes.calleeCount}) | ` +
//       `Voice(${voiceRes.callerCount}/${voiceRes.calleeCount}) | ` +
//       `Chat(${chatRes.callerCount}/${chatRes.calleeCount})`
//     );

//     setTimeout(async () => {
//       try {
//         await Promise.all([
//           wipeSingleCollection(firestore, 'room', roomId, 'callerCandidates', 'calleeCandidates'),
//           wipeSingleCollection(voiceFirestore, 'voiceroom', roomId, 'callerCandidates', 'calleeCandidates'),
//           wipeSingleCollection(chatFirestore, 'chatroom', roomId, 'chatCallerCandidates', 'chatCalleeCandidates')
//         ]);
//       } catch (e) {} finally {
//         wipingRooms.delete(roomId);
//       }
//     }, 2500);

//   } catch (err) {
//     console.log(`[❌ WIPE ERROR] Room ${roomId}:`, err.message);
//     wipingRooms.delete(roomId);
//   }
// }

// // ==============================================================
// // 🚀 HYBRID LAYER A: LIVE ROOM STATUS WATCHERS
// // ==============================================================
// function attachRoomStatusWatcher(dbInstance, collectionName, label) {
//   dbInstance.collection(collectionName).onSnapshot(snapshot => {
//     snapshot.docChanges().forEach(async change => {
//       const roomId = change.doc.id;
//       const data = change.doc.data() || {};

//       if (change.type === 'added') {
//         console.log(`[📞 ${label} ROOM CREATED] ID: ${roomId} | Caller: ${data.caller || 'N/A'} | Callee: ${data.callee || 'N/A'}`);
//       }

//       if ((change.type === 'added' || change.type === 'modified') && isTerminalRoomState(data)) {
//         const action = (data.status && TERMINAL_STATUSES.includes(String(data.status).toLowerCase()))
//           ? String(data.status).toLowerCase()
//           : 'ended';

//         if (action === 'background' && isRoomProtectedForGallery(roomId)) {
//           return;
//         }

//         console.log(`\n[⚡ ${label} STATUS TRIGGER] Room ${roomId} marked as '${action}' by ${data.endedBy || 'user'}`);
//         io.to(roomId).emit('call_alert', getAlertPayload(action));

//         setTimeout(() => {
//           forceWipeRoom(roomId, `${label} Status Field (${action})`);
//         }, 600);
//       }
//     });
//   }, err => {
//     console.log(`[❌ WATCHER ERROR] ${collectionName}:`, err.message);
//   });
// }

// attachRoomStatusWatcher(firestore, 'room', 'VIDEO');
// attachRoomStatusWatcher(voiceFirestore, 'voiceroom', 'VOICE');
// attachRoomStatusWatcher(chatFirestore, 'chatroom', 'CHAT');

// // ==============================================================
// // 🚀 HYBRID LAYER B: END-ROOM-REQUEST WATCHERS
// // ==============================================================
// function attachEndRequestWatcher(dbInstance, label) {
//   dbInstance.collection('EndRoomRequest').onSnapshot(snapshot => {
//     snapshot.docChanges().forEach(async change => {
//       if (change.type === 'added') {
//         const data = change.doc.data() || {};

//         if (data.action === 'background' && isRoomProtectedForGallery(data.roomId)) {
//           try { await change.doc.ref.delete(); } catch (err) {}
//           return;
//         }

//         console.log(`\n[🔥 ${label} END-REQUEST] Action: '${data.action}' by ${data.by} for Room: ${data.roomId}`);

//         if (data.roomId) {
//           io.to(data.roomId).emit('call_alert', getAlertPayload(data.action));
//           await forceWipeRoom(data.roomId, `${label} EndRoomRequest (${data.action})`);
//         }

//         try { await change.doc.ref.delete(); } catch (err) {}
//       }
//     });
//   }, err => {
//     console.log(`[❌ END-REQUEST WATCHER ERROR] ${label}:`, err.message);
//   });
// }

// attachEndRequestWatcher(firestore, 'VIDEO');
// attachEndRequestWatcher(voiceFirestore, 'VOICE');
// attachEndRequestWatcher(chatFirestore, 'CHAT');

// // ==============================================================
// // 🚀 SOCKET.IO CONNECTIONS & AUTO-RECOVERY
// // ==============================================================
// io.on('connection', (socket) => {
//   console.log(`[🔌 NEW SOCKET CONNECTED] ID: ${socket.id}`);

//   const ensureSocketUser = (data = {}) => {
//     if (!activeUsers.has(socket.id)) {
//       activeUsers.set(socket.id, {
//         uid: data.uid || null,
//         email: data.email || null,
//         screen: data.screen || 'Home',
//         lastPing: Date.now(),
//         isWatchingAd: false,
//         inQueue: false,
//         roomId: data.roomId || null
//       });
//     }
//     const user = activeUsers.get(socket.id);
//     if (data.uid) user.uid = data.uid;
//     if (data.email) user.email = data.email;
//     if (data.screen) user.screen = data.screen;
//     user.lastPing = Date.now();
//     return user;
//   };

//   socket.on('register_user', async (data = {}) => {
//     const user = ensureSocketUser(data);
//     if (data.roomId) {
//       user.roomId = data.roomId;
//       socket.join(data.roomId);
//       if (pendingRoomDrops.has(data.roomId)) {
//         clearTimeout(pendingRoomDrops.get(data.roomId));
//         pendingRoomDrops.delete(data.roomId);
//       }
//     }
//     console.log(`[👤 USER ONLINE] Email: ${user.email} | Socket: ${socket.id} | Screen: ${user.screen}`);
//     if (user.uid) {
//       try { await rtdb.ref(`users/${user.uid}`).update({ IsActive: true }); } catch (error) {}
//     }
//   });

//   socket.on('set_queue_status', (data = {}) => {
//     const user = ensureSocketUser(data);
//     user.inQueue = !!data.inQueue;
//   });

//   socket.on('set_room_status', async (data = {}) => {
//     const user = ensureSocketUser(data);
//     if (user.roomId && user.roomId !== data.roomId) {
//       socket.leave(user.roomId);
//     }
//     user.roomId = data.roomId || null;

//     if (data.roomId) {
//       user.inQueue = false;
//       socket.join(data.roomId);

//       if (pendingRoomDrops.has(data.roomId)) {
//         clearTimeout(pendingRoomDrops.get(data.roomId));
//         pendingRoomDrops.delete(data.roomId);
//         console.log(`[🛡️ DROP CANCELLED] User ${user.email || socket.id} active in Room: ${data.roomId}`);
//       }

//       if (user.email) {
//         await removeUserFromAllQueues(user.email);
//       }
//     }
//   });

//   socket.on('room_established', (data) => {
//     if (!data) return;
//     if (data.roomId && pendingRoomDrops.has(data.roomId)) {
//       clearTimeout(pendingRoomDrops.get(data.roomId));
//       pendingRoomDrops.delete(data.roomId);
//     }
//     console.log(`\n[🎉 CONNECTION ESTABLISHED] ${data.userA} and ${data.userB} has joined room ${data.roomId}\n`);
//   });

//   socket.on('videoend', async ({ roomId } = {}) => {
//     if (!roomId) return;
//     socket.to(roomId).emit('call_alert', getAlertPayload('ended'));
//     await forceWipeRoom(roomId, 'Socket videoend');
//   });

//   socket.on('videonext', async ({ roomId } = {}) => {
//     if (!roomId) return;
//     socket.to(roomId).emit('call_alert', getAlertPayload('next'));
//     await forceWipeRoom(roomId, 'Socket videonext');
//   });

//   socket.on('videobackground', async ({ roomId } = {}) => {
//     if (!roomId) return;
//     const user = activeUsers.get(socket.id);
//     if (user?.isWatchingAd || isRoomProtectedForGallery(roomId)) {
//       return;
//     }
//     socket.to(roomId).emit('call_alert', getAlertPayload('background'));
//     await forceWipeRoom(roomId, 'Socket videobackground');
//   });

//   socket.on('checkInternet', async ({ roomId } = {}) => {
//     if (!roomId) return;
//     socket.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
//     await forceWipeRoom(roomId, 'Socket checkInternet');
//   });

//   socket.on('ping', (data = {}) => {
//     const user = ensureSocketUser(data);
//     if (data.roomId && user.roomId !== data.roomId) {
//       user.roomId = data.roomId;
//       socket.join(data.roomId);
//     }
//     if (user.roomId && pendingRoomDrops.has(user.roomId)) {
//       clearTimeout(pendingRoomDrops.get(user.roomId));
//       pendingRoomDrops.delete(user.roomId);
//     }
//   });

//   socket.on('ad_status', async (data = {}) => {
//     const user = ensureSocketUser(data);
//     user.isWatchingAd = !!data.isWatchingAd;

//     const targetRoomId = data.roomId || user.roomId;
//     if (targetRoomId && user.isWatchingAd) {
//       protectedRoomsUntil.set(targetRoomId, Date.now() + 25000);
//     }

//     if (user.uid && user.isWatchingAd) {
//       try { await rtdb.ref(`users/${user.uid}`).update({ IsActive: true }); } catch (e) {}
//     }
//   });

//   socket.on('manual_disconnect', async () => {
//     const user = activeUsers.get(socket.id);
//     if (user?.isWatchingAd || (user?.roomId && isRoomProtectedForGallery(user.roomId))) {
//       if (user) user.lastPing = Date.now();
//       return;
//     }
//     console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} (App backgrounded/closed)`);
//     await handleUserDrop(socket.id, "App Backgrounded/Closed");
//   });

//   socket.on('disconnect', async () => {
//     console.log(`[🔌 SOCKET LOST] ID: ${socket.id}`);
//     await handleUserDrop(socket.id, "Socket Disconnected");
//   });
// });

// // ==============================================================
// // 🚀 SERVER PING CHECKER & RECONNECT-SAFE USER DROP HANDLER
// // ==============================================================
// setInterval(async () => {
//   const now = Date.now();
//   for (const [socketId, user] of activeUsers.entries()) {
//     const timeoutThreshold = user.isWatchingAd ? 120000 : 75000;

//     if (now - user.lastPing > timeoutThreshold) {
//       console.log(`[🕒 PING DEAD] User ${user.email || user.uid} timed out.`);
//       await handleUserDrop(socketId, "Server Ping Timeout");
//       io.to(socketId).emit('force_disconnect');
//     }
//   }
// }, 8000);

// async function handleUserDrop(socketId, reason) {
//   if (!activeUsers.has(socketId)) return;

//   const user = activeUsers.get(socketId);
//   activeUsers.delete(socketId);

//   // 🛡️ CRITICAL FIX: If this user already reconnected on a new socket ID, ignore the old socket's disconnect!
//   if (isUserConnectedOnAnySocket(user.email, user.uid)) {
//     console.log(`[🔄 SOCKET HANDOVER] ${user.email || user.uid} is already active on a newer socket. Ignoring old socket drop.`);
//     return;
//   }

//   if (user.isWatchingAd || (user.roomId && isRoomProtectedForGallery(user.roomId))) {
//     const roomId = user.roomId;
//     if (roomId && !pendingRoomDrops.has(roomId)) {
//       const timer = setTimeout(async () => {
//         pendingRoomDrops.delete(roomId);
//         if (!isUserConnectedOnAnySocket(user.email, user.uid)) {
//           io.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
//           await forceWipeRoom(roomId, `Gallery Timeout Drop (${user.email})`);
//         }
//       }, 22000);
//       pendingRoomDrops.set(roomId, timer);
//     }
//     return;
//   }

//   console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Reason: ${reason}`);

//   if (user.email) {
//     await removeUserFromAllQueues(user.email);
//   }

//   if (user.roomId) {
//     const roomId = user.roomId;
//     if (!pendingRoomDrops.has(roomId)) {
//       // Give 12s for transient mobile network switches before declaring a dropped call
//       const waitMs = reason === "App Backgrounded/Closed" ? 3000 : 12000;
//       const timer = setTimeout(async () => {
//         pendingRoomDrops.delete(roomId);
//         if (isRoomProtectedForGallery(roomId)) return;
//         if (!isUserConnectedOnAnySocket(user.email, user.uid)) {
//           try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (e) {}
//           io.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
//           await forceWipeRoom(roomId, `Confirmed User Drop (${reason})`);
//         }
//       }, waitMs);
//       pendingRoomDrops.set(roomId, timer);
//     }
//   } else {
//     try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (e) {}
//   }
// }

// // ==============================================================
// // ⚡ 10-SECOND QUEUE SWEEPER (VIDEO, VOICE & CHAT QUEUES)
// // ==============================================================
// setInterval(async () => {
//   const sweepQueueCollection = async (dbInstance, collectionName, label) => {
//     try {
//       const snapshot = await dbInstance.collection(collectionName).get();
//       if (snapshot.empty) return;

//       const now = Date.now();
//       let cleaned = 0;

//       for (const docSnap of snapshot.docs) {
//         const data = docSnap.data() || {};
//         const email = docSnap.id;

//         const createdMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
//         const ageMs = createdMs ? now - createdMs : 0;

//         if (createdMs && ageMs > 20000) {
//           await docSnap.ref.delete().catch(() => {});
//           cleaned++;
//           continue;
//         }

//         if (createdMs && ageMs > 8000) {
//           const active = await isUserActiveInRTDB(email, data.uid);
//           if (!active) {
//             await docSnap.ref.delete().catch(() => {});
//             cleaned++;
//           }
//         }
//       }

//       if (cleaned > 0) {
//         console.log(`[⚡ ${label} QUEUE SWEEP] Purged ${cleaned} stale/offline queue docs from ${collectionName}.`);
//       }
//     } catch (error) {}
//   };

//   await Promise.all([
//     sweepQueueCollection(firestore, 'randomQueue', 'VIDEO'),
//     sweepQueueCollection(voiceFirestore, 'voicerandomQueue', 'VOICE'),
//     sweepQueueCollection(chatFirestore, 'randomChatQueue', 'CHAT')
//   ]);
// }, 10000);

// // ==============================================================
// // 👻 GHOST ROOM SWEEPER (NEVER KILLS ACTIVE HANDSHAKEN CALLS)
// // ==============================================================
// setInterval(async () => {
//   const sweepDatabaseRooms = async (dbInstance, collectionName, label) => {
//     try {
//       const docRefs = await dbInstance.collection(collectionName).listDocuments();

//       for (const docRef of docRefs) {
//         const roomId = docRef.id;
//         if (
//           wipingRooms.has(roomId) ||
//           pendingRoomDrops.has(roomId) ||
//           isRoomProtectedForGallery(roomId)
//         ) {
//           continue;
//         }

//         const docSnap = await docRef.get();

//         // CASE 1: Italic Ghost Document (Parent deleted, subcollections remain)
//         if (!docSnap.exists) {
//           await forceWipeRoom(roomId, `${label} Italic Ghost Sweeper`);
//           continue;
//         }

//         const data = docSnap.data() || {};

//         // CASE 2: Document has a terminal status ('ended', 'next', 'background', 'disconnected')
//         if (isTerminalRoomState(data)) {
//           const action = data.status || 'ended';
//           io.to(roomId).emit('call_alert', getAlertPayload(action));
//           await forceWipeRoom(roomId, `${label} Lingering Status Sweeper`);
//           continue;
//         }

//         // CASE 3: Malformed room missing caller or callee
//         if (!data.caller || !data.callee) {
//           await forceWipeRoom(roomId, `${label} Malformed Room Sweeper`);
//           continue;
//         }

//         const createdMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
//         const roomAgeMs = createdMs ? Date.now() - createdMs : 0;

//         if (roomAgeMs < 40000) continue;

//         // CASE 4: Room older than 45s that never completed offer/answer OR chatOffer/chatAnswer handshake
//         const hasHandshake = (data.offer && data.answer) || (data.chatOffer && data.chatAnswer);
//         if (roomAgeMs > 45000 && !hasHandshake) {
//           console.log(`\n[👻 UNFINISHED HANDSHAKE] ${label} ${roomId} stuck without offer/answer for >45s.`);
//           io.to(roomId).emit('call_alert', getAlertPayload('disconnected'));
//           await forceWipeRoom(roomId, `${label} Unfinished Handshake Sweeper`);
//           continue;
//         }

//         // CASE 5: Only sweep an established room if NEITHER user is connected on Socket.IO anymore
//         const callerOnSocket = isUserConnectedOnAnySocket(data.caller);
//         const calleeOnSocket = isUserConnectedOnAnySocket(data.callee);
//         const roomOccupied = isRoomOccupiedOnSocket(roomId);

//         if (!callerOnSocket && !calleeOnSocket && !roomOccupied) {
//           console.log(`\n[👻 ABANDONED ROOM] ${label} ${roomId} has no connected users. Wiping...`);
//           await forceWipeRoom(roomId, `${label} Abandoned Room Sweeper`);
//         }
//       }
//     } catch (err) {}
//   };

//   await Promise.all([
//     sweepDatabaseRooms(firestore, 'room', 'VIDEO'),
//     sweepDatabaseRooms(voiceFirestore, 'voiceroom', 'VOICE'),
//     sweepDatabaseRooms(chatFirestore, 'chatroom', 'CHAT')
//   ]);
// }, 15000);

// // ==============================================================
// // 💎 VIP SUBSCRIPTION SWEEPER (Every 1 Min)
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
//         const expDate = new Date(parts[2], parts[1] - 1, parts[0], parts[3], parts[4], parts[5], parts[6]);
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

// app.get('/', (req, res) => res.send('MeetVibe Master Quad-DB Hybrid Server Running 🚀'));
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
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com"
}, 'rtdbApp');
const rtdb = rtdbApp.database();

// 2. Video Firestore (secondaryDb: room & randomQueue)
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

console.log("[✅ SYSTEM] All 4 Firebase Admin SDKs initialized successfully!");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 2000, // 💓 2-second socket ping
  pingTimeout: 5000,  // 5-second disconnect detection
});

// ==============================================================
// 🧠 IN-MEMORY REAL-TIME STATE MAPS
// ==============================================================
const activeUsers = new Map();         // socketId -> { socketId, uid, email, screen, lastPing, isWatchingAd, inQueue, joinedQueueAt, roomId, partnerEmail }
const activeRooms = new Map();         // roomId -> { roomId, caller, callee, label, createdAt }
const wipingRooms = new Set();         // roomId
const pendingRoomDrops = new Map();    // roomId -> timeoutId
const protectedRoomsUntil = new Map(); // roomId -> timestampMs

const TERMINAL_STATUSES = ['ended', 'next', 'background', 'disconnected'];
const QUEUE_PING_TIMEOUT_MS = 5000;    // 5s without a 2s ping while in queue = lost connection
const QUEUE_MAX_TTL_MS = 10000;        // 10s max time allowed in randomQueue

const normEmail = (email) => (email ? String(email).toLowerCase().trim() : null);

// ==============================================================
// 🚀 HELPERS: ALERTS, DEDUPLICATION & PRESENCE CHECK
// ==============================================================
function getAlertPayload(action) {
  if (action === 'next') {
    return { title: "Stranger left", message: "User is looking for someone else", action: 'next' };
  }
  if (action === 'background') {
    return { title: "User Has Left 👋", message: "Remote user has left or went to background", action: 'background' };
  }
  if (action === 'disconnected') {
    return { title: "Connection Lost ⚠️", message: "User has lost the connection", action: 'disconnected' };
  }
  return { title: "Call ended", message: "The user has ended the call", action: 'ended' };
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

function findUserSockets(email, uid = null) {
  const targetEmail = normEmail(email);
  const matches = [];
  for (const [sockId, u] of activeUsers.entries()) {
    const emailMatch = targetEmail && normEmail(u.email) === targetEmail;
    const uidMatch = uid && u.uid && u.uid === uid;
    if (emailMatch || uidMatch) {
      matches.push({ sockId, user: u });
    }
  }
  return matches;
}

function isUserConnectedOnAnySocket(email, uid = null) {
  return findUserSockets(email, uid).length > 0;
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
    if (!snap.exists()) return true;
    const val = snap.val();
    const firstUid = Object.keys(val)[0];
    return val[firstUid]?.IsActive !== false;
  } catch (e) {
    return true;
  }
}

/**
 * 🗑️ Removes a user's document from Video, Voice, and Chat queues immediately
 */
async function removeUserFromAllQueues(rawEmail, reason = "cleanup") {
  const cleanEmail = normEmail(rawEmail);
  const exactEmail = rawEmail ? String(rawEmail).trim() : null;
  if (!cleanEmail) return;

  console.log(`[🗑️ QUEUE DELETE] Removing ${exactEmail || cleanEmail} from queues | Reason: ${reason}`);

  const deleteFromDbQueue = async (dbInstance, colName) => {
    const col = dbInstance.collection(colName);
    const tasks = [col.doc(cleanEmail).delete().catch(() => {})];
    if (exactEmail && exactEmail !== cleanEmail) {
      tasks.push(col.doc(exactEmail).delete().catch(() => {}));
    }
    await Promise.all(tasks);
  };

  await Promise.all([
    deleteFromDbQueue(firestore, 'randomQueue'),
    deleteFromDbQueue(voiceFirestore, 'voicerandomQueue'),
    deleteFromDbQueue(chatFirestore, 'randomChatQueue'),
  ]);

  console.log(`[✅ QUEUE DELETED] ${exactEmail || cleanEmail} removed from randomQueue / voicerandomQueue / randomChatQueue (${reason})`);
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
  activeRooms.delete(roomId);

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

/**
 * 🔄 Immediately alerts the remaining connected partner ("User Has Left" or "Connection Lost") & wipes the broken room
 */
async function notifyPartnerAndWipeRoom(roomId, droppedEmail, action = 'disconnected', reason = 'Partner Disconnected', fallbackPartnerEmail = null) {
  if (!roomId || wipingRooms.has(roomId)) return;

  const cleanDropped = normEmail(droppedEmail);
  let partnerEmail = normEmail(fallbackPartnerEmail);

  if (activeRooms.has(roomId)) {
    const info = activeRooms.get(roomId);
    if (cleanDropped) {
      partnerEmail = partnerEmail || (
        normEmail(info.caller) === cleanDropped
          ? normEmail(info.callee)
          : normEmail(info.caller)
      );
    }
  }

  for (const u of activeUsers.values()) {
    if (u.roomId === roomId && normEmail(u.email) !== cleanDropped) {
      partnerEmail = partnerEmail || normEmail(u.email);
    }
    if (cleanDropped && normEmail(u.partnerEmail) === cleanDropped) {
      partnerEmail = partnerEmail || normEmail(u.email);
    }
  }

  console.log(
    `\n[🔄 PARTNER ALERT & WIPE] Dropped: ${cleanDropped || 'unknown'} | Partner: ${partnerEmail || 'room-broadcast'} | Room: ${roomId} | Action: ${action} | Reason: ${reason}`
  );

  const alertPayload = getAlertPayload(action);
  const requeuePayload = {
    roomId,
    disconnectedUser: cleanDropped,
    action,
    reason,
    title: alertPayload.title,
    message: alertPayload.message,
    timestamp: Date.now(),
  };

  // 1. Emit to the Socket.IO room
  io.to(roomId).emit('call_alert', alertPayload);
  io.to(roomId).emit('partner_disconnected_requeue', requeuePayload);

  // 2. Also emit directly to partner's socketId (crucial during the 2-second hold on RandomConnectingScreen!)
  if (partnerEmail) {
    const partnerSockets = findUserSockets(partnerEmail);
    for (const { sockId, user } of partnerSockets) {
      user.roomId = null;
      user.partnerEmail = null;
      io.to(sockId).emit('call_alert', alertPayload);
      io.to(sockId).emit('partner_disconnected_requeue', requeuePayload);
      console.log(`[📡 EMITTED ALERT TO PARTNER] -> ${partnerEmail} (Socket: ${sockId})`);
    }
  }

  await forceWipeRoom(roomId, reason);
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
        const caller = normEmail(data.caller);
        const callee = normEmail(data.callee);
        activeRooms.set(roomId, {
          roomId,
          caller,
          callee,
          label,
          createdAt: Date.now(),
        });
        console.log(`[📞 ${label} ROOM CREATED] ID: ${roomId} | Caller: ${data.caller || 'N/A'} | Callee: ${data.callee || 'N/A'}`);

        // ⚡ Instant Dual-User Sync: Notify both caller and callee sockets in 0ms so both show "CONNECTION ESTABLISHED" simultaneously!
        if (caller) {
          const callerSockets = findUserSockets(caller);
          for (const { sockId, user } of callerSockets) {
            user.inQueue = false;
            user.joinedQueueAt = null;
            user.roomId = roomId;
            user.partnerEmail = data.callee || callee;
            const s = io.sockets.sockets.get(sockId);
            if (s) s.join(roomId);
            io.to(sockId).emit('match_established_sync', {
              roomId,
              role: 'caller',
              partnerEmail: data.callee || callee,
            });
          }
          removeUserFromAllQueues(data.caller, `${label}_room_created`).catch(() => {});
        }

        if (callee) {
          const calleeSockets = findUserSockets(callee);
          for (const { sockId, user } of calleeSockets) {
            user.inQueue = false;
            user.joinedQueueAt = null;
            user.roomId = roomId;
            user.partnerEmail = data.caller || caller;
            const s = io.sockets.sockets.get(sockId);
            if (s) s.join(roomId);
            io.to(sockId).emit('match_established_sync', {
              roomId,
              role: 'callee',
              partnerEmail: data.caller || caller,
            });
          }
          removeUserFromAllQueues(data.callee, `${label}_room_created`).catch(() => {});
        }
      }

      if ((change.type === 'added' || change.type === 'modified') && isTerminalRoomState(data)) {
        const action = (data.status && TERMINAL_STATUSES.includes(String(data.status).toLowerCase()))
          ? String(data.status).toLowerCase()
          : 'ended';

        if (action === 'background' && isRoomProtectedForGallery(roomId)) {
          console.log(`[🛡️ GALLERY PROTECTED] Ignoring background status on protected room: ${roomId}`);
          return;
        }

        console.log(`\n[⚡ ${label} STATUS TRIGGER] Room ${roomId} marked as '${action}' by ${data.endedBy || 'user'}`);
        await notifyPartnerAndWipeRoom(roomId, data.endedBy || null, action, `${label} Status Field (${action})`);
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
          await notifyPartnerAndWipeRoom(
            data.roomId,
            data.by || null,
            data.action || 'ended',
            `${label} EndRoomRequest (${data.action})`
          );
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
// 🚀 SOCKET.IO CONNECTIONS, DEDUPLICATION & AUTO-RECOVERY
// ==============================================================
io.on('connection', (socket) => {
  console.log(`[🔌 NEW SOCKET CONNECTED] ID: ${socket.id}`);

  /**
   * 🛡️ Ensures strictly ONE socket per user (closes any duplicate old socket cleanly)
   */
  const ensureSocketUser = (data = {}) => {
    const incomingEmail = data.email ? String(data.email).trim() : null;
    const incomingNorm = normEmail(incomingEmail);
    const incomingUid = data.uid || null;

    if (incomingNorm || incomingUid) {
      for (const [otherSockId, otherUser] of activeUsers.entries()) {
        if (otherSockId === socket.id) continue;
        const sameEmail = incomingNorm && normEmail(otherUser.email) === incomingNorm;
        const sameUid = incomingUid && otherUser.uid && otherUser.uid === incomingUid;

        if (sameEmail || sameUid) {
          console.log(
            `[♻️ DUPLICATE SOCKET CLOSED] User ${incomingEmail || incomingUid} moved to socket ${socket.id}. Closing old socket ${otherSockId}.`
          );
          if (!data.roomId && otherUser.roomId) data.roomId = otherUser.roomId;
          if (!data.partnerEmail && otherUser.partnerEmail) data.partnerEmail = otherUser.partnerEmail;
          activeUsers.delete(otherSockId);
          const oldSock = io.sockets.sockets.get(otherSockId);
          if (oldSock) {
            oldSock.disconnect(true);
          }
        }
      }
    }

    if (!activeUsers.has(socket.id)) {
      activeUsers.set(socket.id, {
        socketId: socket.id,
        uid: incomingUid,
        email: incomingEmail,
        screen: data.screen || 'Home',
        lastPing: Date.now(),
        isWatchingAd: false,
        inQueue: false,
        joinedQueueAt: null,
        roomId: data.roomId || null,
        partnerEmail: data.partnerEmail || null,
      });
    }

    const user = activeUsers.get(socket.id);
    if (incomingUid) user.uid = incomingUid;
    if (incomingEmail) user.email = incomingEmail;
    if (data.screen) user.screen = data.screen;
    if (data.partnerEmail) user.partnerEmail = data.partnerEmail;
    user.lastPing = Date.now();
    return user;
  };

  // 1. REGISTER USER
  socket.on('register_user', async (data = {}) => {
    const user = ensureSocketUser(data);
    if (data.roomId) {
      user.roomId = data.roomId;
      user.inQueue = false;
      user.joinedQueueAt = null;
      socket.join(data.roomId);
      if (pendingRoomDrops.has(data.roomId)) {
        clearTimeout(pendingRoomDrops.get(data.roomId));
        pendingRoomDrops.delete(data.roomId);
      }
    }
    console.log(`[👤 USER ONLINE] Email: ${user.email} | UID: ${user.uid} | Socket: ${socket.id} | Screen: ${user.screen}`);
    if (user.uid) {
      try { await rtdb.ref(`users/${user.uid}`).update({ IsActive: true }); } catch (error) {}
    }
  });

  // 2. JOIN QUEUE (`queue_join` / `set_queue_status`)
  const handleQueueJoin = (data = {}) => {
    const user = ensureSocketUser(data);
    user.inQueue = true;
    user.joinedQueueAt = Date.now();
    user.lastPing = Date.now();
    user.roomId = null;
    user.partnerEmail = null;
    console.log(`[📥 QUEUE JOIN] User: ${user.email} | Socket: ${socket.id} | Time: ${new Date(user.joinedQueueAt).toISOString()}`);
  };

  socket.on('queue_join', handleQueueJoin);
  socket.on('join_queue', handleQueueJoin);

  socket.on('set_queue_status', (data = {}) => {
    const user = ensureSocketUser(data);
    if (data.inQueue) {
      user.inQueue = true;
      user.joinedQueueAt = user.joinedQueueAt || Date.now();
      console.log(`[📥 SET_QUEUE_STATUS: TRUE] User: ${user.email} | Socket: ${socket.id}`);
    } else {
      user.inQueue = false;
      user.joinedQueueAt = null;
      console.log(`[📤 SET_QUEUE_STATUS: FALSE] User: ${user.email} | Socket: ${socket.id}`);
    }
  });

  // 3. 2-SECOND QUEUE HEARTBEAT PING (`queue_ping` — IN-MEMORY ONLY)
  socket.on('queue_ping', (data = {}) => {
    const user = ensureSocketUser(data);
    user.lastPing = Date.now();

    if (!user.roomId && data.inQueue !== undefined) {
      user.inQueue = Boolean(data.inQueue);
      if (user.inQueue && !user.joinedQueueAt) {
        user.joinedQueueAt = Date.now();
      }
    }
    if (data.roomId) {
      user.roomId = data.roomId;
      user.inQueue = false;
      user.joinedQueueAt = null;
      socket.join(data.roomId);
    }

    const waitSec = user.joinedQueueAt ? Math.round((Date.now() - user.joinedQueueAt) / 1000) : 0;
    console.log(
      `[💓 2s QUEUE PING] User: ${user.email} | inQueue: ${user.inQueue} | wait: ${waitSec}s | roomId: ${user.roomId || 'none'}`
    );

    socket.emit('queue_pong', { timestamp: user.lastPing });
  });

  // 4. LEAVE / ABORT QUEUE (`queue_leave`)
  const handleQueueLeave = async (data = {}) => {
    const user = ensureSocketUser(data);
    const reason = data.reason || 'client_queue_leave';
    user.inQueue = false;
    user.joinedQueueAt = null;

    console.log(`[📤 QUEUE LEAVE] User: ${user.email} | Reason: ${reason} | RoomToWipe: ${data.roomId || 'none'}`);
    if (user.email) {
      await removeUserFromAllQueues(user.email, reason);
    }

    if (data.roomId) {
      user.roomId = null;
      const dropAction = reason.includes('internet') ? 'disconnected' : 'background';
      await notifyPartnerAndWipeRoom(
        data.roomId,
        user.email,
        dropAction,
        `Queue Leave (${reason})`,
        data.partnerEmail || user.partnerEmail
      );
    }
  };

  socket.on('queue_leave', handleQueueLeave);
  socket.on('leave_queue', handleQueueLeave);

  // 5. ROOM & MATCH ESTABLISHED (`set_room_status`, `match_established`, `room_established`)
  socket.on('set_room_status', async (data = {}) => {
    const user = ensureSocketUser(data);
    if (user.roomId && user.roomId !== data.roomId) {
      socket.leave(user.roomId);
    }
    user.roomId = data.roomId || null;

    if (data.roomId) {
      user.inQueue = false;
      user.joinedQueueAt = null;
      socket.join(data.roomId);

      if (pendingRoomDrops.has(data.roomId)) {
        clearTimeout(pendingRoomDrops.get(data.roomId));
        pendingRoomDrops.delete(data.roomId);
        console.log(`[🛡️ DROP CANCELLED] User ${user.email || socket.id} active in Room: ${data.roomId}`);
      }

      if (user.email) {
        await removeUserFromAllQueues(user.email, 'set_room_status');
      }
    }
  });

  const handleMatchEstablished = async (data = {}) => {
    const user = ensureSocketUser(data);
    const roomId = data.roomId;
    const partnerEmail = data.partnerEmail || data.userB || null;

    user.inQueue = false;
    user.joinedQueueAt = null;
    user.lastPing = Date.now();

    if (roomId) {
      user.roomId = roomId;
      user.partnerEmail = partnerEmail;
      socket.join(roomId);

      if (pendingRoomDrops.has(roomId)) {
        clearTimeout(pendingRoomDrops.get(roomId));
        pendingRoomDrops.delete(roomId);
      }

      const existingRoom = activeRooms.get(roomId) || {};
      activeRooms.set(roomId, {
        roomId,
        caller: data.role === 'caller' ? user.email : (existingRoom.caller || data.userA || partnerEmail),
        callee: data.role === 'callee' ? user.email : (existingRoom.callee || data.userB || partnerEmail),
        label: 'MATCH',
        createdAt: existingRoom.createdAt || Date.now(),
      });

      // ⚡ Immediately relay `match_established_sync` to the partner's socket so BOTH devices enter the 2s hold together!
      if (partnerEmail) {
        const partnerSockets = findUserSockets(partnerEmail);
        for (const { sockId, user: pUser } of partnerSockets) {
          pUser.inQueue = false;
          pUser.joinedQueueAt = null;
          pUser.roomId = roomId;
          pUser.partnerEmail = user.email;
          const pSock = io.sockets.sockets.get(sockId);
          if (pSock) pSock.join(roomId);

          io.to(sockId).emit('match_established_sync', {
            roomId,
            role: data.role === 'caller' ? 'callee' : 'caller',
            partnerEmail: user.email,
          });
        }
      }
    }

    if (user.email) {
      await removeUserFromAllQueues(user.email, 'match_established');
    }

    console.log(
      `\n[🎉 CONNECTION ESTABLISHED (2s VERIFICATION HOLD)] User: ${user.email || data.userA} <-> Partner: ${partnerEmail || data.userB} | Room: ${roomId}\n`
    );
  };

  socket.on('match_established', handleMatchEstablished);
  socket.on('room_established', handleMatchEstablished);

  // 6. CALL END / NEXT / BACKGROUND / INTERNET LOSS EVENTS
  socket.on('videoend', async (payload = {}) => {
    const roomId = typeof payload === 'string' ? payload : payload?.roomId;
    const user = activeUsers.get(socket.id);
    console.log(`[🛑 SOCKET videoend] User: ${user?.email || socket.id} | Room: ${roomId}`);
    if (user?.email) await removeUserFromAllQueues(user.email, 'videoend');
    if (!roomId) return;
    await notifyPartnerAndWipeRoom(roomId, user?.email, 'ended', 'Socket videoend', user?.partnerEmail);
  });

  socket.on('videonext', async (payload = {}) => {
    const roomId = typeof payload === 'string' ? payload : payload?.roomId;
    const user = activeUsers.get(socket.id);
    console.log(`[⏭️ SOCKET videonext] User: ${user?.email || socket.id} | Room: ${roomId}`);
    if (user?.email) await removeUserFromAllQueues(user.email, 'videonext');
    if (!roomId) return;
    await notifyPartnerAndWipeRoom(roomId, user?.email, 'next', 'Socket videonext', user?.partnerEmail);
  });

  socket.on('videobackground', async (payload = {}) => {
    const roomId = typeof payload === 'string' ? payload : payload?.roomId;
    const user = activeUsers.get(socket.id);
    const email = payload?.email || user?.email;
    const partnerEmail = payload?.partnerEmail || user?.partnerEmail;

    console.log(`[📱 SOCKET videobackground] User: ${email || socket.id} | Room: ${roomId}`);

    if (email) {
      await removeUserFromAllQueues(email, 'videobackground');
    }
    if (user) {
      user.inQueue = false;
      user.joinedQueueAt = null;
    }

    const targetRoomId = roomId || user?.roomId;
    if (!targetRoomId) return;

    if (user?.isWatchingAd || isRoomProtectedForGallery(targetRoomId)) {
      console.log(`[🛡️ AD/GALLERY PROTECTED] Ignoring videobackground for Room: ${targetRoomId}`);
      return;
    }

    await notifyPartnerAndWipeRoom(targetRoomId, email, 'background', 'Socket videobackground', partnerEmail);
  });

  const handleInternetLoss = async (payload = {}) => {
    const roomId = typeof payload === 'string' ? payload : payload?.roomId;
    const user = activeUsers.get(socket.id);
    const email = payload?.email || user?.email;
    const partnerEmail = payload?.partnerEmail || user?.partnerEmail;

    console.log(`[🌐 SOCKET INTERNET LOST] User: ${email || socket.id} | Room: ${roomId}`);

    if (email) {
      await removeUserFromAllQueues(email, 'internet_lost');
    }
    if (user) {
      user.inQueue = false;
      user.joinedQueueAt = null;
    }

    const targetRoomId = roomId || user?.roomId;
    if (!targetRoomId) return;

    await notifyPartnerAndWipeRoom(targetRoomId, email, 'disconnected', 'Socket checkInternet', partnerEmail);
  };

  socket.on('checkInternet', handleInternetLoss);
  socket.on('check_internet', handleInternetLoss);

  // 7. GENERAL APP PING & AD STATUS
  socket.on('ping', (data = {}) => {
    const user = ensureSocketUser(data);
    if (data.roomId && user.roomId !== data.roomId) {
      user.roomId = data.roomId;
      user.inQueue = false;
      user.joinedQueueAt = null;
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

  // 8. MANUAL DISCONNECT & SOCKET DISCONNECT (APP KILLED / NETWORK DROPPED)
  socket.on('manual_disconnect', async () => {
    const user = activeUsers.get(socket.id);
    if (user?.isWatchingAd || (user?.roomId && isRoomProtectedForGallery(user.roomId))) {
      if (user) user.lastPing = Date.now();
      return;
    }
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} (${user?.email || 'unknown'}) - App backgrounded/closed`);
    await handleUserDrop(socket.id, "App Backgrounded/Closed");
  });

  socket.on('disconnect', async (reason) => {
    const user = activeUsers.get(socket.id);
    console.log(`[🔌 SOCKET LOST] ID: ${socket.id} | User: ${user?.email || 'unknown'} | Reason: ${reason}`);
    await handleUserDrop(socket.id, `Socket Disconnected (${reason})`);
  });
});

// ==============================================================
// ⏱️ FAST 1-SECOND QUEUE HEARTBEAT & 10-SECOND EXPIRY WATCHDOG
// ==============================================================
setInterval(async () => {
  const now = Date.now();

  for (const [socketId, user] of activeUsers.entries()) {
    if (!user.inQueue || user.roomId) continue;

    // 1. If user is in queue and missed 2-second pings for > 5s -> remove from randomQueue immediately!
    if (now - user.lastPing > QUEUE_PING_TIMEOUT_MS) {
      console.log(
        `[🚨 QUEUE PING LOST] User ${user.email || socketId} missed 2s pings for ${Math.round(
          (now - user.lastPing) / 1000
        )}s! Removing from randomQueue immediately.`
      );
      user.inQueue = false;
      user.joinedQueueAt = null;
      if (user.email) {
        await removeUserFromAllQueues(user.email, 'missed_2s_queue_ping');
      }
      continue;
    }

    // 2. If user has been waiting in queue for >= 10 seconds -> remove from randomQueue & notify device!
    if (user.joinedQueueAt && now - user.joinedQueueAt >= QUEUE_MAX_TTL_MS) {
      console.log(`[⏰ 10s QUEUE TIMEOUT] User ${user.email} reached 10s limit in randomQueue. Removing now.`);
      user.inQueue = false;
      user.joinedQueueAt = null;

      if (user.email) {
        await removeUserFromAllQueues(user.email, 'server_10s_ttl_expired');
      }

      io.to(socketId).emit('queue_expired_10s', {
        email: user.email,
        message: "No match found within 10 seconds",
        timestamp: now,
      });
    }
  }
}, 1000);

// ==============================================================
// 🚀 SERVER PING CHECKER & INSTANT DROP HANDLER
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

  // Always remove from randomQueue immediately when a user drops
  if (user.email) {
    await removeUserFromAllQueues(user.email, reason);
  }

  // 🛡️ If this user already reconnected on a new socket ID, ignore the old socket's disconnect
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
          await notifyPartnerAndWipeRoom(roomId, user.email, 'disconnected', `Gallery Timeout Drop (${user.email})`, user.partnerEmail);
        }
      }, 22000);
      pendingRoomDrops.set(roomId, timer);
    }
    return;
  }

  console.log(`[🧹 CLEANING USER DATA] Dropping ${user.email || socketId} | Room: ${user.roomId || 'none'} | Screen: ${user.screen} | Reason: ${reason}`);

  if (user.roomId) {
    const roomId = user.roomId;
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (e) {}

    // Determine if this was an app background/kill ('background') vs network loss ('disconnected')
    const dropAction =
      reason.includes("Backgrounded") ||
      reason.includes("Closed") ||
      reason.includes("transport close") ||
      reason.includes("client namespace disconnect")
        ? 'background'
        : 'disconnected';

    // ⚡ 0ms IMMEDIATE NOTIFICATION & WIPE!
    // Ensures that if a user kills the app, goes background, or loses connection during the 2-second hold,
    // the partner is alerted on RandomConnectingScreen BEFORE the 2-second timer pushes them into InCall!
    await notifyPartnerAndWipeRoom(
      roomId,
      user.email,
      dropAction,
      `Immediate User Drop (${reason})`,
      user.partnerEmail
    );
  } else {
    try { if (user.uid) await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); } catch (e) {}
  }
}

// ==============================================================
// ⚡ QUEUE SWEEPER (VIDEO, VOICE & CHAT QUEUES)
// Purges any doc > 12s old, offline docs, or 1+ day old stuck docs!
// ==============================================================
let isSweepingQueues = false;

async function sweepAllQueueCollections() {
  if (isSweepingQueues) return;
  isSweepingQueues = true;

  const sweepQueueCollection = async (dbInstance, collectionName, label) => {
    try {
      const snapshot = await dbInstance.collection(collectionName).get();
      if (snapshot.empty) return;

      const now = Date.now();
      let cleaned = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() || {};
        const docId = docSnap.id;
        const email = normEmail(data.email || docId);

        const createdMs =
          data.createdAt?.toDate
            ? data.createdAt.toDate().getTime()
            : data.createdAt?._seconds
            ? data.createdAt._seconds * 1000
            : typeof data.createdAtMs === 'number'
            ? data.createdAtMs
            : 0;

        const ageMs = createdMs > 0 ? now - createdMs : Infinity;

        // 1. Delete if older than 12 seconds OR missing timestamp (purges 1+ day old stuck docs!)
        if (ageMs >= 12000) {
          console.log(
            `[🧹 ${label} QUEUE SWEEP] Deleting expired doc ${collectionName}/${docId} (Age: ${
              ageMs === Infinity ? 'old/no-timestamp' : Math.round(ageMs / 1000) + 's'
            })`
          );
          await docSnap.ref.delete().catch(() => {});
          cleaned++;

          const userSockets = findUserSockets(email, data.uid);
          for (const { sockId, user } of userSockets) {
            if (user.inQueue && !user.roomId) {
              user.inQueue = false;
              user.joinedQueueAt = null;
              io.to(sockId).emit('queue_expired_10s', {
                email,
                message: "Queue timeout (10s)",
                timestamp: now,
              });
            }
          }
          continue;
        }

        // 2. If doc is > 6 seconds old and user is not connected on any socket and offline in RTDB -> delete!
        if (ageMs > 6000 && !isUserConnectedOnAnySocket(email, data.uid)) {
          const active = await isUserActiveInRTDB(email, data.uid);
          if (!active) {
            console.log(`[🧹 ${label} OFFLINE QUEUE SWEEP] Deleting offline user ${collectionName}/${docId}`);
            await docSnap.ref.delete().catch(() => {});
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        console.log(`[✅ ${label} QUEUE SWEEP] Purged ${cleaned} stale/offline queue doc(s) from ${collectionName}.`);
      }
    } catch (error) {
      console.log(`[❌ ${label} QUEUE SWEEP ERROR]:`, error.message);
    }
  };

  try {
    await Promise.all([
      sweepQueueCollection(firestore, 'randomQueue', 'VIDEO'),
      sweepQueueCollection(voiceFirestore, 'voicerandomQueue', 'VOICE'),
      sweepQueueCollection(chatFirestore, 'randomChatQueue', 'CHAT')
    ]);
  } finally {
    isSweepingQueues = false;
  }
}

// Run immediately on boot (cleans any 1+ day old docs right away!) and every 5 seconds
sweepAllQueueCollections();
setInterval(sweepAllQueueCollections, 5000);

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
          await notifyPartnerAndWipeRoom(roomId, data.endedBy || null, action, `${label} Lingering Status Sweeper`);
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
          await notifyPartnerAndWipeRoom(roomId, null, 'disconnected', `${label} Unfinished Handshake Sweeper`);
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