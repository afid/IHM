# Createur : Afid BENAYAD
# Date : 15/12/2025
# Version : 1.0
# Description : Lambda pour déterminer le statut d'ouverture ou de fermeture basé sur un calendrier DynamoDB.

import boto3
import logging
import os
import datetime
import zoneinfo

from boto3.dynamodb.conditions import Key
from utils import configure_logger
from constants import LOG_LEVEL_INFO


# Initialisation des clients AWS
connect = boto3.client('connect')
dynamodb = boto3.resource('dynamodb')
table_calendar = os.environ.get('CALENDAR_TABLE_NAME')

logger = logging.getLogger()
configure_logger(logger, os.getenv('LOGGER_LEVEL', 'INFO'))
start_time_lambda = datetime.datetime.now(datetime.timezone.utc)

def is_open_status(status):
    """
    Vérifie si un statut représente une ouverture du service.
    Les types d'ouverture sont: Ouvert, OuvertSansAttente, PreFermeture.
    """
    open_statuses = {
        'Ouvert',
        'OuvertSansAttente',
        'PreFermeture'
    }
    return status in open_statuses

def is_closure_status(status):
    """
    Vérifie si un statut représente une fermeture du service.
    Les motifs de fermeture sont: Ferme, FermetureExceptionnelle,
    FermetureHebdomadaire, FermetureJourFerie.
    """
    closure_statuses = {
        'Ferme',
        'FermetureExceptionnelle',
        'FermetureHebdomadaire',
        'FermetureJourFerie'
    }
    return status in closure_statuses

def is_valid_status(status):
    """
    Vérifie si un statut est valide (ouverture ou fermeture).
    """
    return is_open_status(status) or is_closure_status(status)

def is_time_in_range(time_range_str, current_time):
    """
    Vérifie si l'heure actuelle (datetime.time) est dans la plage horaire string "HH:MM-HH:MM".
    Format: "00:00-23:59" (23:59 est la fin de journée maximale)
    """
    try:
        start_str, end_str = time_range_str.split('-')
        start_h, start_m = map(int, start_str.split(':'))
        end_h, end_m = map(int, end_str.split(':'))

        # Conversion en minutes pour comparaison
        curr_min = current_time.hour * 60 + current_time.minute
        start_min = start_h * 60 + start_m
        end_min = end_h * 60 + end_m

        return start_min <= curr_min < end_min
    except Exception as e:
        logger.error(f"Erreur parsing heure {time_range_str}: {e}")
        return False

def get_status_from_slots(slots_config, current_time):
    """
    Parcourt les slots (format "HH:MM-HH:MM") et retourne le status si match.
    Statuts d'ouverture: Ouvert, OuvertSansAttente, PreFermeture
    Statuts de fermeture: Ferme, FermetureExceptionnelle, FermetureHebdomadaire, FermetureJourFerie
    Par défaut: 'Ferme'
    Structure slots_config: { "HH:MM-HH:MM": { "Status": "..." } } ou Raw DynamoDB deserialized
    """
    if not slots_config:
        return "Ferme"

    for time_range, properties in slots_config.items():
        if is_time_in_range(time_range, current_time):
            # properties est un dict, ex: {'Status': 'Ouvert'}
            status = properties.get('Status', 'Ferme')
            # Valider que le statut est reconnu
            if not is_valid_status(status):
                logger.warning(f"Statut invalide trouvé: {status}, utilisation de 'Ferme' par défaut")
                return 'Ferme'
            return status

    return "Ferme"

def get_day_status_if_total_closure(slots_config):
    """
    Retourne le statut de fermeture si la journée est totalement fermée,
    sinon retourne None.
    Considère tous les motifs de fermeture: Ferme, FermetureExceptionnelle,
    FermetureHebdomadaire, FermetureJourFerie.
    """
    if not slots_config:
        # Pas de slots définis = Fermé par défaut
        return 'Ferme'

    # On cherche le slot 00:00-23:59 explicitement fermé (journée complète)
    slot_full_day = slots_config.get('00:00-23:59')
    if slot_full_day:
        status = slot_full_day.get('Status')
        if is_closure_status(status):
            return status

    # Si on a d'autres slots, ce n'est pas une fermeture totale
    return None

def parse_date(date_str):
    """DD/MM/YYYY"""
    try:
        return datetime.datetime.strptime(date_str, '%d/%m/%Y').date()
    except ValueError:
        logger.error(f"Format date invalide: {date_str}")
        return None

