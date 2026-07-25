/*
// index.js
// const io = require("socket.io")(8080, { cors: { origin: "*" } });
// const { createClient } = require("@supabase/supabase-js");

// // Supabase client
// const supabase = createClient(
//   "https://raoohjclgxiuushhdwvv.supabase.co",
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhb29oamNsZ3hpdXVzaGhkd3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MzkzMTEsImV4cCI6MjA3MzAxNTMxMX0.LgK_EzTdLWn9ELp-riXnyWV0MVI3pLMCtTPss-s2aKc"
// );

// const onlineUsers = {}; // { email: socketId }

// io.on("connection", (socket) => {
//   console.log("⚡ Connected:", socket.id);

//   // Register user
//   socket.on("register", (email) => {
//     onlineUsers[email] = socket.id;
//     socket.email = email;
//     console.log(`🟢 Registered: ${email}`);
//   });

//   // -----------------------------
//   // 📞 Start a call
//   // -----------------------------
//   socket.on("start_call", async ({ from, to, callType, roomId, isVideoCall }) => {
//     console.log(`📞 ${from} is calling ${to}`);

//     try {
//       // Check both user states
//       const { data: users, error } = await supabase
//         .from("users")
//         .select("email, isoncallstatus")
//         .in("email", [from, to]);

//       if (error) throw error;

//       const caller = users.find((u) => u.email === from);
//       const callee = users.find((u) => u.email === to);

//       if (caller?.isoncallstatus) {
//         return socket.emit("user_busy", { reason: "caller_busy" });
//       }
//       if (callee?.isoncallstatus) {
//         return socket.emit("user_busy", { reason: "callee_busy" });
//       }

//       // Update Supabase flags
//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: true,
//           iscallingfrom: from,
//           iscallingto: to,
//           lastcallroom: roomId,
//           isvideocall: isVideoCall,
//           updatedat: new Date().toISOString(),
//         })
//         .in("email", [from, to]);

//       // Notify callee
//       const calleeSocket = onlineUsers[to];
//       if (calleeSocket) {
//         io.to(calleeSocket).emit("incoming_call", { from, callType, roomId });
//         console.log(`📲 Incoming call sent to ${to}`);
//       } else {
//         socket.emit("user_offline", { to });
//         console.log(`⚠️ ${to} is offline`);
//       }

//       // Notify caller
//       socket.emit("call_pending", { to });
//     } catch (err) {
//       console.error("❌ start_call error:", err);
//       socket.emit("call_error", { message: err.message });
//     }
//   });

//   // -----------------------------
//   // ✅ User joins call
//   // -----------------------------
//   socket.on("join_call", async ({ from, to }) => {
//     console.log(`📞 ${to} joined call with ${from}`);

//     try {
//       await supabase
//         .from("users")
//         .update({ isoncallstatus: true })
//         .in("email", [from, to]);

//       const callerSocket = onlineUsers[from];
//       const calleeSocket = onlineUsers[to];

//       if (callerSocket) io.to(callerSocket).emit("call_started", { with: to });
//       if (calleeSocket) io.to(calleeSocket).emit("call_started", { with: from });

//       console.log(`🚀 Call started between ${from} and ${to}`);
//     } catch (err) {
//       console.error("❌ join_call error:", err);
//     }
//   });

//   // -----------------------------
//   // 🛑 End call
//   // -----------------------------
//   socket.on("end_call", async ({ from, to }) => {
//     console.log(`📴 Call end requested by ${from}`);

//     await endCallForUsers(from, to);
//   });

//   // -----------------------------
//   // ⚙️ Handle background/offline (disconnect)
//   // -----------------------------
//   socket.on("disconnect", async (reason) => {
//     const email = socket.email;
//     console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

//     if (!email) return;
//     delete onlineUsers[email];

//     // Mark user as not on call
//     await endCallForUsers(email);
//   });

//   // -----------------------------
//   // Helper: End call cleanly
//   // -----------------------------
//   async function endCallForUsers(user1, user2) {
//     try {
//       // Fetch current call info
//       const { data: user } = await supabase
//         .from("users")
//         .select("iscallingfrom, iscallingto, isoncallstatus")
//         .eq("email", user1)
//         .single();

//       if (user?.isoncallstatus) {
//         const otherEmail =
//           user.iscallingfrom === user1 ? user.iscallingto : user.iscallingfrom || user2;

//         await supabase
//           .from("users")
//           .update({
//             isoncallstatus: false,
//             iscallingfrom: null,
//             iscallingto: null,
//             updatedat: new Date().toISOString(),
//           })
//           .in("email", [user1, otherEmail].filter(Boolean));

//         // Notify the other user if online
//         const otherSocket = onlineUsers[otherEmail];
//         if (otherSocket)
//           io.to(otherSocket).emit("call_ended", { from: user1 });

//         console.log(`✅ Call state reset for ${user1} and ${otherEmail || "(none)"}`);
//       }
//     } catch (err) {
//       console.error("❌ endCallForUsers error:", err.message);
//     }
//   }
// });

// console.log("✅ Socket server running on http://localhost:8080");


// index.js
// const { createClient } = require("@supabase/supabase-js");
// const io = require("socket.io")(8080, { cors: { origin: "*" } });

// // const io = require("socket.io")(8080, { cors: { origin: "*" } });
// const { createClient } = require("@supabase/supabase-js");

// // Supabase client
// const supabase = createClient(
//   "https://raoohjclgxiuushhdwvv.supabase.co",
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhb29oamNsZ3hpdXVzaGhkd3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MzkzMTEsImV4cCI6MjA3MzAxNTMxMX0.LgK_EzTdLWn9ELp-riXnyWV0MVI3pLMCtTPss-s2aKc"
// );


// const onlineUsers = {}; // { email: socketId }

// io.on("connection", (socket) => {
//   console.log("⚡ Connected:", socket.id);

//   // -----------------------------
//   // 🟢 Register user
//   // -----------------------------
//   socket.on("register", (email) => {
//     onlineUsers[email] = socket.id;
//     socket.email = email;
//     console.log(`🟢 Registered: ${email}`);
//   });

//   // -----------------------------
//   // 📞 Start call
//   // -----------------------------
//   socket.on("start_call", async ({ from, to, callType, roomId, isVideoCall }) => {
//     console.log(`📞 ${from} is calling ${to}`);

//     try {
//       // 1️⃣ Check user call status
//       const { data: users, error } = await supabase
//         .from("users")
//         .select("email, isoncallstatus")
//         .in("email", [from, to]);

//       if (error) throw error;

//       const caller = users.find((u) => u.email === from);
//       const callee = users.find((u) => u.email === to);

//       if (caller?.isoncallstatus) return socket.emit("user_busy", { reason: "caller_busy" });
//       if (callee?.isoncallstatus) return socket.emit("user_busy", { reason: "callee_busy" });

//       // 2️⃣ Update Supabase call flags
//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: true,
//           iscallingfrom: from,
//           // iscallingto: to,
//           lastcallroom: roomId,
//           isvideocall: isVideoCall,
//           updatedat: new Date().toISOString(),
//         })
//         .in("email", [from, to]);

//       // 3️⃣ Notify callee (incoming call)
//       const calleeSocket = onlineUsers[to];
//       if (calleeSocket) {
//         io.to(calleeSocket).emit("incoming_call", { from, callType, roomId, isVideoCall });
//         console.log(`📲 Incoming call sent to ${to}`);
//       } else {
//         socket.emit("user_offline", { to });
//         console.log(`⚠️ ${to} is offline`);
//       }

//       // 4️⃣ Notify caller
//       socket.emit("call_pending", { to });
//     } catch (err) {
//       console.error("❌ start_call error:", err);
//       socket.emit("call_error", { message: err.message });
//     }
//   });

//   // -----------------------------
//   // ✅ User joins call
//   // -----------------------------
//   socket.on("join_call", async ({ from, to }) => {
//     console.log(`📞 ${to} joined call with ${from}`);
//     try {
//       await supabase.from("users").update({ isoncallstatus: true }).in("email", [from, to]);

//       const callerSocket = onlineUsers[from];
//       const calleeSocket = onlineUsers[to];

//       if (callerSocket) io.to(callerSocket).emit("call_started", { with: to });
//       if (calleeSocket) io.to(calleeSocket).emit("call_started", { with: from });

//       console.log(`🚀 Call started between ${from} and ${to}`);
//     } catch (err) {
//       console.error("❌ join_call error:", err);
//     }
//   });

//   // -----------------------------
//   // 🛑 End call manually
//   // -----------------------------
//   socket.on("end_call", async ({ from, to }) => {
//     console.log(`📴 Call end requested by ${from}`);
//     await endCallForUsers(from, to);
//   });

//   // -----------------------------
//   // ⚙️ Handle disconnect (background / no internet)
//   // -----------------------------
//   socket.on("disconnect", async (reason) => {
//     const email = socket.email;
//     console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

//     if (!email) return;
//     delete onlineUsers[email];

//     await endCallForUsers(email);
//   });

//   // -----------------------------
//   // 🧹 Helper: End call cleanly
//   // -----------------------------
//   async function endCallForUsers(user1, user2) {
//     try {
//       const { data: user } = await supabase
//         .from("users")
//         .select("iscallingfrom, iscallingto, isoncallstatus")
//         .eq("email", user1)
//         .single();

//       if (!user?.isoncallstatus) return;

//       const otherEmail =
//         user.iscallingfrom === user1 ? user.iscallingto : user.iscallingfrom || user2;

//       // Update both users
//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: false,
//           iscallingfrom: null,
//           iscallingto: null,
//           updatedat: new Date().toISOString(),
//         })
//         .in("email", [user1, otherEmail].filter(Boolean));

//       // Notify the other user if online
//       const otherSocket = onlineUsers[otherEmail];
//       if (otherSocket) io.to(otherSocket).emit("call_ended", { from: user1 });

//       console.log(`✅ Call state reset for ${user1} and ${otherEmail || "(none)"}`);
//     } catch (err) {
//       console.error("❌ endCallForUsers error:", err.message);
//     }
//   }
// });

// console.log("✅ Socket server running on http://localhost:8080");
*/

