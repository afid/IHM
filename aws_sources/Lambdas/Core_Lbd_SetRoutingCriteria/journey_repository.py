import json
import boto3
import logging
from typing import Dict, Any

from routing_criteria_builder import TargetsType
from utils import convert_to_decimal
from aws_service import getItemsFromDynamoDB

def getJourney(dynamodb: boto3.resource, logger: logging.Logger, contact_id: str, journeyName: str) -> Dict[str, Any]:    
    
    items = getItemsFromDynamoDB(dynamodb, journeyName, logger, contact_id)

    targetsStep = []
    if items:        
        # Navigation dans la structure française : Etapes -> Etape1, Etape2, etc.
        etapes = items.get('Etapes', {})
        
        for i in range(5):
            etape_key = f'Etape{i+1}'
            step = etapes.get(etape_key, {})
            
            if not step:  # Si l'étape n'existe pas, on s'arrête
                break
            else:
                logger.debug(f'[{contact_id}] getJourney -> {etape_key}: {step}')            
                targetStep = {}
                targetStep[f"{i+1}"] = {}
                
                # Mapping des types français vers anglais
                type_mapping = {
                    'Groupes': 'groups',
                    'NumeroSDA': 'phonenumber', 
                    'Agents': 'agents'
                }
                targetType_fr = step.get('Type', 'Groupes')
                targetType = type_mapping.get(targetType_fr, 'groups')
                targetStep[f"{i+1}"]['type'] = targetType
                logger.debug(f"[{contact_id}] getJourney step{i+1} type {targetStep[f"{i+1}"]['type']}")
                
                targetStep[f"{i+1}"]['targetDefinition'] = {}
                targetStep[f"{i+1}"]['targetDefinition']['groups'] = []
                
                # Extraction des données d'enchainement
                enchainement = step.get('Enchainement', {})
                # Support des deux formats : "Delai" (sans accent) et "Délai" (avec accent) pour rétrocompatibilité
                duration = convert_to_decimal(enchainement.get('Delai', enchainement.get('Délai', 30)))
                targetStep[f"{i+1}"]['targetDefinition']['duration'] = duration
                logger.debug(f"[{contact_id}] getJourney step{i+1} duration {duration}")
                
                # Conversion Mode français -> overflow booléen (logique corrigée)
                mode = enchainement.get('Mode', 'Debordement')
                overflow = (mode == 'Debordement')  # Débordement = true, Élargissement = false
                targetStep[f"{i+1}"]['targetDefinition']['overflow'] = overflow
                logger.debug(f"[{contact_id}] getJourney step{i+1} mode: {mode} -> overflow: {overflow}")
                
                # Valeurs par défaut pour les seuils manquants
                targetStep[f"{i+1}"]['targetDefinition']['thresholdExpectedDissuasion'] = 3600
                targetStep[f"{i+1}"]['targetDefinition']['thresholdEWTDissuasion'] = 3600
                logger.debug(f"[{contact_id}] getJourney step{i+1} using default thresholds")
                                       
                if targetType == TargetsType.GROUPS.value:
                    # Traitement des critères de ciblage
                    critereCiblage = step.get('CritereCiblage', [])
                    logger.debug(f"[{contact_id}] getJourney step{i+1} CritereCiblage: {critereCiblage}")
                    
                    if critereCiblage:
                        group = []
                        for critere_str in critereCiblage:
                            try:
                                proficiency = json.loads(critere_str)
                                logger.debug(f"[{contact_id}] getJourney step{i+1} proficiency: {proficiency}")
                                group.append(proficiency)
                            except json.JSONDecodeError as e:
                                logger.error(f"[{contact_id}] Error parsing CritereCiblage: {e}")
                                continue
                        
                        if group:  # Seulement si on a des critères valides
                            targetStep[f"{i+1}"]['targetDefinition']['groups'].append(group)
                        
                elif targetType == TargetsType.PHONENUMBER.value:
                    logger.info(f"[{contact_id}] targetType -> phonenumber")
                    # Pour NumeroSDA, les critères sont directement dans CritereCiblage
                    critereCiblage = step.get('CritereCiblage', [])
                    targetStep[f"{i+1}"]['targetDefinition']['phoneNumbers'] = critereCiblage
                    
                elif targetType == TargetsType.AGENTS.value:
                    logger.info(f"[{contact_id}] targetType -> agents")
                    
                logger.debug(f"[{contact_id}] getJourney step{i+1} final: {targetStep[f"{i+1}"]}")
                targetsStep.append(targetStep[f"{i+1}"])
                
        logger.debug(f"[{contact_id}] getJourney targetsStep -> {targetsStep}")
    else:
        message = f"[{contact_id}] getJourney -> journey is not defined !"
        logger.error(message)
        raise Exception(message)  
    
    journey = {}    
    journey['targetsStep'] = targetsStep
    logger.info(f"[{contact_id}] getJourney Result journey -> {journey}")
    return journey

