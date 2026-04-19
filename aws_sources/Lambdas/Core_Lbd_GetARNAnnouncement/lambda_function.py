import json
import logging
import os
import datetime
import ast
import boto3
import traceback

# -----------------------------------------------------------------------------------------
# CONFIGURATION ET INITIALISATION
# -----------------------------------------------------------------------------------------

# Initialisation du système de logs (journalisation).
# Cela permet d'écrire des messages dans CloudWatch pour suivre l'exécution.
logger = logging.getLogger()
try:
    # On récupère le niveau de log depuis les variables d'environnement (par défaut INFO)
    log_level = os.getenv('LOGGER_LEVEL', 'INFO')
    logger.setLevel(log_level)
except Exception:
    logger.setLevel('INFO')

# Initialisation du client Boto3 pour Amazon Connect.
# C'est ce client qui nous permettra d'interroger l'API d'Amazon Connect (ex: rechercher des annonces).
connect_client = boto3.client('connect')

# Dictionnaire global servant de mémoire cache pour stocker les correspondances Nom -> ARN.
# Cela évite de rappeler l'API Amazon Connect si on a déjà cherché cette annonce récemment.
# Format de la clé : "InstanceId:NomAnnonce", Valeur : "ARN de l'annonce"
# Dictionnaire global servant de mémoire cache pour stocker les correspondances Nom -> ARN.
# Cela évite de rappeler l'API Amazon Connect si on a déjà cherché cette annonce récemment.
# Format de la clé : "InstanceId:NomAnnonce", Valeur : {'arn': "...", 'expiry': datetime}
PROMPT_CACHE = {}

# Durée de rétention du cache en secondes (par défaut 300s = 5 minutes).
# Configurable via la variable d'environnement 'TIME_API_RETENTION'.
try:
    CACHE_TTL_SECONDS = int(os.getenv('TIME_API_RETENTION', 300))
except ValueError:
    CACHE_TTL_SECONDS = 300

# -----------------------------------------------------------------------------------------
# FONCTIONS UTILITAIRES
# -----------------------------------------------------------------------------------------

def get_instance_id_from_arn(instance_arn):
    """
    Extrait l'identifiant court de l'instance (InstanceId) à partir de son ARN complet.
    Exemple ARN: arn:aws:connect:eu-west-3:123456789:instance/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
    Retourne: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
    """
    try:
        if "/" in instance_arn:
            # On découpe la chaîne par les '/' et on prend le dernier morceau
            return instance_arn.split("/")[-1]
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction de l'InstanceId depuis {instance_arn}: {e}")
    return None

