import json
import boto3
from botocore.exceptions import ClientError
import logging
import os
import datetime
from AttachDataList import UC

# Configuration du logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Clients AWS
dynamodb = boto3.resource('dynamodb')
connect = boto3.client('connect')

# Tables DynamoDB depuis les variables d'environnement
table_parametrage_segment = os.environ.get('TABLE_PARAMETRAGE_SEGMENT', 'Core_Ddb_CiblageParametrageSegments')
table_parametrage_structure = os.environ.get('TABLE_PARAMETRAGE_STRUCTURE', 'Core_Ddb_ParametrageCentralise')

def get_default_value(attr):
    """
    Retourne la valeur par défaut pour un attribut obligatoire.
    
    Args:
        attr: Nom de l'attribut
    
    Returns:
        str: Valeur par défaut appropriée
    """
    if attr in ("ModulesPreCiblage", "ModulesPostCiblage"):
        return "[]"
    elif attr in ("ModulesPreCiblageLength", "ModulesPostCiblageLength"):
        return "0"
    else:
        return ""

def calculate_modules_length(modules_data):
    """
    Calcule la longueur d'une liste de modules.
    
    Args:
        modules_data: Liste de modules (list, str JSON, ou None)
    
    Returns:
        str: Longueur de la liste sous forme de chaîne, "0" si vide ou erreur
    """
    if not modules_data:
        return "0"
    try:
        if isinstance(modules_data, str):
            modules_list = json.loads(modules_data)
        else:
            modules_list = modules_data
        return str(len(modules_list)) if isinstance(modules_list, list) else "0"
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        logger.warning(f"Erreur lors du calcul de la longueur des modules: {e}")
        return "0"

