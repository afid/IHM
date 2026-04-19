"""
AWS Lambda handler for CheckEmpty function.

This module provides the main entry point for the CheckEmpty Lambda function
that validates Amazon Connect contact attributes. It orchestrates all the
components (event parsing, validation, and response formatting) to provide
a complete solution.
"""

import logging
from event_parser import (
    parse_connect_event, validate_parameters, EventParsingError
)
from validator import validate_single_attribute, validate_multiple_attributes
from response_formatter import (
    format_single_result, format_multiple_results, format_error_response
)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """
    Handler principal de la fonction Lambda CheckEmpty.

    Cette fonction orchestre tous les composants pour valider les contact attributes
    Amazon Connect selon les règles métier définies.

    Args:
        event (dict): Event Amazon Connect standard
        context: Contexte Lambda AWS (non utilisé dans cette implémentation)

    Returns:
        dict: Résultat de validation formaté pour Amazon Connect
              - Pour un seul attribute: {"result": bool}
              - Pour plusieurs attributes: {"results": {attribute_name: bool, ...}}
              - En cas d'erreur: {"error": {"type": str, "message": str}}
    """
    try:
        logger.info("Processing CheckEmpty request")

        # Étape 1: Parser l'événement Amazon Connect
        try:
            parameters, contact_attributes = parse_connect_event(event)
            logger.info(
                f"Successfully parsed event with {len(contact_attributes)} "
                f"contact attributes"
            )
        except EventParsingError as e:
            logger.error(f"Event parsing failed: {str(e)}")
            return format_error_response("MALFORMED_EVENT", str(e))

        # Étape 2: Valider les paramètres
        try:
            is_single, attribute_data = validate_parameters(parameters)
            logger.info(
                f"Parameters validated - Single attribute mode: {is_single}"
            )
        except EventParsingError as e:
            logger.error(f"Parameter validation failed: {str(e)}")
            return format_error_response("INVALID_PARAMETERS", str(e))

        # Étape 3: Effectuer la validation selon le mode
        try:
            if is_single:
                # Mode validation d'un seul attribute
                attribute_name = attribute_data
                logger.info(f"Validating single attribute: {attribute_name}")

                result = validate_single_attribute(attribute_name, contact_attributes)
                response = format_single_result(result)

                logger.info(
                    f"Single attribute validation completed - Result: {result}"
                )

            else:
                # Mode validation de plusieurs attributes
                attribute_names = attribute_data
                logger.info(f"Validating multiple attributes: {attribute_names}")

                results = validate_multiple_attributes(
                    attribute_names, contact_attributes
                )
                response = format_multiple_results(results)

                logger.info(
                    f"Multiple attributes validation completed - Results: {results}"
                )

            return response

        except Exception as e:
            logger.error(f"Validation processing failed: {str(e)}")
            return format_error_response(
                "VALIDATION_ERROR", f"Validation failed: {str(e)}"
            )

    except Exception as e:
        # Gestion d'erreurs globale pour les cas non prévus
        logger.error(f"Unexpected error in lambda_handler: {str(e)}")
        return format_error_response(
            "INTERNAL_ERROR", "An unexpected error occurred"
        )


def get_handler_info():
    """
    Retourne des informations sur le handler pour les tests et le debugging.

    Returns:
        dict: Informations sur la version et les capacités du handler
    """
    return {
        "version": "1.0.0",
        "capabilities": [
            "single_attribute_validation",
            "multiple_attributes_validation",
            "amazon_connect_integration"
        ],
        "supported_event_types": ["amazon_connect"]
    }