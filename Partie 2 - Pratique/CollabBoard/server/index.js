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

  const GLOBAL_KEY = '__CONNECTED__'
  if (!activeRooms.has(GLOBAL_KEY)) {
    activeRooms.set(GLOBAL_KEY, {
      users: new Map(),
      content: '',
      eventsCount: 0,
    })
  }
  activeRooms.get(GLOBAL_KEY).users.set(socket.id, username)

  console.log(
    `[CONNECT] User ${username} (ID: ${socket.id}) connected. Total: ${totalConnections}`
  )

  emitUserListUpdate()

  // Rejoindre la Room
  socket.on('join_room', (newRoom) => {
    const oldRoom = socket.data.room
    const { username } = socket.data

    if (oldRoom && activeRooms.has(oldRoom)) {
      activeRooms.get(oldRoom).users.delete(socket.id)
      socket.leave(oldRoom)
    }

    activeRooms.get(GLOBAL_KEY).users.delete(socket.id)

    socket.join(newRoom)
    socket.data.room = newRoom

    if (!activeRooms.has(newRoom)) {
      activeRooms.set(newRoom, {
        users: new Map(),
        content: '',
        eventsCount: 0,
      })
      io.emit('room_created', newRoom)
    }

    const roomData = activeRooms.get(newRoom)
    roomData.users.set(socket.id, username)

    //  activeRooms.get('__global__').users.delete(socket.id)

    socket.emit('initial_content', { room: newRoom, content: roomData.content })
    socket.to(newRoom).emit('notification', `${username} a rejoint ${newRoom}.`)

    console.log(`[ROOM_CHANGE] ${username} joined: ${newRoom}`)
    emitUserListUpdate()
  })

  socket.on('leave_room', (roomToLeave) => {
    const { username } = socket.data

    if (activeRooms.has(roomToLeave)) {
      activeRooms.get(roomToLeave).users.delete(socket.id)
    }

    socket.leave(roomToLeave)

    activeRooms.get(GLOBAL_KEY).users.set(socket.id, username)

    socket.data.room = 'general'

    console.log(`[ROOM_LEAVE] ${socket.data.username} left: ${roomToLeave}`)
    emitUserListUpdate()
  })

  // Gestion de la Déconnexion
  socket.on('disconnect', () => {
    totalConnections--
    const { room, username } = socket.data

    if (activeRooms.has(room)) {
      activeRooms.get(room).users.delete(socket.id)
      if (activeRooms.get(room).users.size === 0) {
        activeRooms.delete(room)
        console.log(`Room ${room} is empty and closed.`)
      }
    }

    if (activeRooms.has(GLOBAL_KEY)) {
      activeRooms.get(GLOBAL_KEY).users.delete(socket.id)
    }

    socket.to(room).emit('notification', `${username} a quitté l'espace.`)

    console.log(`User ${username} disconnected. Total: ${totalConnections}`)
    emitUserListUpdate()
  })

  // Notification de Connexion à la Room
  //   socket.to(room).emit('notification', `${username} a rejoint l'espace.`)

  //   socket.emit('initial_content', roomData.content)

  // Gestion des Événements Temps Réel
  socket.on('update', ({ room, content }) => {
    if (!activeRooms.has(room) || socket.data.room !== room) {
      console.warn(
        `[SECURITY] User ${socket.data.username} tried to update unauthorized room: ${room}`
      )
      return
    }

    const roomData = activeRooms.get(room)

    roomData.content = content
    roomData.eventsCount++

    const now = Date.now()
    if (now - lastEventTime > 60000) {
      eventsPerMinute = 0
      lastEventTime = now
    }
    eventsPerMinute++

    socket.to(room).emit('update', { room, content })
  })

  function emitUserListUpdate() {
    const roomUsers = {}
    activeRooms.forEach((data, roomName) => {
      if (roomName === 'general') return

      const displayRoomName = roomName === GLOBAL_KEY ? 'Connectés' : roomName

      roomUsers[displayRoomName] = Array.from(data.users.values())
    })

    if (!roomUsers['Connectés']) {
      roomUsers['Connectés'] = []
    }

    io.emit('user_list_update', roomUsers)
  }
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

// Servir les fichiers clients
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
