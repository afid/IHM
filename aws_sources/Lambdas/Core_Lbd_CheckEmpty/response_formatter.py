"""
Response formatter module for CheckEmpty Lambda function.

This module provides functions to format validation results into the expected
JSON structure for Amazon Connect integration.
"""


def format_single_result(result):
    """
    Formate le résultat pour un seul attribute.

    Args:
        result (bool): Résultat de validation (True si l'attribute est renseigné,
                      False sinon)

    Returns:
        dict: Réponse formatée avec la structure {"result": str}
              Le booléen est converti en chaîne pour Amazon Connect
    """
    return {"result": "true" if result else "false"}


def format_multiple_results(results):
    """
    Formate les résultats pour plusieurs attributes.

    Args:
        results (dict): Dictionnaire avec les noms d'attributes comme clés
                       et les résultats de validation (bool) comme valeurs

    Returns:
        dict: Réponse formatée avec la structure
              {"results": {attribute_name: str, ...}}
              Les booléens sont convertis en chaînes pour Amazon Connect
    """
    # Convert boolean results to strings for Amazon Connect compatibility
    string_results = {}
    for key, value in results.items():
        string_results[key] = "true" if value else "false"
    
    return {"results": string_results}


def format_error_response(error_type, message):
    """
    Formate une réponse d'erreur standardisée.

    Args:
        error_type (str): Type d'erreur (ex: "MALFORMED_EVENT",
                         "MISSING_PARAMETERS", "INVALID_TYPE")
        message (str): Message d'erreur descriptif

    Returns:
        dict: Réponse d'erreur formatée avec la structure
              {"error": {"type": str, "message": str}}
    """
    return {
        "error": {
            "type": error_type,
            "message": message
        }
    }