// const io = require("socket.io")(8080, { cors: { origin: "*" } });
// const { createClient } = require("@supabase/supabase-js");

// // Supabase client
// const supabase = createClient(
//   "https://raoohjclgxiuushhdwvv.supabase.co",
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhb29oamNsZ3hpdXVzaGhkd3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MzkzMTEsImV4cCI6MjA3MzAxNTMxMX0.LgK_EzTdLWn9ELp-riXnyWV0MVI3pLMCtTPss-s2aKc"
// );

// const onlineUsers = {}; // { email: socketId }

// io.on("connection", (socket) => {
//   console.log("⚡ Connected:", socket.id);

//   // -----------------------------
//   // 🟢 Register user
//   // -----------------------------
//   socket.on("register", (email) => {
//     onlineUsers[email] = socket.id;
//     socket.email = email;
//     console.log(`🟢 Registered: ${email}`);
//   });

//   // -----------------------------
//   // 📞 Start call
//   // -----------------------------
//   socket.on("start_call", async ({ from, to, callType, roomId, isVideoCall }) => {
//     console.log(`📞 ${from} is calling ${to}`);

//     try {
//       const { data: users, error } = await supabase
//         .from("users")
//         .select("email, isoncallstatus")
//         .in("email", [from, to]);

//       if (error) throw error;

//       const caller = users.find((u) => u.email === from);
//       const callee = users.find((u) => u.email === to);

//       if (caller?.isoncallstatus) return socket.emit("user_busy", { reason: "caller_busy" });
//       if (callee?.isoncallstatus) return socket.emit("user_busy", { reason: "callee_busy" });

//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: true,
//           iscallingfrom: from,
//           lastcallroom: roomId,
//           isvideocall: isVideoCall,
//           updatedat: new Date().toISOString(),
//         })
//         .in("email", [from, to]);

//       const calleeSocket = onlineUsers[to];
//       if (calleeSocket) {
//         io.to(calleeSocket).emit("incoming_call", { from,to,callType, roomId, isVideoCall });
//         console.log(`📲 Incoming call sent to ${to}`);
//       } else {
//         socket.emit("user_offline", { to });
//         console.log(`⚠️ ${to} is offline`);
//       }

//       socket.emit("call_pending", { to });
//     } catch (err) {
//       console.error("❌ start_call error:", err);
//       socket.emit("call_error", { message: err.message });
//     }
//   });

//   // -----------------------------
//   // ✅ User joins call
//   // -----------------------------
//   socket.on("join_call", async ({ from, to }) => {
//     console.log(`📞 ${to} joined call with ${from}`);
//     try {
//       await supabase.from("users").update({ isoncallstatus: true }).in("email", [from, to]);

//       const callerSocket = onlineUsers[from];
//       const calleeSocket = onlineUsers[to];

//       if (callerSocket) io.to(callerSocket).emit("call_started", { with: to });
//       if (calleeSocket) io.to(calleeSocket).emit("call_started", { with: from });

//       console.log(`🚀 Call started between ${from} and ${to}`);
//     } catch (err) {
//       console.error("❌ join_call error:", err);
//     }
//   });

//   // -----------------------------
//   // ❌ Reject call
//   // -----------------------------
//   socket.on("reject_call", async ({ from, to }) => {
//     console.log(`❌ Call rejected by ${from}`);
//     await endCallForUsers(from, to);

//     const otherSocket = onlineUsers[to];
//     if (otherSocket) io.to(otherSocket).emit("call_rejected", { from });
//   });

