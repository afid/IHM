# ABE_Module_Play_Annoncement

Ce module permet de diffuser des annonces sonores aux appelants dans Amazon Connect. Il dispose de deux fonctionnalités avancées :
1.  **Lecture Multiple** : Capacité de jouer une suite d'annonces (ex: Bienvenue + Menu).
2.  **Résolution de Nom** : Utilisation du nom de l'annonce (ex: "Bienvenue") au lieu de son ID technique (ARN).

## Configuration DynamoDB

Le déclenchement de ce module se fait via la table de paramétrage `ABE_DnisParameters`, dans la liste `Modules`.

### Format de la chaîne de configuration

```text
Module:<ID_DU_MODULE>:<ANNONCES>
```

### Détail des champs

1.  **Module** : Mot-clé fixe indiquant qu'on appelle un module Connect.
2.  **ID_DU_MODULE** : L'identifiant (UUID) ou l'ARN du module Connect `ABE_Module_Play_Annoncement` qui a été importé dans votre instance.
    *   *Exemple* : `5eca7422-58e1-4e53-a04d-f8c392683501`
3.  **ANNONCES** : Le contenu à jouer. Peut être une annonce unique ou une liste.

### Exemples Concrets

#### Cas 1 : Jouer une seule annonce
Vous pouvez spécifier simplement le nom de l'annonce.

```text
Module:5eca7422-58e1-4e53-a04d-f8c392683501:PFRO_MBO_ACC
```
*   Cela jouera l'annonce nommée "PFRO_MBO_ACC".

#### Cas 2 : Jouer plusieurs annonces à la suite
Vous pouvez spécifier une liste (format Python avec crochets `[]` et guillemets simples `'`).

```text
Module:5eca7422-58e1-4e53-a04d-f8c392683501:['PFRO_MBO_ACC','PFRO_MBO_ATT']
```
*   Cela jouera d'abord "PFRO_MBO_ACC", puis "PFRO_MBO_ATT".

## Fonctionnement Technique

Ce module s'appuie sur une fonction Lambda (`ABE_Module_Play_Annoncement`) qui :
*   Reçoit la liste des annonces et un Index (compteur).
*   Interroge Amazon Connect pour trouver l'ARN correspondant au Nom de l'annonce d'après l'Index.
*   Retourne l'ARN à jouer au flux Connect, ainsi que le prochain Index.
*   Le flux Connect boucle tant que la Lambda lui indique qu'il y a une suite (`HasMore: true`).
