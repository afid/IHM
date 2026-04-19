"""
Comprehensive error handling for AAN Parametrage Decision Lambda
Handles DynamoDB errors, unhandled exceptions, and detailed logging
Requirements: 5.1, 5.3, 5.4
"""
import json
import logging
from typing import Dict, Any
from botocore.exceptions import ClientError, BotoCoreError
from models import ErrorResponse

# Configure logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def log_request(event: Dict[str, Any]) -> None:
    """
    Log incoming request details
    
    Args:
        event: The Lambda event dictionary
        
    Requirements: 5.3
    """
    logger.info(f"Request received: {json.dumps(event, default=str)}")


def log_error(error_type: str, error_message: str, details: Dict[str, Any] = None) -> None:
    """
    Log error details in structured format
    
    Args:
        error_type: Type of error (ValidationError, DatabaseError, etc.)
        error_message: Human-readable error message
        details: Additional error details
        
    Requirements: 5.3
    """
    log_data = {
        "error_type": error_type,
        "error_message": error_message,
        "details": details or {}
    }
    logger.error(json.dumps(log_data))


def log_success(domaine: str, moteur_decision: str) -> None:
    """
    Log successful domain resolution
    
    Args:
        domaine: The domain that was resolved
        moteur_decision: The decision engine that was found
        
    Requirements: 5.3
    """
    logger.info(f"Success: Domain '{domaine}' mapped to '{moteur_decision}'")


def handle_dynamodb_error(error: Exception, domaine: str = None) -> Dict[str, Any]:
    """
    Handle DynamoDB errors and create appropriate error responses
    
    Args:
        error: The exception that occurred
        domaine: The domain being queried (for logging context)
        
    Returns:
        dict: Formatted error response for Lambda
        
    Requirements: 5.1
    """
    if isinstance(error, ClientError):
        error_code = error.response['Error']['Code']
        error_message = error.response['Error']['Message']
        
        # Log detailed error information
        log_error(
            error_type="DynamoDBClientError",
            error_message=f"DynamoDB operation failed: {error_code}",
            details={
                "error_code": error_code,
                "aws_error_message": error_message,
                "domaine": domaine
            }
        )
        
        # Create user-friendly error response
        if error_code == 'ResourceNotFoundException':
            response_message = "Configuration table not found"
        elif error_code == 'ValidationException':
            response_message = "Invalid request parameters"
        elif error_code == 'ProvisionedThroughputExceededException':
            response_message = "Service temporarily unavailable"
        else:
            response_message = f"Database error: {error_code}"
            
    elif isinstance(error, BotoCoreError):
        # Log BotoCore errors
        log_error(
            error_type="DynamoDBBotoCoreError",
            error_message=f"AWS service error: {str(error)}",
            details={
                "domaine": domaine,
                "error_class": error.__class__.__name__
            }
        )
        response_message = "AWS service unavailable"
        
    else:
        # Log unexpected errors
        log_error(
            error_type="DynamoDBUnexpectedError",
            error_message=f"Unexpected database error: {str(error)}",
            details={
                "domaine": domaine,
                "error_class": error.__class__.__name__
            }
        )
        response_message = "Database service unavailable"
    
    # Create standardized error response
    error_response = ErrorResponse(
        statusCode=500,
        body={
            "error": "DatabaseError",
            "message": response_message
        }
    )
    return error_response.to_dict()


def handle_validation_error(error: Exception, event: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Handle validation errors and create appropriate error responses
    
    Args:
        error: The validation exception that occurred
        event: The original event (for logging context)
        
    Returns:
        dict: Formatted error response for Lambda
        
    Requirements: 5.2
    """
    error_message = str(error)
    
    # Log validation error details
    log_error(
        error_type="ValidationError",
        error_message=f"Input validation failed: {error_message}",
        details={
            "event": event,
            "error_class": error.__class__.__name__
        }
    )
    
    # Create standardized validation error response
    error_response = ErrorResponse(
        statusCode=400,
        body={
            "error": "ValidationError",
            "message": error_message
        }
    )
    return error_response.to_dict()


def handle_unhandled_exception(error: Exception, event: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Handle unexpected/unhandled exceptions without exposing internal details
    
    Args:
        error: The unexpected exception that occurred
        event: The original event (for logging context)
        
    Returns:
        dict: Formatted generic error response for Lambda
        
    Requirements: 5.4
    """
    # Log detailed error information for debugging
    log_error(
        error_type="UnhandledException",
        error_message=f"Unhandled exception: {str(error)}",
        details={
            "event": event,
            "error_class": error.__class__.__name__,
            "error_args": str(error.args) if hasattr(error, 'args') else None
        }
    )
    
    # Create generic error response without exposing internal details
    error_response = ErrorResponse(
        statusCode=500,
        body={
            "error": "InternalServerError",
            "message": "An internal error occurred while processing the request"
        }
    )
    return error_response.to_dict()


def create_domain_not_found_response(domaine: str) -> Dict[str, Any]:
    """
    Create standardized response for domain not found scenarios
    
    Args:
        domaine: The domain that was not found
        
    Returns:
        dict: Formatted error response for Lambda
        
    Requirements: 3.3
    """
    # Log domain not found
    log_error(
        error_type="DomainNotFound",
        error_message=f"Domain not found in parametrage table: {domaine}",
        details={"domaine": domaine}
    )
    
    # Create standardized error response
    error_response = ErrorResponse(
        statusCode=404,
        body={
            "error": "DomainNotFound",
            "message": f"Domain '{domaine}' not found in parametrage table"
        }
    )
    return error_response.to_dict()