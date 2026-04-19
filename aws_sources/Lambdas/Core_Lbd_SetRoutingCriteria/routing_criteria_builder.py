import logging
from typing import Dict, Any, List, Union
from enum import Enum

from exceptions import RoutingConfigurationError

class TargetsType(Enum):
    GROUPS = 'groups'
    AGENTS = 'agents'
    PHONENUMBER = 'phonenumber'

def shouldActivateSDA(contact_id: str, journey: Dict[str, Any], logger: logging.Logger, stats: Dict[str, Union[int, float]] = None) -> Dict[str, Any]:
    """
    Détermine si le routage SDA doit être activé et retourne les informations nécessaires
    
    Returns:
        Dict avec 'activate': bool, 'phoneNumber': str, 'stepNumber': int
    """
    result = {'activate': False, 'phoneNumber': None, 'stepNumber': None}
    
    targetsStep = journey.get('targetsStep', [])
    if not targetsStep:
        return result
    
    # Rechercher les steps SDA
    sda_steps = []
    for idx, target in enumerate(targetsStep, start=1):
        if target['type'] == TargetsType.PHONENUMBER.value:
            phone_numbers = target['targetDefinition'].get('phoneNumbers', [])
            if phone_numbers:
                sda_steps.append({
                    'stepNumber': idx,
                    'phoneNumber': phone_numbers[0],  # Prendre le premier numéro
                    'isFirst': idx == 1,
                    'isLast': idx == len(targetsStep)
                })
    
    if not sda_steps:
        return result
    
    # Cas 1: SDA en première position
    first_sda = next((step for step in sda_steps if step['isFirst']), None)
    if first_sda:
        result = {
            'activate': True,
            'phoneNumber': first_sda['phoneNumber'],
            'stepNumber': first_sda['stepNumber']
        }
        logger.info(f"[{contact_id}] SDA activé - première étape: {first_sda['phoneNumber']}")
        return result
    
    # Cas 2: SDA en dernière position ET toutes les étapes précédentes sans agents
    last_sda = next((step for step in sda_steps if step['isLast']), None)
    if last_sda and stats:
        all_previous_empty = True
        for i in range(1, last_sda['stepNumber']):
            if stats.get(f"step{i}_AgentsOnline", 0) > 0:
                all_previous_empty = False
                break
        
        if all_previous_empty:
            result = {
                'activate': True,
                'phoneNumber': last_sda['phoneNumber'],
                'stepNumber': last_sda['stepNumber']
            }
            logger.info(f"[{contact_id}] SDA activé - dernière étape sans agents précédents: {last_sda['phoneNumber']}")
            return result
    
    logger.debug(f"[{contact_id}] SDA non activé")
    return result

