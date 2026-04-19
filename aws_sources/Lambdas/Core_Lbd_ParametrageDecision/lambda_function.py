# Main Lambda handler and event processing functions
# Lambda Function: Core_Lbd_ParametrageDecision
# DynamoDB Table: Core_Ddb_ParametrageCentralise
import json
import logging
from typing import Dict, Any
from models import InputEvent
from dynamodb_service import DynamoDBService
from botocore.exceptions import ClientError, BotoCoreError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ✅ OPTIMIZATION: Module-level service instance (lazy initialization for testability)
_dynamodb_service = None

def get_dynamodb_service():
    """Get or create DynamoDB service instance (singleton pattern)"""
    global _dynamodb_service
    if _dynamodb_service is None:
        _dynamodb_service = DynamoDBService(table_name='Core_Ddb_ParametrageCentralise')
    return _dynamodb_service


def process_event(event: dict) -> InputEvent:
    """
    Process incoming Lambda event and extract UC_Domaine
    
    Args:
        event: Raw Lambda event dictionary
        
    Returns:
        InputEvent: Validated input event object
        
    Raises:
        ValueError: If UC_Domaine is missing or invalid
        
    Requirements: 1.2, 1.4
    """
    try:
        # Extract and validate UC_Domaine from event
        input_event = InputEvent.from_dict(event)
        return input_event
        
    except ValueError as e:
        logger.error(f"Validation failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Invalid event: {str(e)}")
        raise ValueError(f"Invalid event format: {str(e)}")


def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Main Lambda handler function - Core_Lbd_ParametrageDecision
    
    Processes incoming events from Amazon Connect to determine the appropriate
    decision engine based on the UC_SousDomaine (priority) or UC_Domaine (fallback) 
    attribute by querying DynamoDB table Core_Ddb_ParametrageCentralise with hierarchical lookup.
    
    Args:
        event: Lambda event dictionary containing UC_SousDomaine and/or UC_Domaine
        context: Lambda context object
        
    Returns:
        dict: Amazon Connect compatible response containing either:
              - Success: moteurDecision and structure as top-level keys
              - Error: error information
        
    Requirements: 1.1, 3.4
    """
    # Get DynamoDB service instance (reused across warm invocations)
    dynamodb_service = get_dynamodb_service()
    
    try:
        # Process and validate the incoming event
        input_event = process_event(event)
        
        # Query DynamoDB with hierarchical lookup
        parametrage_item = dynamodb_service.get_moteur_decision_with_hierarchy(
            input_event.UC_SousDomaine, 
            input_event.UC_Domaine
        )
        
        # Check if configuration was found
        if parametrage_item is None:
            # Structure not found - return Amazon Connect compatible error
            search_key = input_event.UC_SousDomaine or input_event.UC_Domaine
            return {
                "error": "StructureNotFound",
                "message": f"Structure not found in parametrage table: {search_key}"
            }
        
        # Success - return Amazon Connect compatible response (flat structure)
        return {
            "moteurDecision": parametrage_item.MoteurDecision,
            "structure": parametrage_item.Structure
        }
        
    except ValueError as e:
        # Handle validation errors - Amazon Connect compatible format
        return {
            "error": "ValidationError",
            "message": f"Input validation failed: {str(e)}"
        }
        
    except (ClientError, BotoCoreError) as e:
        # Handle DynamoDB errors - Amazon Connect compatible format
        return {
            "error": "DatabaseError",
            "message": "Database operation failed"
        }
        
    except Exception as e:
        # Handle any unhandled exceptions - Amazon Connect compatible format
        return {
            "error": "InternalServerError",
            "message": "An internal error occurred"
        }