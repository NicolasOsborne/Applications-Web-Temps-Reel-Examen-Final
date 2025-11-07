let socket = null
const API_BASE = window.location.origin

const loginWindow = document.getElementById('login-window')
const desktopIconsContainer = document.getElementById('desktop-icons')
const userListWindow = document.getElementById('user-list-window')
const userListContent = document.getElementById('user-list-content')
const roomWindowsContainer = document.getElementById('room-windows-container')
const createRoomModal = document.getElementById('create-room-modal')
const errorMsg = document.getElementById('error_message')

let openedRooms = new Map()

let userToken = null

async function handleAuth(type) {
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value.trim()
  const endpoint = type === 'login' ? '/api/login' : '/api/register'
  errorMsg.textContent = ''

  if (!username || !password) {
    errorMsg.textContent = 'Pseudo et mot de passe requis.'
    return
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    const data = await response.json()

    if (!response.ok) {
      errorMsg.textContent = `Erreur ${type}: ${data.message}`
      return
    }

    userToken = data.token
    localStorage.setItem('userToken', userToken)
    localStorage.setItem('username', username)

    connectSocket(username)
  } catch (e) {
    errorMsg.textContent = 'Erreur de communication avec le serveur.'
    console.error(e)
  }
}

function connectSocket(username) {
  if (!userToken) return

  socket = io({
    query: { username, token: userToken },
  })

  socket.on('connect', () => {
    loginWindow.style.display = 'none'
    desktopIconsContainer.style.display = 'flex'
    userListWindow.style.display = 'block'

    loadDesktopIcons()
    setupSocketListeners()
  })

  socket.on('connect_error', (err) => {
    errorMsg.textContent = `Échec de la connexion Socket: ${err.message}`
    if (socket) socket.close()
  })
}

window.onload = () => {
  const token = localStorage.getItem('userToken')
  const username = localStorage.getItem('username')

  if (token && username) {
    userToken = token
    document.getElementById('username').value = username
    loginWindow.style.display = 'block'
    errorMsg.textContent = 'Token trouvé. Tentez la connexion.'
  } else {
    loginWindow.style.display = 'block'
  }
  loadDesktopIcons()
}

async function loadDesktopIcons() {
  try {
    const response = await fetch(`${API_BASE}/status`)
    const status = await response.json()

    const staticIcon = desktopIconsContainer.querySelector('.desktop-icon')
    desktopIconsContainer.innerHTML = ''
    desktopIconsContainer.appendChild(staticIcon)

    status.activeRooms.forEach((room) => {
      if (room.name === 'general' || room.name === '__CONNECTED__') return
      createRoomIcon(room.name, room.id)
    })
  } catch (e) {
    console.error('Erreur lors du chargement des icônes du bureau:', e)
  }
}

function createRoomIcon(roomName, roomId) {
  const iconDiv = document.createElement('div')
  iconDiv.className = 'desktop-icon'
  iconDiv.onclick = () => openRoomWindow(roomName, roomId)
  iconDiv.innerHTML = `
    <img src="/assets/file.png" alt="${roomName}">
      ${roomName}
   `
  desktopIconsContainer.appendChild(iconDiv)
}

function openCreateRoomWindow() {
  createRoomModal.style.display = 'block'
}

function closeCreateRoomWindow() {
  createRoomModal.style.display = 'none'
}

function createAndJoinNewRoom() {
  const newRoomName = document.getElementById('new_room_name').value.trim()
  if (newRoomName) {
    closeCreateRoomWindow()
    openRoomWindow(newRoomName)
  }
}

function deleteRoom(roomName) {
  if (confirm(`Êtes-vous sûr de vouloir supprimer la Room "${roomName}" ?`)) {
    socket.emit('delete_room', roomName)
  }
}

