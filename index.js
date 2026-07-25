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
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Map to track active connections: socketId -> { uid, email, lastPing }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // 2. Register User & Set Active
  socket.on('register_user', async (data) => {
    const { uid, email } = data;
    if (!uid) return;

    activeUsers.set(socket.id, { uid, email, lastPing: Date.now() });

    try {
      // 🚀 SERVER-SIDE UPDATE: Force IsActive to true
      await db.ref(`users/${uid}`).update({ IsActive: true });
      console.log(`🟢 User Active: ${email || uid}`);
    } catch (error) {
      console.log('Error setting active:', error);
    }
  });

  // 3. Hearbeat Ping from Client (Received every 4 seconds)
  socket.on('ping', () => {
    if (activeUsers.has(socket.id)) {
      activeUsers.get(socket.id).lastPing = Date.now();
    }
  });

  // 4. Graceful Disconnect
  socket.on('disconnect', () => {
    handleUserDrop(socket.id, 'Disconnected (App Closed Normally)');
  });
});

// 5. HEARTBEAT MONITOR: Detects Missed Pings (App Kills / Internet Drops)
setInterval(async () => {
  const now = Date.now();
  for (const [socketId, user] of activeUsers.entries()) {
    // If no ping for 6 seconds (4s interval + 2s network buffer)
    if (now - user.lastPing > 6000) {
      await handleUserDrop(socketId, 'Missed Ping (Internet Drop / App Killed)');
      io.to(socketId).emit('force_disconnect');
    }
  }
}, 4000);

// Helper to set IsActive to false securely
async function handleUserDrop(socketId, reason) {
  if (activeUsers.has(socketId)) {
    const user = activeUsers.get(socketId);
    console.log(`❌ User Dropped [${reason}]: ${user.uid}`);

    try {
      // 🚀 SERVER-SIDE UPDATE: Force IsActive to false
      await db.ref(`users/${user.uid}`).update({ IsActive: false });
    } catch (error) {
      console.log('Error setting inactive:', error);
    }

    activeUsers.delete(socketId);
  }
}

// 6. TOTAL SUBSCRIPTION SWEEPER
async function sweepSubscriptions() {
  console.log('🔍 Running TotalSubscriptions Sweeper...');
  try {
    const snap = await db.ref('TotalSubscriptions').once('value');
    if (!snap.exists()) return;

    const subscriptions = snap.val();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight today for strict comparison

    for (const [dateKey, subData] of Object.entries(subscriptions)) {
      // Format: DD-MM-YYYY-HH-mm-ss-SSS
      const parts = dateKey.split('-');
      
      if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-11
        const year = parseInt(parts[2], 10);
        
        const expDate = new Date(year, month, day);
        expDate.setHours(0, 0, 0, 0);

        // If Expired (Past) OR Same Day (Today) -> Remove
        if (expDate <= today) {
          console.log(`🗑️ Removing Expired Sub: ${dateKey}`);
          const uid = subData.userId;

          if (uid) {
            // Delete 'Subscription' node from the specific user
            await db.ref(`users/${uid}/Subscription`).remove();
            
            // Safety measure: also flip IsVip to false based on your DB screenshot
            await db.ref(`users/${uid}`).update({ IsVip: false }); 
          }
          // Delete from TotalSubscriptions root
          await db.ref(`TotalSubscriptions/${dateKey}`).remove();
        }
      }
    }
    console.log('✅ Subscription Sweep Complete.');
  } catch (error) {
    console.log('Sweeper Error:', error);
  }
}

// Run the sweeper immediately on server start, and then every 1 hour
sweepSubscriptions();
setInterval(sweepSubscriptions, 60 * 60 * 1000);

app.get('/', (req, res) => res.send('Admin-Powered Heartbeat Server is Running 🚀'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});