def getMockJourney(logger: logging.Logger) -> Dict[str, Any]:
    mockTargetsStep = []
    #mockGroups = []
    mockGroup1 = []   
    mockGroup1.append(
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",  
                "Name": "StepLevel",
                "ProficiencyLevel": 1,
                "Value": "1"                             
            }
        }
    )
    #mockGroups.append(mockGroup1)
    mockGroup2 = []
    mockGroup2.append(    
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",  
                "Name": "StepLevel",                                    
                "ProficiencyLevel": 1,                                    
                "Value": "2",
            }
        }        
    )
    mockGroup2.append(
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",
                "Name": "ABE.Produit",                                    
                "ProficiencyLevel": 1,
                "Value": "Auto"
            }
        }
    )

    mockGroup3 = []
    mockGroup3.append(    
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",
                "Name": "StepLevel",                                    
                "ProficiencyLevel": 1,
                "Value": "3"                                    
            }
        }        
    )

    mockGroup4 = []
    mockGroup4.append(    
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",
                "Name": "StepLevel",                                    
                "ProficiencyLevel": 1,
                "Value": "4"                                    
            }
        }        
    )

    mockGroup5 = []
    mockGroup5.append(    
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",
                "Name": "StepLevel",                                    
                "ProficiencyLevel": 1,
                "Value": "5"                                    
            }
        }        
    )

    mockGroup6 = []
    mockGroup6.append(    
        {
            "AttributeCondition": 
            {
                "ComparisonOperator": "NumberGreaterOrEqualTo",
                "Name": "StepLevel",                                    
                "ProficiencyLevel": 1,
                "Value": "6"                                    
            }
        }        
    )

    #mockGroups.append(mockGroup2)
    #print(f" mockGroups -> {mockGroups}")   
    mockTargetStep1 = {}
    mockTargetStep1['type'] = 'groups'
    mockTargetStep1['targetDefinition'] = {}    
    mockTargetStep1['targetDefinition']['groups'] = []
    #mockTargetStep1['targetDefinition']['groups'].append(mockGroup1)
    mockTargetStep1['targetDefinition']['groups'].append(mockGroup2)
    mockTargetStep1['targetDefinition']['groups'].append(mockGroup3)
    mockTargetStep1['targetDefinition']['duration'] = 30
    mockTargetStep1['targetDefinition']['overflow'] = True
    mockTargetStep1['targetDefinition']['thresholdExpectedDissuasion'] = 3600
    mockTargetStep1['targetDefinition']['thresholdEWTDissuasion'] = 3600
    #print(f" mockTargetStep1 -> {mockTargetStep1}")

    mockTargetStep2 = {}
    mockTargetStep2['type'] = 'groups'
    mockTargetStep2['targetDefinition'] = {}    
    mockTargetStep2['targetDefinition']['groups'] = []
    mockTargetStep2['targetDefinition']['groups'].append(mockGroup2)
    mockTargetStep2['targetDefinition']['groups'].append(mockGroup3)
    mockTargetStep2['targetDefinition']['duration'] = 30
    mockTargetStep2['targetDefinition']['overflow'] = True
    mockTargetStep2['targetDefinition']['thresholdExpectedDissuasion'] = 3600
    mockTargetStep2['targetDefinition']['thresholdEWTDissuasion'] = 3600
    #print(f" mockTargetStep2 -> {mockTargetStep2}")

    mockTargetStep3 = {}
    mockTargetStep3['type'] = 'groups'
    mockTargetStep3['targetDefinition'] = {}    
    mockTargetStep3['targetDefinition']['groups'] = []    
    mockTargetStep3['targetDefinition']['groups'].append(mockGroup4)
    mockTargetStep3['targetDefinition']['duration'] = 3600
    mockTargetStep3['targetDefinition']['overflow'] = True
    mockTargetStep3['targetDefinition']['thresholdExpectedDissuasion'] = 3600
    mockTargetStep3['targetDefinition']['thresholdEWTDissuasion'] = 3600
    #print(f" mockTargetStep3 -> {mockTargetStep3}")

    mockTargetStep4 = {}
    mockTargetStep4['type'] = 'groups'
    mockTargetStep4['targetDefinition'] = {}    
    mockTargetStep4['targetDefinition']['groups'] = []    
    mockTargetStep4['targetDefinition']['groups'].append(mockGroup5)
    mockTargetStep4['targetDefinition']['duration'] = 3600
    mockTargetStep4['targetDefinition']['overflow'] = True
    mockTargetStep4['targetDefinition']['thresholdExpectedDissuasion'] = 3600
    mockTargetStep4['targetDefinition']['thresholdEWTDissuasion'] = 3600
    #print(f" mockTargetStep4 -> {mockTargetStep4}")

    mockTargetStep5 = {}
    mockTargetStep5['type'] = 'groups'
    mockTargetStep5['targetDefinition'] = {}    
    mockTargetStep5['targetDefinition']['groups'] = []    
    mockTargetStep5['targetDefinition']['groups'].append(mockGroup6)
    mockTargetStep5['targetDefinition']['duration'] = 3600
    mockTargetStep5['targetDefinition']['overflow'] = True
    mockTargetStep5['targetDefinition']['thresholdExpectedDissuasion'] = 3600
    mockTargetStep5['targetDefinition']['thresholdEWTDissuasion'] = 3600
    #print(f" mockTargetStep5 -> {mockTargetStep5}")
    
    mockTargetsStep = []
    mockTargetsStep.append(mockTargetStep1)
    
    #mockTargetsStep.append(mockTargetStep2)
    #mockTargetsStep.append(mockTargetStep3)
    #mockTargetsStep.append(mockTargetStep4)
    #mockTargetsStep.append(mockTargetStep5)
  
    mockJourney = {}
    mockJourney['targetsStep'] = mockTargetsStep    
    return mockJourney