def get_prompt_arn(instance_id, prompt_identifier):
    """
    Cherche l'ARN (identifiant unique Amazon) d'une annonce sonore à partir de son Nom.

    Arguments:
        instance_id: L'identifiant de votre instance Amazon Connect.
        prompt_identifier: Le nom de l'annonce que vous avez configuré (ou déjà un ARN).

    Retourne:
        L'ARN complet de l'annonce à jouer.
    """
    global PROMPT_CACHE
    logger.info(f"Résolution ARN pour: '{prompt_identifier}' sur instance: {instance_id}")

    # 1. Protection contre les valeurs vides
    if not prompt_identifier:
        return prompt_identifier

    # 2. Si c'est déjà un ARN (commence par arn:aws:connect...), on n'a rien à faire
    if prompt_identifier.startswith("arn:aws:connect:"):
        logger.info("L'identifiant est déjà un ARN.")
        return prompt_identifier

    # 3. Vérification dans le cache (mémoire) pour gagner du temps
    cache_key = f"{instance_id}:{prompt_identifier}"
    now = datetime.datetime.now(datetime.timezone.utc)

    if cache_key in PROMPT_CACHE:
        cached_entry = PROMPT_CACHE[cache_key]
        if cached_entry['expiry'] > now:
            logger.info(f"CACHE HIT pour '{prompt_identifier}' (Expire à {cached_entry['expiry']})")
            return cached_entry['arn']
        else:
             logger.info(f"CACHE EXPIRED pour '{prompt_identifier}'. Rafraîchissement nécessaire.")
             del PROMPT_CACHE[cache_key]

    # 4. Recherche via l'API Amazon Connect
    try:
        next_token = None
        found_arn = None
        page_count = 0

        # On peut avoir beaucoup d'annonces, l'API renvoie les résultats par pages.
        # Cette boucle parcourt toutes les pages jusqu'à trouver l'annonce.
        while True:
            page_count += 1
            # Préparation des paramètres de la recherche
            kwargs = {'InstanceId': instance_id}
            if next_token:
                kwargs['NextToken'] = next_token

            # Appel à l'API Amazon Connect (ListPrompts)
            response = connect_client.list_prompts(**kwargs)

            # On regarde chaque annonce de la page reçue
            for prompt in response.get('PromptSummaryList', []):
                # Si le nom correspond exactement à ce qu'on cherche
                if prompt['Name'] == prompt_identifier:
                    found_arn = prompt['Arn']
                    break # Trouvé ! On sort de la boucle for

            if found_arn:
                break # Trouvé ! On sort de la boucle while

            # Si pas de page suivante, on arrête la recherche
            if not response.get('NextToken'):
                break
            # Sinon, on prépare la page suivante
            next_token = response.get('NextToken')

        # Résultat de la recherche
        if found_arn:
            logger.info(f"ARN trouvé via API (Page {page_count}) pour '{prompt_identifier}': {found_arn}")

            # On mémorise le résultat dans le cache pour la prochaine fois
            expiry_time = now + datetime.timedelta(seconds=CACHE_TTL_SECONDS)
            PROMPT_CACHE[cache_key] = {
                'arn': found_arn,
                'expiry': expiry_time
            }
            logger.info(f"CACHE SET pour '{prompt_identifier}' - Valide pour {CACHE_TTL_SECONDS}s")

            return found_arn
        else:
            # Si on a tout parcouru sans trouver
            logger.warning(f"AUCUN ARN TROUVÉ pour le prompt '{prompt_identifier}' après avoir parcouru {page_count} pages.")
            return prompt_identifier # On retourne le nom original (ce qui causera probablement une erreur ou silence dans Connect)

    except Exception as e:
        logger.error(f"EXCEPTION lors de l'appel à list_prompts: {e}")
        logger.error(traceback.format_exc())

    return prompt_identifier

