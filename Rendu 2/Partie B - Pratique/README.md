# Nicolas OSBORNE

# Applications Web Temps Réel - Examen Final (Session 2) - Persistance des données/Sécurité/Monitoring

# Partie B - Réalisation pratique

Il s'agit ici de la même application Collaboard (développée dans la partie pratique du 1er rendu), mais cette fois-ci étendue avec des fonctionnalités supplémentaire :

- Une persistance des données (SQLite).
- Une authentification (JWT et hash bcrypt).
- Des règles de sécurité (limitation de certaines actions par utilisateur, validation côté serveur et sanitisation des inputs contre les injections malveillantes).
- Reconnexion automatique en cas de perte de connexion.
- Monitoring (compteur de connexions, affichage de la latence, logs de synchronisation).

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

- Lancer l'application :

```bash
npm run start
```

- Accéder à l'application à l'addresse http://localhost:3000
- Accéder au Dashboard JSON simple du serveur à l'addresse http://localhost:3000/status
