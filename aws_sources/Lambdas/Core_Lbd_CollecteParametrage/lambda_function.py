# Createur : Afid BENAYAD
# Date : 15/12/2025
# Version : 1.2
# Description : Fonction principale Lambda pour récupérer les paramètres DNIS et le statut du calendrier associé au paramétrage de ce même DNIS.

import boto3
import logging
import os
import datetime
import json

from boto3.dynamodb.conditions import Key
from utils import configure_logger
from constants import LOG_LEVEL_INFO
from typing import Dict, Any, Optional
from attacheDataList import UD

# Initialisation des clients AWS (hors du handler pour les performances "cold start")
connect = boto3.client('connect')
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('PARAM_DNIS_TABLE_NAME')

logger = logging.getLogger()
configure_logger(logger, os.getenv('LOGGER_LEVEL', 'INFO'))
start_time_lambda = datetime.datetime.now(datetime.timezone.utc)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, str]:
    print("Boto3 version:", boto3.__version__)
    """
    Fonction principale Lambda pour récupérer les paramètres de l'objet recu dans l'input de la lambda et le statut du calendrier associé a l'objet.
    """
    try:
        logger.info(f"Start Lambda {context.function_name} {start_time_lambda}")
        # Récupération des paramètres de l'événement avec valeurs par défaut sécurisées
        index = event.get("Details", {}).get("Parameters", {}).get("input", "+33159241926")
        instanceId = event.get("Details", {}).get("ContactData", {}).get("Tags", {}).get("aws:connect:instanceId")
        # initialContactId = event.get("Details", {}).get("ContactData", {}).get("InitialContactId", "")

        # Sécurité : Si l'ID n'est pas dans les tags, on essaie de le deviner depuis l'ARN
        if not instanceId:
             instance_ARN = event.get("Details", {}).get("ContactData", {}).get("InstanceARN", "")
             if instance_ARN:
                instanceId = instance_ARN.split("/")[-1]

        # Recherche des paramètres de l'index
        logger.info(f"Recherche des parametres du {index} dans la Table DynamoDB utilisée: {table_name}")

        dynamodbtable = dynamodb.Table(table_name)

        response = dynamodbtable.query(
            KeyConditionExpression=Key('Dnis').eq(index)
        )
        items = response.get('Items')

        # Construction de l'objet resultat avec gestion des types (Harmonisation JSON)
        resultat = {}

        # Si on trouve des paramètres, on les récupère sinon on affecte des valeurs prédéfinie ou vide par défaut pour éviter les erreurs.
        if items:
            logger.info(f"Paramètres trouvés pour l'index: {index}")
            parametrage = items[0]

            for key, value in parametrage.items():
                if isinstance(value, (list, dict)):
                    # Pour les collections, on utilise json.dumps pour avoir des guillemets doubles et un format JSON valide
                    resultat[key] = json.dumps(value)
                else:
                    # Pour les types simples, str() suffit
                    resultat[key] = str(value)

            # Champs calculés additionnels pour rétro-compatibilité
            if "Modules" in parametrage:
                resultat["ModulesLength"] = str(len(parametrage["Modules"]))

            # on attache les données qui sont renseigné obligatoire dans le tableau UD
            # attributes_to_update = {}
            # for key in UD:
            #     if key in resultat:
            #          attributes_to_update[key] = resultat[key]

            #  if attributes_to_update:
            #     update_contact_attributes_batch(instanceId, initialContactId, attributes_to_update)

        else:
            logger.warning(f"Aucun paramètre trouvé pour l'index: {index} dans la table {table_name}")
            raise Exception(f"Aucun paramétrage trouvé pour l'index {index} dans la table {table_name}")

        execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
        logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
        logger.info(f"Resultat: {resultat}")
        return resultat

    except Exception as e:
        execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
        logger.error(f"Erreur critique dans Lambda {context.function_name}: {str(e)} {execution_time}")
        raise e


# def update_contact_attributes_batch(instanceId: str, initialContactId: str, attributes: Dict[str, str]) -> None:
#     """
#     Met à jour les attributs de contact en une seule fois (Batch)
#     """
#     if not attributes or not instanceId or not initialContactId:
#         return

#     try:
#         connect.update_contact_attributes(
#             InstanceId=instanceId,
#             InitialContactId=initialContactId,
#             Attributes=attributes
#         )
#         logger.info(f"Mise à jour des contacts attributes effectuée: {attributes}")
#     except Exception as e:
#         logger.error(f"Erreur lors de la mise à jour des attributs: {e}")
#         pass