function openRoomWindow(roomName, roomId) {
  if (openedRooms.has(roomName)) {
    const existingWindow = document.getElementById(`room-${roomName}`)
    existingWindow.style.zIndex = 500
    return
  }

  const windowDiv = document.createElement('div')
  windowDiv.className = 'window room-window'
  windowDiv.id = `room-${roomName}`
  windowDiv.style.width = '500px'
  windowDiv.style.position = 'absolute'
  windowDiv.style.top = `50%`
  windowDiv.style.left = `50%`
  windowDiv.style.transform = 'translate(-50%, -50%)'
  windowDiv.style.zIndex = 100

  windowDiv.innerHTML = `
    <div class="title-bar">
      <div class="title-bar-text">${roomName}</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close" onclick="closeRoomWindow('${roomName}')"></button>
      </div>
    </div>
    <div class="window-body">
      <div class="field-row-stacked">
        <textarea id="editor-${roomName}" data-room="${roomName}" placeholder="Soyez le premier à contribuer !"></textarea>
      </div>
      <section class="field-row" style="justify-content: flex-end; margin-top: 5px;">
        <button id="delete-btn-${roomName}" onclick="deleteRoom('${roomName}')" disabled>
          Supprimer la Room
        </button>
      </section>
    </div>
  `
  roomWindowsContainer.appendChild(windowDiv)

  socket.emit('join_room', { roomName, roomId })

  openedRooms.set(roomName, {
    element: windowDiv,
    editor: document.getElementById(`editor-${roomName}`),
    creatorId: null,
  })

  const editor = openedRooms.get(roomName).editor
  editor.addEventListener('input', () => {
    socket.emit('update', { room: roomName, content: editor.value })
  })
}

function closeRoomWindow(roomName) {
  const windowDiv = document.getElementById(`room-${roomName}`)
  if (windowDiv) {
    windowDiv.remove()
    openedRooms.delete(roomName)

    socket.emit('leave_room', roomName)
  }
}

function setupSocketListeners() {
  socket.on('update', ({ room, content }) => {
    const roomState = openedRooms.get(room)
    if (roomState && roomState.editor) {
      const editor = roomState.editor

      const start = editor.selectionStart
      const end = editor.selectionEnd
      editor.value = content
      editor.setSelectionRange(start, end)
    }
  })

  socket.on(
    'initial_content',
    ({ room, content, creatorId, currentUserId }) => {
      const roomState = openedRooms.get(room)
      if (roomState && roomState.editor) {
        roomState.editor.value = content

        roomState.creatorId = creatorId

        const deleteBtn = document.getElementById(`delete-btn-${room}`)

        if (deleteBtn && creatorId === currentUserId) {
          deleteBtn.disabled = false
          deleteBtn.title = 'Vous êtes le créateur de cette Room.'
        } else if (deleteBtn) {
          deleteBtn.disabled = true
          deleteBtn.title = 'Seul le créateur de la Room peut la supprimer.'
        }
      }
      loadDesktopIcons()
    }
  )

  socket.on('notification', (message) => {
    console.log(`[Notification] ${message}`)
  })

  socket.on('join_error', (message) => {
    alert(message)
    console.error(`[Join Error] ${message}`)
    closeRoomWindow(openedRooms.keys().next().value)
  })

  socket.on('delete_error', (message) => {
    alert(`Erreur de suppression : ${message}`)
    console.error(`[Delete Error] ${message}`)
  })

  socket.on('user_list_update', (roomUsers) => {
    updateUserList(roomUsers)
  })

  socket.on('room_created', (room) => {
    loadDesktopIcons()
  })

  socket.on('room_deleted', (roomName) => {
    const roomState = openedRooms.get(roomName)
    if (roomState) {
      alert(`La Room "${roomName}" a été supprimée !`)
      closeRoomWindow(roomName)
    }
    loadDesktopIcons()
  })
}

function updateUserList(roomUsers) {
  userListContent.innerHTML = ''

  const globalUsers = roomUsers['Connectés'] || []

  const globalDiv = document.createElement('div')
  globalDiv.className = 'room-group-title'
  globalDiv.textContent = 'Connectés'
  userListContent.appendChild(globalDiv)

  globalUsers.forEach((user) => {
    const p = document.createElement('p')
    p.textContent = `👤 ${user}`
    userListContent.appendChild(p)
  })

  for (const [roomName, users] of Object.entries(roomUsers)) {
    if (roomName === 'Connectés') continue

    if (users.length > 0) {
      const groupDiv = document.createElement('div')
      groupDiv.className = 'room-group-title'
      groupDiv.textContent = `Room: ${roomName}`
      userListContent.appendChild(groupDiv)

      users.forEach((user) => {
        const p = document.createElement('p')
        p.textContent = `👤 ${user}`
        userListContent.appendChild(p)
      })
    }
  }
}

window.onload = () => {
  loginWindow.style.display = 'block'
  loadDesktopIcons()
}