# -----------------------------------------------------------------------------------------
# FONCTION PRINCIPALE (POINT D'ENTRÉE)
# -----------------------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    Fonction appelée automatiquement par Amazon Connect (ou test).

    Arguments:
        event: Contient toutes les données envoyées par Connect (attributs, paramètres...).
        context: Infos techniques sur l'exécution Lambda (rarement utilisé ici).
    """
    logger.info("----------- START ABE_Module_Play_Annoncement -----------")
    logger.info(f"Timestamp: {datetime.datetime.now(datetime.timezone.utc)}")

    try:
        # ÉTAPE 1 : LOGGING DE L'ÉVÉNEMENT REÇU
        # On affiche tout ce qu'on reçoit pour comprendre ce qui se passe.
        logger.info(f"EVENT REMITED: {json.dumps(event)}")

        # Récupération des paramètres envoyés par le Flux Connect
        parameters = event.get("Details", {}).get("Parameters", {})

        # 'PromptsList' : La liste des annonces (Ex: "['Bienvenue', 'Menu']")
        prompts_param = parameters.get("PromptsList", "[]")

        # 'CurrentIndex' : Le numéro de l'annonce à jouer maintenant (0, 1, 2...)
        current_index_str = parameters.get("CurrentIndex", "0")

        # ÉTAPE 2 : TRAITEMENT ET NETTOYAGE DES PARAMÈTRES

        # Conversion de l'index en nombre entier
        try:
            current_index = int(current_index_str)
        except ValueError:
            logger.warning(f"Index invalide reçu ('{current_index_str}'), utilisation de 0 par défaut.")
            current_index = 0

        # Conversion de la liste d'annonces (qui arrive sous forme de Texte) en vraie liste Python
        prompts_list = []
        if isinstance(prompts_param, list):
            prompts_list = prompts_param
        elif isinstance(prompts_param, str):
            try:
                # Essai 1 : Format JSON standard
                prompts_list = json.loads(prompts_param)
            except json.JSONDecodeError:
                try:
                    # Essai 2 : Format Python (avec des simples quotes ' au lieu de doubles ")
                    prompts_list = ast.literal_eval(prompts_param)
                except:
                    logger.warning(f"Impossible de parser la liste '{prompts_param}', traitement comme chaîne unique.")
                    prompts_list = [prompts_param]

        # Sécurité : Si ce n'est toujours pas une liste, on en fait une liste d'un seul élément
        if not isinstance(prompts_list, list):
             prompts_list = [str(prompts_list)]

        logger.info(f"Paramètres parsés - Index: {current_index}, Liste ({len(prompts_list)} éléments): {prompts_list}")

        result = {}

        # ÉTAPE 3 : LOGIQUE PRINCIPALE (BOUCLE)

        # On vérifie si l'index demandé existe dans la liste
        if 0 <= current_index < len(prompts_list):

            # On récupère le nom de l'annonce à cet index
            raw_next_prompt = prompts_list[current_index]
            logger.info(f"Prompt à traiter pour l'index {current_index}: '{raw_next_prompt}'")

            # ÉTAPE 4 : RETROUVER L'ARN DE L'ANNONCE

            # On a besoin de l'ID de l'instance Connect pour interroger l'API
            contact_data = event.get("Details", {}).get("ContactData", {})

            # On cherche l'ARN de l'instance à plusieurs endroits possibles
            instance_arn = contact_data.get("InstanceArn") or contact_data.get("InstanceARN")

            instance_id = None
            if instance_arn:
                instance_id = get_instance_id_from_arn(instance_arn)

            # Si pas trouvé, on cherche dans les Tags
            if not instance_id:
                logger.info("InstanceId non trouvé dans InstanceArn, vérification des Tags...")
                tags = contact_data.get("Tags", {})
                tag_id = tags.get("aws:connect:instanceId")
                if tag_id:
                     instance_id = tag_id if "/" not in tag_id else get_instance_id_from_arn(tag_id)

            final_next_prompt = raw_next_prompt

            if instance_id:
                logger.info(f"InstanceId identifié: {instance_id}")
                # Appel de notre fonction de recherche pour convertir Nom -> ARN
                final_next_prompt = get_prompt_arn(instance_id, raw_next_prompt)
            else:
                logger.error("CRITICAL: Impossible de déterminer l'InstanceId. La résolution de nom est impossible.")
                logger.info(f"ContactData Keys Available: {list(contact_data.keys())}")

            # Calcul du prochain numéro pour le tour suivant
            next_index = current_index + 1

            # Construction de la réponse pour Amazon Connect
            result = {
                "HasMore": True,                # Dire au Flux: "Oui, continue, j'ai trouvé quelque chose"
                "NextPrompt": final_next_prompt,# L'ARN de l'audio à jouer
                "NextIndex": next_index         # Le numéro à me renvoyer au prochain tour
            }
            logger.info("Statut: SUCCÈS - Prompt suivant identifié.")

        else:
            # Si l'index est trop grand (fin de la liste)
            logger.info(f"Statut: TERMINÉ - Index {current_index} hors limites (Taille liste: {len(prompts_list)}).")
            result = {
                "HasMore": False,       # Dire au Flux: "C'est fini, arrête la boucle"
                "NextPrompt": "",
                "NextIndex": current_index
            }

        logger.info(f"RESULTAT LAMBDA: {json.dumps(result)}")
        return result

    except Exception as e:
        # ÉTAPE 5 : GESTION DES ERREURS IMPRÉVUES
        logger.error(f"ERREUR NON GÉRÉE: {e}")
        logger.error(traceback.format_exc()) # Affiche tout le détail de l'erreur

        # On renvoie une structure valide pour ne pas faire planter l'appel téléphonique brutalement
        return {
            "HasMore": False,
            "NextPrompt": "Error",
            "NextIndex": 0
        }
    finally:
        logger.info("----------- END ABE_Module_Play_Annoncement -----------")
