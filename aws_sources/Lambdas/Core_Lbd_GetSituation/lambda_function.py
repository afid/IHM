# CRED : Marie DUMBO
# SEE : https://confluence.covea.priv/display/DF/03-Determiner+les+situations+-+Core_Mod_DeterminSituation

import json
import logging
import boto3
import botocore
import os
from datetime import date
from boto3.dynamodb.conditions import Key

# Logging config
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Get table DynamoDB
nomTable = os.environ.get('CENTRALISE_TABLE_NAME')

# Init ressource DynamoDB
dynamodb = boto3.resource('dynamodb')

def getSituation(UC_Marque, UC_Domaine, UC_SousDomaine) :

    logger.info(f"Input parameters : UC_Marque : {UC_Marque}, UC_Domaine : {UC_Domaine}, UC_SousDomaine : {UC_SousDomaine}")
    
    UC_Situation= {}
    UC_Situation["NORMALE"] = 0

    for structure in filter(None, [UC_Marque, UC_Domaine, UC_SousDomaine]):

        logger.info(f"Recherche dans la table {nomTable} la strucure {structure}")

        try:
            tableDdb = dynamodb.Table(nomTable)
            response = tableDdb.get_item(Key={'Structure': structure}, AttributesToGet=['Situations'])

            if "Item" in response : 
                
                if "Situations" in response["Item"]:
                    situationActive = getActiveSituation(response["Item"]["Situations"])

                    # If same situation is active for different structure, get min preponderance (max priority)
                    UC_Situation.update(
                        {
                            key: [min(UC_Situation[key], situationActive[key])] if key in situationActive else UC_Situation[key] for key in UC_Situation
                        })

                    UC_Situation.update({key: situationActive[key] for key in situationActive if key not in UC_Situation})
            
            else :
                logger.warning(f"Structure {structure} absente de la table {tableDdb}")

        except Exception as err:
            #TODO : Remonté et retourné excpetion et différencier 
            logger.error(err)

    # NOTE : Besoin  d'un check "même priorité" ? 
    UC_Situation["NORMALE"] =  max(UC_Situation.values()) +1
    
    logger.info(f"Result UC_Situation : {UC_Situation}")

    return UC_Situation

def getActiveSituation(situationDbd):
    #NOTE : DateFin obligatoire ???

    activeSituation = {}
    today = date.today()

    for situation in situationDbd :
        
        dateDebutStr = situation["DateDebut"]
        dateDebut = date(int(dateDebutStr[6:]), int(dateDebutStr[3:5]) , int(dateDebutStr[:2]))

        dateFinStr = situation["DateFin"]
        dateFin = date(int(dateFinStr[6:]), int(dateFinStr[3:5]) , int(dateFinStr[:2]))

        if dateDebut < today and today < dateFin :
            activeSituation[situation["Situation"]] = situation["Priorite"]

    return activeSituation

def lambda_handler(event, context):

    #TODO : Check paramétre existe avant de get
    UC_Marque = event["Details"]["Parameters"]["UC_Marque"]
    UC_Domaine = event["Details"]["Parameters"]["UC_Domaine"]
    UC_SousDomaine = event["Details"]["Parameters"]["UC_SousDomaine"]

    UC_Situation = getSituation(UC_Marque, UC_Domaine, UC_SousDomaine)

    return {"UC_Situation": UC_Situation}
