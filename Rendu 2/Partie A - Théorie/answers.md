# Nicolas OSBORNE

# Applications Web Temps Réel - Examen Final (Session 2) - Persistance des données/Sécurité/Monitoring

# Partie A - Questions théoriques

## Q1. Services cloud temps réel

> Citez deux services managés permettant la synchro temps réel (hors WebSocket natif).
> Comparez ces deux services selon :
>
> - Modèle de données
> - Persistance
> - Mode d'écoute
> - Scalabilité
>
> Donnez un cas d'usage préféré pour chacun.

- **Firebase Realtime Database** :

  - `Modèle de données` : NoSQL, stocké sous forme d'arborescence JSON. Les données sont structurées en noeuds et sous-noeuds, permettant une mise à jour rapide mais qui peuvent engendrer des requêtes complexes à gérer pour des structures fortement relationnelles.
  - `Persistance` : Les modifications sont conservées localement et synchronisées automatiquement lorsque la connexion est établie.
  - `Mode d'écoute` : Écoute en temps réel sur un chemin précis du JSON via un WebSocket.
  - `Scalabilté` : Verticale.
  - `Cas d'usage préféré` : Applications collaboratives légères (type Kanban) ou chat en temps réel, où la structure des données est simple.

- **Supabase Realtime** :

  - `Modèle de données` : PostgreSQL relationnel.
  - `Persistance` : Les données sont stockées dans PostgreSQL, comme une base SQL traditionnelle.
  - `Mode d'écoute` : WebSocket qui capture les événements (INSERT, UPDATE, DELETE).
  - `Scalabilité` : Horizontale.
  - `Cas d'usage préféré` : Applications métiers complexes ou dashboards temps réel (puissance du SQL et synchro temps réel sans perte de structure relationnelle).

## Q2. Sécurité temps réel

> Donnez trois risques liés au temps réel (ex : DDoS via connexions persistantes) et comment s’en protéger.
> Expliquez l’importance de la gestion des identités en temps réel.

- **Attaques par DoS/DDoS** : l'ouverture d'un grand nombre de connexions persistantes peut rapidement saturer le serveur et le rendre indisponible. On peut s'en protéger en limitant le nombre de connexions par IP ou utiliser un load balancer.

- **Attaques CSRF** : à la différence des requêtes HTTP, les WebSockets ne suivent pas la politique same-origin, ainsi le serveur ne vérifie pas strictement les headers une fois la connexion ouverte.

- **Injections XSS** : une absence de validation et de nettoyage des données reçues via le socket pourraient permettre d'injecter du code malveillant qui serait ensuite exécuté par tous les autres clients.

En temps réel, les connexions restent ouvertes longtemps, il est donc primordial de vérifier l'identité au moment de la connexion, de renouveler et revalider les tokens sans pour autant mettre un terme à la synchronisation. Cela permet de garantir que seules les connexions valides peuvent émettre ou recevoir des données.

## Q3. WebSockets vs Webhooks

> Définissez chaque technologie.
> Donnez deux avantages et deux limites de chaque.
> Dans quel cas un Webhook est préférable ? Justifiez.

- **WebSocket** : Un protocole réseau full-duplex qui permet de mettre en place une connexion persistancte et bidirectionnelle entre client et serveur après un handshake HTTP et la mise en place d'une connexion TCP.
  Avantages : Une très faible latence (quasi-instantané) avec une communication bidirectionnelle en temps réel.
  Limites : Plus complexe à mettre en place et nécessite la mise en place de connexions persistantes.

- **Webhooks** : Un mécanisme HTTP où un serveur envoie une requête POST vers une URL externe sur un autre serveur lorsqu'un événement en particulier se produit, afin de lui transmettre des notifications concernant ces événements.
  Avantages : Simplicité à mettre en place et scalabilité.
  Limites : Unidirectionnel (envoi de notifications dans un sens) et latence plus importe.

Il est préférable d'utiliser un Webhook dans le cas où l'on souhaite notifier un service d'un événement ponctuel ne nécessitant pas une communication bidirectionnelle en continu (par exemple lorsqu'un paiement est validé).

## Q4. CRDT & Collaboration

> Définissez un CRDT.
> Donnez un exemple concret de situation où l’utiliser.
> Expliquez pourquoi un CRDT évite les conflits de modifications distribuées.

- Définition d'un CRDT : Un CRDT (Conflict-free Replicated Data Types) est une structure de données qui permet à plusieurs noeuds d'apporter des modifications à leur copie locale des données, puis de fusionner automatiquement toutes les modifications sans créer de conflits pour arriver à un même état final pour tous.

- Exemple concret de situation où l'utiliser : Une application collaborative en temps réel. C'est ce qui est utilisé par Google Docs, Notion ou bien Figma par exemple.

Plusieurs personnes peuvent modifier le même document simultanément, même hors-ligne, et quel que soit l'ordre d'application des modifications, le résultat final sera le même pour tous les noeuds, ce qui élimine le besoin d'un arbitre pour décider des cocurrences et des conflits entre les modifications.

## Q5. Monitoring temps réel

> Citez trois métriques clés à surveiller dans une application temps réel.
> Expliquez comment des outils comme Prometheus/Grafana aident dans ce contexte.
> Quelle est la différence entre logs, traces, et métriques ?

- Les trois métriques clés à surveiller pour une application temps réel sont :

  - La latence (temps de réponse, démarrage)
  - Les connexions (actives, fermées, refusées)
  - Les erreurs (taux d'erreurs, types d'erreurs)

- Prometheus permet de collecter et de stocker ces métriques en temps réel, et Grafana permet ensuite de les visualiser sous forme de dashboard et de graphiques. Ensemble, ils permettent d'aider à détecter rapidement des anomalies et de suivre les performances du réseau.

- La différence entre logs, traces et métriques :
  - Les logs sont des enregistrements sous forme de messages des différents événements.
  - Les traces sont des suivis d'une même requête à travers les différents services.
  - Les métriques sont des valeurs chiffrées périodiques.

## Q6. Déploiement & Connexions persistantes

> Expliquez comment les connexions WebSockets impactent : le load balancing et la scalabilité.
> Pourquoi Kubernetes est souvent utilisé dans ce contexte ?

Les WebSockets impactent le load balancing car un client doit absolument rester connecté au même serveur, et la scalabilité car ils nécessitent une infrastructure suffisante et performante pour synchroniser tous les messages entre les différents serveurs.

Pour ces raisons, Kubernetes est souvent utilisé dans le contexte des WebSockets puisqu'il permet de faciliter une scalabilité horizontale en répartissant les pods WebSockets pour améliorer le load balancing.

## Q7. Stratégies de résilience client

> Décrivez trois mécanismes côté client pour gérer les déconnexions.
> Expliquez brièvement le principe d’exponential backoff.

Pour gérer les déconnexions côté client, il est conseillé de mettre en place les mécanismes suivants :

- La synchronisation après une perte de connexion
- La reconnexion automatique en cas de perte du réseau
- La gestion des files d'attente pour stocker les données ou événements manqués pendant une déconnexion, pour les rejouer lorsque la connexion est rétablie.

L'exponential backoff est un mécanisme qui permet d'augmenter progressivement le délai entre chaque tentative de reconnexion pour éviter de surcharger le serveur.