//   // -----------------------------
//   // 🛑 End call manually
//   // -----------------------------
//   socket.on("end_call", async ({ from, to }) => {
//     console.log(`📴 Call end requested by ${from}`);
//     await endCallForUsers(from, to);
//   });

//   // -----------------------------
//   // ⚙️ Handle disconnect
//   // -----------------------------
//   socket.on("disconnect", async (reason) => {
//     const email = socket.email;
//     console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

//     if (!email) return;
//     delete onlineUsers[email];

//     await endCallForUsers(email);
//   });

//   // -----------------------------
//   // 🧹 Helper: End call cleanly
//   // -----------------------------


// // -----------------------------
// // 🧹 Helper: End call cleanly (like handleRejectCall)
// // -----------------------------
// async function endCallForUsers(user1, user2) {
//   try {
//     // 1️⃣ Get current user info
//     const { data: selfUser } = await supabase
//       .from("users")
//       .select("iscallingfrom, isoncallstatus")
//       .eq("email", user1)
//       .single();

//     if (!selfUser) return;

//     // If user is not on call, just return
//     if (!selfUser.isoncallstatus) return;

//     // 2️⃣ Determine the peer email
//     const peerEmail =
//       selfUser.iscallingfrom === user1 ? user2 : selfUser.iscallingfrom;

//     // 3️⃣ Update current user (self)
//     const { error: selfError } = await supabase
//       .from("users")
//       .update({
//         iscallingfrom: "",
//         isoncallstatus: false,
//         updatedat: new Date().toISOString(),
//       })
//       .eq("email", user1);

//     if (selfError) console.error("❌ Error updating self:", selfError);

//     // 4️⃣ Update peer if exists
//     if (peerEmail) {
//       const { error: peerError } = await supabase
//         .from("users")
//         .update({
//           iscallingfrom: "",
//           isoncallstatus: false,
//           iscallerhangup: true,
//           updatedat: new Date().toISOString(),
//         })
//         .eq("email", peerEmail);

//       if (peerError) console.error("❌ Error updating peer:", peerError);

//       // 5️⃣ Notify the peer if online
//       const peerSocket = onlineUsers[peerEmail];
//       if (peerSocket) io.to(peerSocket).emit("call_ended", { from: user1 });
//     }

//     console.log(`✅ Call state reset for ${user1} and ${peerEmail || "(none)"}`);
//   } catch (err) {
//     console.error("❌ endCallForUsers error:", err.message);
//   }
// }


//   /*
//   async function endCallForUsers(user1, user2) {
//     try {
//       const { data: user } = await supabase
//         .from("users")
//         .select("iscallingfrom, isoncallstatus")
//         .eq("email", user1)
//         .single();

//       if (!user?.isoncallstatus) return;

//       const otherEmail =
//         user.iscallingfrom === user1 ? user.iscallingto : user.iscallingfrom || user2;

//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: false,
//           iscallingfrom: null,
//           iscallingto: null,
//           updatedat: new Date().toISOString(),
//         })
//         .in("email", [user1, otherEmail].filter(Boolean));

//       const otherSocket = onlineUsers[otherEmail];
//       if (otherSocket) io.to(otherSocket).emit("call_ended", { from: user1 });

//       console.log(`✅ Call state reset for ${user1} and ${otherEmail || "(none)"}`);
//     } catch (err) {
//       console.error("❌ endCallForUsers error:", err.message);
//     }
//   }
//   */
// });

// console.log("✅ Socket server running on http://localhost:8080");


// const io = require("socket.io")(8080, { cors: { origin: "*" } });
// const { createClient } = require("@supabase/supabase-js");

// const supabase = createClient(
//   "https://raoohjclgxiuushhdwvv.supabase.co",
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhb29oamNsZ3hpdXVzaGhkd3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MzkzMTEsImV4cCI6MjA3MzAxNTMxMX0.LgK_EzTdLWn9ELp-riXnyWV0MVI3pLMCtTPss-s2aKc"
// );
// const onlineUsers = {}; // { email: socketId }

// io.on("connection", (socket) => {
//   console.log("⚡ Connected:", socket.id);

//   // -----------------------------
//   // 🟢 Register user
//   // -----------------------------
//   socket.on("register", (email) => {
//     onlineUsers[email] = socket.id;
//     socket.email = email;
//     console.log(`🟢 Registered: ${email}`);
//   });

//   // -----------------------------
//   // 📞 Start call
//   // -----------------------------
//   socket.on("start_call", async ({ from, to, callType, roomId, isVideoCall }) => {
//     console.log(`📞 ${from} is calling ${to}`);

//     try {
//       const { data: users, error } = await supabase
//         .from("users")
//         .select("email, isoncallstatus")
//         .in("email", [from, to]);

//       if (error) throw error;

//       const caller = users.find((u) => u.email === from);
//       const callee = users.find((u) => u.email === to);

//       if (caller?.isoncallstatus) return socket.emit("user_busy", { reason: "caller_busy" });
//       if (callee?.isoncallstatus) return socket.emit("user_busy", { reason: "callee_busy" });

//       // Update call status for both users
//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: true,
//           iscallingfrom: from,
//           lastcallroom: roomId,
//           isvideocall: isVideoCall,
//           updatedat: new Date().toISOString(),
//         })
//         .in("email", [from, to]);

//       const calleeSocket = onlineUsers[to];
//       if (calleeSocket) {
//         io.to(calleeSocket).emit("incoming_call", { from, to, callType, roomId, isVideoCall });
//         console.log(`📲 Incoming call sent to ${to}`);
//       } else {
//         socket.emit("user_offline", { to });
//         console.log(`⚠️ ${to} is offline`);
//       }

//       socket.emit("call_pending", { to });
//     } catch (err) {
//       console.error("❌ start_call error:", err);
//       socket.emit("call_error", { message: err.message });
//     }
//   });

//   // -----------------------------
//   // ✅ User joins call
//   // -----------------------------
//   socket.on("join_call", async ({ from, to }) => {
//     console.log(`📞 ${to} joined call with ${from}`);
//     try {
//       await supabase.from("users").update({ isoncallstatus: true }).in("email", [from, to]);

//       const callerSocket = onlineUsers[from];
//       const calleeSocket = onlineUsers[to];

//       if (callerSocket) io.to(callerSocket).emit("call_started", { with: to });
//       if (calleeSocket) io.to(calleeSocket).emit("call_started", { with: from });

//       console.log(`🚀 Call started between ${from} and ${to}`);
//     } catch (err) {
//       console.error("❌ join_call error:", err);
//     }
//   });

//   // -----------------------------
//   // ❌ Reject call
//   // -----------------------------
//   socket.on("reject_call", async ({ from, to }) => {
//     console.log(`❌ Call rejected by ${from}`);
//     await endCallForUsers(from, to);

