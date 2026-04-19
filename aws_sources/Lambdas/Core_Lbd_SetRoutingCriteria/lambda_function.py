import json
import logging
import boto3
import os

from enum import Enum
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

from botocore.exceptions import ClientError

from utils import configure_logger, format_contact_log, convert_to_decimal
from validators import validate_event_parameters, validate_event_queue_id
from routing_criteria_builder import getRoutingCriteria, shouldActivateSDA
from aws_service import updateContactRoutingData, updateContactAttributes, getGetCurrentMetricDataAgentsOnline
from journey_repository import getJourney, getMockJourney
from exceptions import InvalidParameterError, JourneyNotFoundError

connect = boto3.client('connect')
dynamodb = boto3.resource('dynamodb')

logger = logging.getLogger()

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, int]:
    start_time_durationProcessing_init1 = datetime.now(timezone.utc) 
    
    # Environment variables    
    log_level = os.environ['LOGGER_LEVEL'] 
    configure_logger(logger, log_level)    
    
    # DEBUG: Log de l'événement complet pour diagnostic
    logger.info(f"DEBUG: Full event structure -> {json.dumps(event, indent=2, default=str)}")
    
    # ---- Extract core identifiers from the Amazon Connect event ----
    contact_data = event['Details']['ContactData']
    contact_id = contact_data['ContactId']
    instance_arn = contact_data['InstanceARN']
    instance_id = instance_arn.split('/')[1]    
    
    start_time_durationProcessing_init2 = datetime.now(timezone.utc)    

    try:
        # Validation et récupération du paramétrage
        params = validate_event_parameters(event, contact_id)
        queue_id = validate_event_queue_id(event, contact_id)

    except (InvalidParameterError, JourneyNotFoundError) as e:
        logger.error(str(e))
        raise Exception(str(e))
    
    logger.debug(f"[{contact_id}] queuePriority -> {params['queue_priority']}")      
    elapse_time_durationProcessing_init2 =  datetime.now(timezone.utc) - start_time_durationProcessing_init2
    logger.debug(f"[{contact_id}] durationProcessing elapse_time_durationProcessing_init2 in {elapse_time_durationProcessing_init2} sec")
        
    start_time_durationProcessing_getJourney = datetime.now(timezone.utc)
    try:
        
        if params['is_mock_journey'] == "True":
            journey = getMockJourney(logger)
        else:
            journey = getJourney(
                dynamodb,
                logger, 
                contact_id, 
                params['journey_name']                
            )            
    except ClientError as e:
        message = format_contact_log(contact_id, f"AWS error getJourney: {e}")        
        logger.error(message)
        raise Exception(message)        
    except Exception as e:
        message = format_contact_log(contact_id, f"Unexpected error getJourney: {e}")
        logger.error(message)
        raise Exception(message) 
    elapse_time_durationProcessing_getJourney =  datetime.now(timezone.utc) - start_time_durationProcessing_getJourney
    logger.debug(f"[{contact_id}] durationProcessing elapse_time_durationProcessing_getJourney in {elapse_time_durationProcessing_getJourney} sec")
    
    start_time_durationProcessing_routingCriteria = datetime.now(timezone.utc)    
    try:
        routingCriteria = getRoutingCriteria(
            contact_id, 
            journey, 
            logger
        )
        logger.info(f"[{contact_id}] routingCriteria -> {routingCriteria}")
        #data = routingCriteria        
    except ClientError as e:        
        message = format_contact_log(contact_id, f"AWS error getRoutingCriteria: {e}")
        logger.error(message)
        raise Exception(message)
    except Exception as e:
        message = format_contact_log(contact_id, f"Unexpected error getRoutingCriteria: {e}")
        logger.error(message)
        raise Exception(message)
    elapse_time_durationProcessing_routingCriteria =  datetime.now(timezone.utc) - start_time_durationProcessing_routingCriteria
    logger.debug(f"[{contact_id}] durationProcessing elapse_time_durationProcessing_routingCriteria in {elapse_time_durationProcessing_routingCriteria} sec")
    
    start_time_durationProcessing_getGetCurrentMetricDataAgentsOnline = datetime.now(timezone.utc)    
    try:
        # Filtrer les steps SDA pour l'appel aux métriques (elles ont OrExpression vide)
        routing_criteria_for_metrics = {
            'Steps': [step for step in routingCriteria['Steps'] if not step.get('SDA')]
        }
        
        if len(routing_criteria_for_metrics['Steps']) > 0:
            responseGetGetCurrentMetricDataAgentsOnline = getGetCurrentMetricDataAgentsOnline(
                contact_id,
                instance_id, 
                connect, 
                queue_id, 
                routing_criteria_for_metrics, 
                logger
            )
        else:
            # Aucune step non-SDA, créer une réponse vide
            responseGetGetCurrentMetricDataAgentsOnline = {}
            logger.debug(f"[{contact_id}] Aucune step non-SDA pour les métriques")
    except ClientError as e:
        message = format_contact_log(contact_id, f"AWS error updateContactRoutingData: {e}")         
        logger.error(message)
        raise Exception(message)
    except Exception as e:
        message = format_contact_log(contact_id, f"Unexpected error updateContactRoutingData: {e}")
        logger.error(message)
        raise Exception(message)
    elapse_time_responseGetGetCurrentMetricDataAgentsOnline = datetime.now(timezone.utc) - start_time_durationProcessing_getGetCurrentMetricDataAgentsOnline
    logger.debug(f"[{contact_id}] durationProcessing elapse_time_responseGetGetCurrentMetricDataAgentsOnline in {elapse_time_responseGetGetCurrentMetricDataAgentsOnline} sec")

    start_time_durationProcessing_routingCriteriaStats = datetime.now(timezone.utc)    
    try:
        routingCriteriaStats = getRoutingCriteria(
            contact_id, 
            journey, 
            logger,
            responseGetGetCurrentMetricDataAgentsOnline
        )
        logger.info(f"[{contact_id}] routingCriteriaStats -> {routingCriteriaStats}")
        
        # Vérifier si le routage SDA doit être activé
        sda_info = shouldActivateSDA(contact_id, journey, logger, responseGetGetCurrentMetricDataAgentsOnline)
        
        if sda_info['activate']:
            # Routage SDA activé
            logger.info(f"[{contact_id}] Routage SDA activé vers: {sda_info['phoneNumber']}")
            return {
                'statusCode': 301,  # Code spécifique pour SDA
                'message': 'SDA_ROUTING',
                'phoneNumber': sda_info['phoneNumber'],
                'stepNumber': sda_info['stepNumber']
            }
                       
    except ClientError as e:        
        message = format_contact_log(contact_id, f"AWS error getRoutingCriteriaStats: {e}")
        logger.error(message)
        raise Exception(message) 
    except Exception as e:
        message = format_contact_log(contact_id, f"Unexpected error getRoutingCriteriaStats: {e}")
        logger.error(message)
        raise Exception(message)
    elapse_time_durationProcessing_routingCriteriaStats =  datetime.now(timezone.utc) - start_time_durationProcessing_routingCriteriaStats
    logger.debug(f"[{contact_id}] durationProcessing elapse_time_durationProcessing_routingCriteriaStats in {elapse_time_durationProcessing_routingCriteriaStats} sec")

    if len(routingCriteriaStats['Steps']) != 0:
        # Filtrer les steps SDA des critères de routage normaux
        filtered_steps = []
        has_agents_available = False
        
        for step in routingCriteriaStats['Steps']:
            # Vérifier si c'est une step SDA (pas de critères de routage agent)
            if step.get('SDA'):
                logger.debug(f"[{contact_id}] Step SDA ignorée pour le routage normal: {step.get('SDA')}")
                continue
            
            # Vérifier si cette step a des agents disponibles (durée > 1s indique des agents disponibles)
            if step['Expiry']['DurationInSeconds'] > 1:
                has_agents_available = True
            
            filtered_steps.append(step)
        
        if len(filtered_steps) > 0 and has_agents_available:
            # Il y a des steps normales (non-SDA) avec des agents disponibles
            routingCriteriaStats['Steps'] = filtered_steps
            
            try:
                start_time_responseUpdateContactRoutingData = datetime.now(timezone.utc) 
                responseUpdateContactRoutingData = updateContactRoutingData(
                    instance_id, 
                    connect, 
                    contact_id,        
                    params['queue_priority'],
                    routingCriteriaStats,
                    logger
                    )       
                elapse_time_responseUpdateContactRoutingData = datetime.now(timezone.utc) - start_time_responseUpdateContactRoutingData
                logger.debug(f"[{contact_id}] responseUpdateContactRoutingData in {elapse_time_responseUpdateContactRoutingData} sec -> {responseUpdateContactRoutingData}")
                statusCode = 200
                message = 'OK'
            except ClientError as e:
                message = format_contact_log(contact_id, f"AWS error updateContactRoutingData: {e}")        
                logger.error(message)
                raise Exception(message)
            except Exception as e:
                message = format_contact_log(contact_id, f"Unexpected error updateContactRoutingData: {e}")
                logger.error(message)
                raise Exception(message)
        else:
            # Aucune step avec des agents disponibles
            logger.info(f"[{contact_id}] Aucun agent disponible - Steps filtrées: {len(filtered_steps)}, Agents disponibles: {has_agents_available}")
            statusCode = 204
            message = 'NO_AGENTS_AVAILABLE'
    else:
        # Aucun agent disponible avec les compétences requises
        logger.info(f"[{contact_id}] Aucun agent disponible avec les compétences requises")
        statusCode = 204
        message = 'NO_AGENTS_AVAILABLE'    
    
    '''
    try:
       start_time_responseUpdateContactAttributes = datetime.now(timezone.utc)
       responseUpdateContactAttributes = updateContactAttributes(
        instance_id, 
        connect, 
        contact_id,        
        json.dumps(routingCriteria, indent=2),
        logger      
        )
       elapse_time_responseUpdateContactAttributes = datetime.now(timezone.utc) - start_time_responseUpdateContactAttributes
    except ClientError as e:        
        logger.error(format_contact_log(contact_id, f"AWS error updateContactAttributes: {e}"))
        raise
    except Exception as e:
        logger.error(format_contact_log(contact_id, f"Unexpected error updateContactAttributes: {e}"))
        raise

    logger.debug(f"[{contact_id}] responseUpdateContactAttributes in {elapse_time_responseUpdateContactAttributes} sec -> {responseUpdateContactAttributes}") 
    '''
    logger.info(f"[{contact_id}] statusCode: {statusCode} message:{message}") 
    return {
        'statusCode': statusCode,
        'message': message       
    }

