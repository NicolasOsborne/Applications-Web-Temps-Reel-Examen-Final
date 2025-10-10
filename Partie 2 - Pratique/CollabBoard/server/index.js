const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')

const app = express()
const server = http.createServer(app)

// Configuration de Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

const clientPath = path.join(__dirname, '..', 'client')
app.use(express.static(clientPath))

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'))
})

// Monitoring & State Management
let activeRooms = new Map()
let totalConnections = 0
let eventsPerMinute = 0
let lastEventTime = Date.now()

// Middleware pour la vérification du token et l'attachement de la room
io.use((socket, next) => {
  const token = socket.handshake.query.token
  const room = socket.handshake.query.room
  const username = socket.handshake.query.username

  if (token !== '12345') {
    return next(new Error('Authentication error: Invalid token'))
  }
  if (!room || !username) {
    return next(new Error('Connection error: Room and username are required'))
  }

  socket.data.room = room
  socket.data.username = username
  next()
})

io.on('connection', (socket) => {
  const { room, username } = socket.data

  totalConnections++
  if (!activeRooms.has(room)) {
    activeRooms.set(room, { users: new Map(), content: '', eventsCount: 0 })
  }
  const roomData = activeRooms.get(room)
  roomData.users.set(socket.id, username)

  // Rejoindre la Room
  socket.join(room)
  console.log(
    `User ${username} (ID: ${socket.id}) joined room: ${room}. Total: ${totalConnections}`
  )

  // Notification de Connexion à la Room
  socket.to(room).emit('notification', `${username} a rejoint l'espace.`)

  socket.emit('initial_content', roomData.content)

  // Gestion des Événements Temps Réel
  socket.on('update', (content) => {
    roomData.content = content
    roomData.eventsCount++

    const now = Date.now()
    if (now - lastEventTime > 60000) {
      eventsPerMinute = 0
      lastEventTime = now
    }
    eventsPerMinute++

    // Broadcast
    socket.to(room).emit('update', content)
  })

  // Gestion de la Déconnexion ---
  socket.on('disconnect', () => {
    totalConnections--
    roomData.users.delete(socket.id)

    if (roomData.users.size === 0) {
      activeRooms.delete(room)
      console.log(`Room ${room} is empty and closed.`)
    }

    socket.to(room).emit('notification', `${username} a quitté l'espace.`)

    console.log(
      `User ${username} left room: ${room}. Total: ${totalConnections}`
    )
  })
})

// Endpoint de Monitoring (/status)
app.get('/status', (req, res) => {
  const statusData = {
    totalConnections: totalConnections,
    eventsLastMinute: eventsPerMinute,
    activeRooms: Array.from(activeRooms.keys()),
    roomDetails: {},
  }

  activeRooms.forEach((data, roomName) => {
    statusData.roomDetails[roomName] = {
      usersCount: data.users.size,
      eventsInRoom: data.eventsCount,
    }
  })

  res.json(statusData)
})

// Servir les fichiers clients pour l'exemple
app.use(express.static('client'))

// Démarrage du serveur
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT} | Application available at http://localhost:${PORT}`
  )
  console.log(`Monitoring status available at http://localhost:${PORT}/status`)
})

// --- BONUS: Implémentation du Redis Adapter ---
/* // Code pour le bonus Redis (nécessite redis-server en cours d'exécution)
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

async function setupRedisAdapter() {
    const pubClient = createClient({ url: "redis://localhost:6379" });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    console.log("Redis Adapter configured successfully.");
}

// Décommenter pour activer le bonus
// setupRedisAdapter().catch(err => console.error("Redis connection failed:", err));
*/
