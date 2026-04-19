# ABE_Boucle - Itérateur de Modules

Cette fonction AWS Lambda permet de sélectionner dynamiquement un module de flux Amazon Connect à partir d'une liste, en fonction d'un index donné. Elle sert de mécanisme de routage dynamique.

## ⚙️ Entrées / Sorties

### Entrées (Evenement Amazon Connect)
La Lambda attend les paramètres suivants :

| Paramètre | Chemin JSON | Description |
| :--- | :--- | :--- |
| `Index` | `Details.Parameters.Index.BoucleModulesIndex.Index` | L'index (entier) de l'élément à récupérer dans la liste. |
| `Modules` | `Details.Parameters.Modules` | Liste des IDs de modules (Format JSON String `["ID1", "ID2"]` ou Python List String). |

### Sorties (Return)
Un objet JSON contenant l'ARN ou le qualifiant du module à invoquer.

| Clé | Description | Exemple |
| :--- | :--- | :--- |
| `Module` | L'ID du module suffixé de `:$LATEST`. | `arn:aws:connect:...:$LATEST` |

---

## ☁️ Configuration AWS Lambda

Cette fonction dépend d'une configuration spécifique dans la console AWS Lambda.

### Variables d'Environnement
| Clé | Valeur Exemple | Description |
| :--- | :--- | :--- |
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
