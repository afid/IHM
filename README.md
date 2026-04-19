# 🗓️ IHM de Gestion des Calendriers (Pilotage SVI)

## 📖 Table des Matières

1. [Vue d'ensemble](#-vue-densemble)
2. [Bienvenue dans l'équipe !](#-bienvenue-dans-léquipe-)
3. [Prérequis et installation](#-prérequis-et-installation)
4. [Guide d'utilisation pour les utilisateurs](#-guide-dutilisation-pour-les-utilisateurs)
5. [Architecture technique détaillée](#-architecture-technique-détaillée)
6. [Structure des fichiers](#-structure-des-fichiers)
7. [Comment fonctionne chaque composant](#-comment-fonctionne-chaque-composant)
8. [Flux de données](#-flux-de-données)
9. [Conventions de code](#-conventions-de-code)
10. [Sécurité et gestion des identifiants](#-sécurité-et-gestion-des-identifiants)
11. [Dépannage et problèmes courants](#-dépannage-et-problèmes-courants)
12. [Contribution et développement](#-contribution-et-développement)

---

## 🎯 Vue d'ensemble

### Qu'est-ce que cette application ?

**L'IHM (Interface Homme-Machine) de Gestion des Calendriers** est une application web qui permet aux équipes métier (non-techniques) de **piloter en toute autonomie les horaires d'ouverture et de fermeture** de leurs services sans écrire une seule ligne de code.

### À quoi sert-elle concrètement ?

Cette interface gère les calendriers qui contrôlent :
- **Les services téléphoniques** (SVI - Serveurs Vocaux Interactifs) : Quel message afficher selon l'heure
- **Le routage des appels** : Vers quelles équipes diriger les appels selon le moment
- **Les horaires des centers de contacts** : Jours fériés, vacances, changements d'horaires saisonniers

Chaque modification effectuée dans cette interface est **immédiatement transmise aux serveurs Amazon Connect** qui contrôlent vos flux d'appels et vos interactions client en temps réel.

### Pour qui est-ce destiné ?

- **Coordinateurs de flux** : Responsables de la configuration des circuits d'appels
- **Responsables de centres de contacts** : Qui gèrent les horaires d'ouverture/fermeture
- **Planificateurs opérationnels** : Qui définissent les jours spéciaux, vacances, etc.
- **Toute personne non-technique** : Aucune connaissance en programmation n'est requise !

---

## 🎓 Bienvenue dans l'équipe !

Vous êtes nouveau dans ce projet ? Parfait ! Voici un parcours progressif pour bien comprendre le système.

### Jour 1 : Comprendre le concept

Lisez les trois premières sections de ce guide pour avoir une compréhension générale de :
- Ce que l'application fait
- Comment les utilisateurs l'utilisent
- Ce qu'il se passe "sous le capot"

### Jour 2-3 : Installer et explorer

Suivez la section "Prérequis et installation" pour faire tourner l'application en local, puis :
1. Connectez-vous avec les identifiants de test fournis par votre manager
2. Naviguez dans les différentes pages (Calendrier Vocal, Distribution, etc.)
3. Observez l'interface sans rien modifier
4. Utilisez le bouton **?** en haut à droite pour lire les guides d'aide

### Jour 4-5 : Comprendre l'architecture

Lisez les sections "Architecture technique détaillée" et "Comment fonctionne chaque composant" pour savoir où est stockée l'information et comment elle circule dans l'application.

### Semaine 2 : Chercher des bugs ou faire des petites améliorations

Maintenant que vous comprenez le système, vous pouvez :
- Lire le code des fichiers JavaScript
- Essayer de corriger des bugs simples
- Proposer des améliorations (avec l'approbation d'un senior)

### Semaine 3+ : Contribuer des fonctionnalités

Une fois à l'aise, consultez la section "Contribution et développement" pour ajouter de nouvelles fonctionnalités.

---

## 💻 Prérequis et installation

### Avant de commencer

Vous aurez besoin de :

1. **Git** : Pour cloner le projet et versionner votre code
   - Télécharger depuis https://git-scm.com/
   - Vérifier l'installation : `git --version`

2. **Un navigateur moderne** : Chrome, Firefox, Safari ou Edge (version récente)
   - Certaines fonctionnalités utilisent des API JavaScript modernes
   - **IMPORTANT : La langue du navigateur doit être réglée sur FRANÇAIS** pour afficher les horaires au format 24h (HH:MM)
     - En English (US), l'affichage serait en AM/PM
     - En FRANÇAIS, l'affichage est automatiquement en 24h
     - Pour changer la langue : Paramètres du navigateur → Langue → Français

3. **Serveur HTTP (MANDATAIRE)** : Pour faire fonctionner l'application, un serveur Web local est **obligatoire**.
   - Pourquoi ? Le navigateur bloque certaines fonctionnalités de sécurité (comme le chargement de fichiers ou les appels AWS) si vous ouvrez simplement le fichier `.html` depuis votre dossier.
   - Vous pouvez utiliser Python 3, Node.js, PHP, ou n'importe quel serveur HTTP.
   - Télécharger Python depuis https://www.python.org/ si nécessaire.
   - OU télécharger Node.js depuis https://nodejs.org/

4. **Des identifiants AWS** : Fournis par votre administrateur (Access Key, Secret Key, Region)
   - **⚠️ IMPORTANT** : Gardez ces identifiants secrets ! Jamais dans le code, jamais sur GitHub !

5. **Accès à DynamoDB** : Votre administrateur doit vous créer un utilisateur AWS avec les permissions appropriées

### Étapes d'installation

#### Étape 1 : Cloner le projet

```bash
# Ouvrir le terminal/PowerShell
git clone https://github.com/votre-entreprise/IHM.git
cd IHM
```

#### Étape 2 : Vérifier la structure

```bash
# Vous devriez voir cela :
ls
# → calendrier_vocal.html
# → calendrier_distribution.html
# → parametrage_dnis.html
# → js/
# → css/
# → help/
# → news/
```

#### Étape 3 : Lancer un serveur local

**Option 1 : Avec Python 3** (recommandé)
```bash
# Dans le dossier du projet
python -m http.server 8000
# L'application est maintenant accessible sur http://localhost:8000
```

**Option 2 : Avec Node.js** (via npx)
```bash
npx http-server -p 8000
```

**Option 3 : Avec PHP**
```bash
php -S localhost:8000
```

> [!IMPORTANT]
> **Ne pas ouvrir les fichiers HTML directement** (double-clic sur le fichier). L'URL dans votre navigateur doit TOUJOURS commencer par `http://localhost...` pour que l'application fonctionne correctement.

#### Étape 4 : Accéder à l'application

Ouvrez votre navigateur et allez sur : **http://localhost:8000/login.html**

Vous devriez voir l'écran de connexion avec trois champs :
- Clé d'Accès AWS
- Clé Secrète AWS
- Région AWS

#### Étape 5 : Se connecter

Utilisez les identifiants de test fournis par votre manager :
```
Accès Key : AKIA123456789ABC...
Secret Key : wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Région : eu-west-3
```

Une fois connecté, vous verrez la page d'accueil avec le menu latéral.

---

## 🚀 Guide d'utilisation pour les utilisateurs

### Le flux complet en 5 étapes

#### 1️⃣ Connexion

L'application demande vos **identifiants AWS** au démarrage. C'est normal ! Cela permet à l'application de lire et modifier les calendriers stockés dans la base de données Amazon.

```
Clé d'Accès : C'est votre "nom d'utilisateur" auprès d'Amazon
Clé Secrète : C'est votre "mot de passe" auprès d'Amazon
Région : eu-west-3 (pour nous, ce sera toujours "Europe Paris")
```

#### 2️⃣ Choisir un calendrier

Une fois connecté, vous verrez la page d'accueil avec un menu latéral. Cliquez sur :
- **Calendrier Vocal** : Pour gérer les horaires des SVI (serveurs vocaux)
- **Calendrier Distribution** : Pour gérer le routage des appels
- **Calendrier Cible** : Pour les horaires spécifiques aux cibles

Vous arrivez sur la page de sélection. Un menu déroulant en haut à gauche montre tous les calendriers disponibles (ex: `Cal_Vocal_Marque01`, `Cal_Vocal_Marque02`, etc.).

#### 3️⃣ Comprendre ce que vous voyez

La page affiche une **grille de calendrier** avec les 7 jours de la semaine. Chaque jour a une couleur qui signifie :

| Couleur | Signification | Exemple |
|---------|--------------|---------|
| 🔵 **Bleu** | Service ouvert selon la Semaine Type | Lundi avec horaires 09:00-18:00 |
| 🟠 **Orange** | Service fermé TOUTE la journée | Dimanche (fermé) |
| 🔷 **Bleu ciel** | Exception : fermeture partielle ou extension | Vendredi avec fermeture à 14:00 au lieu de 18:00 |
| 🟤 **Marron** | Jour férié ou fermé exceptionnellement | 1er janvier |

#### 4️⃣ Modifier les horaires

Cliquez sur le bouton **✏️ Éditer** en bas à droite. Une fenêtre s'ouvre avec trois onglets :

**Onglet 1 : Semaine Type**
- Définit les horaires "normaux" de la semaine
- De **Lundi** à **Dimanche**
- Chaque jour peut avoir plusieurs créneaux horaires (ex: 09:00-12:00, 14:00-18:00)
- Utilisez ➕ pour ajouter un créneau
- Utilisez 🗑️ pour supprimer un créneau

**Onglet 2 : Jours Exceptionnels**
- Pour modifier **un seul jour spécifique**
- Exemples :
  - "2 janvier 2024 : exceptionnellement fermé" (jour férié déplacé)
  - "15 avril 2024 : ouvert 10:00-16:00" (jour spécial)
  - "24 décembre 2023 : fermé" (veille de Noël)

#### 5️⃣ Sauvegarder vos modifications

⚠️ **IMPORTANT** : Cliquez **impérativement** sur le bouton **SAUVEGARDER** en bas de la fenêtre d'édition. Sans cela, vos modifications seront perdues !

Une notification verte s'affichera : "✅ Sauvegarde réussie"

---

### 📞 Paramétrage des DNIS

**Page** : `parametrage_dnis.html`

Les DNIS (Direct Inward Dialing) sont les **numéros de téléphone** entrants associés à votre système Amazon Connect. Chaque DNIS définit comment un appel entrant sera traité.

#### Comment ça marche ?

1. **Sélectionnez un DNIS** dans le menu déroulant pour voir ses détails
2. Cliquez **✏️ Éditer** pour le modifier, **📄 Dupliquer** pour en créer un similaire, ou **🗑️ Supprimer**
3. Cliquez **➕ Nouveau DNIS** pour en créer un de zéro

#### Champs disponibles dans l'éditeur

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Numéro** *(obligatoire)* | Numéro de téléphone au format international | `+33123456789` |
| **Nom** | Nom descriptif du DNIS | `Accueil Marque01` |
| **Marque** | Marque associée (menu déroulant) | `Marque01` |
| **Domaine** | Domaine d'activité (menu déroulant) | `Assurance` |
| **Sous-domaine** | Sous-domaine (menu déroulant) | `Vie` |
| **Intention Déduite** | Intention déduite de l'appel | `Sinistre` |
| **Périmètre** | Périmètre de traitement | `National` |
| **Signification** | Description libre du DNIS | `Ligne sinistres` |
| **Type Client** | Type de client visé | `Particulier` |
| **Voix Acteur** | Voix du SVI (Mathieu, Lea, Celine, Remi) | `Lea` |
| **Ani Simulation** | Numéro de simulation | `+33...` |
| **Date Simulation** | Date/heure de simulation | `2025-12-25 15:00:00` |
| **Logger Actif** | Active/désactive le logging | ✅ / ❌ |
| **Modules** | Modules Amazon Connect associés (ajout dynamique) | `Core_Mod_xxx` |

> **💡 Astuce** : Les champs Marque, Domaine et Sous-domaine sont des menus déroulants auto-alimentés pour garantir la cohérence. Les modules peuvent être réorganisés par **drag-and-drop**.

---

### 🔀 Paramétrage des Parcours

**Page** : `parametrage_parcours.html`

Les parcours définissent la **séquence de traitement** d'un appel dans Amazon Connect. Chaque parcours associe une action, des guides vocaux (Dissuasion, Attente, Mise en Relation) et des étapes ordonnées.

#### Comment ça marche ?

1. **Sélectionnez un parcours** dans le menu déroulant
2. Les détails s'affichent : action, guides vocaux, étapes, et groupement
3. Utilisez **✏️ Éditer**, **📄 Dupliquer** ou **🗑️ Supprimer**
4. Cliquez **➕ Nouveau Parcours** pour en créer un

#### Champs disponibles dans l'éditeur

| Champ | Description |
|-------|-------------|
| **Action** | Type de traitement (menu déroulant depuis DynamoDB) |
| **Guide Dissuasion** | Guide vocal joué en message de dissuasion (chargé via l'API Amazon Connect ✨) |
| **Guides Attente** | Guide vocal joué pendant l'attente (chargé via l'API Amazon Connect ✨) |
| **Guides Mise en Relation** | Guide(s) joué(s) lors de la mise en relation (**multi-sélection** ✨, chargé via l'API Amazon Connect ✨) |
| **Groupement** | Pré-remplissage automatique des guides depuis un groupement existant |
| **Étapes** | Séquence ordonnée d'étapes de traitement |

> **✨ Multi-sélection MER** : Cliquez **➕** pour ajouter plusieurs guides Mise en Relation. Cliquez **✕** pour en supprimer. Les guides sont stockés en tableau JSON dans DynamoDB.

> **💡 Groupement** : La sélection d'un groupement pré-remplit automatiquement les 3 types de guides (Dissuasion, Attente, MER).

---

### 🎯 Paramétrage des Segments

**Page** : `parametrage_segments.html`

Les segments définissent les **règles de distribution** des appels vers les équipes. Chaque segment peut avoir des calendriers associés et des modules de traitement Pre/Post Ciblage.

#### Comment ça marche ?

1. **Sélectionnez un segment** dans le menu déroulant
2. Les détails s'affichent avec les propriétés et les modules associés
3. Utilisez **✏️ Éditer**, **📄 Dupliquer** ou **🗑️ Supprimer**

#### Champs disponibles dans l'éditeur

| Champ | Description |
|-------|-------------|
| **Nom du Segment** *(obligatoire)* | Identifiant unique (ex: `SEGMENT_STANDARD`) |
| **Groupement** | Groupement parent pour héritage de propriétés |
| **Type** *(obligatoire)* | `Segment` ou `GroupementSegments` |
| **État** | État spécial (ex: `Fermeture d'urgence`) |
| **Calendriers** | Paires événement ↔ calendrier de distribution (ajout dynamique avec ➕) |
| **Modules Pre Ciblage** | Modules exécutés **AVANT** le ciblage final (ajout dynamique) |
| **Modules Post Ciblage** | Modules exécutés **APRÈS** le ciblage final (ajout dynamique) |

> **💡 Astuce** : Les modules Pre/Post Ciblage permettent d'exécuter des traitements supplémentaires autour du ciblage principal (vérifications, enrichissements, etc.)

---

### 🏗️ Paramétrage des Structures

**Page** : `parametrage_structures.html`

Les structures définissent la **configuration centralisée** de l'ensemble du système. Elles sont organisées hiérarchiquement (Marque > Domaine > Sous-Domaine) avec un système de **filtres en cascade**.

#### Comment ça marche ?

1. **Sélectionnez une Marque** dans le premier filtre
2. Le filtre **Domaine** apparaît avec les domaines de cette marque
3. Le filtre **Sous-domaine** apparaît ensuite
4. Les détails de la structure sélectionnée s'affichent

#### Champs disponibles dans l'éditeur

| Champ | Description |
|-------|-------------|
| **Structure** *(obligatoire)* | Identifiant unique (ex: `MARQUE_NOM`) |
| **Type** | Type de structure : `marque`, `domaine`, `sous-domaine`, `segment`, `groupe-segments` |
| **État** | État spécial (ex: `Fermeture d'urgence`, `Fermeture exceptionnelle`) |
| **Moteur de Décision** | Moteur utilisé : `CoreDécision` ou `DomaineDécision` |
| **Parent** | Structure parente (menu déroulant dynamique) |
| **Situations (Périodes)** | Périodes de fonctionnement spéciales (ajout dynamique avec ➕) |

> **💡 Filtres en cascade** : La sélection d'une Marque filtre automatiquement les Domaines disponibles, et la sélection d'un Domaine filtre les Sous-domaines. Cela simplifie la navigation parmi un grand nombre de structures.

---

### ⚙️ Paramétrages de l'IHM

**Page** : `parametrage_ihm.html`

Cette page permet de gérer les **modules de configuration** de l'IHM. Chaque module définit un composant réutilisable dans les flux Amazon Connect (DNIS, Segments, etc.)

#### Comment ça marche ?

1. La page affiche un **tableau** de tous les modules existants avec leur type, nom, nombre de paramètres et actions disponibles
2. Cliquez **✏️** pour éditer un module ou **🗑️** pour le supprimer
3. Cliquez **➕ Nouveau Paramètre** pour créer un module

#### Champs disponibles dans l'éditeur

| Champ | Description |
|-------|-------------|
| **Type** | Type du paramètre (`Module`) |
| **Nom du module** | Identifiant unique (ex: `Core_Mod_MonModule`) |
| **Nombre de paramètres attendus** | Nombre de paramètres d'entrée (0 = illimité) |
| **Actions** | Liste des actions disponibles pour ce module (ajout dynamique avec ➕) |

---

### 🎙️ Gestion des Guides

**Page** : `gestion_guides.html`

Cette page gère les **groupements de guides vocaux**. Un groupement associe trois types de guides : Dissuasion, Attente et Mise en Relation. Ces groupements sont ensuite réutilisables dans les parcours.

#### Comment ça marche ?

1. La page affiche un **tableau** de tous les groupements avec leurs guides associés, chacun identifié par un badge coloré :
   - 🔴 **Dissuasion** : guide joué en message de dissuasion
   - 🔵 **Attente** : guide joué pendant l'attente
   - 🟢 **Mise en Relation** : guide(s) joué(s) lors de la connexion
2. Cliquez **✏️** pour éditer ou **🗑️** pour supprimer
3. Cliquez **➕ Nouveau Groupe** pour créer un groupement

#### Champs disponibles dans l'éditeur

| Champ | Description |
|-------|-------------|
| **Nom du Groupe** *(obligatoire)* | Identifiant unique du groupement |
| **Guide Dissuasion** | Sélection d'un guide de dissuasion (chargé via l'API Amazon Connect ✨) |
| **Guide Attente** | Sélection d'un guide d'attente (chargé via l'API Amazon Connect ✨) |
| **Guides Mise en Relation** | Sélection de **un ou plusieurs** guides MER (**multi-sélection** ✨, chargé via l'API Amazon Connect ✨) |

> **✨ Multi-sélection MER** : Comme pour les parcours, cliquez **➕** pour ajouter plusieurs guides MER et **✕** pour en supprimer.

---

## 🛠️ Architecture technique détaillée

### Vue d'ensemble : Comment ça marche ?

```
┌─────────────┐
│  Navigateur │  ← Vous arrivez ici avec votre souris
│  (Chrome,   │
│  Firefox)   │
└──────┬──────┘
       │
       │ HTTP / HTTPS
       │
┌──────▼──────────────────────────────────────┐
│  Application Web (HTML + CSS + JavaScript)   │
│  (Fichiers : calendar-editor.js, etc)       │
└──────┬──────────────────────────────────────┘
       │
       │ AWS SDK for JavaScript
       │ (Utilise les identifiants AWS)
       │
┌──────▼──────────────────────────────────────┐
│  AWS (Internet)                              │
│  ├─ STS : Valide vos identifiants           │
│  ├─ DynamoDB : Stocke les calendriers       │
│  └─ Amazon Connect : Fournit les guides     │
└──────────────────────────────────────────────┘
       │
       │
┌──────▼──────────────────────────────────────┐
│  Amazon Connect                              │
│  (Vos serveurs vocaux, flux d'appels)       │
└──────────────────────────────────────────────┘
```

### Architecture en "couches"

**Couche 1 : Présentation (HTML + CSS)**
- C'est ce que vous voyez à l'écran
- Fichiers : `calendrier_vocal.html`, `calendar-editor.html`
- Styles : `css/style.css`
- Icônes et design : SLDS (Salesforce Lightning Design System)

**Couche 2 : Interaction (JavaScript)**
- C'est ce qui "écoute" vos clics et met à jour l'écran
- Fichiers : `js/calendar-editor.js`, `js/script.js`, `js/layout.js`
- Valide les saisies (vous ne pouvez pas saisir 25:00, par exemple)
- Gère les modales, animations, etc.

**Couche 3 : Données (AWS SDK + DynamoDB + Connect)**
- C'est "l'entrepôt" où sont stockées les données
- Fichiers : `js/aws-config.js`, `js/calendars-data.js`, `js/connect-service.js`
- Utilise vos identifiants AWS pour communiquer avec Amazon
- Envoie et récupère les données depuis DynamoDB
- Récupère la liste des guides vocaux (prompts) via l'API Amazon Connect

**Couche 4 : Intégration (Amazon Connect)**
- C'est "le cerveau" qui utilise les calendriers pour décider quoi faire
- Lit les calendriers de DynamoDB
- Décide : ouvrir le service ? Le fermer ? Router vers qui ?

### Modèle de données : Organisation des calendriers

Les calendriers sont organisés en **modules** identifiés par un préfixe :

```
Cal_Vocal_Marque01          ← Module "vocal" : calendriers vocaux
Cal_Vocal_Marque02
Cal_Vocal_Marque03

Cal_Distrib_Marque01        ← Module "distribution" : routage des appels
Cal_Distrib_Marque02
Cal_Distrib_Marque03

Cal_Cible_Marque01          ← Module "cible" : cibles spécifiques
Cal_Cible_Marque02
Cal_Cible_Marque03
```

Chaque page filtre les calendriers par **module** :
- `calendrier_vocal.html` : N'affiche que `Cal_Vocal_*`
- `calendrier_distribution.html` : N'affiche que `Cal_Distrib_*`
- `calendrier_cible.html` : N'affiche que `Cal_Cible_*`

**Pourquoi ?** Pour que chaque équipe ne voit que ses propres calendriers.

---

## 📁 Structure des fichiers

### Arborescence complète

```
IHM/
├── README.md                          ← Vous êtes ici !
├── CLAUDE.md                          ← Instructions pour l'IA Claude
├── ANALYSE_AWS_SOURCES.md             ← Analyse détaillée des sources AWS
├── PERIODE_REMOVAL_REPORT.md          ← Rapport de suppression Période
├── .gitignore                         ← Fichiers à ne pas versionner
│
├── 📄 Pages HTML (racine)
│   ├── index.html                     ← Page d'accueil
│   ├── login.html                     ← Écran de connexion
│   ├── calendrier_vocal.html          ← Gestion calendrier vocal
│   ├── calendrier_distribution.html   ← Gestion calendrier distribution
│   ├── calendrier_cible.html          ← Gestion calendrier cible
│   ├── parametrage_dnis.html          ← Configuration DNIS (numéros)
│   ├── parametrage_parcours.html      ← Paramétrage des parcours d'appels
│   ├── parametrage_segments.html      ← Paramétrage des segments de ciblage
│   ├── parametrage_structures.html    ← Paramétrage centralisé des structures
│   ├── parametrage_ihm.html           ← Paramétrage de l'IHM (modules)
│   └── gestion_guides.html            ← Gestion des groupements de guides vocaux
│
├── 📁 components/                     ← Composants HTML réutilisables
│   ├── header.html                    ← En-tête de l'application
│   ├── sidebar.html                   ← Menu latéral de navigation
│   └── help-modal.html                ← Modale d'aide contextuelle
│
├── 📁 css/                            ← Styles de l'application
│   ├── style.css                      ← Personnalisations (couleurs, fonts)
│   └── salesforce-lightning-design-system.min.css  ← SLDS (framework CSS)
│
├── 📁 js/                             ← Code JavaScript
│   ├── auth-guard.js                  ← Vérifie la connexion (charge EN PREMIER)
│   ├── aws-config.js                  ← Configure AWS SDK
│   ├── login.js                       ← Gère la connexion/déconnexion
│   ├── layout.js                      ← Injecte le menu dans toutes les pages
│   ├── script.js                      ← Interactivités globales (menus, modales)
│   ├── utils.js                       ← Fonctions utilitaires (toasts, helpers)
│   ├── dynamodb-service.js            ← Service centralisé CRUD DynamoDB
│   ├── calendars-data.js              ← Récupère les calendriers depuis DynamoDB
│   ├── calendar-editor.js             ← Éditeur de calendriers (le plus complexe)
│   ├── dnis-manager.js                ← Gestion des numéros DNIS
│   ├── parcours-manager.js            ← Gestion des parcours d'appels
│   ├── segments-manager.js            ← Gestion des segments de ciblage
│   ├── structure-manager.js           ← Gestion centralisée des structures
│   ├── ihm-manager.js                 ← Paramétrage de l'IHM (modules)
│   ├── connect-service.js             ← Service API Amazon Connect ✨
│   └── guides-manager.js              ← Gestion des groupements de guides vocaux
│
├── 📁 help/                           ← Guides d'aide HTML
│   ├── guide-calendrier.html          ← Guide détaillé calendriers
│   ├── guide-dnis.html                ← Guide détaillé DNIS
│   ├── guide-segments.html            ← Guide détaillé segments
│   └── guide-structures.html          ← Guide détaillé structures
│
├── 📁 news/                           ← Système de bandeau d'infos
│   └── news.js                        ← Affiche les actualités
│
├── 📁 fonts/                          ← Polices personnalisées (Khand, HP, Rajdhani)
│
└── 📁 img/                            ← Images et icônes
    ├── logo.png
    ├── logosmall.png
    └── favicon.png
```

### Fichiers à connaître absolument

| Fichier | Priorité | Responsabilité |
|---------|----------|------------------|
| `auth-guard.js` | ⭐⭐⭐ | **Charge EN PREMIER** - Redirige vers login si pas connecté |
| `aws-config.js` | ⭐⭐⭐ | Configure AWS SDK, gère les erreurs AWS |
| `dynamodb-service.js` | ⭐⭐⭐ | Service centralisé pour toutes les opérations DynamoDB (CRUD) |
| `connect-service.js` | ⭐⭐⭐ | **Service API Amazon Connect** - Liste les guides vocaux (prompts) |
| `calendar-editor.js` | ⭐⭐⭐ | Le cœur : affiche/modifie les calendriers |
| `layout.js` | ⭐⭐ | Injecte le menu et le header dans toutes les pages |
| `utils.js` | ⭐⭐ | Fonctions utilitaires partagées (toasts, helpers) |
| `calendars-data.js` | ⭐⭐ | Récupère les calendriers depuis DynamoDB |
| `script.js` | ⭐⭐ | Interactivités globales (menus mobiles, modales d'aide) |
| `login.js` | ⭐⭐ | Valide les identifiants et crée la session |
| `dnis-manager.js` | ⭐ | Gestion CRUD des numéros DNIS |
| `parcours-manager.js` | ⭐ | Gestion des parcours d'appels avec étapes |
| `segments-manager.js` | ⭐ | Gestion des segments avec modules Pre/Post Ciblage |
| `structure-manager.js` | ⭐ | Paramétrage centralisé avec filtres en cascade |
| `guides-manager.js` | ⭐ | Gestion des groupements de guides vocaux |
| `ihm-manager.js` | ⭐ | Paramétrage des modules de l'IHM |

---

## ⚙️ Comment fonctionne chaque composant

### 1️⃣ `auth-guard.js` : Le vigile

**Charge EN PREMIER sur chaque page** pour vérifier que vous êtes connecté.

```
Si vous n'êtes PAS connecté :
  → Redirige vers login.html

Si vous ÊTES connecté :
  → Continue le chargement de la page
```

**À ne pas modifier** à moins de vraiment comprendre la sécurité !

---

### 2️⃣ `aws-config.js` : La traduction

Configure le **AWS SDK for JavaScript** pour communiquer avec Amazon.

```javascript
// Lit vos identifiants depuis sessionStorage (pas dans le code!)
// Configure la région (eu-west-3 pour nous)
// Crée des clients AWS (STS, DynamoDB)
// Fournit handleAWSError() pour gérer les erreurs
```

**Utilité** : Quand le code dit "je veux lire la base de données", c'est `aws-config.js` qui traduit ça en "langage AWS".

---

### 3️⃣ `login.js` : L'authentificateur

Valide vos identifiants et crée une session.

```
1. Vous rentrez votre Access Key, Secret Key, Region
2. login.js les envoie à AWS (via STS GetCallerIdentity)
3. AWS répond : "Ok, c'est bon!" ou "Pas bon!"
4. Si c'est bon :
   → Les identifiants sont stockés dans sessionStorage
   → Vous êtes redirigé vers index.html
5. Si c'est pas bon :
   → Message d'erreur : "Identifiants incorrects"
```

---

### 4️⃣ `layout.js` : Le magicien

"Injecte" automatiquement le même menu et header sur **toutes les pages**.

```html
<!-- Avant (ce que vous écrivez) -->
<div id="layout-header"></div>    ← Placeholder vide
<div id="layout-sidebar"></div>   ← Placeholder vide

<!-- Après (ce que layout.js fait) -->
<div id="layout-header">
  ┌─────────────────┐
  │ IHM Calendrier  │
  │ Déconnexion     │
  └─────────────────┘
</div>

<div id="layout-sidebar">
  ┌─────────────────┐
  │ Calendrier Vocal│
  │ Distribution    │
  │ Cible           │
  │ DNIS            │
  └─────────────────┘
</div>
```

**Avantage** : Vous modifiez le menu une seule fois dans `layout.js` et c'est changé partout.

---

### 5️⃣ `calendars-data.js` : Le chercheur

Récupère **tous les calendriers disponibles** depuis DynamoDB.

```javascript
// Appelle AWS DynamoDB
// Récupère tous les éléments avec le bon préfixe (Cal_Vocal_*, etc)
// Les retourne à calendar-editor.js
// Remplit le menu déroulant "Choisir un calendrier"
```

---

### 6️⃣ `calendar-editor.js` : Le cœur complexe

C'est le composant le plus important et le plus complexe.

**Ce qu'il fait** :
```
1. Récupère le calendrier sélectionné
2. Affiche les 7 jours de la semaine
3. Affiche les créneaux horaires existants
4. Affiche les périodes (vacances, etc)
5. Affiche les exceptions (jours spéciaux)
6. Écoute vos clics sur les boutons
7. Valide les horaires (ex: fin avant début = erreur)
8. Gère le **Type** de calendrier (Vocal ou Distribution)
9. Sauvegarde dans DynamoDB quand vous cliquez "Sauvegarder"
10. Gère les couleurs (bleu, orange, etc.) selon l'état
```

**Fonctions principales** :
```javascript
renderWeeklyEditor()      // Affiche la semaine type
renderExceptionsEditor()  // Affiche les exceptions
addSlot()                 // Ajoute un créneau
deleteSlot()              // Supprime un créneau
saveCalendar()            // Sauvegarde tout dans DynamoDB
```

---

### 7️⃣ `script.js` : Les petits détails

Gère les éléments "mineurs" mais importants :
```javascript
// Menu mobile : affiche/cache le menu sur mobile
// Bandeau d'actualités : affiche les news
// Bouton d'aide (?) : ouvre la modale d'aide
// Déconnexion : efface la session
// Notifications : "✅ Sauvegarde réussie" en vert
```

---

### 8️⃣ `dnis-manager.js` : Le gestionnaire de numéros

Gère les numéros de téléphone (DNIS = Direct Inward Dialing).

```
DNIS = les numéros de téléphone attachés à chaque calendrier
Exemple :
  - 01 23 45 67 89 → Calendrier Vocal Marque 01
  - 01 23 45 67 90 → Calendrier Distribution Marque 01
```

Vous pouvez ajouter/modifier/supprimer des DNIS depuis `parametrage_dnis.html`. L'interface utilise des menus déroulants pour les champs récurrents (Marque, Domaine, Sous-Domaine) afin de garantir la cohérence des données. Le drag-and-drop permet de réorganiser les modules.

---

### 9️⃣ `dynamodb-service.js` : Le service centralisé

Couche d'abstraction pour toutes les opérations DynamoDB. Toutes les pages utilisent ce service via `window.dynamoDBService`.

```javascript
// Opérations disponibles :
window.dynamoDBService.scan(tableName)         // Lister tous les items
window.dynamoDBService.get(tableName, key)     // Lire un item
window.dynamoDBService.put(tableName, item)    // Créer/mettre à jour
window.dynamoDBService.delete(tableName, key)  // Supprimer
```

**Avantage** : Gestion centralisée des erreurs, logging, et configuration AWS.

---

### 🔟 `utils.js` : Les utilitaires partagés

Fonctions utilitaires utilisées par toutes les pages :
```javascript
window.showToast("Message", 'success');  // Notifications (success, error, info)
```

Remplace l'ancien système `showNotification` par un système de toasts unifié.

---

### 1️⃣1️⃣ `parcours-manager.js` : Les parcours d'appels

Gère les parcours complets d'un appel (séquence de traitement). Chaque parcours définit :
- Une **Action** (ex: Appelant, Queuing)
- Des **Guides vocaux** : Dissuasion, Attente, et Mise en Relation
- Des **Étapes** ordonnées (séquence de traitement)
- Un **Groupement** de guides pour simplifier la sélection

> **Multi-sélection MER** : Les Guides Mise en Relation supportent la sélection multiple avec un bouton ➕ pour ajouter des guides et ✕ pour les supprimer. Les données sont stockées en tableau JSON dans DynamoDB.

---

### 1️⃣2️⃣ `guides-manager.js` : Les groupements de guides

Gère les groupements de guides vocaux (Dissuasion, Attente, Mise en Relation). Permet de créer des ensembles prédéfinis de guides réutilisables dans les parcours.

> **Multi-sélection MER** : Comme pour les parcours, les Guides Mise en Relation supportent la sélection multiple.

---

### 1️⃣3️⃣ `segments-manager.js` : Les segments de ciblage

Gère les segments de distribution des appels avec modules Pre/Post Ciblage. Chaque segment définit les règles de routage vers les équipes appropriées.

---

### 1️⃣4️⃣ `structure-manager.js` : Le pilote des structures

Gère le paramétrage centralisé des structures avec un système de **filtres en cascade** (Marque > Domaine > Sous-Domaine) pour faciliter la recherche parmi un grand nombre de configurations.

---

### 1️⃣5️⃣ `ihm-manager.js` : Le paramétrage IHM

Gère les modules de configuration de l'IHM elle-même (types de modules, paramètres d'affichage, options de configuration).

---

## 🔄 Flux de données

### Scénario 1 : Vous accédez à la page pour la première fois

```
1. Vous tapez http://localhost:8000/calendrier_vocal.html

2. Le navigateur charge :
   └─ calendrier_vocal.html (structure)

3. auth-guard.js s'exécute
   └─ Si pas connecté → Redirige vers login.html
   └─ Si connecté → Continue

4. Les fichiers JS se chargent :
   ├─ aws-config.js → Configure AWS
   ├─ layout.js → Injecte le menu
   └─ calendars-data.js → Récupère les calendriers

5. calendar-editor.js s'exécute :
   ├─ Récupère le liste des calendriers (Cal_Vocal_Marque01, etc)
   ├─ Remplit le menu déroulant
   ├─ Quand vous sélectionnez un calendrier :
   │  ├─ Récupère les détails depuis DynamoDB
   │  ├─ Appelle renderWeeklyEditor()
   │  └─ Appelle renderExceptionsEditor()
   │
   └─ L'écran affiche les 7 jours avec les horaires

6. Vous voyez la page !
```

### Scénario 2 : Vous modifiez un créneau horaire

```
1. Vous cliquez le bouton ✏️ Éditer

2. calendar-editor.js affiche la modale d'édition

3. Vous ajoutez un créneau : ➕ Créneau

4. addSlot() s'exécute :
   ├─ Crée un nouveau champ de saisie horaire
   ├─ L'ajoute à la liste en mémoire
   └─ L'affiche sur l'écran

5. Vous rentrez les horaires (ex: 09:00 - 18:00)

6. Vous cliquez SAUVEGARDER

7. saveCalendar() s'exécute :
   ├─ Valide que fin > début
   ├─ Valide qu'il n'y a pas de chevauchement
   ├─ Construit l'objet "Jour" pour DynamoDB
   ├─ Appelle dynamodb.put()
   │  └─ Envoie une requête HTTPS à AWS
   │  └─ AWS reçoit et sauvegarde dans DynamoDB
   ├─ AWS répond : "OK, c'est sauvé!"
   │
   ├─ showNotification("✅ Sauvegarde réussie", 'success')
   │  └─ Affiche une notification verte
   │
   └─ Ferme la modale

8. Les données sont maintenant dans DynamoDB

9. Amazon Connect lit ces données et les utilise immédiatement
```

---

## 📐 Conventions de code

### Nommage des variables

```javascript
// ✅ BON
let calendarId = "Cal_Vocal_Marque01";
let userAccessKey = "AKIA...";
let isCalendarOpen = true;

// ❌ MAUVAIS
let cid = "Cal_Vocal_Marque01";
let x = "AKIA...";
let open = true;
```

**Règle** : Variables en `camelCase`, noms explicites, pas d'abréviations.

### Nommage des fichiers

```
✅ BON
js/calendar-editor.js
js/calendars-data.js
css/style.css
html/parametrage_dnis.html

❌ MAUVAIS
js/calendarEditor.js
js/data.js
css/styles.css
html/DNIS.html
```

**Règle** : Fichiers en `kebab-case` (tirets), pas de camelCase.

### Structure HTML

```html
<!-- ✅ BON : Structure claire -->
<div id="layout-header"></div>
<div id="layout-sidebar"></div>
<main class="main-content">
  <section id="calendar-editor">
    <button onclick="saveCalendar()">Sauvegarder</button>
  </section>
</main>

<!-- ❌ MAUVAIS : Structure confuse -->
<div id="header"></div>
<div id="side"></div>
<div id="x">
  <div onclick="save()">Save</div>
</div>
```

### Commentaires

```javascript
// ✅ BON : Explique le WHY, pas le WHAT
// Si le jour est dimanche, pas de bouton pour copier vers le jour suivant
if (day !== 'Dimanche') {
    // Affiche le bouton de copie
}

// ❌ MAUVAIS : Explique le WHAT (le code le dit déjà)
// Vérifier que day n'est pas égal à 'Dimanche'
if (day !== 'Dimanche') {
    // Code ici
}
```

### Fonctions AWS

```javascript
// ✅ BON : Utilise handleAWSError()
const params = { TableName: 'Core_Ddb_Calendriers', Key: { id_Calendar: id } };
try {
    const data = await dynamodb.get(params).promise();
    return data.Item;
} catch (err) {
    console.error("Erreur:", err);
    if (typeof handleAWSError === 'function') {
        handleAWSError(err);  // Gestion centralisée
    }
}

// ❌ MAUVAIS : Pas d'accès AWS valide
const data = await fetch('/api/calendar/' + id);  // API inexistante
```

---

## 🔒 Sécurité et gestion des identifiants

### ⚠️ RÈGLE D'OR : Les identifiants AWS ne vont JAMAIS dans le code !

### Où SONT stockés les identifiants

```javascript
// ✅ CORRECT : Dans sessionStorage (temporaire, en mémoire)
window.sessionStorage.setItem('aws_access_key', userInput);
```

**Pourquoi sessionStorage ?**
- Les données disparaissent quand vous fermez l'onglet
- Les données sont isolées par onglet (pas de croisement)
- Les données restent disponibles pour la session

### Où NE SONT PAS stockés les identifiants

```javascript
// ❌ DANGEREUX : JAMAIS dans le code source
const ACCESS_KEY = "AKIA123456...";  // DANGER!

// ❌ DANGEREUX : JAMAIS dans localStorage (persiste)
localStorage.setItem('access_key', key);  // DANGER!

// ❌ DANGEREUX : JAMAIS dans .env commité
AWS_ACCESS_KEY=AKIA123456...  # DANGER!

// ❌ DANGEREUX : JAMAIS en commentaire
// Old access key: AKIA123456...  # DANGER!
```

### Flux d'authentification sécurisé

```
1. Page de login.html
   ↓
2. Vous rentrez vos identifiants
   ↓
3. login.js envoie une requête AWS (STS GetCallerIdentity)
   Pour vérifier que les identifiants sont valides
   ↓
4. AWS vérifie et répond OK/NOK
   ↓
5. Si OK :
   └─ Stockage dans sessionStorage
   └─ Ferme la modal de login
   └─ Page peut utiliser aws-config.js pour appeler DynamoDB

6. Si NOK :
   └─ Message d'erreur
   └─ Vous restez sur la page de login
```

### En cas de problème

**Mon accès AWS a été compromis !**
1. Allez sur la console AWS immédiatement
2. Désactivez la clé d'accès compromise
3. Créez une nouvelle clé d'accès
4. Informez immédiatement votre manager

---

## 🐛 Dépannage et problèmes courants

### Problème 1 : "Erreur de connexion : Identifiants invalides"

**Causes possibles** :
1. Access Key ou Secret Key mal saisi(e)
2. Identifiants expirés (changés par l'administrateur)
3. Région incorrecte (ce ne devrait pas être le cas, ce devrait toujours être `eu-west-3`)

**Solutions** :
```
1. Vérifie que tu as copié-collé correctement (pas d'espaces)
2. Demande à ton manager de vérifier si la clé est active
3. Demande à ton manager la région correcte
```

---

### Problème 2 : "La page est blanche, rien ne s'affiche"

**Causes possibles** :
1. JavaScript est désactivé dans le navigateur
2. Les fichiers JS n'ont pas pu charger
3. Une erreur JavaScript "casse" la page

**Solutions** :
```
1. Ouvre la Console du Navigateur (F12 ou Cmd+Option+I)
2. Cherche des messages rouges d'erreur
3. Si tu vois "auth-guard.js:10 Error: Not authenticated"
   → Tu n'es pas connecté, va sur login.html
4. Si tu vois une autre erreur, note-la et demande à ton manager
```

---

### Problème 3 : "Je clique sur Sauvegarder mais rien ne se passe"

**Causes possibles** :
1. Une erreur de validation (horaires impossibles, etc)
2. Pas d'accès AWS à DynamoDB
3. Erreur de connexion Internet

**Solutions** :
```
1. Ouvre la Console (F12)
2. Cherche les messages rouges
3. Si le message dit "Accès refusé"
   → Ton manager doit t'ajouter les permissions sur DynamoDB
4. Si le message parle d'horaires
   → Vérifie que l'heure de fin > heure de début
```

---

### Problème 4 : "Je suis déconnecté au bout de 5 minutes"

C'est NORMAL ! Les identifiants AWS sont stockés dans `sessionStorage` qui :
- S'efface quand vous fermez l'onglet
- S'efface après un certain temps d'inactivité

**Solution** :
```
Reconnectez-vous avec vos identifiants AWS
```

---

### Problème 5 : "Les modifications ne s'appliquent pas à Amazon Connect"

**Causes possibles** :
1. Vous avez cru avoir sauvegardé mais vous ne l'avez pas fait
2. Délai de propagation (AWS met quelques secondes à synchroniser)
3. Les flux Amazon Connect pointent vers une mauvaise table DynamoDB

**Solutions** :
```
1. Vérifiez la notification verte "✅ Sauvegarde réussie"
2. Attendez 30 secondes
3. Si ça ne marche toujours pas, demandez à votre manager
   de vérifier la configuration Amazon Connect
```

---

### Problème 6 : Erreurs JavaScript dans la console

Si tu vois une erreur et ne sais pas quoi faire :

```
1. Recopie le message entier de l'erreur
2. Demande à un senior : "Est-ce normal ?"
3. Si c'est pas normal, c'est peut-être un bug
   (voir section "Contribuer")
```

---

## 🤝 Contribution et développement

### Je pense avoir trouvé un bug. Que faire ?

#### Étape 1 : Reproduisez le bug

```
1. Réappliquez les étapes qui causent le bug
2. Notez exactement ce qui se passe
3. Notez ce qui devrait se passer
```

#### Étape 2 : Vérifiez que c'est vraiment un bug

```
Demandez-vous :
- Est-ce que c'est dans la documentation / les règles métier ?
- Est-ce un comportement intentionnel ?
- Ou est-ce vraiment inattendu ?
```

#### Étape 3 : Documenter le bug

```
Créez un document avec :
- Titre explicite : "Impossibilité de modifier le créneau du lundi"
- Étapes pour reproduire : "1. Aller sur Calendrier Vocal. 2. Sélectionner Cal_Vocal_Marque01. 3. Cliquer Éditer..."
- Comportement observé : "Erreur : Horaires invalides"
- Comportement attendu : "Modification devrait être acceptée"
- Capture d'écran ou vidéo
```

#### Étape 4 : Signalez à un senior

```
Donnez le document à un senior qui examinera et :
- Confirmera que c'est un bug
- L'ajoutera à la liste de tâches
```

---

### Je veux faire une petite correction. Comment faire ?

**Pour les petits changements (typos, petits bugs)** :

```bash
# 1. Créez une branche pour votre modification
git checkout -b fix/mon-correction

# 2. Modifiez le fichier avec votre éditeur

# 3. Testez localement (http://localhost:8000)

# 4. Vérifiez vos changements
git status
git diff

# 5. Commitez avec un message explicite
git add .
git commit -m "Correction : Masquer le bouton flèche le dimanche"

# 6. Poussez vers le serveur
git push origin fix/mon-correction

# 7. Créez une Pull Request sur GitHub
# (Un senior examinera et approuvera)
```

---

### Je veux ajouter une nouvelle fonctionnalité. Comment faire ?

**Pour les nouvelles fonctionnalités importantes** :

```bash
# 1. Discutez d'abord avec votre manager/senior
# "Je veux ajouter... Est-ce que c'est prioritaire ?"

# 2. Lisez la section "Architecture technique" du CLAUDE.md
git show HEAD:CLAUDE.md | head -100

# 3. Créez une branche pour votre fonctionnalité
git checkout -b feature/nouvelle-fonctionnalite

# 4. Modifiez les fichiers nécessaires

# 5. Testez COMPLÈTEMENT
# - Login
# - Navigation
# - Modifications de calendrier
# - Sauvegarde
# - Consultez la console (F12) pour les erreurs

# 6. Commitez avec un message explicite
git add .
git commit -m "Ajout : Nouvelle fonctionnalité pour..."

# 7. Poussez et créez une Pull Request
git push origin feature/nouvelle-fonctionnalite
```

---

### Standards de code

Avant de committer, vérifiez :

- ✅ Pas d'erreurs dans la console (F12)
- ✅ Le code suit les conventions (camelCase, commentaires utiles)
- ✅ Vous avez testé tous les cas possibles
- ✅ Vous n'avez pas compromis de sécurité (pas d'identifiants en dur)
- ✅ Les anciens tests passent toujours
- ✅ Le message de commit est explicite

---

### Ressources pour apprendre

**Documents à lire** :
- `CLAUDE.md` : Instructions techniques détaillées
- `help/guide-calendrier.html` : Guide utilisateur calendriers avec visuels
- `help/guide-dnis.html` : Guide DNIS avec visuels
- `help/guide-segments.html` : Guide segments
- `help/guide-structures.html` : Guide structures

**Technologie à apprendre** :
- HTML / CSS / JavaScript vanilla (https://developer.mozilla.org)
- AWS SDK for JavaScript (https://docs.aws.amazon.com/sdk-for-javascript/)
- DynamoDB basics (https://docs.aws.amazon.com/dynamodb/)

**Outils à maîtriser** :
- Git et GitHub (pour versionner le code)
- Navigateur Developer Tools (F12) pour déboguer
- Terminal/Command Prompt pour lancer le serveur

---

## 📞 Support et questions

Si vous avez des questions :

1. **Questions techniques** : Demandez à un senior ou un développeur
2. **Questions métier** : Demandez à votre manager
3. **Questions de sécurité** : Demandez à l'administrateur AWS

Bienvenue dans l'équipe ! Vous allez faire du bon travail ! 🚀