//     const otherSocket = onlineUsers[to];
//     if (otherSocket) io.to(otherSocket).emit("call_rejected", { from });
//   });

//   // -----------------------------
//   // 🛑 End call manually
//   // -----------------------------
//   socket.on("end_call", async ({ from, to }) => {
//     console.log(`📴 Call end requested by ${from}`);
//     await endCallForUsers(from, to);
//   });

//   // -----------------------------
//   // ⚙️ Handle disconnect (background / no internet)
//   // -----------------------------
//   socket.on("disconnect", async (reason) => {
//     const email = socket.email;
//     console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

//     if (!email) return;
//     delete onlineUsers[email];

//     await endCallForUsers(email);
//   });

//   // -----------------------------
//   // 🧹 Helper: End call cleanly (like handleRejectCall)
//   // -----------------------------
//   async function endCallForUsers(user1, user2) {
//     try {
//       // 1️⃣ Get current user info
//       const { data: selfUser } = await supabase
//         .from("users")
//         .select("iscallingfrom, isoncallstatus")
//         .eq("email", user1)
//         .single();

//       if (!selfUser || !selfUser.isoncallstatus) return;

//       // 2️⃣ Determine the peer email
//       const peerEmail = user2 || selfUser.iscallingfrom;

//       // 3️⃣ Update current user (self)
//       await supabase
//         .from("users")
//         .update({
//           isoncallstatus: false,
//           iscallingfrom: "",
//           updatedat: new Date().toISOString(),
//         })
//         .eq("email", user1);

//       // 4️⃣ Update peer if exists
//       if (peerEmail) {
//         await supabase
//           .from("users")
//           .update({
//             isoncallstatus: false,
//             iscallingfrom: "",
//             iscallerhangup: true,
//             updatedat: new Date().toISOString(),
//           })
//           .eq("email", peerEmail);

//         // 5️⃣ Notify the peer if online
//         const peerSocket = onlineUsers[peerEmail];
//         if (peerSocket) io.to(peerSocket).emit("call_ended", { from: user1 });
//       }

//       console.log(`✅ Call state reset for ${user1} and ${peerEmail || "(none)"}`);
//     } catch (err) {
//       console.error("❌ endCallForUsers error:", err.message);
//     }
//   }
// });

// console.log("✅ Socket server running on http://localhost:8080");

/// updated code






const admin = require("firebase-admin");

var serviceAccount = require("./serviceAccountKey.json");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hiddo-3887f-default-rtdb.firebaseio.com"
});

const db = admin.firestore(); // ✅ Firestore instance





// const io = require("socket.io")(8080, { cors: { origin: "*" } });
const { Server } = require("socket.io");
const io = new Server(8080, {
  cors: {
    origin: "*", // allow all origins (good for dev)
    methods: ["GET", "POST"]
  },
  // host: "192.168.0.103" // <-- optional in socket.io v4, it listens on all interfaces by default
});
// const io = require("socket.io")(8080, { cors: { origin: "*" } });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://srv1498042.hstgr.cloud";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzczNjUzNTc3LCJleHAiOjIwODkwMTM1Nzd9._TDSF9tCnHRRaST2AQGA-6aLDMbFqY4SuS8CXih-dWY";

const supabase = createClient(
 SUPABASE_URL,
 SUPABASE_KEY
);
const onlineUsers = {};

