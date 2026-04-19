# ABE_GetCalendar - Module de Gestion Calendrier

Ce module permet de déterminer le statut d'un service (ouverture, pré-fermeture, ou fermeture) en fonction d'un calendrier complexe stocké dans DynamoDB.
Retourne des statuts détaillés: Ouvert, OuvertSansAttente, PreFermeture, Ferme, FermetureExceptionnelle, FermetureHebdomadaire, FermetureJourFerie.

## 📋 Fonctionnalités Principales

*   **Multi-Calendriers** : Gestion par `id_Calendar`.
*   **Timezone** : Support des fuseaux horaires (ex: `Europe/Paris`).
*   **Priorité Intelligente** : Gestion des conflits entre horaires standards et jours exceptionnels.
*   **Simulation** : Capacité de simuler une date/heure spécifique via le paramètre `Date_Simulation` pour les tests recette.

## ⚙️ Entrées / Sorties

### Entrées (Evenement Amazon Connect)
La Lambda attend les attributs suivants dans `Details.ContactData.Attributes` :

| Attribut | Obligatoire | Description |
| :--- | :--- | :--- |
| `Id_Calendrier` | **OUI** | Clé de partition pour retrouver la config dans DynamoDB (ex: `Cal_GMF_01`). |
| `Date_Simulation` | NON | Date de simulation au format ISO (ex: `2025-12-25T10:00:00`). Si présent, surcharge l'heure système. |

### Sorties (Return)
Un objet JSON contenant :

| Champ | Description |
| :--- | :--- |
| `Status` | Statut du service: `Ouvert`, `OuvertSansAttente`, `PreFermeture`, `Ferme`, `FermetureExceptionnelle`, `FermetureHebdomadaire`, ou `FermetureJourFerie`. |
| `Reason` | (Optionnel) Raison de la fermeture en cas d'erreur (ex: `NotFound`). |

**Types d'Ouverture Reconnus:**
- `Ouvert`: Service ouvert normalement, file d'attente active
- `OuvertSansAttente`: Service ouvert mais sans mise en attente (urgences seulement)
- `PreFermeture`: Service en fermeture progressive (proche de la fermeture)

**Motifs de Fermeture Reconnus:**
- `Ferme`: Service fermé standard
- `FermetureExceptionnelle`: Fermeture exceptionnelle (maintenance, urgence)
- `FermetureHebdomadaire`: Fermeture habituelle d'une journée de semaine (ex: Dimanche)
- `FermetureJourFerie`: Jour férié ou public holiday

---

## 📅 Structure du Calendrier (JSON DynamoDB)

Le format du calendrier stocké en base est complexe. Voici un exemple complet pour référence :

```json
{
 "id_Calendar": "Cal_GMF_01",
 "Jour": {
  "Dimanche": {
   "00:00-23:59": { "Status": "Fermé" }
  },
  "Lundi": {
   "00:00-08:00": { "Status": "Fermé" },
   "08:00-18:00": { "Status": "Ouvert" },
   "18:00-23:59": { "Status": "Fermé" }
  }
 },
 "JourExceptionnel": {
  "01/05/2026": {
   "Label": "Fête du Travail",
   "Slots": {
    "00:00-23:59": { "Status": "Fermé" }
   }
  }
 },
 "TimeZone": "Europe/Paris"
}
```

---

## 🚀 Logique de Priorité (Règles Métier)

L'ordre de vérification est strict pour garantir que les fermetures exceptionnelles ou hebdomadaires soient respectées.

1.  **JOUR EXCEPTIONNEL (Priorité 1 - Absolue)**
    *   Vérifie si la date du jour (JJ/MM/AAAA) existe dans la liste `JourExceptionnel`.
    *   *Usage* : Pour les jours fériés spécifiques ou ouvertures exceptionnelles (ex: Dimanche avant Noël).

2.  **FERMETURE TOTALE HEBDOMADAIRE (Priorité 2)**
    *   Vérifie si le jour de la semaine standard (Lundi...Dimanche) est configuré comme **Fermé 24h/24** (Slot `00:00-23:59` à `Ferme`).
    *   *Comportement* : Si le jour habituel est fermé totalement, il le reste.
    *   *Exemple* : Si le Dimanche est fermé tout le temps, il le restera sauf si une Exception explicite est créée (Règle 1).

3.  **SEMAINE STANDARD (Priorité 3)**
    *   Si aucune règle précédente ne s'applique, utilise les horaires classiques définis dans `Jour` (Lundi, Mardi...).

---

## ⚠️ Subtilités & Attention

*   **Nom des Clés DynamoDB** :
    *   Assurez-vous que les clés JSON sont exactement : `Jour`, `JourExceptionnel`, `TimeZone`.
*   **Format des Heures** :
    *   Format `HH:MM-HH:MM` (ex: `08:00-12:00`).
    *   La fin de journée est `23:59` (pas de `24:00`).
    *   Plage valide: `00:00` à `23:59`.
*   **Timezone** :
    *   Par défaut `Europe/Paris` si non spécifié.
    *   Si la machine AWS est en UTC, la conversion est faite automatiquement grâce à la clé `TimeZone` de la base.
*   **Date_Simulation** :
    *   Format `(Année complète)-(Mois numéroté de 0 à 12)-(Jour du mois 01-31) (Heure 24h):(Minute 00-59):(Secondes 00-59).(Microsecondes 000000-999999)(Décalage UTC)` `2025-12-25 15:00:00.000000+01:00`.

## ☁️ Configuration AWS Lambda

Cette fonction dépend d'une configuration spécifique dans la console AWS Lambda.

### Variables d'Environnement
| Clé | Valeur Exemple | Description |
| :--- | :--- | :--- |
| `CALENDAR_TABLE_NAME` | `ABE_Calendar` | Nom de la table DynamoDB contenant les calendriers. |
| `LOGGER_LEVEL` | `INFO` | Niveau de détail des logs CloudWatch (INFO ou DEBUG). |

### Layers (Code Partagé)
Cette Lambda utilise la Layer **`ABE_Layers`** qui contient les dépendances partagées :
*   `constants.py`
*   `utils.py`

> [!IMPORTANT]
> **Gestion des Versions Layer** : Si vous modifiez le code dans `ABE_Layers`, vous devez publier une nouvelle version de la Layer **ET** mettre à jour la configuration de cette Lambda pour qu'elle pointe vers cette nouvelle version (numéro de version incrémenté).
>
> **Structure du ZIP** : Pour que les imports fonctionnent (`from utils import ...`), l'archive ZIP de la Layer doit impérativement contenir un dossier `python/` à la racine :
> ```text
> mon-archive-layer.zip
> └── python/
>     ├── constants.py
>     └── utils.py
> ```