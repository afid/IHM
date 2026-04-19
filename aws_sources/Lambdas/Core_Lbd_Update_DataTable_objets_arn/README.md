# Core_Lbd_Update_DataTable_objets_arn

## Description

Cette Lambda AWS récupère automatiquement la liste de tous les **flows** et **modules** d'une instance Amazon Connect, puis insère ou met à jour ces informations dans une **Data Table Amazon Connect**.

Elle est conçue pour maintenir à jour un référentiel centralisé des objets Amazon Connect (flows et modules), accessible depuis les flows via le bloc **"Get data table value"**.

---

## Dépendances et configuration

### Layer Boto3

Cette Lambda utilise un **Layer AWS** contenant la dernière version de Boto3 :

| Paramètre | Valeur |
|-----------|--------|
| Nom du layer | `boto3-layer` |
| Version Boto3 | **1.42.63** |
| Runtime | Python 3.12+ |

> Le layer est nécessaire car la version de Boto3 embarquée par défaut dans Lambda ne contient pas les APIs Amazon Connect Data Table (`batch_create_data_table_value`, `batch_update_data_table_value`).

Pour attacher le layer à la Lambda :
1. Ouvrir la Lambda dans la console AWS
2. Aller dans **Configuration → Layers**
3. Cliquer sur **Add a layer**
4. Sélectionner le layer `boto3-layer` en version `boto3_1-42-63`

### Variables de configuration (dans le code)

| Constante | Description |
|-----------|-------------|
| `INSTANCE_ID` | Identifiant de l'instance Amazon Connect |
| `DATA_TABLE_ID` | ARN complet de la Data Table cible |

---

## Structure de la Data Table cible

La Data Table Amazon Connect doit être configurée avec les colonnes suivantes :

| Colonne | Type | Rôle |
|---------|------|------|
| `Key` | **Clé primaire** | Nom court du flow/module (sans le préfixe `shared-core-euc1-`) |
| `Name` | Texte | Nom complet du flow/module |
| `Id` | Texte | Identifiant unique Amazon Connect |
| `Arn` | Texte | ARN complet de la ressource |
| `ContactFlowType` | Texte | Type de flow ou `CONTACT_MODULE` |
| `ContactFlowState` | Texte | État du flow (vide pour les modules) |
| `ContactFlowStatus` | Texte | Statut de publication |

### Exemple de ligne insérée

| Key | Name | ContactFlowType |
|-----|------|-----------------|
| `mod-CollecteParam` | `shared-core-euc1-mod-CollecteParam` | `CONTACT_MODULE` |
| `flux-Ciblage` | `shared-core-euc1-flux-Ciblage` | `CONTACT_FLOW` |

---

## Types de flows récupérés

La Lambda récupère les flows des types suivants via `list_contact_flows` :

| Type | Description |
|------|-------------|
| `CONTACT_FLOW` | Flows de contact principaux |
| `CUSTOMER_QUEUE` | Flows de file d'attente client |
| `CUSTOMER_HOLD` | Flows de mise en attente client |
| `CUSTOMER_WHISPER` | Flows de chuchotement client |
| `AGENT_HOLD` | Flows de mise en attente agent |
| `AGENT_WHISPER` | Flows de chuchotement agent |
| `OUTBOUND_WHISPER` | Flows de chuchotement sortant |
| `AGENT_TRANSFER` | Flows de transfert agent |

Les **modules** (`CONTACT_MODULE`) sont récupérés séparément via `list_contact_flow_modules`.

---

## Fonctions

### `list_all_flows()`

Récupère tous les flows de l'instance Amazon Connect.

- Utilise le **paginator** AWS pour gérer automatiquement la pagination (100 résultats par page)
- Filtre sur les types définis dans `FLOW_TYPES`
- Retourne une liste de dictionnaires avec les champs : `Id`, `Arn`, `Name`, `ContactFlowType`, `ContactFlowState`

```python
def list_all_flows() -> list[dict]
```

**Retour :** Liste de flows au format `ContactFlowSummaryList`

---

### `list_all_modules()`

Récupère tous les modules de l'instance Amazon Connect via l'API dédiée `list_contact_flow_modules`.

- Utilise le **paginator** AWS pour gérer la pagination
- **Normalise** la structure des modules pour la rendre identique à celle des flows
- Ajoute `ContactFlowType = 'CONTACT_MODULE'` pour les distinguer des flows
- `ContactFlowState` est vide (non applicable pour les modules)

```python
def list_all_modules() -> list[dict]
```

**Retour :** Liste de modules normalisés avec les champs : `Id`, `Arn`, `Name`, `ContactFlowType`, `ContactFlowState`, `ContactFlowStatus`