def getRoutingCriteria(contact_id: str, journey: Dict[str, Any], logger: logging.Logger, *args: Dict[str, Union[int, float]]) -> Dict[str, Any]:
    steps = []    
    stepEnlargementStepLevel = []
    enlargementNextStepLevel = None    
    routingCriteria = {}            

    targetsStep = journey.get('targetsStep', [])
        
    if not targetsStep:
        raise RoutingConfigurationError(
            f"[{contact_id}] Journey has no target steps defined"
        )

    totalStep = len(targetsStep)
    
    if totalStep > 5:
        raise RoutingConfigurationError(
            f"[{contact_id}] illegal argument : five steps max in a routing criteria ! -> configuration {journey.get('targetsStep', [])}"
        )   
    
    logger.debug(f"[{contact_id}] getroutingCriteria -> totalStep {len(journey.get('targetsStep', []))}")


    if targetsStep:
        targetStepRemove = []
        isTargetStepRemove = False        
               
        for idxTargetsStep, target in enumerate(targetsStep, start=1):
            stepTemplate = {}                                                                       
            stepTemplate['Expiry'] = {}
            stepTemplate['Expiry']['DurationInSeconds'] = 9999
            stepTemplate['Expression'] = {}
            stepTemplate['Expression']['OrExpression'] = []

            step = {}
            step[f"{idxTargetsStep}"] = dict(stepTemplate)
            if target['targetDefinition']['duration'] == 0 and target['targetDefinition']['overflow'] == True:            
                raise RoutingConfigurationError(f"[{contact_id}] illegal argument : step{idxTargetsStep} if duration = 0 -> overflow = False")

            if target['targetDefinition']['duration'] > 0 and target['targetDefinition']['duration'] < 30:
            #if target['targetDefinition']['duration'] < 30:
                raise RoutingConfigurationError(f"[{contact_id}] illegal argument : step{idxTargetsStep} duration = 0 or duration > 30 sec -> configuration {target['targetDefinition']['duration']} sec")
            step[f"{idxTargetsStep}"]['Expiry']['DurationInSeconds'] = target['targetDefinition']['duration']      
            #TODO : save overflow status ?
            targetType = target['type']
            logger.debug(f"[{contact_id}] targetType{idxTargetsStep} -> {targetType}")

            match targetType:
                case TargetsType.GROUPS.value:                    
                    groups = target['targetDefinition'].get('groups', [])                    
                    if groups:                     

                        for idxGroups, group in enumerate(groups, start=1):
                            andExpressionTemplate = {}                                                                       
                            andExpressionTemplate = {                                
                                'AndExpression' : {}
                            }                                         
                            #print(f" andExpressionTemplate -> {andExpressionTemplate}")
                            andExpression = {}
                            andExpression[f"{idxGroups}"] = dict(andExpressionTemplate)                         
                            andExpression[f"{idxGroups}"]['AndExpression'] = group

                            # Number logical AND in CriteriaRouting expression less than 9 ?
                            if int(len(andExpression[f"{idxGroups}"]['AndExpression'])/2) > 8:
                                    raise RoutingConfigurationError(f"[{contact_id}] illegal argument : eight attributes max using the AND condition ! -> configuration {andExpression[f"{idxGroups}"]['AndExpression']}")
                            
                            step[f"{idxTargetsStep}"]['Expression']['OrExpression'].append(andExpression[f"{idxGroups}"])                           
                            
                        #enlargement rule (add RoutingExpression step n if overflow=false, i.e. Élargissement)
                        if isOverFlow(idxTargetsStep, journey, logger, contact_id) != True:
                            # overflow=false → Élargissement : ajouter les critères aux étapes suivantes
                            stepEnlargementStepLevel.append(step[f"{idxTargetsStep}"]['Expression']['OrExpression'].copy())
                        else:
                            # overflow=true → Débordement : ne pas ajouter aux étapes suivantes
                            stepEnlargementStepLevel.append([])                        
                        
                        if idxTargetsStep == enlargementNextStepLevel:
                            index = idxTargetsStep-2
                            workInProgress = True
                            while workInProgress:                                
                                #print(f"{idxTargetsStep} stepEnlargementStepLevel[max]:{index} -> {stepEnlargementStepLevel[index]}")
                                stepEnlargementGroupsTmp = stepEnlargementStepLevel[index]                                

                                for idxStepEnlargementGroup, stepEnlargementGroup in enumerate(stepEnlargementGroupsTmp, start=1):
                                    step[f"{idxTargetsStep}"]['Expression']['OrExpression'].append(stepEnlargementGroup)
                                if int(len(step[f"{idxTargetsStep}"]['Expression']['OrExpression'])/2) > 3:
                                    raise RoutingConfigurationError(f"[{contact_id}] illegal argument : three OR conditions max in a routing step ! -> configuration {step[f"{idxTargetsStep}"]['Expression']['OrExpression']}")
                                if index == 0 or stepEnlargementGroupsTmp == []: 
                                    workInProgress = False
                                else:
                                    index = index - 1
                        if isOverFlow(idxTargetsStep, journey, logger, contact_id) != True:
                            # overflow=false → Élargissement : préparer l'élargissement pour l'étape suivante
                            enlargementNextStepLevel = idxTargetsStep+1
                            #print(f"{idxTargetsStep} step+1:{enlargementNextStepLevel} stepEnlargementStepLevel[{enlargementNextStepLevel}] -> {stepEnlargementStepLevel[len(enlargementNextStepLevel)]}")
                        else:
                            # overflow=true → Débordement : arrêter l'élargissement
                            enlargementNextStepLevel = None

                        #enlargement rule (conserver step selon la logique overflow)
                        if isDurationInSecondsEqualZero(idxTargetsStep-1, journey, logger, contact_id) == False:
                            # Vérifier si cette step doit être conservée selon la logique overflow
                            should_keep_step = True
                            
                            # Si aucun agent disponible sur cette step
                            if not isAgentsOnlineCurrentStep(idxTargetsStep, contact_id, logger, *args):
                                # Si overflow=true (Débordement), ne pas conserver la step
                                if isOverFlow(idxTargetsStep, journey, logger, contact_id):
                                    should_keep_step = False
                                    logger.debug(f"[{contact_id}] Step {idxTargetsStep}: Débordement + aucun agent → step supprimée")
                                else:
                                    # Si overflow=false (Élargissement), conserver avec durée 1s
                                    step[f"{idxTargetsStep}"]['Expiry']['DurationInSeconds'] = 1
                                    logger.debug(f"[{contact_id}] Step {idxTargetsStep}: Élargissement + aucun agent → durée réduite à 1s")
                            
                            # Ajouter la step seulement si elle doit être conservée
                            if should_keep_step:
                                steps.append(step[f"{idxTargetsStep}"]) 
                                                                                                                 
                    else:
                        raise Exception('illegal argument : groups is not defined !')                   
                case TargetsType.AGENTS.value:
                    logger.info(f"[{contact_id}] targetType -> agents")  
                case TargetsType.PHONENUMBER.value:
                    logger.info(f"[{contact_id}] targetType -> phoneNumber (SDA)")
                    phone_numbers = target['targetDefinition'].get('phoneNumbers', [])
                    
                    if phone_numbers:
                        # Créer une step vide pour le SDA (pas de critères de routage agent)
                        step[f"{idxTargetsStep}"]['Expression']['OrExpression'] = []
                        
                        # Conserver les informations SDA pour traitement ultérieur
                        step[f"{idxTargetsStep}"]['SDA'] = {
                            'phoneNumbers': phone_numbers,
                            'stepNumber': idxTargetsStep
                        }
                        
                        # Toujours ajouter la step SDA
                        steps.append(step[f"{idxTargetsStep}"])
                        logger.debug(f"[{contact_id}] Step SDA {idxTargetsStep} ajoutée avec numéros: {phone_numbers}")
                    else:
                        logger.warning(f"[{contact_id}] Step SDA {idxTargetsStep} sans numéros de téléphone définis")  
                case _:
                    raise Exception('illegal argument : no support target type {targetType}')             
        
        #print(f"steps -> {steps}")        
        routingCriteria['Steps'] = steps
        andExpressionsBackup = []    
        #print(f"routingCriteria -> {routingCriteria}")  
    else:
        message = (f"[{contact_id}] getroutingCriteria -> journey is not defined !")        
        logger.error(message)
        raise Exception(message)
    return routingCriteria

