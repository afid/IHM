import boto3
import json
import ast
import logging
import os
import datetime
import traceback
from constants import LOG_LEVEL_INFO
from utils import configure_logger

# -----------------------------------------------------------------------------------------
# CONFIGURATION ET INITIALISATION
# -----------------------------------------------------------------------------------------

# Initialisation du système de logs (journalisation).
# Cela permet de garder une trace de ce qui se passe lors de l'exécution de la fonction dans CloudWatch.
logger = logging.getLogger()
configure_logger(logger, os.getenv('LOGGER_LEVEL', 'INFO'))

# On note l'heure de début pour les logs.
start_time_lambda = datetime.datetime.now(datetime.timezone.utc)

# Initialisation du client Amazon Connect.
# C'est ce "client" qui nous permet de parler aux services Amazon Connect (pour chercher des flux ou modules).
connect = boto3.client('connect')

# -----------------------------------------------------------------------------------------
# VARIABLES GLOBALES & CACHE
# -----------------------------------------------------------------------------------------

# Cache global pour stocker les résultats des recherches (Nom -> ARN)
# Cela permet de ne pas rappeler l'API payante d'Amazon si on a déjà l'info.
# Le cache persiste tant que l'instance Lambda reste "chaude" (warm start).
RESOURCE_CACHE = {}

# Durée de rétention du cache en secondes (par défaut 300s = 5 minutes).
# Nous permettons à l'utilisateur de configurer cette durée via une variable d'environnement 'TIME_API_RETENTION'.
try:
    CACHE_TTL_SECONDS = int(os.getenv('TIME_API_RETENTION', 300))
except ValueError:
    logger.warning("Valeur invalide pour TIME_API_RETENTION, utilisation de la valeur par défaut (300s).")
    CACHE_TTL_SECONDS = 300

logger.info(f"Configuration du Cache : Rétention activée pour {CACHE_TTL_SECONDS} secondes.")

# -----------------------------------------------------------------------------------------
# FONCTIONS UTILITAIRES
# -----------------------------------------------------------------------------------------

