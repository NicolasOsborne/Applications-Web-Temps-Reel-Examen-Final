const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')

const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const SALT_ROUNDS = 10

require('dotenv').config()

const JWT_SECRET = process.env.JWT_SECRET

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

// Créer les tables "rooms" et "users" si elles n'existent pas déja
function initalizeDatabase() {
  const roomSql = `
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      content TEXT,
      creator_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `

  db.run(roomSql, (error) => {
    if (error) {
      console.error(
        'Erreur lors de la création de la table "rooms": ',
        error.message
      )
    } else {
      console.log('Table rooms créée avec succès !')
    }
  })

  const userSql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `

  db.run(userSql, (error) => {
    if (error) {
      console.error(
        'Erreur lors de la création de la table "users": ',
        error.message
      )
    } else {
      console.log('Table users créée avec succès !')
    }
  })
}

const app = express()
app.use(express.json())

// Configuration de Socket.IO
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
})

// Servir les fichiers clients du frontend
const clientPath = path.join(__dirname, '..', 'client')
app.use(express.static(clientPath))
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'))
})
app.use(express.static('client'))

// Routes d'authentification
// Inscription (Register)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username et mot de passe requis.' })
  }

  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS)
    const sql = `INSERT INTO users (username, password_hash) VALUES (?, ?)`
    let userId = null

    await new Promise((resolve, reject) => {
      db.run(sql, [username, password_hash], function (err) {
        if (err) return reject(err)
        userId = this.lastID
        resolve()
      })
    })

    const token = jwt.sign({ username, userId }, JWT_SECRET, {
      expiresIn: '1h',
    })

    res.status(201).json({
      message: 'Inscription réussie.',
      username,
      token,
    })
  } catch (error) {
    if (error.message && error.message.includes('SQLITE_CONSTRAINT: UNIQUE')) {
      return res
        .status(409)
        .json({ message: "Ce nom d'utilisateur est déjà pris." })
    }
    console.error('[AUTH ERROR] Register failed:', error)
    res.status(500).json({ message: "Erreur serveur lors de l'inscription." })
  }
})

// Connexion (login)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username et mot de passe requis.' })
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, password_hash FROM users WHERE username = ?',
        [username],
        (err, row) => {
          if (err) return reject(err)
          resolve(row)
        }
      )
    })

    if (!user) {
      return res.status(401).json({ message: 'Identifiants invalides.' })
    }

    const match = await bcrypt.compare(password, user.password_hash)

    if (!match) {
      return res.status(401).json({ message: 'Identifiants invalides.' })
    }

    const token = jwt.sign({ username, userId: user.id }, JWT_SECRET, {
      expiresIn: '1h',
    })

    res.status(200).json({
      message: 'Connexion réussie.',
      username,
      token,
    })
  } catch (error) {
    console.error('[AUTH ERROR] Login failed:', error)
    res.status(500).json({ message: 'Erreur serveur lors de la connexion.' })
  }
})

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
    const sql =
      'SELECT id, name, content, creator_user_id FROM rooms WHERE name = ?'
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
function saveRoomToDb(roomName, content, roomId, creatorId) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO rooms (id, name, content, creator_user_id) 
      VALUES (?, ?, ?, COALESCE((SELECT creator_user_id FROM rooms WHERE name = ?), ?))`

    db.run(
      sql,
      [roomId, roomName, content, roomName, creatorId],
      function (error) {
        if (error) {
          reject(error)
        } else {
          resolve({
            message: 'Room sauvegardée/mise à jour.',
            changes: this.changes,
          })
        }
      }
    )
  })
}

