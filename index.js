const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 🔑 1. DUAL FIREBASE ADMIN INITIALIZATION
// ==========================================

// APP 1: Realtime Database (User Status & VIP Subscriptions)
const rtdbServiceAccount = require('./serviceAccountKey.json');
const rtdbApp = admin.initializeApp({
   credential: admin.credential.cert(rtdbServiceAccount),
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com" // ⚠️ REPLACE WITH YOUR RTDB URL
}, 'rtdbApp');

const rtdb = rtdbApp.database();

// APP 2: Cloud Firestore (MeetVibeVideoChatDb -> randomQueue)
const firestoreServiceAccount = require('./videoChatfirestoreServiceAccountKey.json');
const firestoreApp = admin.initializeApp({
  credential: admin.credential.cert(firestoreServiceAccount)
}, 'firestoreApp');
const firestore = firestoreApp.firestore();

// ==========================================
// 🚀 SERVER & SOCKET SETUP
// ==========================================
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Track active users: socket.id -> { uid, email, screen, lastPing, isWatchingAd, inQueue }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`\n[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  // 1. Register User on App Startup
  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    
    activeUsers.set(socket.id, { 
      uid, email, screen, lastPing: Date.now(), isWatchingAd: false, inQueue: false 
    });

    try {
      await rtdb.ref(`users/${uid}`).update({ IsActive: true });
      console.log(`[✅ REGISTERED] ${email || uid} active on screen: ${screen}`);
    } catch (error) { 
      console.log(`[❌ RTDB ERROR] Failed setting active:`, error); 
    }
  });

  // 2. User Enters / Exits Random Queue
  socket.on('set_queue_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.inQueue = data.inQueue;
      if (data.email) user.email = data.email;
      console.log(`[🎯 QUEUE STATUS] ${user.email} searching status: ${data.inQueue}`);
    }
  });

  // 3. Heartbeat Ping Listener (4-Second Interval)
  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).lastPing = Date.now();
    }
  });

  // 4. Ad Status Listener (2-Minute Grace Period)
  socket.on('ad_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.isWatchingAd = data.isWatchingAd;
      user.lastPing = Date.now();
      console.log(`[📺 AD STATUS] ${user.email} watching ad: ${data.isWatchingAd}`);
    }
  });

  // 5. Manual Disconnect (App Backgrounded or Left Screen)
  socket.on('manual_disconnect', async () => {
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id}`);
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  // 6. Socket Disconnect (Network Failure / App Killed)
  socket.on('disconnect', () => {
    console.log(`[🔌 DISCONNECTED] Socket ID: ${socket.id}`);
    handleUserDrop(socket.id, 'Socket Connection Lost');
  });
});

// ==========================================
// 🚨 HEARTBEAT SWEEPER (Runs every 4 seconds)
// ==========================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    const timeoutThreshold = user.isWatchingAd ? 120000 : 6000; 

    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 TIMEOUT] ${user.email} missed pings for ${timeoutThreshold / 1000}s.`);
      await handleUserDrop(socketId, 'Missed Ping (Internet Drop / App Killed)');
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
    console.log(`[🛑 DROPPING USER] ${user.email || user.uid} | Reason: ${reason}`);

    // 1. Set IsActive to false in Realtime Database
    try {
      if (user.uid) {
        await rtdb.ref(`users/${user.uid}`).update({ IsActive: false });
        console.log(`[💾 RTDB] Set IsActive=FALSE for ${user.email}`);
      }
    } catch (error) { 
      console.log(`[❌ RTDB ERROR]`, error); 
    }

    // 2. 🚀 INSTANT FIRESTORE QUEUE DELETION
    // ONLY delete if they actually had the queue screen open!
    if (user.email && user.inQueue) {
      try {
        await firestore.collection('randomQueue').doc(user.email).delete();
        console.log(`[🔥 FIRESTORE QUEUE] Deleted ${user.email} from randomQueue!`);
      } catch (error) {
        console.log(`[❌ FIRESTORE QUEUE ERROR] Failed to delete ${user.email}:`, error);
      }
    }

    activeUsers.delete(socketId);
  }
}

// ==========================================
// 💎 TOTAL SUBSCRIPTION SWEEPER (RTDB - Runs every 60s)
// ==========================================
async function sweepSubscriptions() {
  try {
    const snap = await rtdb.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) return;

    const subscriptions = snap.val();
    const now = new Date(); 

    for (const [dateKey, subData] of Object.entries(subscriptions)) {
      const parts = dateKey.split('-');
      if (parts.length >= 7) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; 
        const year = parseInt(parts[2], 10);
        const hours = parseInt(parts[3], 10);
        const minutes = parseInt(parts[4], 10);
        const seconds = parseInt(parts[5], 10);
        const ms = parseInt(parts[6], 10);
        
        const expDate = new Date(year, month, day, hours, minutes, seconds, ms);

        if (expDate <= now) {
          console.log(`[💥 SUB EXPIRED!] Removing VIP for user: ${subData.email || subData.userId}`);
          const uid = subData.userId;

          if (uid) {
            await rtdb.ref(`users/${uid}/Subscription`).remove();
            await rtdb.ref(`users/${uid}`).update({ IsVip: false }); 
          }
          await rtdb.ref(`TotalSubscriptions/${dateKey}`).remove();
        }
      }
    }
  } catch (error) { console.log('[❌ RTDB SWEEPER ERROR]', error); }
}

setInterval(sweepSubscriptions, 60000); 

// ==========================================
// 📅 STALE QUEUE SWEEPER (FIRESTORE - Runs every 30 mins)
// ==========================================
async function sweepOldQueueDocs() {
  console.log('\n[🔍 QUEUE SWEEPER] Checking for expired dates in randomQueue...');
  try {
    const snapshot = await firestore.collection('randomQueue').get();
    if (snapshot.empty) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0); // Midnight today 

    let deletedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      let docCreatedDate = null;

      if (data.createdAt && data.createdAt.toDate) {
        docCreatedDate = data.createdAt.toDate();
      } else if (data.createdAt) {
        docCreatedDate = new Date(data.createdAt);
      }

      // Check if createdAt is strictly older than today
      if (docCreatedDate && docCreatedDate < todayStart) {
        console.log(`[🗑️ PURGING STALE QUEUE] Email: ${doc.id}`);
        await firestore.collection('randomQueue').doc(doc.id).delete();
        deletedCount++;
      }
    }
    console.log(`[✅ QUEUE SWEEPER DONE] Cleaned ${deletedCount} old queue documents.`);
  } catch (error) {
    console.log('[❌ QUEUE SWEEPER ERROR]', error);
  }
}

setInterval(sweepOldQueueDocs, 30 * 60 * 1000);

// ==========================================
// 🚀 MANUAL API ENDPOINTS
// ==========================================
app.get('/sweep', async (req, res) => {
  await sweepSubscriptions();
  res.send('<h1>🧹 RTDB Sweeper Triggered!</h1>');
});

app.get('/sweep-queue', async (req, res) => {
  await sweepOldQueueDocs();
  res.send('<h1>🧹 Firestore Old Queue Purge Executed!</h1>');
});

app.get('/', (req, res) => res.send('MeetVibe Dual-Admin Server Running 🚀'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));