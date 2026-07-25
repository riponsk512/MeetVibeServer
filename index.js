const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// 🔑 1. Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://testvibe-cc69f-default-rtdb.firebaseio.com"
});
const db = admin.database();
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Track active users: socket.id -> { uid, email, screen, lastPing, isWatchingAd }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`\n[🔌 NEW CONNECTION] Socket ID: ${socket.id}`);

  // 1. Register User
  socket.on('register_user', async (data) => {
    const { uid, email, screen } = data;
    if (!uid) return;
    
    activeUsers.set(socket.id, { 
      uid, email, screen, lastPing: Date.now(), isWatchingAd: false 
    });

    try {
      await db.ref(`users/${uid}`).update({ IsActive: true });
      console.log(`[✅ REGISTERED] User: ${email || uid} is Active on screen: ${screen}`);
    } catch (error) { 
      console.log(`[❌ DB ERROR] Failed to set user active:`, error); 
    }
  });

  // 2. ⚡ The 4-Second Ping Listener
  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).lastPing = Date.now();
      // Optional: Uncomment the line below if you want to see EVERY ping (it will spam the console)
      // console.log(`[💓 PING] Received from ${activeUsers.get(socket.id).email}`);
    }
  });

  // 3. 📺 Ad Status Listener (Prevents disconnects while watching ads)
  socket.on('ad_status', (data) => {
    if (activeUsers.has(socket.id)) {
      const user = activeUsers.get(socket.id);
      user.isWatchingAd = data.isWatchingAd;
      user.lastPing = Date.now(); // Reset ping timer to give them a fresh start
      console.log(`[📺 AD STATUS] User ${user.email} watching ad: ${data.isWatchingAd}. Grace period activated!`);
    }
  });

  // 4. Instant Manual Disconnect (App backgrounded by user, NOT by an ad)
  socket.on('manual_disconnect', async () => {
    console.log(`[⚠️ MANUAL DISCONNECT] Socket ${socket.id} requested disconnect.`);
    await handleUserDrop(socket.id, 'App Backgrounded/Closed');
  });

  // 5. Standard Socket Drop (Network failure)
  socket.on('disconnect', () => {
    console.log(`[🔌 DISCONNECTED] Socket ID: ${socket.id} connection lost.`);
    handleUserDrop(socket.id, 'Socket Dropped');
  });
});

// ==========================================
// 🚨 HEARTBEAT SWEEPER (Runs every 4 seconds)
// ==========================================
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    
    // 💡 THE AD GRACE PERIOD LOGIC:
    // If watching an ad, give them 2 minutes (120,000ms) before dropping them.
    // If NOT watching an ad, give them standard 6 seconds (6000ms).
    const timeoutThreshold = user.isWatchingAd ? 120000 : 6000; 

    if (now - user.lastPing > timeoutThreshold) {
      console.log(`[🕒 TIMEOUT] User ${user.email} missed pings for ${timeoutThreshold/1000}s.`);
      await handleUserDrop(socketId, 'Missed Ping (Internet Drop / App Killed)');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

// Helper to handle drops
async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`[🛑 DROPPING USER] ${user.email || user.uid} | Reason: ${reason}`);

    try {
      await db.ref(`users/${user.uid}`).update({ IsActive: false });
      console.log(`[💾 DB UPDATE] Set IsActive to FALSE for ${user.email}`);
    } catch (error) { 
      console.log(`[❌ DB ERROR] Failed to set inactive for ${user.email}:`, error); 
    }

    activeUsers.delete(socketId);
  }
}

// ==========================================
// 💎 EXACT DATE/TIME SUBSCRIPTION SWEEPER (Runs every 60s)
// ==========================================
async function sweepSubscriptions() {
  console.log('\n[🔍 SWEEPER] Running Exact Date/Time Subscription Sweep...');
  try {
    const snap = await db.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) {
      console.log('[🔍 SWEEPER] No subscriptions found in database.');
      return;
    }

    const subscriptions = snap.val();
    const now = new Date(); // The EXACT current time right now

    for (const [dateKey, subData] of Object.entries(subscriptions)) {
      // Key Format: DD-MM-YYYY-HH-mm-ss-SSS
      const parts = dateKey.split('-');
      if (parts.length >= 7) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS Months are 0-11
        const year = parseInt(parts[2], 10);
        const hours = parseInt(parts[3], 10);
        const minutes = parseInt(parts[4], 10);
        const seconds = parseInt(parts[5], 10);
        const ms = parseInt(parts[6], 10);
        
        // Construct the EXACT expiry date from the key
        const expDate = new Date(year, month, day, hours, minutes, seconds, ms);

        console.log(`[⏱️ CHECKING] Key: ${dateKey} | Expiry: ${expDate.toLocaleString()} | Now: ${now.toLocaleString()}`);

        // Compare exact milliseconds!
        if (expDate <= now) {
          console.log(`[💥 EXPIRED!] Time has passed. Removing subscription for user: ${subData.email || subData.userId}`);
          const uid = subData.userId;

          if (uid) {
            await db.ref(`users/${uid}/Subscription`).remove();
            await db.ref(`users/${uid}`).update({ IsVip: false }); 
          }
          await db.ref(`TotalSubscriptions/${dateKey}`).remove();
          console.log(`[✅ CLEANUP DONE] Deleted ${dateKey} from Firebase.`);
        }
      }
    }
  } catch (error) { 
    console.log('[❌ SWEEPER ERROR]', error); 
  }
}

setInterval(sweepSubscriptions, 60000); // Check every 60 seconds

app.get('/sweep', async (req, res) => {
  await sweepSubscriptions();
  res.send('<h1>🧹 Exact Time Sweeper Triggered! Check Console Logs.</h1>');
});

app.get('/', (req, res) => res.send('Heartbeat Server is Running with Detailed Logs 🚀'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Server listening on port ${PORT}`));