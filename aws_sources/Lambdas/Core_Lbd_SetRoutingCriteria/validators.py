"""
Fonctions de validation de la configuration.
"""
from typing import Dict, Any, List
from exceptions import RoutingConfigurationError, InvalidParameterError
from constants import (
    MAX_ROUTING_STEPS, MAX_AND_CONDITIONS, MAX_OR_CONDITIONS, MIN_STEP_DURATION
)

def validate_event_queue_id(event: Dict[str, Any], contact_id: str) -> str:
    """
    Valider et extraire l'identifiant de la queue requis à la récupération de la métrique temps réel.
    
    Args:
        event: Lambda event dictionary
        contact_id: Contact ID for error messages
        
    Returns:
        Queue Id
        
    Raises:
        InvalidParameterError: If required Queue Id are missing
    """
    #details = event.get('Details', {})
    contact_data = event['Details']['ContactData']
    queue = contact_data.get('Queue', None)
    
    if queue is None:
        raise InvalidParameterError(
            f"[{contact_id}] no queue specified in the contact flow"
        )
    else:
        queue_arn = queue['ARN']
        queue_id = queue_arn.split('/')[3]
    return queue_id    

def validate_event_parameters(event: Dict[str, Any], contact_id: str) -> Dict[str, Any]:
    """
    Valider et extraire les paramètres requis de l'événement Lambda.
    
    Args:
        event: Lambda event dictionary
        contact_id: Contact ID for error messages
        
    Returns:
        Dictionary with validated parameters
        
    Raises:
        InvalidParameterError: If required parameters are missing
    """
    details = event.get('Details', {})
    parameters = details.get('Parameters')
    
    if parameters is None:
        raise InvalidParameterError(
            f"[{contact_id}] Missing Parameters in event"
        )
    
    # Extract queue priority
    if 'queuePriority' not in parameters:
        raise InvalidParameterError(
            f"[{contact_id}] Missing required parameter: queuePriority"
        )
    
    # Extract journey name (accepte journeyName ou Parcours)
    journey_key = None
    if 'journeyName' in parameters:
        journey_key = parameters['journeyName']
    elif 'Parcours' in parameters:
        journey_key = parameters['Parcours']
    else:
        raise InvalidParameterError(
            f"[{contact_id}] Missing required parameter: journeyName or Parcours"
        )
    
    return {
        'queue_priority': int(parameters['queuePriority']),
        'journey_name': journey_key,
        'is_mock_journey': parameters.get('isMockJourney', 'False')
    }


def validate_routing_steps(target_steps: List[Dict[str, Any]], contact_id: str) -> None:
    """
    Validate routing step configuration.
    
    Args:
        target_steps: List of target steps to validate
        contact_id: Contact ID for error messages
        
    Raises:
        RoutingConfigurationError: If configuration is invalid
    """
    total_steps = len(target_steps)
    
    if total_steps > MAX_ROUTING_STEPS:
        raise RoutingConfigurationError(
            f"[{contact_id}] Maximum {MAX_ROUTING_STEPS} steps allowed, "
            f"found {total_steps}"
        )
    
    for idx, step in enumerate(target_steps, start=1):
        _validate_single_step(step, idx, contact_id)


def _validate_single_step(step: Dict[str, Any], step_number: int, contact_id: str) -> None:
    """Validate a single routing step."""
    target_def = step.get('targetDefinition', {})
    duration = target_def.get('duration', 0)
    overflow = target_def.get('overflow', False)
    
    # Validate duration and overflow combination
    if duration == 0 and overflow:
        raise RoutingConfigurationError(
            f"[{contact_id}] Step {step_number}: "
            f"duration cannot be 0 when overflow is True"
        )
    
    # Validate minimum duration
    if 0 < duration < MIN_STEP_DURATION:
        raise RoutingConfigurationError(
            f"[{contact_id}] Step {step_number}: "
            f"duration must be 0 or >= {MIN_STEP_DURATION} seconds, "
            f"found {duration}"
        )


def validate_and_expression_count(and_expression: List[Any], contact_id: str) -> None:
    """
    Validate number of AND conditions in expression.
    
    Args:
        and_expression: List of AND conditions
        contact_id: Contact ID for error messages
        
    Raises:
        RoutingConfigurationError: If too many AND conditions
    """
    condition_count = len(and_expression) // 2
    if condition_count > MAX_AND_CONDITIONS:
        raise RoutingConfigurationError(
            f"[{contact_id}] Maximum {MAX_AND_CONDITIONS} AND conditions allowed, "
            f"found {condition_count}"
        )


def validate_or_expression_count(or_expression: List[Any], contact_id: str) -> None:
    """
    Validate number of OR conditions in expression.
    
    Args:
        or_expression: List of OR conditions
        contact_id: Contact ID for error messages
        
    Raises:
        RoutingConfigurationError: If too many OR conditions
    """
    condition_count = len(or_expression) // 2
    if condition_count > MAX_OR_CONDITIONS:
        raise RoutingConfigurationError(
            f"[{contact_id}] Maximum {MAX_OR_CONDITIONS} OR conditions allowed, "
            f"found {condition_count}"
        )
