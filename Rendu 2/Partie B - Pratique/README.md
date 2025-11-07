# Nicolas OSBORNE

# Applications Web Temps Réel - Examen Final (Session 2) - Persistance des données/Sécurité/Monitoring

# Partie B - Réalisation pratique

Il s'agit ici de la même application Collaboard (développée dans la partie pratique du 1er rendu), mais cette fois-ci étendue avec des fonctionnalités supplémentaire :

- Une persistance des données : une base SQLite locale est créée au démarrage du serveur, et conserve la table avec les "rooms" et les "users".

- Une authentification (JWT et hash bcrypt).

- Des règles de sécurité :

  - Limitation de certaines actions par utilisateur : seul l'utilisateur qui a créé la room peut la supprimer (les autres ne peuvent pas effectuer cette action).

  - Validation côté serveur : l'utilisation de requêtes préparées pour chaque interaction avec la base de donénes où des données sont entrées par l'utilisateur, par exemple :

  ```bash
  const sql = 'SELECT id, name, content, creator_user_id FROM rooms WHERE name = ?'
  ```

  Le `?` agit comme un placeholder et SQLite le traite comme une donnée pure, non comme une partie de la requête SQL, ce qui empêche l'injection de commandes SQL dans la base de données.

  - Sanitisation des inputs contre les injections malveillantes : utilisation de la librairie sanitize-html pour neutraliser et sanitiser tout HTML qui pourrait être inséré dans la base de données (des balises `<script>` ou `onerror` par exemple) et exécuté côté navigateur chez un autre utilisateur :

  ```bash
  const sanitizedContent = sanitizeHtml(content, {
      allowedTags: [],
      allowedAttributes: {},
    })
  ```

- Reconnexion automatique en cas de perte de connexion

- Monitoring (compteur de connexions, affichage de la latence, logs de synchronisation) visible dans un fichier app.log

```bash
   // Log du compteur de connexions
   logger.info(`
    `[CONNEXION] Utilisateur ${username} (ID: ${socket.id}) connecté. Total: ${totalConnections}`
  )

  // Log de latence
  socket.on('pong', (latency) => {
    logger.debug(`[LATENCE] Latence de ${socket.data.username}: ${latency}ms`)
  })

  // Log de synchronisation
    logger.info(
      `[SYNC] ${username} a rejoint la room: ${newRoom} (Ancienne room: ${oldRoom})`
    )

    logger.info(`[SYNC] ${socket.data.username} a quitté la room: ${roomToLeave}`)

    logger.info(
      `[DECONNEXION] Utilisateur ${username} déconnecté. Total: ${totalConnections}`
    )


```

## Technologies utilisées

- Node.js
- Express
- Socket.IO
- JWT
- Bcrypt
- SQLite
- Winston

## Lancer l'application

- S'assurer d'avoir Node.js d'installé

- Installer les dépendances :

```bash
cd CollabBoard-2
npm install
```

- ## Configurer une variable d'environnement pour le JWT
  Créer un fichier .env à la racine du projet, et renseigner :

```bash
JWT_SECRET=SuPerSeCreTKey


```

- Lancer l'application :

```bash
npm run start
```

- Accéder à l'application à l'addresse http://localhost:3000
- Accéder au Dashboard JSON simple du serveur à l'addresse http://localhost:3000/status