def resolve_resource_arn(client, instance_id, resource_type, name_or_id):
    """
    Cette fonction sert à retrouver l'identifiant technique (ARN et ID) d'un Module ou d'un Flux
    à partir de son Nom, en utilisant les API de RECHERCHE (Search) d'Amazon Connect.

    Elle intègre un système de CACHE pour optimiser les performances et réduire les coûts.

    Arguments:
        client: Le "connecteur" vers Amazon Connect.
        instance_id: L'identifiant unique de votre instance Connect.
        resource_type: Le type de ressource qu'on cherche ("Flow" ou "Module").
        name_or_id: Le nom que vous avez écrit dans la config (ex: "MonFluxSupport").

    Retourne:
        Deux valeurs : (ARN trouvé, ID trouvé).
        Si rien n'est trouvé, elle retourne (None, None).
    """
    global RESOURCE_CACHE

    # 1. Création d'une clé unique pour le cache (Instance + Type + Nom)
    cache_key = f"{instance_id}:{resource_type}:{name_or_id}"
    now = datetime.datetime.now(datetime.timezone.utc)

    # 2. Vérification dans le cache
    if cache_key in RESOURCE_CACHE:
        cached_entry = RESOURCE_CACHE[cache_key]
        # On vérifie si l'entrée n'a pas expiré (est-ce que la date d'expiration est dans le futur ?)
        if cached_entry['expiry'] > now:
            logger.info(f"CACHE HIT pour '{name_or_id}' (Expire à {cached_entry['expiry']})")
            return cached_entry['arn'], cached_entry['id']
        else:
            logger.info(f"CACHE EXPIRED pour '{name_or_id}'. Rafraîchissement nécessaire.")
            del RESOURCE_CACHE[cache_key] # On nettoie l'entrée expirée

    # 3. Recherche via l'API (Si pas dans le cache ou expiré)
    try:
        found_arn = None
        found_id = None

        # Cas 1 : On cherche un Flux (Contact Flow)
        if resource_type == "Flow":
            # Documentation: https://docs.aws.amazon.com/connect/latest/APIReference/API_SearchContactFlows.html
            response = client.search_contact_flows(
                InstanceId=instance_id,
                SearchCriteria={
                    'StringCondition': {
                        'FieldName': 'NAME',
                        'Value': name_or_id,
                        'ComparisonType': 'EXACT'
                    }
                }
            )

            if response.get('ContactFlows'):
                flow = response['ContactFlows'][0]
                found_arn = flow['Arn']
                found_id = flow['Id']

        # Cas 2 : On cherche un Module (Contact Flow Module)
        elif resource_type == "Module":
            # Documentation: https://docs.aws.amazon.com/connect/latest/APIReference/API_SearchContactFlowModules.html
            response = client.search_contact_flow_modules(
                InstanceId=instance_id,
                SearchCriteria={
                    'StringCondition': {
                        'FieldName': 'NAME',
                        'Value': name_or_id,
                        'ComparisonType': 'EXACT'
                    }
                }
            )

            if response.get('ContactFlowModules'):
                module = response['ContactFlowModules'][0]
                found_arn = module['Arn']
                found_id = module['Id']

        # 4. Enregistrement dans le cache si trouvé
        if found_arn and found_id:
            # On calcule l'heure d'expiration : Maintenant + Durée configurée
            expiry_time = now + datetime.timedelta(seconds=CACHE_TTL_SECONDS)

            RESOURCE_CACHE[cache_key] = {
                'arn': found_arn,
                'id': found_id,
                'expiry': expiry_time
            }
            logger.info(f"CACHE SET pour '{name_or_id}' - Valide pour {CACHE_TTL_SECONDS}s")
            return found_arn, found_id

    except Exception as e:
        logger.error(f"Erreur technique lors de la recherche du nom '{name_or_id}': {e}")

    # Si on arrive ici, c'est qu'on n'a rien trouvé.
    return None, None


# -----------------------------------------------------------------------------------------
# FONCTION PRINCIPALE (POINT D'ENTRÉE)
# -----------------------------------------------------------------------------------------

