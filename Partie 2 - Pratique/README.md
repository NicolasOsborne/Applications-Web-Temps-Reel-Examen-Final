# Nicolas OSBORNE

# Applications Web Temps Réel - Examen Final

# Partie 2 - Réalisation pratique

Application de tableau blanc collaboratif en temps réel Collaboard, permettant à plusieurs utilisateurs connectés de travailler simultanément sur le même espace.
Chaque modification effectuée par un utilisateur doit être immédiatement visible par les autres.

- Chaque utilisateur saisit un pseudo avant de rejoindre la session.
- Le serveur conserve une liste simple des utilisateurs connectés.
- À la connexion/déconnexion, un événement `notification` informe tous les clients.

- Les utilisteurs partagent un espace de travail commun.
- Les modifications sont transmises en temps réel via `Socket.IO` avec un événement `update`.

- Les utilsateurs peuvent créer ou rejoindre une `room`.
- Les événements ne concernent que les utilisateurs d'une même room.

- Utilisation d'un `token temporaire` pour rejoindre une room.
- Vérification du token côté serveur avant d'accepter la connexion Socket.IO.

- Le serveur affiche en console :
  - Le nombre de connexions actives.
  - Le nombre d'événements émis par minute.
  - Les rooms actives.
  - Affichage sur une page `/status` du serveur.

## Technologies utilisées

- Node.js
- Express
- Socket.IO

## Lancer l'application

- S'assurer d'avoir Node.js d'installé

- Installer les dépendances :

```bash
cd CollabBoard
npm install
```

- Lancer l'application :

```bash
npm run start
```

- Accéder à l'application à l'addresse http://localhost:3000