def isAgentsOnlineCurrentStep(stepNumber: int, contact_id: str, logger: logging.Logger, *args: Dict[str, Union[int, float]]) -> bool:
    isAgentsOnline = False    
    if len(args) != 0:        
        for ar in args:
            if ar[f"step{stepNumber}_AgentsOnline"] >0:
                isAgentsOnline = True
    else:
        #boolean isAgentsOnline forcé à True si l'API getGetCurrentMetricDataAgentsOnline n'a pas été appelée
        isAgentsOnline = True
        logger.debug(f"[{contact_id}] isAgentsOnlineCurrentStep -> no data")
    return isAgentsOnline

def isOverFlow(stepNumber: int, journey: Dict[str, Any], logger: logging.Logger, contact_id: str) -> bool:
    targetsStep = journey.get('targetsStep', [])
    result = targetsStep[stepNumber-1]['targetDefinition']['overflow']
    mode_text = "Débordement" if result else "Élargissement"
    logger.debug(f"[{contact_id}] Step{stepNumber} overflow: {result} ({mode_text})")                
    return result

def isDurationInSecondsEqualZero(stepNumber: int, journey: Dict[str, Any], logger: Any, contact_id: str) -> bool:
    isDurationInSecondsEqualZero = False
    targetsStep = journey.get('targetsStep', [])
    if targetsStep[stepNumber]['targetDefinition']['duration'] == 0 : isDurationInSecondsEqualZero = True
    logger.debug(f"[{contact_id}] isDurationInSecondsEqualZero : {isDurationInSecondsEqualZero} for step{stepNumber+1}")                
    return isDurationInSecondsEqualZero