import json
import logging
import os
import datetime
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


def lambda_handler(event, context):
    """
    Vérifie de manière robuste si la donnée en entrée est vide, nulle ou non définie.

    Args:
        event (dict): L'événement Lambda.
        context: Le contexte d'exécution.

    Returns:
        bool: True si considéré comme vide, False sinon.
    """
    logger.info(f"Start Lambda {context.function_name} {start_time_lambda}")
    logger.info(f"Réception d'un nouvel événement: {json.dumps(event)}")
    result = {"isEmpty": "true"}

    try:
        # Extraction de la valeur
        # On cherche en priorité la clé spécifique input,
        # puis les paramètres standards Amazon Connect
        val = event
        if isinstance(event, dict):
            if 'input' in event:
                val = event['input']
                logger.info(f"Valeur extraite depuis 'input': {val}")
            elif 'Details' in event and 'Parameters' in event['Details']:
                params = event['Details']['Parameters']
                # Si input est dans les paramètres Connect
                if 'input' in params:
                    val = params['input']
                    logger.info(f"Valeur 'input' extraite depuis Parameters: {val}")
                else:
                    val = params
                    logger.info(f"Valeurs extraites depuis Amazon Connect Parameters: {val}")

        # 1. Nullité absolue
        if val is None:
            logger.info("La valeur est None (null).")
            result = {"isEmpty": "true"}

        # 2. Cas des chaînes de caractères
        elif isinstance(val, str):
            v_clean = val.strip()
            logger.info(f"Type détecté: String. Valeur nettoyée: '{v_clean}'")
            # Vide, "null", "undefined" (cas fréquents en intégration)
            if v_clean == "" or v_clean == "null" or v_clean == "undefined":
                logger.info(f"La chaîne '{val}' est considérée comme VIDE.")
                result = {"isEmpty": "true"}
            else:
                logger.info(f"La chaîne '{val}' contient une donnée valide.")
                result = {"isEmpty": "false"}

        # 3. Cas des collections (Listes, Dictionnaires, Sets, Tuples)
        elif isinstance(val, (list, dict, set, tuple)):
            is_empty = (len(val) == 0)
            logger.info(f"Type détecté: Collection ({type(val).__name__}). Taille: {len(val)}. Est vide: {is_empty}")
            result = {"isEmpty": "true" if is_empty else "false"}

        # 4. Autres types (int, float, bool)
        # Note: 0 et False ne sont PAS considérés comme "vides" ici car ce sont des valeurs.
        else:
            logger.info(f"Type détecté: {type(val).__name__}. Valeur: {val}. Considéré comme NON VIDE.")
            result = {"isEmpty": "false"}

    except Exception as e:
        logger.error(f"Une erreur est survenue lors du test: {str(e)}")
        # En cas d'erreur imprévue, on sécurise en retournant True (mieux vaut considérer vide)
        result = {"isEmpty": "true"}

    execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
    logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
    return result