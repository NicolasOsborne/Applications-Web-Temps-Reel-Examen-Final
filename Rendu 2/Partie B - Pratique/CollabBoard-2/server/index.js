const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')

// Configuration de la base de données locale SQLite
const sqlite = require('sqlite3').verbose()
const db = new sqlite.Database('./collaboard.db', (error) => {
  if (error) {
    console.error('Erreur lors de la connexion à SQLite: ', error.message)
  } else {
    console.log('Connexion à la base de données collaboard.db réussie ! ')
    initalizeDatabase()
  }
})

// Créer la table "rooms" si elle n'existe pas déja
function initalizeDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `

  db.run(sql, (error) => {
    if (error) {
      console.error(
        'Erreur lors de la création de la table "rooms": ',
        error.message
      )
    } else {
      console.log('Table rooms créée avec succès !')
    }
  })
}

const app = express()
const server = http.createServer(app)

// Configuration de Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

// Servir les fichiers clients du frontend
const clientPath = path.join(__dirname, '..', 'client')
app.use(express.static(clientPath))
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'))
})
app.use(express.static('client'))

// Généreration d'un token simple pour un id de room
function generateRoomId(length = 10) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

// Récupérer une room depuis la base de données
function getRoomFromDb(roomName) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT id, name, content FROM rooms WHERE name = ?'
    db.get(sql, [roomName], (error, row) => {
      if (error) {
        reject(error)
      } else {
        resolve(row)
      }
    })
  })
}

// Sauvegarder une room dans la base de données
function saveRoomToDb(roomName, content, roomId) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO rooms (id, name, content) 
      VALUES (?, ?, ?)`

    db.run(sql, [roomId, roomName, content], function (error) {
      if (error) {
        reject(error)
      } else {
        resolve({
          message: 'Room sauvegardée/mise à jour.',
          changes: this.changes,
        })
      }
    })
  })
}

// Monitoring & State Management
let activeRooms = new Map()
let totalConnections = 0
let eventsPerMinute = 0
let lastEventTime = Date.now()

// Middleware pour la vérification du username
io.use((socket, next) => {
  const username = socket.handshake.query.username

  if (!username) {
    return next(new Error('Connection error: Username is required'))
  }

  socket.data.room = 'general'
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
  socket.on('join_room', async ({ roomName, roomId }) => {
    const oldRoom = socket.data.room
    const { username } = socket.data
    const newRoom = roomName

    let roomFromDb
    try {
      roomFromDb = await getRoomFromDb(newRoom)
    } catch (e) {
      console.error(`[DB ERROR] Failed to load room ${newRoom}:`, e)
      return socket.emit(
        'join_error',
        'Erreur serveur lors du chargement de la room.'
      )
    }

    if (roomFromDb) {
      if (roomId && roomFromDb.id !== roomId) {
        return socket.emit(
          'join_error',
          `Accès refusé pour ${newRoom}: ID invalide.`
        )
      }
    }

    if (oldRoom && activeRooms.has(oldRoom)) {
      activeRooms.get(oldRoom).users.delete(socket.id)
      socket.leave(oldRoom)
    }

    activeRooms.get(GLOBAL_KEY).users.delete(socket.id)

    socket.join(newRoom)
    socket.data.room = newRoom

    let currentRoomId = roomId
    let initialContent = ''

    if (!activeRooms.has(newRoom)) {
      const newId = roomFromDb ? roomFromDb.id : generateRoomId()
      currentRoomId = newId

      activeRooms.set(newRoom, {
        users: new Map(),
        eventsCount: 0,
        id: newId,
      })

      if (!roomFromDb) {
        try {
          await saveRoomToDb(newRoom, '', newId)
          io.emit('room_created', { name: newRoom, id: newId })
        } catch (e) {
          console.error(`[DB ERROR] Failed to create room ${newRoom}:`, e)
        }
      }
    }

    const roomData = activeRooms.get(newRoom)
    roomData.users.set(socket.id, username)

    initialContent = roomFromDb ? roomFromDb.content : ''

    socket.emit('initial_content', {
      room: newRoom,
      content: initialContent,
    })
    socket.to(newRoom).emit('notification', `${username} a rejoint ${newRoom}.`)

    console.log(
      `[ROOM_CHANGE] ${username} joined: ${newRoom} (ID: ${
        currentRoomId || roomFromDb.id
      })`
    )
    emitUserListUpdate()
  })

  // Quitter la room
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
  socket.on('update', async ({ room, content }) => {
    if (!activeRooms.has(room) || socket.data.room !== room) {
      console.warn(
        `[SECURITY] User ${socket.data.username} tried to update unauthorized room: ${room}`
      )
      return
    }

    const roomData = activeRooms.get(room)

    try {
      await saveRoomToDb(room, content, roomData.id)
    } catch (error) {
      console.error(`[DB ERROR] Failed to save room ${room}:`, error)
    }

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
app.get('/status', async (req, res) => {
  const statusData = {
    totalConnections: totalConnections,
    eventsLastMinute: eventsPerMinute,
    activeRooms: [],
    roomDetails: {},
  }

  try {
    const allRooms = await new Promise((resolve, reject) => {
      db.all('SELECT name, id FROM rooms', (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
    statusData.activeRooms = allRooms.map((r) => ({ name: r.name, id: r.id }))
  } catch (error) {
    console.error('[DB ERROR] Failed to load all rooms for status:', error)
  }

  activeRooms.forEach((data, roomName) => {
    if (roomName === 'general' || roomName === '__CONNECTED__') return

    statusData.roomDetails[roomName] = {
      usersCount: data.users.size,
      eventsInRoom: data.eventsCount,
    }
  })

  res.json(statusData)
})

// Démarrage du serveur
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT} | Application available at http://localhost:${PORT}`
  )
  console.log(`Monitoring status available at http://localhost:${PORT}/status`)
})
