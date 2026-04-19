# Core_Lbd_CollecteParametrage

**Créateur :** Afid BENAYAD  
**Date de création :** 15/12/2025  
**Version :** 1.2  

## Description

Cette Lambda est le **point d'entrée du flux d'appel Amazon Connect**. Elle récupère l'ensemble des paramètres de configuration associés à un numéro DNIS (numéro composé par l'appelant) depuis une table DynamoDB, et les retourne au flux Connect pour piloter dynamiquement le comportement de l'appel.

Elle agit comme le cerveau initial du flux : sans elle, le flux ne sait pas quelle marque, quel calendrier, quels modules ou quelle voix utiliser.

---

## Dépendances et configuration

### Layer partagé

Cette Lambda utilise un **Layer AWS** contenant les dépendances partagées :

| Fichier | Rôle |
|---------|------|
| `utils.py` | Fournit la fonction `configure_logger()` pour initialiser les logs |
| `constants.py` | Fournit les constantes partagées (ex: `LOG_LEVEL_INFO`) |
| `attacheDataList.py` | Fournit la liste `UD` des attributs obligatoires à attacher |

> Le ZIP du layer doit impérativement contenir un dossier `python/` à la racine pour que les imports fonctionnent :
> ```
> mon-archive-layer.zip
> └── python/
>     ├── constants.py
>     ├── utils.py
>     └── attacheDataList.py
> ```
> Si vous modifiez le layer, publiez une nouvelle version et mettez à jour la Lambda pour qu'elle pointe vers cette nouvelle version.

### Variables d'environnement

| Variable | Exemple | Description |
|----------|---------|-------------|
| `PARAM_DNIS_TABLE_NAME` | `Core_Ddb_CollecteParametrage` | Nom de la table DynamoDB contenant les paramétrages DNIS |
| `LOGGER_LEVEL` | `INFO` | Niveau de détail des logs CloudWatch (`INFO` ou `DEBUG`) |

---

## Table DynamoDB source

La Lambda interroge la table définie dans `PARAM_DNIS_TABLE_NAME`.

**Clé primaire :** `Dnis` (String) — numéro de téléphone au format E.164 (ex: `+33159241926`)

### Colonnes attendues dans la table

| Colonne | Type | Description |
|---------|------|-------------|
| `Dnis` | String | Clé primaire — numéro de téléphone composé |
| `Marque` | String | Nom de la marque/service (ex: GMF, MAAF) |
| `Domaine` | String | Domaine de l'interaction (ex: ASA, Indemnisation, Commerce) |
| `SousDomaine` | String | Sous-domaine (ex: Auto MAT, Auto IRD) |
| `id_Calendar` | String | Identifiant du calendrier à interroger |
| `Signification` | String | Signification du numéro (ex: Indigo, Agence) — équivalent à `Id_Flux` |
| `Modules` | List | Liste des modules à exécuter pendant l'appel |
| `Annonces` | List | Liste des fichiers audio d'accueil |
| `Ani_Simulation` | String | Numéro d'appelant simulé (pour les tests) |
| `Date_Simulation` | String | Date/heure forcée pour le module Calendrier (pour les tests) |
| `Logger_Actif` | Boolean | Active ou désactive les logs CloudWatch |
| `Voix_Acteur` | String | Nom de la voix Amazon Polly (ex: Mathieu) |

---

## Entrées / Sorties

### Entrée — Événement Amazon Connect

La Lambda reçoit l'événement standard Amazon Connect. Elle en extrait :

| Champ | Chemin dans l'événement | Description |
|-------|------------------------|-------------|
| `input` | `Details.Parameters.input` | Numéro DNIS à rechercher (défaut: `+33159241926`) |
| `instanceId` | `Details.ContactData.Tags.aws:connect:instanceId` | ID de l'instance Connect (fallback sur l'ARN si absent) |

### Sortie — Objet retourné au flux Connect

La Lambda retourne un objet JSON plat, directement utilisable par les blocs **"Set Contact Attributes"** dans Amazon Connect.

| Clé | Description | Valeur par défaut |
|-----|-------------|-------------------|
| `Dnis` | Numéro DNIS | — |
| `Marque` | Nom de la marque/service | `""` |
| `Domaine` | Domaine de l'interaction | `""` |
| `SousDomaine` | Sous-domaine de l'interaction | `""` |
| `id_Calendar` | ID du calendrier à interroger | `""` |
| `Signification` | Signification du numéro | `""` |
| `Modules` | Liste des modules (sérialisée en String JSON) | `"[]"` |
| `ModulesLength` | Nombre de modules dans la liste | `"0"` |
| `Annonces` | Liste des fichiers audio (sérialisée en String JSON) | `"[]"` |
| `Ani_Simulation` | Numéro d'appelant simulé | `""` |
| `Date_Simulation` | Date/heure forcée pour les tests | `""` |
| `Logger_Actif` | Flag d'activation des logs | `"False"` |
| `Voix_Acteur` | Voix Amazon Polly | `"Mathieu"` |

