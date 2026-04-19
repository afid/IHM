# Vérificateur de Donnée Vide (ABE_CheckEmpty)

Ce petit programme est comme une "douane" ou un "filtre" qui sert à vérifier si une information que vous recevez est exploitable ou si elle est totalement vide.


Ce programme regarde l'information et retourne un résultat formaté pour Amazon Connect :
- `{"isEmpty": "true"}` -> C'est vide !
- `{"isEmpty": "false"}` -> Il y a quelque chose dedans !

## Comment ça fonctionne (en termes simples) ?

Le programme cherche en priorité la clé **UC_FlowAppelant** (très utile pour vos flux Connect) ou toute autre donnée que vous lui envoyez. Il suit ensuite une liste de vérifications très précises :

1.  **L'absence totale** : Si l'étiquette de l'information existe mais qu'il n'y a rien derrière, il dit "C'est vide".
2.  **Le faux texte** : S'il reçoit des mots comme `"null"` ou `"undefined"` (qui veulent dire "inconnu" en langage informatique), il comprend que c'est une erreur et dit "C'est vide".
3.  **Les espaces inutiles** : S'il reçoit juste des espaces, il les nettoie et s'aperçoit qu'il ne reste rien. Il dit "C'est vide".
4.  **Les boîtes vides** : S'il reçoit une liste ou un dossier qui ne contient aucun élément à l'intérieur, il dit "C'est vide".

## Pourquoi c'est utile pour vous ?

Dans vos flux d'appels Amazon Connect, cela vous permet de prendre des décisions intelligentes.

### Exemple concret : Le "Souvenir du parcours"

Imaginez que vous avez un **Menu Principal** qui envoie l'appel vers un **Menu Secondaire**.

1.  **Au départ** : Le client arrive sur le Menu Principal. L'attribut `UC_FlowAppelant` est vide. La Lambda répond `isEmpty: true`. Le Menu se déroule normalement depuis le début.
2.  **Avant le transfert** : Le Menu Principal note son propre nom dans `UC_FlowAppelant` (ex: "Menu_Principal") puis transfère l'appel au Menu Secondaire.
3.  **Le retour** : Si le Menu Secondaire renvoie l'appel au Menu Principal, celui-ci redémarre techniquement au tout début du flux.
4.  **La détection** : Le Menu Principal interroge à nouveau la Lambda par sécurité. Cette fois, `UC_FlowAppelant` n'est plus vide (il contient "Menu_Principal"). La Lambda répond `isEmpty: false`.
5.  **L'action** : Le Menu Principal voit que ce n'est pas vide. Il comprend qu'il a déjà vu ce client il y a quelques instants. Au lieu de répéter les messages de bienvenue, il saute directement à l'étape après le transfert.

Cela permet d'offrir une expérience beaucoup plus fluide en évitant les répétitions inutiles pour le client.

## Sécurité et Robustesse

Nous l'avons rendu "solide" : même si on lui envoie une donnée totalement imprévue ou étrange, il ne va pas "casser" ou s'arrêter. Dans le doute, s'il rencontre un problème pour lire la donnée, il préférera dire "C'est vide" pour éviter que la suite de votre processus ne fasse une erreur plus grave.

---
*Note technique : Ce programme utilise le langage Python, mais il est conçu pour être un module indépendant et fiable.*