def lambda_handler(event, context):
    """
    Lambda de paramétrage pour récupérer les informations de segment depuis DynamoDB
    
    Paramètres d'entrée:
    - UC_Segment: Le segment de distribution (clé primaire)
    - UC_SousDomaine: Le sous-domaine pour la recherche d'Etat (optionnel)
    - UC_Domaine: Le domaine pour la recherche d'Etat si UC_SousDomaine absent (optionnel)
    - colonnes_demandees: Liste des colonnes à récupérer (ex: "Modules,Etat")
    
    Logique de recherche pour Etat:
    1. Segment → GroupementSegment (table AAN_ParametrageSegment)
    2. Si UC_SousDomaine fourni: SousDomaine → Domaine → Marque (table Core_Parametrage_Structure)
    3. Si UC_SousDomaine absent mais UC_Domaine fourni: Domaine → Marque (table Core_Parametrage_Structure)
    
    Retourne les valeurs des colonnes demandées avec gestion de l'héritage complet
    """
    
    try:
        # Extraction des paramètres d'entrée
        segment_distribution = event.get('Details', {}).get('ContactData', {}).get('Attributes', {}).get('UC_Segment')
        sous_domaine = event.get('Details', {}).get('ContactData', {}).get('Attributes', {}).get('UC_SousDomaine')
        domaine = event.get('Details', {}).get('ContactData', {}).get('Attributes', {}).get('UC_Domaine')
        colonnes_demandees_str = event.get('Details', {}).get('Parameters', {}).get('colonnes_demandees', '')
        
        # Récupération des informations de contact pour l'attachement
        instanceId = event.get("Details", {}).get("ContactData", {}).get("Tags", {}).get("aws:connect:instanceId")
        contact_id = event.get("Details", {}).get("ContactData", {}).get("ContactId", "")
        initialContactId = event.get("Details", {}).get("ContactData", {}).get("InitialContactId", "")
        
        # Sécurité : Si l'ID n'est pas dans les tags, on essaie de le deviner depuis l'ARN
        if not instanceId:
            instance_ARN = event.get("Details", {}).get("ContactData", {}).get("InstanceARN", "")
            if instance_ARN:
                instanceId = instance_ARN.split("/")[-1]
        
        # Validation des paramètres
        if not segment_distribution:
            logger.error("UC_Segment manquant dans les attributs de contact")
            return create_error_response("UC_Segment manquant")
        
        if not colonnes_demandees_str:
            logger.error("colonnes_demandees manquant dans les paramètres")
            return create_error_response("colonnes_demandees manquant")
        
        # Conversion de la chaîne en liste
        colonnes_demandees = [col.strip() for col in colonnes_demandees_str.split(',')]
        
        logger.info(f"=== APPEL LAMBDA AAN_Parametrage_Segment ===")
        logger.info(f"Segment demandé: {segment_distribution}")
        logger.info(f"Sous-domaine: {sous_domaine}")
        logger.info(f"Domaine: {domaine}")
        logger.info(f"Colonnes demandées: {colonnes_demandees}")
        logger.info(f"Contact ID: {event.get('Details', {}).get('ContactData', {}).get('ContactId', 'N/A')}")
        
        # Récupération des données depuis DynamoDB avec gestion de l'héritage
        result_data = get_segment_data(segment_distribution, colonnes_demandees, sous_domaine, domaine)
        
        # Préparation de la réponse
        response_data = {}
        
        for colonne in colonnes_demandees:
            if colonne in result_data:
                # Conversion spéciale pour les listes (comme ModulesPreCiblage et ModulesPostCiblage)
                if isinstance(result_data[colonne], list):
                    response_data[colonne] = json.dumps(result_data[colonne], ensure_ascii=False)
                else:
                    response_data[colonne] = result_data[colonne]
                
                # Gestion spéciale pour les colonnes ModulesPreCiblage et ModulesPostCiblage
                if colonne == 'ModulesPreCiblage' and result_data[colonne]:
                    response_data['ModulesPreCiblageLength'] = calculate_modules_length(result_data[colonne])
                
                if colonne == 'ModulesPostCiblage' and result_data[colonne]:
                    response_data['ModulesPostCiblageLength'] = calculate_modules_length(result_data[colonne])
            else:
                response_data[colonne] = ""
        
        logger.info(f"Réponse générée pour {segment_distribution}: {response_data}")
        logger.info(f"=== FIN APPEL LAMBDA ===")
        
        # Préparation de la réponse avec attachement automatique des attributs obligatoires
        # Utilisation du mécanisme AttachDataList pour forcer l'attachement de ModulesPreCiblage, ModulesPreCiblageLength, ModulesPostCiblage et ModulesPostCiblageLength
        final_response = {}
        
        # Ajout des données demandées
        for key, value in response_data.items():
            final_response[key] = value
        
        # Ajout des attributs obligatoires définis dans AttachDataList
        for attr in UC:
            if attr not in final_response:
                if attr == "ModulesPreCiblageLength":
                    final_response[attr] = calculate_modules_length(final_response.get("ModulesPreCiblage"))
                elif attr == "ModulesPostCiblageLength":
                    final_response[attr] = calculate_modules_length(final_response.get("ModulesPostCiblage"))
                elif attr == "ModulesPreCiblage":
                    final_response[attr] = "[]"
                elif attr == "ModulesPostCiblage":
                    final_response[attr] = "[]"
                else:
                    final_response[attr] = ""
        
        logger.info(f"Réponse finale avec AttachDataList (ModulesPreCiblage/ModulesPostCiblage et leurs longueurs): {final_response}")
        
        # Attachement automatique des attributs obligatoires via l'API Amazon Connect
        # IMPORTANT: On attache TOUJOURS les 4 attributs pour éviter de réutiliser les anciennes valeurs
        attributes_to_update = {
            attr: final_response.get(attr, get_default_value(attr))
            for attr in UC
        }
        
        if attributes_to_update and instanceId and initialContactId:
            update_contact_attributes_batch(instanceId, initialContactId, attributes_to_update)
            logger.info(f"Attributs attachés automatiquement: {attributes_to_update}")
        else:
            logger.warning("Impossible d'attacher les attributs - informations de contact manquantes")
        
        # Retour direct des attributs pour Amazon Connect
        return final_response
        
    except Exception as e:
        logger.error(f"Erreur dans lambda_handler: {str(e)}")
        return create_error_response(f"Erreur interne: {str(e)}")