> Les champs de type `List` ou `Dict` sont automatiquement sérialisés en **String JSON** (avec `json.dumps`) pour être compatibles avec Amazon Connect qui ne supporte que les valeurs textuelles dans les attributs de contact.

---

## Fonctions

### `lambda_handler(event, context)`

Point d'entrée principal de la Lambda, déclenché par Amazon Connect.

**Étapes d'exécution :**

1. Affiche la version de Boto3 utilisée (utile pour vérifier le layer)
2. Extrait le paramètre `input` (DNIS) depuis l'événement
3. Extrait l'`instanceId` depuis les tags — si absent, le déduit depuis l'ARN de l'instance
4. Interroge la table DynamoDB avec une requête sur la clé `Dnis`
5. Si trouvé : construit l'objet résultat en sérialisant les types complexes
6. Calcule le champ additionnel `ModulesLength` si le champ `Modules` est présent
7. Si non trouvé : lève une exception pour déclencher la branche "Error" dans Connect
8. Retourne l'objet résultat au flux Connect

```python
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, str]
```

**Flux d'exécution :**

```
lambda_handler(event, context)
    │
    ├─ Extraction de "input" (DNIS) depuis event.Details.Parameters
    ├─ Extraction de "instanceId" depuis Tags ou ARN
    │
    ├─ DynamoDB.query(KeyConditionExpression: Dnis = index)
    │       ├─ Items trouvés
    │       │       ├─ Sérialisation des types (List/Dict → json.dumps, autres → str)
    │       │       ├─ Calcul de ModulesLength
    │       │       └─ Retour du résultat
    │       │
    │       └─ Aucun item → raise Exception → branche "Error" dans Connect
    │
    └─ En cas d'erreur → log + raise (propagation vers Connect)
```

---

## Subtilités et points d'attention

### 1. Sérialisation des champs `Modules` et `Annonces`

Ces champs sont stockés en tant que **listes** dans DynamoDB mais retournés en **String JSON** par la Lambda.

Exemple de valeur retournée :
```
"[\"mod-CollecteParam\", \"mod-Calendrier\"]"
```

Dans Amazon Connect, vous ne pouvez pas itérer nativement sur cette valeur. Pour l'utiliser :
- Passez-la à une Lambda intermédiaire qui la parse
- Ou utilisez le bloc **"Get data table value"** si les modules sont référencés dans une Data Table

### 2. Gestion des booléens

Les champs booléens (`Logger_Actif`) sont retournés en **String** `"True"` ou `"False"` (avec majuscule).

Dans les blocs **"Check Contact Attributes"** de Connect, comparez avec la valeur textuelle `"True"` (et non `"true"`).

### 3. Gestion des erreurs — comportement voulu

Si le DNIS n'est pas trouvé dans la table DynamoDB, la Lambda **lève volontairement une exception**. Ce comportement est intentionnel pour déclencher la branche **"Error"** du bloc Lambda dans le flux Connect, permettant de router l'appel vers une logique de secours.

### 4. Récupération de l'instanceId

La Lambda tente d'abord de récupérer l'`instanceId` depuis les tags de l'événement (`aws:connect:instanceId`). Si ce tag est absent, elle le déduit automatiquement depuis l'ARN de l'instance :

```python
instanceId = instance_ARN.split("/")[-1]
```

### 5. Fonction `update_contact_attributes_batch` (désactivée)

Une fonction de mise à jour des attributs de contact en batch est présente dans le code mais **commentée**. Elle permettrait de pousser directement les attributs vers le contact Amazon Connect sans passer par le retour de la Lambda. Elle est conservée pour une utilisation future.

---

## Logs CloudWatch

Les logs sont disponibles dans le groupe :

```
/aws/lambda/Core_Lbd_CollecteParametrage
```

Exemples de messages de log :

```
[INFO]  Start Lambda Core_Lbd_CollecteParametrage 2026-03-18 10:00:00+00:00
[INFO]  Recherche des parametres du +33159241926 dans la Table DynamoDB utilisée: Core_Ddb_CollecteParametrage
[INFO]  Paramètres trouvés pour l'index: +33159241926
[INFO]  End Lambda Core_Lbd_CollecteParametrage, durée de l'execution: 0:00:00.342
[INFO]  Resultat: {'Dnis': '+33159241926', 'Marque': 'GMF', ...}
```

En cas d'erreur :
```
[WARNING] Aucun paramètre trouvé pour l'index: +33000000000 dans la table Core_Ddb_CollecteParametrage
[ERROR]   Erreur critique dans Lambda Core_Lbd_CollecteParametrage: Aucun paramétrage trouvé...
```

---

## Permissions IAM requises

Le rôle d'exécution de la Lambda doit avoir les permissions suivantes :

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:Query"
  ],
  "Resource": "arn:aws:dynamodb:*:*:table/Core_Ddb_CollecteParametrage"
}
```