io.on("connection", (socket) => {
  console.log("⚡ Connected:", socket.id);
// When user will register or on online
  // socket.on("register", (email) => {
  //   onlineUsers[email] = socket.id;
  //   socket.email = email;
  //   console.log(`🟢 Registered: ${email}`);
  // });

  socket.on("register", async (email) => {
  onlineUsers[email] = socket.id;
  socket.email = email;
  console.log(`🟢 Registered: ${email}`);
  

  // ✅ Mark active = true in Supabase
  try {
    await supabase
      .from("users")
      .update({ 
        isactivestatus: true,
        updatedat: new Date().toISOString()
      })
      .eq("email", email);

    console.log(`✅ ${email} set to active`);
  } catch (err) {
    console.error(`❌ Failed to mark active for ${email}:`, err.message);
  }
  await checkUserSubscription(email);
});

socket.on("User_Offline", async ({ email }) => {
  console.log(`🚨 ${email} went offline or background`);

  try {
    await supabase
      .from("users")
      .update({ 
        isactivestatus: false,
        updatedat: new Date().toISOString()
      })
      .eq("email", email);

    console.log(`✅ ${email} marked offline`);

    // Broadcast to everyone (optional)
    io.emit("User_Offline", { email });

    // Clean up Firestore + calls
    await endCallForUsers(email);
    await checkUserSubscription(email)
  } catch (err) {
    console.error("❌ Error updating user offline status:", err.message);
  }
});



  // socket.on("start_call", async ({ from, to, callType, roomId, isVideoCall }) => {
  //   console.log(`📞 ${from} is calling ${to}`);
  //   try {
  //     const { data: users, error } = await supabase
  //       .from("users")
  //       .select("email, isoncallstatus")
  //       .in("email", [from, to]);
  //     if (error) throw error;

  //     const caller = users.find((u) => u.email === from);
  //     const callee = users.find((u) => u.email === to);
  //     if (caller?.isoncallstatus)
  //       return socket.emit("user_busy", { reason: "caller_busy" });
  //     if (callee?.isoncallstatus)
  //       return socket.emit("user_busy", { reason: "callee_busy" });

  //     await supabase
  //       .from("users")
  //       .update({
  //         isoncallstatus: true,
  //         iscallingfrom: from,
  //         lastcallroom: roomId,
  //         isvideocall: isVideoCall,
  //         updatedat: new Date().toISOString(),
  //       })
  //       .in("email", [from, to]);

  //     const calleeSocket = onlineUsers[to];
  //     if (calleeSocket) {
  //       io.to(calleeSocket).emit("incoming_call", {
  //         from,
  //         to,
  //         callType,
  //         roomId,
  //         isVideoCall,
  //       });
  //       console.log(`📲 Incoming call sent to ${to}`);
  //     } else {
  //       socket.emit("user_offline", { to });
  //     }
  //     socket.emit("call_pending", { to });
  //   } catch (err) {
  //     console.error("❌ start_call error:", err);
  //   }
  // });


//When caller will start the call
socket.on("start_call", async ({ from, to, callType, roomId, isVideoCall,name,avatar}) => {
  console.log(`📞 ${from} is calling ${to}`);
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("email, isoncallstatus")
      .in("email", [from, to]);

    if (error) throw error;

    const caller = users.find((u) => u.email === from);
    const callee = users.find((u) => u.email === to);
 const callerSocket = onlineUsers[from];
    // if (caller?.isoncallstatus)
    //   return socket.emit("user_busy", { reason: "caller_busy" });
    // if (callee?.isoncallstatus)
    //   return socket.emit("user_busy", { reason: "callee_busy" });
    if(callerSocket){
      
 io.to(callerSocket).emit("call_has_started", { from });
       console.log("caller has_started call event emitted to caller");
    }

    // ✅ Update both users' statuses in DB
    await supabase
      .from("users")
      .update({
        isoncallstatus: true,
        iscallingfrom: from,
        lastcallroom: roomId,
        isvideocall: isVideoCall,
        updatedat: new Date().toISOString(),
      })
      .in("email", [from, to]);

    // ✅ Tell caller who the peer is (so app can store peerEmail)
    socket.emit("call_peer_info", {
      peerEmail: to,
      roomId,
      callType,
      isVideoCall,

    });

    // ✅ Notify the callee of the incoming call
    const calleeSocket = onlineUsers[to];
    if (calleeSocket) {
      io.to(calleeSocket).emit("incoming_call", {
        from,
        to,
        callType,
        roomId,
        isVideoCall,
        name,
        avatar
      });
      console.log(`📲 Incoming call sent to ${to}`);
    } else {
      socket.emit("user_offline", { to });
    }

    socket.emit("call_pending", { to });
  } catch (err) {
    console.error("❌ start_call error:", err);
  }
});

// when reciver will join the call
  socket.on("join_call", async ({ from, to }) => {
    console.log(`📞 ${to} joined call with ${from}`);
    try {
      await supabase.from("users").update({ isoncallstatus: true }).in("email", [from, to]);
      const callerSocket = onlineUsers[from];
      const calleeSocket = onlineUsers[to];
       if (callerSocket) {
        console.log("connected caller")
    io.to(callerSocket).emit("call_connected", { from: from });
    // io.to(callerSocket).emit("call_started", { with: from })
  }
  if (calleeSocket) {
     console.log("connected callee")
    io.to(calleeSocket).emit("call_connected", { from: to });
    // io.to(calleeSocket).emit("call_started", { with: to });
  }

      // if (callerSocket) io.to(callerSocket).emit("call_started", { with: to });
      // if (calleeSocket) io.to(calleeSocket).emit("call_started", { with: from });
    } catch (err) {
      console.error("❌ join_call error:", err);
    }
  });

 socket.on("reject_call", async ({ from, to }) => {
  console.log(`❌ Call rejected by ${from} and ${to}`);
  await endCallForUsers(from, to);

  const callerSocket = onlineUsers[to];
  if (callerSocket) {
    io.to(callerSocket).emit("rejected_call", { from });
    console.log(`🚨 Notified ${to}: call has been rejected by ${from}`);
  }
});

// 🆕 When one user hangs up during an active call
socket.on("connected_call_hangup", async ({ from, to }) => {
  console.log(`📴 ${from} hung up an active call with ${to}`);
  try {
    // End the call for both users
    await endCallForUsers(from, to);

    // Notify the other user (callee)
    const calleeSocket = onlineUsers[to];

    
    if (calleeSocket) {
      io.to(calleeSocket).emit("connected_call_hangup", { from });
      console.log(`🚨 Notified ${to}: call has been hung up by ${from}`);
       await supabase.from("users").update({ hasacceptedcall: false }).in("email", [from, to]);
    }
    
  } catch (err) {
    console.error("❌ connected_call_hangup error:", err.message);
  }
});

// When both user connected and the reciver side will cut the call
socket.on("callee_hangup_call", async ({ from, to }) => {
  console.log(`📴 Callee ${from} hung up the call with ${to}`);
  try {
    // ✅ End call for both users
    await endCallForUsers(from, to);

    // ✅ Notify the caller
    const callerSocket = onlineUsers[to];
    if (callerSocket) {
      io.to(callerSocket).emit("connected_callee_hangup", { to });
      console.log(`🚨 Notified ${to}: call ended by ${from}`);
    }
  } catch (err) {
    console.error("❌ callee_hangup_call error:", err.message);
  }
});


  socket.on("end_call", async ({ from, to }) => {
    console.log(`📴 Call end requested by ${from}`);
    await endCallForUsers(from, to);
     const callerSocket = onlineUsers[from];
       const calleeSocket = onlineUsers[to];
      if (calleeSocket) {
        io.to(calleeSocket).emit("end_bg_call", { from });
        console.log(`🚨 Notified ${to} that ${from} went to background`);
      }
    if (callerSocket) {
      io.to(callerSocket).emit("end_bg_call", { to });
      console.log(`🚨 Notified ${to}: call ended by ${from}`);
    }
  });

  // 🆕 NEW: When Caller goes background
  socket.on("caller_goesto_background", async ({ from, to }) => {
    console.log(`📴 Caller ${from} went to background while calling ${to}`);
    try {
      await endCallForUsers(from, to);

      const calleeSocket = onlineUsers[to];
      if (calleeSocket) {
        io.to(calleeSocket).emit("caller_went_background", { from });
        console.log(`🚨 Notified ${to} that ${from} went to background`);
      }
    } catch (err) {
      console.error("❌ caller_goesto_background error:", err.message);
    }
  });
// When caller calls And reciver goes to background 
  socket.on("callee_goes_while_ringing", async ({ from, to }) => {
  console.log(`🚨 Callee (${from}) went to background while ringing`);

  try {
    // End the call for both users in your DB
    await endCallForUsers(from, to);

    // Notify caller
    const callerSocket = onlineUsers[from];
    if (callerSocket) {
      io.to(callerSocket).emit("callee_goes_while_ringing_stop", { from });
    }
  } catch (err) {
    console.error("callee_goes_while_ringing error:", err.message);
  }
});
// 🆕 When both users are connected and Caller goes background
socket.on("caller_join_goes_background", async ({ from, to }) => {
  console.log(`📴 Caller ${from} went to background during active call with ${to}`);

  try {
    // End call for both
    await endCallForUsers(from, to);

    // Notify callee (User B)
    const calleeSocket = onlineUsers[to];
    if (calleeSocket) {
      io.to(calleeSocket).emit("caller_join_goes_background", { from });
      console.log(`🚨 Notified ${to}: caller ${from} went background and call ended`);
    }
  } catch (err) {
    console.error("❌ caller_join_goes_background error:", err.message);
  }
});


  /*
  socket.on("disconnect", async (reason) => {
    const email = socket.email;
    console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);
    if (!email) return;
    delete onlineUsers[email];
    await endCallForUsers(email);
  });
  */
socket.on("caller_hangup_call", async ({ from, to }) => {
  console.log(`📴 Caller ${from} hung up the call with ${to}`);
  try {
    // ✅ End call in database for both users
    await endCallForUsers(from, to);

    // ✅ Notify the callee instantly
    const calleeSocket = onlineUsers[to];
    if (calleeSocket) {
      io.to(calleeSocket).emit("call_ended", { from });
      console.log(`🚨 Notified ${to}: call ended by ${from}`);
    }
  } catch (err) {
    console.error("❌ caller_hangup_call error:", err.message);
  }
});
// socket.on("disconnect", async (reason) => {
//   const email = socket.email;
//   console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

//   if (!email) return;

//   // Remove from online list
//   delete onlineUsers[email];

//   if (["ping timeout", "transport close", "transport error"].includes(reason)) {
//     console.log(`📡 ${email} likely lost internet — waiting 5s before cleanup...`);

//     setTimeout(async () => {
//       const stillOffline = !Object.values(onlineUsers).includes(socket.id);
//       if (stillOffline) {
//         console.log(`💀 ${email} did not reconnect — cleaning up call`);
  
//         await endCallForUsers(email);
//       }
//     }, 5000);
//   } else {
//     await endCallForUsers(email);
//   }
// });
/*
socket.on("disconnect", async (reason) => {
  const email = socket.email;
  console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

  if (!email) return;

  // Remove from online list
  delete onlineUsers[email];

  const markUserOffline = async () => {
    try {
      await supabase
        .from("users")
        .update({
          isactivestatus: false,
          updatedat: new Date().toISOString(),
        })
        .eq("email", email);

      console.log(`🚫 ${email} set to inactive in Supabase`);
      io.emit("User_Offline", { email }); // 🔔 Notify all connected clients
    } catch (err) {
      console.error("❌ Failed to update Supabase:", err.message);
    }

    // Clean up calls
    await endCallForUsers(email);
     await checkUserSubscription(email);
  };
 // Notify the other user (callee)
    const calleeSocket = onlineUsers[to];

    
  
      io.to(calleeSocket).emit("connected_call_hangup", { from });
      console.log(`🚨 Notified ${to}: call has been hung up by ${from}`);
    

  if (["ping timeout", "transport close", "transport error"].includes(reason)) {
    console.log(`📡 ${email} likely lost internet — waiting 5s before cleanup...`);

    setTimeout(async () => {
      const stillOffline = !Object.values(onlineUsers).includes(socket.id);
      if (stillOffline) {
        console.log(`💀 ${email} did not reconnect — cleaning up call & marking offline`);
        await markUserOffline();
      } else {
        console.log(`🔄 ${email} reconnected — skipping offline update`);
      }
    }, 2000);
  } else {
    await markUserOffline();
     await checkUserSubscription(email);
  }
});
*/
socket.on("disconnect", async (reason) => {
  const email = socket.email;
  console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

  if (!email) return;

  // Remove from online users
  delete onlineUsers[email];

  // Helper to mark user offline and end call
  const markUserOffline = async () => {
  
    // Find who this user was in call with
    const { data: userCall } = await supabase
      .from("users")
      .select("iscallingfrom, isoncallstatus,hasacceptedcall")
      .eq("email", email)
      .single();

    if (userCall?.isoncallstatus && userCall?.iscallingfrom) {
      const peerEmail = userCall.iscallingfrom;
      const peerSocket = onlineUsers[peerEmail];
      console.log("if stat")

      console.log(`📴 ${email} disconnected — notifying ${peerEmail}`);

      // 🔔 Emit "connected_call_hangup" to peer
      // if (peerSocket) {
      //   io.to(peerSocket).emit("connected_call_hangup", { from: email });
      //   console.log(`🚨 Notified ${peerEmail}: call hung up by ${email}`);
      // }


       if (peerSocket && userCall.isoncallstatus && userCall.hasacceptedcall) {
        if  (reason === 'transport close'){
        io.to(peerSocket).emit("connected_call_hangup", { from: email });
        console.log(`🚨 Notified ${peerEmail}: call hung up by ${email}`);
      }
    }
       else if (peerSocket && userCall.isoncallstatus) {
        console.log("yes its main")
        // if  (reason === 'transport close'){
        // io.to(peerSocket).emit("connected_call_hangup", { from: email });
         io.to(peerSocket).emit("rejected_call", { from:email });
        console.log(`🚨 Notified ${peerEmail}: call reject up by ${email}`);
      // }
    }else{
      console.log("some how reject with condition")
    }
      

      //  if (peerSocket && data.isoncallstatus) {
      //   io.to(peerSocket).emit("connected_call_hangup", { from: email });
      //   console.log(`🚨 Notified ${peerEmail}: call hung up by ${email}`);
      // }





      
      // Clean up call and Firestore
      await endCallForUsers(email, peerEmail);
    }
    else{
        try {
      await supabase
        .from("users")
        .update({
          isactivestatus: false,
          isoncallstatus:false,
          iscallingfrom:"",
          updatedat: new Date().toISOString(),
        })
        .eq("email", email);

      console.log(`🚫 ${email} set to inactive in Supabase`);
      io.emit("User_Offline", { email }); // Notify all users
    } catch (err) {
      console.error("❌ Failed to update Supabase:", err.message);
    }

    }

    // Subscription check
    await checkUserSubscription(email);
  };

  // Handle temporary vs. permanent disconnects
  if (["ping timeout", "transport close", "transport error"].includes(reason)) {
    console.log(`📡 ${email} likely lost internet — waiting 5s before cleanup...`);

    setTimeout(async () => {
      const stillOffline = !Object.values(onlineUsers).includes(socket.id);
      if (stillOffline) {
        console.log(`💀 ${email} did not reconnect — cleaning up call & marking offline`);
        const { data: userCall } = await supabase
      .from("users")
      .select("iscallingfrom, isoncallstatus,hasacceptedcall")
      .eq("email", email)
      .single();
       if (userCall?.isoncallstatus && userCall?.iscallingfrom) {
      const peerEmail = userCall.iscallingfrom;
      const peerSocket = onlineUsers[peerEmail];
      console.log("if stat")

      console.log(`📴 ${email} disconnected — notifying ${peerEmail}`);

      // 🔔 Emit "connected_call_hangup" to peer
      // if (peerSocket) {
      //   io.to(peerSocket).emit("connected_call_hangup", { from: email });
      //   console.log(`🚨 Notified ${peerEmail}: call hung up by ${email}`);
      // }


       if (peerSocket && userCall.isoncallstatus && userCall.hasacceptedcall) {
        if  (reason === 'transport close'){
        io.to(peerSocket).emit("connected_call_hangup", { from: email });
        console.log(`🚨 Notified ${peerEmail}: call hung up by ${email}`);
      }
    }
       else if (peerSocket && userCall.isoncallstatus) {
        console.log("yes its main")
        // if  (reason === 'transport close'){
        // io.to(peerSocket).emit("connected_call_hangup", { from: email });
         io.to(peerSocket).emit("rejected_call", { from:email });
        console.log(`🚨 Notified ${peerEmail}: call reject up by ${email}`);
      // }
    }else{
      console.log("some how reject with condition")
    }
      

      //  if (peerSocket && data.isoncallstatus) {
      //   io.to(peerSocket).emit("connected_call_hangup", { from: email });
      //   console.log(`🚨 Notified ${peerEmail}: call hung up by ${email}`);
      // }





      
      // Clean up call and Firestore
      await endCallForUsers(email, peerEmail);
    }
    else{
        try {
      await supabase
        .from("users")
        .update({
          isactivestatus: false,
          isoncallstatus:false,
          iscallingfrom:"",
          updatedat: new Date().toISOString(),
        })
        .eq("email", email);

      console.log(`🚫 ${email} set to inactive in Supabase`);
      io.emit("User_Offline", { email }); // Notify all users
    } catch (err) {
      console.error("❌ Failed to update Supabase:", err.message);
    }

    }
        await markUserOffline();
      } else {
        console.log(`🔄 ${email} reconnected — skipping offline update`);
      }
    }, 2000);
  } else {
    await markUserOffline();
  }
});


/*
// scket disconnect event
  socket.on("disconnect", async (reason) => {
  const email = socket.email;
  console.log(`⚡ Disconnected: ${email || "unknown"} | Reason: ${reason}`);

  if (!email) return;

  // Remove from online list
  delete onlineUsers[email];

  // If reason implies connection loss, end the call
  if (["ping timeout", "transport close", "transport error"].includes(reason)) {
    console.log(`📡 ${email} lost internet — ending active call if any...`);
  }

  // End any ongoing call for that user
  await endCallForUsers(email);
});
*/

// iscallingfrom, isoncallstatus will be false and empty on supabase database
  async function endCallForUsers(user1, user2) {
    try {
      const { data: selfUser } = await supabase
        .from("users")
        .select("iscallingfrom, isoncallstatus")
        .eq("email", user1)
        .single();
      if (!selfUser || !selfUser.isoncallstatus) return;
      const peerEmail = user2 || selfUser.iscallingfrom;
   // 🔥 Clean Firestore rooms for both users
    await deleteRoomByEmail(user1);
    if (peerEmail) await deleteRoomByEmail(peerEmail);

//reset the call status for both users in supabase
      await supabase
        .from("users")
        .update({
          isoncallstatus: false,
          iscallingfrom: "",
          updatedat: new Date().toISOString(),
        })
        .eq("email", user1);

      if (peerEmail) {
        await supabase
          .from("users")
          .update({
            isoncallstatus: false,
            iscallingfrom: "",
            iscallerhangup: true,
            updatedat: new Date().toISOString(),
          })
          .eq("email", peerEmail);

        const peerSocket = onlineUsers[peerEmail];
        if (peerSocket) io.to(peerSocket).emit("call_ended", { from: user1 });
      }
    } catch (err) {
      console.error("❌ endCallForUsers error:", err.message);
    }
  }
// Add these WebRTC signaling events to your existing server code

// WebRTC Signaling Events
socket.on("webrtc_offer", async ({ offer, to, from, roomId }) => {
  console.log(`📨 WebRTC offer from ${from} to ${to} and offer is :${offer}`);
  console.log('Offer details:', JSON.stringify(offer, null, 2));
  try {
    const calleeSocket = onlineUsers[to];
    if (calleeSocket) {
      io.to(calleeSocket).emit("webrtc_offer", {
        offer,
        from,
        roomId
      });
    } else {
      socket.emit("user_offline", { to });
    }
  } catch (err) {
    console.error("❌ webrtc_offer error:", err);
  }
});

socket.on("webrtc_answer", async ({ answer, to, from, roomId }) => {
  console.log(`📨 WebRTC answer from ${from} to ${to}`);
  try {
    const callerSocket = onlineUsers[to];
    if (callerSocket) {
      io.to(callerSocket).emit("webrtc_answer", {
        answer,
        from,
        roomId
      });
    }
  } catch (err) {
    console.error("❌ webrtc_answer error:", err);
  }
});

socket.on("webrtc_ice_candidate", async ({ candidate, to, from, roomId }) => {
  try {
    const targetSocket = onlineUsers[to];
    const targetSocket1 = onlineUsers[from];
    if (targetSocket) {
      io.to(targetSocket).emit("webrtc_ice_candidate", {
        candidate,
        from,
        roomId
      });
    }
      if (targetSocket1) {
      io.to(targetSocket).emit("webrtc_ice_candidate", {
        candidate,
        to,
        roomId
      });
    }
  } catch (err) {
    console.error("❌ webrtc_ice_candidate error:", err);
  }
});

//Subscription Status Check
// 🔹 Utility: Calculate subscription expiry
const calculateSubscriptionInfo = (subscriptionDate, duration) => {
  if (!subscriptionDate || !duration)
    return { expiryDate: null, daysRemaining: 0, isActive: false };

  const start = new Date(subscriptionDate);
  if (isNaN(start)) {
    console.error("❌ Invalid subscriptionDate:", subscriptionDate);
    return { expiryDate: null, daysRemaining: 0, isActive: false };
  }

  const expiry = new Date(start);
  let daysToAdd = 30; // Default 1 month = 30 days

  // 🔹 Match by number in duration string (e.g. "premium_3_month")
  if (duration.includes("3")) daysToAdd = 90;
  else if (duration.includes("6")) daysToAdd = 180;
  else if (duration.includes("9")) daysToAdd = 270;
  else if (duration.includes("12")) daysToAdd = 365;
  else if (duration.includes("1")) daysToAdd = 30; // Explicit 1 month

  expiry.setDate(expiry.getDate() + daysToAdd);

  const today = new Date();
  const diffMs = expiry - today;
  const daysRemaining = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
  const isActive = expiry > today; // true if still valid

  return { expiryDate: expiry, daysRemaining, isActive };
};


const checkUserSubscription = async (email) => {
  try {
    if (!email) return;

    console.log("📧 Checking subscription for:", email);

    const { data, error } = await supabase
      .from("users")
      .select("name, email, about, avatar, issubscription, subscriptiondate, duration,isverifiedprofile")
      .eq("email", email)
      .single();

    if (error) {
      console.error("❌ Supabase fetch error:", error.message);
      return null;
    }

    // 🔹 Calculate expiry, days, and active status
    const { expiryDate, daysRemaining } = calculateSubscriptionInfo(
      data.subscriptiondate,
      data.duration
    );

    const isActive = daysRemaining > 0;

    // 🔹 Update the database if subscription expired
    if (!isActive && (data.issubscription || data.duration)) {
      await supabase
        .from("users")
        .update({
          isverifiedprofile: false,
          issubscription: false,
          duration: "",
          subscriptiondate: null, // optional — remove if you want to keep it
          updatedat: null,
        })
        .eq("email", email);

      console.log(`🔴 Subscription expired for ${email} — reset done.`);
    }

    // 🔹 Update active users (optional, if you want to keep duration tracking)
    else if (isActive && !data.issubscription) {
      await supabase
        .from("users")
        .update({
          issubscription: true,
          updatedat: new Date().toISOString(),
          isverifiedprofile: true,
        })
        .eq("email", email);

      console.log(`🟢 Subscription reactivated for ${email}.`);
    }

    // 🔹 Get avatar URL safely
    let avatarUrl = null;
    if (data.avatar) {
      avatarUrl = data.avatar.startsWith("http")
        ? data.avatar
        : supabase.storage.from("avatars").getPublicUrl(data.avatar).data.publicUrl;
    }

    const updatedUser = {
      ...data,
      avatar: avatarUrl,
      expiryDate,
      daysRemaining,
      issubscription: isActive,
      duration: isActive ? data.duration : "",
    };

    console.log("👤 User Data --->", updatedUser);
    console.log("🗓 expiryDate:", expiryDate);
    console.log("📆 daysRemaining:", daysRemaining);

    return updatedUser;
  } catch (err) {
    console.error("🔥 Error fetching user:", err);
    return null;
  }
};



// Add this to handle call acceptance
// Add these events to your existing server code

// When user accepts the call
socket.on("accept_call", async ({ from, to, roomId }) => {
  console.log(`✅ ${from} accepted call from ${to}`);
  try {
    const callerSocket = onlineUsers[to];
    if (callerSocket) {
      io.to(callerSocket).emit("call_accepted", {
        from,
        roomId
      });
      await supabase.from("users").update({ hasacceptedcall: true }).in("email", [from, to]);
      console.log(`📢 Notified ${to} that ${from} accepted the call`);
    }
  } catch (err) {
    console.error("❌ accept_call error:", err);
  }
});

// When callee is ready to receive offer
socket.on("callee_ready", async ({ from, to, roomId }) => {
  console.log(`🎯 ${from} is ready to receive WebRTC offer in room ${roomId}`);
  try {
    const callerSocket = onlineUsers[to];
    if (callerSocket) {
      io.to(callerSocket).emit("callee_ready", {
        from,
        roomId
      });
    }
  } catch (err) {
    console.error("❌ callee_ready error:", err);
  }
});

// Request offer resend if needed
socket.on("request_offer", async ({ from, to, roomId }) => {
  console.log(`🔄 ${from} requesting offer resend from ${to}`);
  try {
    const callerSocket = onlineUsers[to];
    if (callerSocket) {
      io.to(callerSocket).emit("request_offer", {
        from,
        roomId
      });
    }
  } catch (err) {
    console.error("❌ request_offer error:", err);
  }
});
  // socket.on("disconnect", (email) => {
  //   console.log("user disconnected:", socket.id);
  //    checkUserSubscription(email);
  // });

// 🧹 Delete Firestore call room and its subcollections

async function deleteRoomByEmail(email) {
  try {
    if (!email) return;

    const roomRef = db.collection("room").doc(email);
    const roomSnapshot = await roomRef.get();

    if (!roomSnapshot.exists) {
      console.log(`⚠️ No Firestore room found for ${email}`);
      return;
    }

    const subcollections = ["calleeCandidates", "callerCandidates"];
    for (const sub of subcollections) {
      const subColRef = roomRef.collection(sub);
      const subDocs = await subColRef.get();

      const deletePromises = subDocs.docs.map((doc) => doc.ref.delete());
      await Promise.all(deletePromises);
    }

    await roomRef.delete();
    console.log(`🧹 Firestore room (${email}) and its subcollections deleted`);
  } catch (error) {
    console.error("🔥 Firestore cleanup error:", error.message);
  }
}





// async function deleteRoomByEmail(email) {
//   try {
//     if (!email) return;

//     const roomRef = doc(db, "room", email);
//     const roomSnapshot = await roomRef.get();

//     if (roomSnapshot.exists) {
//       const subcollections = ["calleeCandidates", "callerCandidates"];

//       for (const sub of subcollections) {
//         const subColRef = collection(db, "room", email, sub);
//         const subDocs = await subColRef.get();

//         const deletePromises = subDocs.docs.map((subDoc) =>
//           subDoc.ref.delete()
//         );
//         await Promise.all(deletePromises);
//       }

//       await roomRef.delete();
//       console.log(`🧹 Firestore room (${email}) and its subcollections deleted`);
//     } else {
//       console.log(`⚠️ No Firestore room found for ${email}`);
//     }
//   } catch (error) {
//     console.error("🔥 Firestore cleanup error:", error.message);
//   }
// }


});