def get_segment_data(segment, colonnes_demandees, sous_domaine=None, domaine=None):
    """
    Récupère les données du segment avec gestion de l'héritage via Groupement
    et recherche étendue pour Etat via la hiérarchie SousDomaine → Domaine → Marque
    """
    table = dynamodb.Table(table_parametrage_segment)
    
    try:
        # Tentative de récupération directe du segment
        response = table.get_item(Key={'Segment': segment})
        
        if 'Item' not in response:
            logger.warning(f"Segment {segment} non trouvé dans la table")
            return {}
        
        item = response['Item']
        result_data = {}
        
        # Pour chaque colonne demandée
        for colonne in colonnes_demandees:
            if colonne in item and item[colonne]:
                # La valeur existe et n'est pas vide
                result_data[colonne] = format_dynamodb_value(item[colonne])
                logger.info(f"Valeur trouvée pour {colonne} dans {segment}: {result_data[colonne]}")
            elif 'Groupement' in item and item['Groupement']:
                # Héritage: chercher dans le groupement parent
                logger.info(f"Héritage: recherche de {colonne} dans le groupement {item['Groupement']} pour le segment {segment}")
                parent_value = get_value_from_parent(item['Groupement'], colonne)
                if parent_value is not None:
                    result_data[colonne] = parent_value
                    logger.info(f"Valeur héritée pour {colonne}: {parent_value}")
                else:
                    logger.info(f"Aucune valeur trouvée pour {colonne} dans le groupement {item['Groupement']}")
                    # Recherche étendue pour Etat uniquement dans la table structure
                    if colonne == 'Etat':
                        extended_value = get_etat_from_structure_hierarchy_with_fallback(sous_domaine, domaine)
                        if extended_value is not None:
                            result_data[colonne] = extended_value
                            logger.info(f"Valeur Etat trouvée via hiérarchie structure: {extended_value}")
            else:
                logger.info(f"Aucune valeur trouvée pour {colonne} dans {segment} (pas de groupement défini)")
                # Recherche étendue pour Etat uniquement dans la table structure
                if colonne == 'Etat':
                    extended_value = get_etat_from_structure_hierarchy_with_fallback(sous_domaine, domaine)
                    if extended_value is not None:
                        result_data[colonne] = extended_value
                        logger.info(f"Valeur Etat trouvée via hiérarchie structure: {extended_value}")
        
        return result_data
        
    except ClientError as e:
        logger.error(f"Erreur DynamoDB: {e.response['Error']['Message']}")
        raise e

def get_value_from_parent(groupement, colonne):
    """
    Récupère une valeur depuis le groupement parent
    """
    table = dynamodb.Table(table_parametrage_segment)
    
    try:
        response = table.get_item(Key={'Segment': groupement})
        
        if 'Item' in response and colonne in response['Item']:
            return format_dynamodb_value(response['Item'][colonne])
        
        return None
        
    except ClientError as e:
        logger.error(f"Erreur lors de la récupération du parent {groupement}: {e.response['Error']['Message']}")
        return None

def get_etat_from_structure_hierarchy_with_fallback(sous_domaine, domaine):
    """
    Recherche la valeur Etat dans la hiérarchie de structure avec fallback :
    - Si sous_domaine fourni : SousDomaine → Domaine → Marque
    - Si sous_domaine absent/vide mais domaine fourni : Domaine → Marque
    - Si aucun des deux : pas de recherche
    """
    if sous_domaine:
        logger.info(f"Recherche Etat dans la hiérarchie structure pour sous-domaine: {sous_domaine}")
        return get_etat_from_structure_hierarchy(sous_domaine)
    elif domaine:
        logger.info(f"Fallback: recherche Etat dans la hiérarchie structure pour domaine: {domaine}")
        return get_etat_from_structure_hierarchy_starting_from_domaine(domaine)
    else:
        logger.info("Aucun sous-domaine ni domaine fourni, pas de recherche étendue d'Etat")
        return None

def get_etat_from_structure_hierarchy_starting_from_domaine(domaine):
    """
    Recherche la valeur Etat dans la hiérarchie de structure en commençant par le domaine :
    Domaine → Marque
    """
    table = dynamodb.Table(table_parametrage_structure)
    
    try:
        logger.info(f"Recherche Etat dans la hiérarchie structure pour domaine: {domaine}")
        
        # 1. Recherche au niveau Domaine
        etat_value = get_etat_from_structure_item(table, domaine, "domaine")
        if etat_value is not None:
            logger.info(f"Etat trouvé au niveau domaine: {etat_value}")
            return etat_value
        
        # 2. Récupération du parent (Marque) depuis le Domaine
        marque = get_parent_from_structure(table, domaine, "domaine")
        if marque:
            logger.info(f"Recherche Etat au niveau marque: {marque}")
            etat_value = get_etat_from_structure_item(table, marque, "marque")
            if etat_value is not None:
                logger.info(f"Etat trouvé au niveau marque: {etat_value}")
                return etat_value
        
        logger.info("Aucun Etat trouvé dans la hiérarchie structure (domaine → marque)")
        return None
        
    except ClientError as e:
        logger.error(f"Erreur lors de la recherche dans la hiérarchie structure: {e.response['Error']['Message']}")
        return None

