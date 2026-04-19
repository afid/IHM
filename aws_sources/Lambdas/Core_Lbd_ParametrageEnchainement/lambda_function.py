import json
import boto3
import logging
import os

# Configuration du logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Client AWS
connect = boto3.client('connect')


def parse_uc_action(uc_action):
    """
    Parse l'attribut UC_Action pour extraire les actions et leurs arguments.
    
    Format attendu: UC_Action = <action1>:<argument1>;<action2>:<argument2>
    Exemple: "Dissuasion:COVEAPJ_ESA_DISSU;AutreAction:AUTRE_ARG"
    
    Args:
        uc_action (str): La valeur de l'attribut UC_Action
        
    Returns:
        list: Liste de tuples (action, argument)
    """
    if not uc_action:
        return []
    
    actions = []
    segments = uc_action.split(';')
    
    for segment in segments:
        segment = segment.strip()
        if ':' in segment:
            action, argument = segment.split(':', 1)
            actions.append((action.strip(), argument.strip()))
        else:
            logger.warning(f"Segment invalide ignoré: {segment}")
    
    return actions


def build_modules_enchainement(uc_action):
    """
    Construit la liste ModulesEnchainement à partir de UC_Action.
    
    Args:
        uc_action (str): La valeur de l'attribut UC_Action
        
    Returns:
        list: Liste des modules au format simple (tableau de strings)
    """
    actions = parse_uc_action(uc_action)
    modules_list = []
    
    for action, argument in actions:
        # Récupération du module depuis les variables d'environnement
        env_key = action.upper()
        module_name = os.environ.get(env_key)
        
        if not module_name:
            logger.warning(f"Aucun module configuré pour l'action '{action}' (variable d'environnement {env_key} manquante)")
            continue
        
        # Construction de l'élément au format attendu (simple string)
        module_entry = f"Module:{module_name}:['{argument}']"
        modules_list.append(module_entry)
    
    return modules_list


def calculate_modules_length(modules_list):
    """
    Calcule la longueur de la liste de modules.
    
    Args:
        modules_list (list): Liste des modules
        
    Returns:
        str: Longueur sous forme de chaîne
    """
    return str(len(modules_list)) if modules_list else "0"


def lambda_handler(event, context):
    """
    Lambda de paramétrage d'enchainement pour Amazon Connect.
    
    Paramètres d'entrée:
    - UC_Action: Attribut de contact définissant les actions et arguments
      Format: <action1>:<argument1>;<action2>:<argument2>
      Exemple: "Dissuasion:COVEAPJ_ESA_DISSU"
    
    Retourne:
    - ModulesEnchainement: Liste des modules à jouer
    - ModulesEnchainementLength: Nombre d'éléments dans la liste
    """
    try:
        # Extraction de l'attribut UC_Action
        uc_action = event.get('Details', {}).get('ContactData', {}).get('Attributes', {}).get('UC_Action')
        
        # Récupération des informations de contact pour l'attachement
        instanceId = event.get("Details", {}).get("ContactData", {}).get("Tags", {}).get("aws:connect:instanceId")
        contact_id = event.get("Details", {}).get("ContactData", {}).get("ContactId", "")
        initialContactId = event.get("Details", {}).get("ContactData", {}).get("InitialContactId", "")
        
        # Sécurité : Si l'ID n'est pas dans les tags, on essaie de le deviner depuis l'ARN
        if not instanceId:
            instance_ARN = event.get("Details", {}).get("ContactData", {}).get("InstanceARN", "")
            if instance_ARN:
                instanceId = instance_ARN.split("/")[-1]
        
        logger.info(f"=== APPEL LAMBDA Core_Lbd_ParametrageEnchainement ===")
        logger.info(f"UC_Action: {uc_action}")
        logger.info(f"Contact ID: {contact_id}")
        
        # Validation
        if not uc_action:
            logger.error("UC_Action manquant dans les attributs de contact")
            return create_error_response("UC_Action manquant")
        
        # Construction de ModulesEnchainement
        modules_enchainement = build_modules_enchainement(uc_action)
        modules_enchainement_length = calculate_modules_length(modules_enchainement)
        
        # Préparation de la réponse (format simple JSON array)
        response_data = {
            'ModulesEnchainement': json.dumps(modules_enchainement, ensure_ascii=False),
            'ModulesEnchainementLength': modules_enchainement_length
        }
        
        logger.info(f"ModulesEnchainement généré: {response_data['ModulesEnchainement']}")
        logger.info(f"ModulesEnchainementLength: {modules_enchainement_length}")
        logger.info(f"=== FIN APPEL LAMBDA ===")
        
        # Attachement des attributs via l'API Amazon Connect
        if instanceId and initialContactId:
            update_contact_attributes(instanceId, initialContactId, response_data)
        else:
            logger.warning("Impossible d'attacher les attributs - informations de contact manquantes")
        
        return response_data
        
    except Exception as e:
        logger.error(f"Erreur dans lambda_handler: {str(e)}")
        return create_error_response(f"Erreur interne: {str(e)}")


def create_error_response(error_message):
    """Crée une réponse d'erreur standardisée."""
    return {
        'error': error_message,
        'ModulesEnchainement': json.dumps([], ensure_ascii=False),
        'ModulesEnchainementLength': "0"
    }


def update_contact_attributes(instanceId, initialContactId, attributes):
    """
    Met à jour les attributs de contact via l'API Amazon Connect.
    
    Args:
        instanceId (str): ID de l'instance Amazon Connect
        initialContactId (str): ID du contact initial
        attributes (dict): Attributs à mettre à jour
    """
    if not attributes or not instanceId or not initialContactId:
        return
    
    try:
        connect.update_contact_attributes(
            InstanceId=instanceId,
            InitialContactId=initialContactId,
            Attributes=attributes
        )
        logger.info(f"Mise à jour des contact attributes effectuée: {attributes}")
    except Exception as e:
        logger.error(f"Erreur lors de la mise à jour des attributs: {e}")