console.log("✅ Socket server running on http://localhost:8080");


/*
// Caller sends an SDP offer to the callee
socket.on("webrtc_offer", ({ from, to, offer }) => {
  console.log(`📡 ${from} sent WebRTC offer to ${to}`);
  console.log("offer is::::",offer)
  const calleeSocket = onlineUsers[to];
  if (calleeSocket) {
    io.to(calleeSocket).emit("webrtc_offer", { from, offer });
  }
});

// Callee sends an SDP answer back to the caller
socket.on("webrtc_answer", ({ from, to, answer }) => {
  console.log(`📡 ${from} sent WebRTC answer to ${to}`);
  const callerSocket = onlineUsers[to];
  if (callerSocket) {
    io.to(callerSocket).emit("webrtc_answer", { from, answer });
  }
});

// Either side sends ICE candidates to the other peer
socket.on("webrtc_ice_candidate", ({ from, to, candidate }) => {
  const peerSocket = onlineUsers[to];
  if (peerSocket) {
    io.to(peerSocket).emit("webrtc_ice_candidate", { from, candidate });
  }
      
socket.on("join", ({ email, roomId }) => {
    socket.join(roomId);
    socket.email = email;
    console.log(`${email} joined room ${roomId}`);
  });

 socket.on("offer", ({ roomId, offer, from, videoQuality }) => {
    console.log(`📨 Offer from ${from} in room ${roomId}:`, JSON.stringify(offer, null, 2));
    
    // ✅ Relay the offer to everyone else in the room
    socket.to(roomId).emit("offer", { from, offer, videoQuality });
  });

  socket.on("answer", ({ roomId, from, answer }) => {
    console.log(`📩 Answer from ${from} in room ${roomId}:`, JSON.stringify(answer, null, 2));
    socket.to(roomId).emit("answer", { from, answer });
  });

  socket.on("icecandidate", ({ roomId, from, candidate }) => {
    console.log(`❄️ ICE candidate from ${from} in room ${roomId} and candidate is:${JSON.stringify(candidate, null, 2)}`);
    socket.to(roomId).emit("icecandidate", { from, candidate });
  });

  socket.on("hangup", ({ roomId, from }) => {
    socket.to(roomId).emit("hangup", { from });
  });
socket.on("ready", ({ roomId, email }) => {
  console.log(`� ready event from ${email} in room ${roomId}`);
  socket.to(roomId).emit("ready", { email });
});
})*/


