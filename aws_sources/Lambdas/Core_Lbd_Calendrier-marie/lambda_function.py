# Createur : Afid BENAYAD
# Contributeur : Marie DUMBO
# Date création : 15/12/2025
# Date modification : 20/02/2026
# Version : 1.1
# Description : Lambda pour déterminer le statut d'ouverture ou de fermeture basé sur un calendrier DynamoDB
# SEE : https://confluence.covea.priv/display/DF/01+-+Calendriers+-+Core_Mod_Calendrier

import boto3
import logging
import os
import datetime
import zoneinfo

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Init des clients AWS
dynamodb = boto3.resource('dynamodb')
table_calendar = os.environ.get('CALENDAR_TABLE_NAME')

# Config logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Init variable
start_time_lambda = datetime.datetime.now(datetime.timezone.utc)
list_type_ouverture = ["Ouvert", "Ouvert Sans Attente"]

def get_info_calendrier(calendrier, date_simulation) :
           
    logger.info(f"Recherche Calendrier ID: {calendrier} Dynamo : {table_calendar}")

    try :
        table = dynamodb.Table(table_calendar)
        response = table.get_item(Key={"id_Calendar": calendrier})

        item = response.get("Item")
        if not item :
            logger.error(f"Aucun calendrier {calendrier} dans dynamo {table_calendar}")

            return {
                "UC_Etat" : "Ferme",
                "Erreur": "Calendrier absent de la dynamo"
            }

        ####
        # 1. Traitement Timezone
        ####
        tz_name = item.get("TimeZone", "Europe/Paris")

        try:
            tz = zoneinfo.ZoneInfo(tz_name)

        except Exception:
            logger.warning(f"Timezone inconnu {tz_name}, configure UTC")
            tz = datetime.timezone.utc

        ####
        # 2. Traitement date et heure
        ####
        now = datetime.datetime.now(tz)

        # Vérif et config si date simulée
        if date_simulation:
            now = datetime.datetime.fromisoformat(str(date_simulation))
            logger.info(f"Simulation de la Date courante de {datetime.datetime.now(tz)} en {now}")

        current_date = now.date()
        current_time = now.time()
        current_weekday_idx = now.weekday() # 0=Lundi, 6=Dimanche

        days_map = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        day_name = days_map[current_weekday_idx]

        logger.info(f"Date courante: {current_date}, Heure: {current_time}, Jour: {day_name} ({tz_name})")

        ####
        # 3. Traitement jour Exception (Priorité Max)
        ####
        exceptions_config = item.get('JourExceptionnel', {})

        # JourExceptionnel dynamo au format DD/MM/YYYY
        date_str = current_date.strftime('%d/%m/%Y')

        if date_str in exceptions_config:
                logger.info(f"Date exceptionnelle trouvée : {date_str}")

                if exceptions_config[date_str].get("Slots"):
                    return get_info_from_slots(exceptions_config[date_str]["Slots"], current_time)

                else :
                    logger.error(f"Dans dynamo {table_calendar} aucun slot trouvé pour jour excpetionnel {date_str} dans calendrier {calendrier}")
                    return {
                        "UC_Etat" : "Ferme",
                        "Erreur": "Aucun slots"
                    }

        ####
        # 2. Traitement jour semaine
        ####
        jours_config = item.get('Jour', {})
        today_slots = jours_config.get(day_name)
        
        if today_slots:
            return get_info_from_slots(today_slots, current_time)

        else :
            logger.warning(f"Dans dynamo {table_calendar} aucun slot trouvé pour jour {day_name} dans calendrier {calendrier}")
            return {
                "UC_Etat" : "Ferme"
            }
        
    except ClientError as cli_err:
        logger.error(f"Erreur DynamoDB : {cli_err}")
        raise Exception("Erreur traitement Dynamo DB")

def get_info_from_slots(slots_config, current_time):

    # Init resultat
    resultat = {}
    resultat["UC_Etat"] = "Ferme"
 
    for time_range in slots_config :

        if is_time_in_range(time_range, current_time):
            
            if slots_config[time_range].get("Status") and slots_config[time_range].get("Status") in list_type_ouverture :

                resultat["UC_Etat"] = "Ouvert"
                resultat["UC_ParcoursTheorique"] = slots_config[time_range].get("Action")
                
            else : 
                resultat["UC_Action"] = slots_config[time_range]["Status"].get("Action")

            logger.info(f"Succès récupération état et action du calendrier")

    return resultat

def is_time_in_range(time_range_str, current_time):
    """
    Vérifie si l'heure actuelle (datetime.time) est dans la plage horaire string "HH:MM-HH:MM".
    """
    try:
        start_str, end_str = time_range_str.split('-')
        start_h, start_m = map(int, start_str.split(':'))
        end_h, end_m = map(int, end_str.split(':'))

        start_time = datetime.time(start_h, start_m)
        if end_h == 24 and end_m == 0:
            end_h = 23
            end_m = 59
        end_time = datetime.time(end_h, end_m)

        # Gestion du cas 24:00 (noté 24:00 dans le JSON mais datetime n'accepte que 00:00-23:59)
        # Si end_time est 24:00 (ou 00:00 le lendemain), on considère la fin de journée.

        curr_min = current_time.hour * 60 + current_time.minute
        start_min = start_h * 60 + start_m

        if end_h == 24 and end_m == 0:
            end_min = 24 * 60
        else:
            end_min = end_h * 60 + end_m

        return start_min <= curr_min < end_min

    except Exception as e:
        logger.error(f"Erreur parsing heure {time_range_str}: {e}")
        return False

def lambda_handler(event, context):

    logger.info(f"Start Lambda {context.function_name} {start_time_lambda}")
    logger.info(f"event {event}")
    
    try:
        # Récupération paramétre
        # id_calendrier = event.get("Details").get("Parameters").get("input")
        id_calendrier = event.get("Details").get("Parameters").get("Id_Calendrier")

        date_simulation = event["Details"]["ContactData"]["Attributes"].get("Date_Simulation")
        logger.info(f"id_calendrier: {id_calendrier}")


        # Vérif paramétre obligatoire
        if not id_calendrier:
            logger.error("id_calendrier manquant dans les parametres")

            execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
            logger.info(f"Fin Lambda {context.function_name}, durée d'execution: {execution_time}")

            return {
                "UC_Etat": "Ferme", 
                "Erreur": "Id_Calendrier introuvable"
            }
        
        info_calendrier = get_info_calendrier(id_calendrier, date_simulation)

        logger.info(f"Resultat final : {info_calendrier}")

        execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
        logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")
        
        return info_calendrier

    except Exception as e:
        logger.error(f"Erreur critique Lambda {context.function_name}: {e}", exc_info=True)

        execution_time = datetime.datetime.now(datetime.timezone.utc) - start_time_lambda
        logger.info(f"End Lambda {context.function_name}, durée de l'execution: {execution_time}")

        return {
            "UC_Etat" : "Ferme",
            "Erreur": str(e)
        }