def lambda_handler(event, context):
    try:
        logger.info(f"Start Lambda {context.function_name} {start_time_lambda}")

        # Récupération de l'Id_Calendrier
        Id_Calendrier = event.get("Details").get("Parameters").get("Id_Calendrier")
        logger.info(f"Id_Calendrier: {Id_Calendrier}")

        if not Id_Calendrier:
            logger.warning("Id_Calendrier manquant dans les parametres.")
            execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
            logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
            return {"Status": "Ferme", "Reason": "Id_Calendrier introuvable"}

        logger.info(f"Recherche Calendrier ID: {Id_Calendrier} Table: {table_calendar}")

        table = dynamodb.Table(table_calendar)
        response = table.get_item(Key={'id_Calendar': Id_Calendrier})

        item = response.get('Item')
        if not item:
            logger.error(f"Calendrier non trouvé: {Id_Calendrier}")
            execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
            logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
            return {"Status": "Ferme", "Reason": "NotFound"}

        # 1. Timezone et Heure courante
        tz_name = item.get('TimeZone', 'Europe/Paris')
        try:
            tz = zoneinfo.ZoneInfo(tz_name)
        except Exception:
            logger.warning(f"Timezone inconnu {tz_name}, fallback UTC")
            tz = datetime.timezone.utc

        now = datetime.datetime.now(tz)

        # Simuler une date et heure
        Date_Simulation = event.get("Details").get("Parameters").get("Date_Simulation")
        if Date_Simulation:
            now = datetime.datetime.fromisoformat(str(Date_Simulation))
            logger.info(f"Simulation de la Date courante de {datetime.datetime.now(tz)} en {now}")

        current_date = now.date()
        current_time = now.time()
        current_weekday_idx = now.weekday() # 0=Lundi, 6=Dimanche

        days_map = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        day_name = days_map[current_weekday_idx]

        logger.info(f"Date courante: {current_date}, Heure: {current_time}, Jour: {day_name} ({tz_name})")

        # Configuration
        jours_config = item.get('Jour', {})
        exceptions_config = item.get('JourExceptionnel', {})

        # --- LOGIQUE (Ordre de priorité : Exception > Fermeture Totale > Semaine) ---
        # Statuts retournés:
        # Ouvertures: Ouvert, OuvertSansAttente, PreFermeture
        # Fermetures: Ferme, FermetureExceptionnelle, FermetureHebdomadaire, FermetureJourFerie
        status_final = "Ferme" # Default
        found_status = False

        # 1. Exception (Priorité Max)
        # Format exception key: "DD/MM/YYYY"
        # Cas: jours fériés, ouvertures exceptionnelles, fermetures spéciales
        date_str = current_date.strftime('%d/%m/%Y')
        if date_str in exceptions_config:
                logger.info(f"Date exceptionnelle trouvée: {date_str}")
                slots = exceptions_config[date_str]
                status_final = get_status_from_slots(slots, current_time)
                logger.info(f"Status depuis exception: {status_final}")
                found_status = True

        # 2. Fermeture Totale Hebdomadaire
        # Si le jour de semaine standard (ex: Dimanche) est configuré "Fermé Totalement",
        # on le considère fermé avec le motif exact de fermeture (Ferme, FermetureHebdomadaire, etc.)
        if not found_status:
            standard_day_slots = jours_config.get(day_name)
            closure_status = get_day_status_if_total_closure(standard_day_slots)
            if closure_status:
                logger.info(f"Journée standard ({day_name}) en fermeture totale: {closure_status}")
                status_final = closure_status
                found_status = True

        # 3. Semaine Type (Weekday)
        # Applique les horaires standards (Lundi-Dimanche) de la semaine type
        # Retourne le type d'ouverture/fermeture exact pour ce créneau
        if not found_status:
            logger.info(f"Verification conf semaine pour: {day_name}")
            slots = jours_config.get(day_name)
            if slots:
                status_final = get_status_from_slots(slots, current_time)
                logger.info(f"Status depuis semaine type: {status_final}")
            else:
                # Pas de config => Fermé
                logger.info(f"Aucune config pour {day_name}, fermé par défaut")
                status_final = "Ferme"

        resultat = {"Status": status_final}
        logger.info(f"Status final retourne:: {resultat}")
        execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
        logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
        return resultat

    except Exception as e:
        logger.error(f"Erreur critique Lambda {context.function_name}: {e}", exc_info=True)
        execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
        logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
        return {"Status": "Ferme", "Error": str(e)}
