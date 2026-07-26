const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 DUAL FIREBASE ADMIN INITIALIZATION
// ==========================================

// APP 1: Realtime Database
const rtdbServiceAccount = require('./serviceAccountKey.json');
const rtdbApp = admin.initializeApp({
   credential: admin.credential.cert(rtdbServiceAccount),
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com" // ⚠️ REPLACE WITH YOUR RTDB URL
}, 'rtdbApp');
const rtdb = rtdbApp.database();

// APP 2: Cloud Firestore (room & randomQueue)
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

io.on('connection', (socket) => {
  console.log(`\n=========================================`);
  console.log(`[🔌 NEW CONNECTION] Socket ID: ${socket.id} connected at ${new Date().toLocaleTimeString()}`);
  console.log(`=========================================\n`);

  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    
    activeUsers.set(socket.id, { 
      uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false, roomId: null 
    });

    console.log(`[👤 USER REGISTERED] Email: ${email} | Screen: ${screen} | Socket: ${socket.id}`);

    try { 
      await rtdb.ref(`users/${uid}`).update({ IsActive: true }); 
      console.log(`[✅ RTDB UPDATE] Set IsActive = TRUE for ${email}`);
    } catch (error) { 
      console.log(`[❌ RTDB ERROR] Failed setting active for ${email}:`, error); 
    }
  });

  socket.on('set_queue_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.inQueue = data.inQueue;
      if (data.email) user.email = data.email;
      
      console.log(`[🎯 QUEUE UPDATE] ${user.email || socket.id} is now ${data.inQueue ? '🔍 SEARCHING (In Queue)' : '🛑 STOPPED SEARCHING (Left Queue)'}`);
    }
  });

  socket.on('set_room_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.roomId = data.roomId;
      
      if (data.roomId) {
        console.log(`[📞 ROOM ENTERED] ${user.email || socket.id} joined Room ID: ${data.roomId}`);
      } else {
        console.log(`[🚪 ROOM LEFT] ${user.email || socket.id} cleared their room status.`);
      }
    }
  });

  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).lastPing = Date.now();
      // Note: Deliberately NOT logging every ping so it doesn't flood your console!
    }
  });

  socket.on('ad_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.isWatchingAd = data.isWatchingAd;
      user.lastPing = Date.now();
      
      console.log(`[📺 AD STATUS] ${user.email || socket.id} is ${data.isWatchingAd ? '🎬 WATCHING AN AD (120s Grace Period applied)' : '❌ DONE WATCHING AD (15s Grace Period applied)'}`);
    }
  });

  socket.on('manual_disconnect', async () => {
    console.log(`\n[📱 APP BACKGROUNDED] App intentionally sent background signal for Socket: ${socket.id}`);
    await handleUserDrop(socket.id, 'App Backgrounded/Closed by User');
  });

  socket.on('disconnect', () => {
    console.log(`\n[⚠️ NETWORK DROP] Socket ${socket.id} abruptly lost connection.`);
    handleUserDrop(socket.id, 'Socket Connection Lost (Internet dropped or App killed)');
  });
});

// ==========================================
// 🚨 HEARTBEAT SWEEPER (Runs every 4s)
// ==========================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    // 15 seconds grace period for network drops, 120 seconds if watching an ad
    const timeoutThreshold = user.isWatchingAd ? 120000 : 15000; 

    if (now - user.lastPing > timeoutThreshold) {
      console.log(`\n[🕒 TIMEOUT] ${user.email || user.uid} missed pings for over ${timeoutThreshold / 1000} seconds!`);
      await handleUserDrop(socketId, 'Missed Ping (Internet completely died or App Killed)');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

// ==========================================
// 🧹 USER DROP HANDLER (RTDB + FIRESTORE CLEANUP)
// ==========================================
async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🛑 EXECUTING DROP] Dropping user: ${user.email || user.uid} | Reason: ${reason}`);

    // 1. Set RTDB IsActive to False
    try { 
      if (user.uid) {
        await rtdb.ref(`users/${user.uid}`).update({ IsActive: false }); 
        console.log(`   ➔ [💾 RTDB] Set IsActive = FALSE`);
      }
    } catch (error) { 
      console.log(`   ➔ [❌ RTDB ERROR]`, error); 
    }

    // 2. Clear from Queue if they were searching
    if (user.email && user.inQueue) {
      try { 
        await firestore.collection('randomQueue').doc(user.email).delete(); 
        console.log(`   ➔ [🔥 FIRESTORE] Wiped ${user.email} from randomQueue.`);
      } catch (error) {
        console.log(`   ➔ [❌ QUEUE CLEANUP ERROR]`, error);
      }
    }

    // 3. Clear Room and Subcollections if they were in a call
    if (user.roomId) {
      try {
        const roomRef = firestore.collection('room').doc(user.roomId);
        const batch = firestore.batch();

        // Subcollection: callerCandidates
        const callerCands = await roomRef.collection('callerCandidates').get();
        let cCandsCount = 0;
        callerCands.forEach(doc => { batch.delete(doc.ref); cCandsCount++; });

        // Subcollection: calleeCandidates
        const calleeCands = await roomRef.collection('calleeCandidates').get();
        let clCandsCount = 0;
        calleeCands.forEach(doc => { batch.delete(doc.ref); clCandsCount++; });

        await batch.commit();
        await roomRef.delete();
        
        console.log(`   ➔ [📞 FIRESTORE] Wiped Room ID: ${user.roomId} (Deleted ${cCandsCount} caller & ${clCandsCount} callee candidates)`);
      } catch (error) {
        console.log(`   ➔ [❌ ROOM CLEANUP ERROR]`, error);
      }
    }

    activeUsers.delete(socketId);
    console.log(`[🗑️ MEMORY CLEANUP] Removed ${user.email || socketId} from server memory.\n`);
  }
}

// ==========================================
// 📅 STALE QUEUE SWEEPER (FIRESTORE)
// ==========================================
setInterval(async () => {
  try {
    const snapshot = await firestore.collection('randomQueue').get();
    if (snapshot.empty) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); 
    
    let deletedCount = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      let docCreatedDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (docCreatedDate && docCreatedDate < todayStart) {
        await firestore.collection('randomQueue').doc(doc.id).delete();
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`\n[🧹 BACKGROUND SWEEP] Purged ${deletedCount} stale users from randomQueue.`);
    }
  } catch (error) {}
}, 30 * 60 * 1000);

// ==========================================
// 💎 TOTAL SUBSCRIPTION SWEEPER (RTDB)
// ==========================================
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
          console.log(`[💥 SUB EXPIRED] Removed VIP status for User: ${subData.email || subData.userId}`);
        }
      }
    }
  } catch (error) {}
}, 60000); 

app.get('/', (req, res) => res.send('MeetVibe Dual-Admin Server Running 🚀'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));