---

### `extract_key_from_name(name)`

Extrait la valeur courte à insérer dans le champ **clé primaire** `Key` de la Data Table.

- Retire le préfixe `shared-core-euc1-` du nom complet
- Si le préfixe est absent, retourne le nom complet sans modification

```python
def extract_key_from_name(name: str) -> str
```

**Exemple :**

| Name (entrée) | Key (sortie) |
|---------------|--------------|
| `shared-core-euc1-mod-CollecteParam` | `mod-CollecteParam` |
| `shared-core-euc1-flux-Ciblage` | `flux-Ciblage` |
| `autre-nom-sans-prefixe` | `autre-nom-sans-prefixe` |

---

### `build_values(contact)`

Construit la liste `Values` au format attendu par les APIs `batch_create_data_table_value` et `batch_update_data_table_value`.

- Calcule la clé primaire via `extract_key_from_name()`
- Chaque colonne est représentée par un objet contenant :
  - `PrimaryValues` : la clé primaire `Key`
  - `AttributeName` : le nom de la colonne
  - `Value` : la valeur (convertie en string)

```python
def build_values(contact: dict) -> list[dict]
```

**Structure d'un élément retourné :**

```json
{
  "PrimaryValues": [{ "AttributeName": "Key", "Value": "mod-CollecteParam" }],
  "AttributeName": "Arn",
  "Value": "arn:aws:connect:eu-central-1:..."
}
```

---

### `upsert_contact(contact)`

Insère ou met à jour une ligne dans la Data Table pour un flow ou module donné.

**Logique upsert :**

1. Tente un **`batch_create_data_table_value`** (création)
2. Si la ligne existe déjà (`ResourceConflictException`), bascule sur **`batch_update_data_table_value`** (mise à jour)
3. En cas d'autre erreur, logue l'erreur et la propage

```python
def upsert_contact(contact: dict) -> None
```

**Flux d'exécution :**

```
upsert_contact(contact)
    │
    ├─ build_values(contact)
    │       └─ extract_key_from_name(name)
    │
    ├─ batch_create_data_table_value()
    │       ├─ Succès → "Créé"
    │       └─ ResourceConflictException
    │               └─ batch_update_data_table_value() → "Mis à jour"
    │
    └─ Exception → log erreur + raise
```

---

### `lambda_handler(event, context)`

Point d'entrée principal de la Lambda, déclenché par AWS.

**Étapes d'exécution :**

1. Appelle `list_all_flows()` pour récupérer tous les flows
2. Appelle `list_all_modules()` pour récupérer tous les modules
3. Fusionne les deux listes
4. Pour chaque objet, appelle `upsert_contact()` pour insérer/mettre à jour la Data Table
5. Retourne un résumé `{ success, errors }` avec le code HTTP 200

```python
def lambda_handler(event: dict, context: object) -> dict
```

**Retour :**

```json
{
  "statusCode": 200,
  "body": "{\"success\": 42, \"errors\": 0}"
}
```

---

## Déclenchement

Cette Lambda peut être déclenchée :

- **Manuellement** depuis la console AWS Lambda (bouton "Test")
- **Automatiquement** via une règle **Amazon EventBridge** (ex: toutes les nuits à 2h00)
- **Via un flow Amazon Connect** avec le bloc "Invoke AWS Lambda function"

### Exemple de règle EventBridge (déclenchement quotidien)

```json
{
  "source": ["aws.events"],
  "schedule": "cron(0 2 * * ? *)"
}
```

---

## Permissions IAM requises

Le rôle d'exécution de la Lambda doit avoir les permissions suivantes :

```json
{
  "Effect": "Allow",
  "Action": [
    "connect:ListContactFlows",
    "connect:ListContactFlowModules",
    "connect:BatchCreateDataTableValue",
    "connect:BatchUpdateDataTableValue"
  ],
  "Resource": "*"
}
```

---

## Logs CloudWatch

Les logs sont disponibles dans le groupe :

```
/aws/lambda/Core_Lbd_Update_DataTable_objets_arn
```

Exemples de messages de log :

```
[INFO] Démarrage de la mise à jour de la Data Table Object_Arn
[INFO] Flows récupérés : 15
[INFO] Modules récupérés : 8
[INFO] Total objets à traiter : 23
[INFO] Upsert : shared-core-euc1-mod-CollecteParam → Key: mod-CollecteParam (CONTACT_MODULE)
[INFO]   → Créé avec Key=mod-CollecteParam
[INFO] Terminé — Succès: 23 | Erreurs: 0
```