def get_etat_from_structure_hierarchy(sous_domaine):
    """
    Recherche la valeur Etat dans la hiérarchie de structure :
    SousDomaine → Domaine → Marque
    """
    table = dynamodb.Table(table_parametrage_structure)
    
    try:
        logger.info(f"Recherche Etat dans la hiérarchie structure pour sous-domaine: {sous_domaine}")
        
        # 1. Recherche au niveau SousDomaine
        etat_value = get_etat_from_structure_item(table, sous_domaine, "sous-domaine")
        if etat_value is not None:
            logger.info(f"Etat trouvé au niveau sous-domaine: {etat_value}")
            return etat_value
        
        # 2. Récupération du parent (Domaine) depuis le SousDomaine
        domaine = get_parent_from_structure(table, sous_domaine, "sous-domaine")
        if domaine:
            logger.info(f"Recherche Etat au niveau domaine: {domaine}")
            etat_value = get_etat_from_structure_item(table, domaine, "domaine")
            if etat_value is not None:
                logger.info(f"Etat trouvé au niveau domaine: {etat_value}")
                return etat_value
            
            # 3. Récupération du parent (Marque) depuis le Domaine
            marque = get_parent_from_structure(table, domaine, "domaine")
            if marque:
                logger.info(f"Recherche Etat au niveau marque: {marque}")
                etat_value = get_etat_from_structure_item(table, marque, "marque")
                if etat_value is not None:
                    logger.info(f"Etat trouvé au niveau marque: {etat_value}")
                    return etat_value
        
        logger.info("Aucun Etat trouvé dans la hiérarchie structure")
        return None
        
    except ClientError as e:
        logger.error(f"Erreur lors de la recherche dans la hiérarchie structure: {e.response['Error']['Message']}")
        return None

def get_etat_from_structure_item(table, key_value, type_value):
    """
    Récupère la valeur Etat d'un item spécifique dans Core_Ddb_ParametrageCentralise.
    Utilise get_item pour une récupération optimale (Structure est la clé primaire).
    
    Args:
        table: Table DynamoDB
        key_value: Valeur de la clé Structure
        type_value: Type attendu (sous-domaine, domaine, marque) pour validation
    
    Returns:
        str ou None: Valeur de Etat si trouvée, None sinon
    """
    try:
        # Utilisation de get_item (Structure est la clé primaire)
        response = table.get_item(Key={'Structure': key_value})
        
        if 'Item' in response:
            item = response['Item']
            # Validation du Type pour s'assurer qu'on est au bon niveau hiérarchique
            if item.get('Type') == type_value:
                if 'Etat' in item and item['Etat']:
                    return format_dynamodb_value(item['Etat'])
            else:
                logger.warning(f"Type mismatch pour {key_value}: attendu {type_value}, trouvé {item.get('Type')}")
        
        return None
        
    except ClientError as e:
        logger.error(f"Erreur lors de la récupération de Etat pour {key_value} ({type_value}): {e.response['Error']['Message']}")
        return None

def get_parent_from_structure(table, key_value, type_value):
    """
    Récupère la valeur Parent d'un item spécifique dans Core_Ddb_ParametrageCentralise.
    Utilise get_item pour une récupération optimale (Structure est la clé primaire).
    
    Args:
        table: Table DynamoDB
        key_value: Valeur de la clé Structure
        type_value: Type attendu (sous-domaine, domaine, marque) pour validation
    
    Returns:
        str ou None: Valeur du Parent si trouvée, None sinon
    """
    try:
        # Utilisation de get_item (Structure est la clé primaire)
        response = table.get_item(Key={'Structure': key_value})
        
        if 'Item' in response:
            item = response['Item']
            # Validation du Type pour s'assurer qu'on est au bon niveau hiérarchique
            if item.get('Type') == type_value:
                if 'Parent' in item and item['Parent']:
                    return format_dynamodb_value(item['Parent'])
            else:
                logger.warning(f"Type mismatch pour {key_value}: attendu {type_value}, trouvé {item.get('Type')}")
        
        return None
        
    except ClientError as e:
        logger.error(f"Erreur lors de la récupération du Parent pour {key_value} ({type_value}): {e.response['Error']['Message']}")
        return None

def format_dynamodb_value(value):
    """
    Formate les valeurs DynamoDB pour la réponse
    """
    if isinstance(value, dict):
        # Gestion des types DynamoDB (List, etc.)
        if 'L' in value:
            # Type List
            return [item.get('S', str(item)) for item in value['L']]
        elif 'S' in value:
            # Type String
            return value['S']
        else:
            return str(value)
    else:
        return value

def create_error_response(error_message):
    """
    Crée une réponse d'erreur standardisée
    """
    return {
        'error': error_message
    }

def update_contact_attributes_batch(instanceId: str, initialContactId: str, attributes: dict) -> None:
    """
    Met à jour les attributs de contact en une seule fois (Batch) via l'API Amazon Connect
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
        pass