// Supprimer une room dans la base de données
function deleteRoomFromDb(roomName) {
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM rooms WHERE name = ?`

    db.run(sql, [roomName], function (error) {
      if (error) {
        reject(error)
      } else {
        resolve({
          message: `Room ${roomName} supprimée.`,
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

// Middleware pour la vérification de l'authentification (Pseudo + Token)
io.use((socket, next) => {
  const username = socket.handshake.query.username
  const token = socket.handshake.query.token

  if (!username || !token) {
    return next(new Error('Connection error: Username and Token are required'))
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)

    if (decoded.username !== username) {
      return next(new Error('Connection error: Invalid token for this user'))
    }

    socket.data.room = 'general'
    socket.data.username = username
    socket.data.userId = decoded.userId
    next()
  } catch (err) {
    console.error('JWT Verification Error:', err.message)
    return next(new Error(`Authentication error: ${err.message}`))
  }
})

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
  const { room, username, userId } = socket.data

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
    `[CONNECT] User ${username} (ID: ${socket.id}, UserID: ${userId}) connected. Total: ${totalConnections}`
  )

  emitUserListUpdate()

  // Gestion de l'événement "Rejoindre une room"
  socket.on('join_room', async ({ roomName, roomId }) => {
    const oldRoom = socket.data.room
    const { username, userId } = socket.data
    const newRoom = roomName

    let roomFromDb
    try {
      roomFromDb = await getRoomFromDb(newRoom)
    } catch (error) {
      console.error(`[DB ERROR] Failed to load room ${newRoom}:`, error)
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
    let creatorId = null

    if (!activeRooms.has(newRoom)) {
      const newId = roomFromDb ? roomFromDb.id : generateRoomId()
      currentRoomId = newId

      activeRooms.set(newRoom, {
        users: new Map(),
        eventsCount: 0,
        id: newId,
      })

      if (!roomFromDb) {
        creatorId = userId
        try {
          await saveRoomToDb(newRoom, '', newId, creatorId)
          io.emit('room_created', { name: newRoom, id: newId })
        } catch (error) {
          console.error(`[DB ERROR] Failed to create room ${newRoom}:`, error)
        }
      }
    }

    const roomData = activeRooms.get(newRoom)
    roomData.users.set(socket.id, username)

    initialContent = roomFromDb ? roomFromDb.content : ''
    creatorId = creatorId || (roomFromDb ? roomFromDb.creator_user_id : null)

    socket.emit('initial_content', {
      room: newRoom,
      content: initialContent,
      creatorId: creatorId,
      currentUserId: userId,
    })
    socket.to(newRoom).emit('notification', `${username} a rejoint ${newRoom}.`)

    console.log(
      `[ROOM_CHANGE] ${username} joined: ${newRoom} (ID: ${
        currentRoomId || roomFromDb.id
      })`
    )
    emitUserListUpdate()
  })

  // Gestion de l'événement "Quitter la room"
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

  // // Gestion de l'événement "Modifier une room"
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

  // Gestion de l'événement "Supprimer une room"
  socket.on('delete_room', async (roomToDelete) => {
    const { userId } = socket.data

    if (!activeRooms.has(roomToDelete)) return

    const roomFromDb = await getRoomFromDb(roomToDelete)
    if (!roomFromDb) {
      return socket.emit('delete_error', 'Room introuvable.')
    }

    // Vérifier que l'utilisateur est le créateur de la room
    if (roomFromDb.creator_user_id !== userId) {
      console.warn(
        `[SECURITY] User ${socket.data.username} (ID: ${userId}) tried to delete room ${roomToDelete} (Creator ID: ${roomFromDb.creator_user_id}) without being the creator.`
      )
      return socket.emit(
        'delete_error',
        'Seul le créateur de la Room peut la supprimer.'
      )
    }

    const roomData = activeRooms.get(roomToDelete)

    if (roomData.users.size > 1) {
      console.warn(
        `[SECURITY] User ${socket.data.username} tried to delete non-empty room: ${roomToDelete}`
      )
      return socket.emit(
        'delete_error',
        'Veuillez attendre que tous les autres utilisateurs quittent la Room avant de la supprimer.'
      )
    }

    socket.emit('notification', `Suppression de la Room ${roomToDelete}.`)
    socket.leave(roomToDelete)
    activeRooms.delete(roomToDelete)

    try {
      await deleteRoomFromDb(roomToDelete)
      console.log(
        `Room ${roomToDelete} deleted from DB by ${socket.data.username}.`
      )

      io.emit('room_deleted', roomToDelete)
    } catch (e) {
      console.error(`[DB ERROR] Failed to delete room ${roomToDelete}:`, e)
      socket.emit(
        'delete_error',
        'Erreur serveur lors de la suppression de la Room.'
      )
    }

    emitUserListUpdate()
  })

  // Gestion de l'événement "Déconnexion"
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

// Notification de Connexion à la Room
//   socket.to(room).emit('notification', `${username} a rejoint l'espace.`)

//   socket.emit('initial_content', roomData.content)

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