def lambda_handler(event, context):
    """
    C'est la fonction principale appelée par Amazon Connect.
    Elle reçoit des paramètres, décide quel module/flux exécuter, et renvoie la réponse.
    """
    logger.info(f"----------- DÉBUT ABE_Boucle_Modules {start_time_lambda} -----------")

    
        

    try:
        # ÉTAPE 1 : RÉCUPÉRATION DU CONTEXTE (Où sommes-nous ?)
        # -----------------------------------------------------

        # On récupère les infos sur l'appel en cours et l'instance Connect
        details = event.get("Details", {})
        contact_data = event.get("Details", {}).get("ContactData", {})
        instanceId = contact_data.get("Tags", {}).get("aws:connect:instanceId")
        instanceArn = contact_data.get("InstanceARN", "")
        # Récupere le nom du flow en cours
        # logger.info(f"----------- FLOW contact_data {contact_data} -----------")
        # logger.info(f"----------- FLOW instanceId {instanceId} -----------")
        # logger.info(f"----------- FLOW instanceArn {instanceArn} -----------")
        # logger.info(f"----------- FLOW NAME {details} -----------")
        # Sécurité : Si l'ID n'est pas dans les tags, on essaie de le deviner depuis l'ARN
        if not instanceId and instanceArn:
             instanceId = instanceArn.split("/")[-1]

        # ÉTAPE 2 : RÉCUPÉRATION DES PARAMÈTRES (Quoi faire ?)
        # ----------------------------------------------------

        parameters = event.get("Details", {}).get("Parameters", {})

        # 'Index' : C'est le compteur de la boucle (0, 1, 2...).
        # Il nous dit quel élément de la liste nous devons traiter maintenant.
        id_index = int(parameters.get("Index", {}).get("BoucleModulesIndex", {}).get("Index", 0))
        logger.info(f"Position actuelle dans la boucle (Index): {id_index}")

        # 'Modules' : C'est la liste de tout ce qu'on doit exécuter.
        modules_input = parameters.get("Modules", [])
        logger.info(f"Liste complète des modules reçue: {modules_input}")

        # Conversion : Parfois Connect envoie une chaîne de caractères "['A','B']" au lieu d'une vraie liste.
        # On s'assure ici d'avoir une vraie liste Python.
        modules_list = modules_input
        if isinstance(modules_input, str):
            try:
                modules_list = json.loads(modules_input)
            except json.JSONDecodeError:
                # Si le format n'est pas du JSON strict, on essaie une méthode plus permissive (Python literal)
                logger.warning("Format JSON invalide, tentative de lecture format Python...")
                modules_list = ast.literal_eval(modules_input)

        # On récupère l'élément à traiter pour ce tour de boucle
        current_item = modules_list[id_index]
        print(f"Élément à traiter: {current_item}")

        # ÉTAPE 3 : ANALYSE DE L'ÉLÉMENT (Décorticage)
        # --------------------------------------------

        # L'élément ressemble à : "Type:NomOuID" ou "Type:NomOuID:Fonction"
        # On coupe la chaîne en morceaux en utilisant les deux points ":" comme séparateur.
        parts = current_item.split(":", 2)

        resource_type_input = parts[0]     # Ex: "Module" ou "Flow"
        resource_identifier = parts[1]     # Ex: "MonModule" ou "8a19fc4e-..."
        # Si une fonction est précisée (pour les modules), on la récupère, sinon c'est vide.
        resource_function = parts[2] if len(parts) > 2 else ""

        # Détermination du type standardisé
        resource_type = "Module" # Par défaut
        if resource_type_input == "Flow":
            resource_type = "Flow"

        arn = None
        resource_id = resource_identifier

        # ÉTAPE 4 : RÉSOLUTION DU NOM EN ARN (Le cœur du sujet)
        # -----------------------------------------------------

        # On demande à notre fonction utilitaire de trouver les identifiants officiels à partir du Nom.
        found_arn, found_id = resolve_resource_arn(connect, instanceId, resource_type, resource_identifier)

        if found_arn:
            # SUCCÈS : On a trouvé le nom dans Amazon Connect !
            logger.info(f"Succès : Le nom '{resource_identifier}' correspond à l'ARN {found_arn}")
            arn = found_arn
            resource_id = found_id
        else:
            # ÉCHEC : On n'a pas trouvé ce nom.
            # On suppose alors que l'utilisateur a peut-être donné directement un ID (UUID).
            logger.info(f"Info : Impossible de résoudre '{resource_identifier}' comme un Nom. On l'utilise comme ID.")

            # On reconstruit l'ARN manuellement selon le format standard AWS
            if resource_type == "Flow":
                 arn = f"{instanceArn}/contact-flow/{resource_identifier}"
            else:
                 # Pour un module, on ajoute :$LATEST pour dire "la dernière version"
                 arn = f"{resource_identifier}:$LATEST"

        logger.info(f"Sélection Finale -> Type: {resource_type}, ID: {resource_id}, ARN: {arn}")

        # ÉTAPE 5 : PRÉPARATION DE LA RÉPONSE
        # -----------------------------------

        result = {
            "Type": resource_type,
            "Id": resource_id,       # L'ID technique
            "Nom du Module ou Flow": resource_identifier,       # Le nom du module
            "Arn": arn,              # L'ARN complet (nécessaire pour Connect)
            "Fonction": resource_function # Le nom de la fonction à exécuter dans le module (si besoin)
        }
        # print(f"RESULT: {result}")

        return result

    except Exception as e:
        # GESTION DES ERREURS
        # Si tout explose, on l'écrit dans les logs pour pouvoir réparer plus tard.
        logger.error(f"ERREUR CRITIQUE dans lambda_handler: {e}")
        logger.error(traceback.format_exc())
        raise e # On laisse l'erreur remonter pour qu'elle soit visible dans la console AWS Lambda
