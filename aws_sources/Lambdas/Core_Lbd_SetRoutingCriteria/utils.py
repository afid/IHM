"""
Fonctions utilitaires pour la conversion et la validation des données.
"""
import logging
from typing import Union
from constants import LOG_LEVEL_INFO, LOG_LEVEL_DEBUG


def convert_to_decimal(number: Union[int, float, str]) -> Union[int, float]:
    """
    Convertir un nombre en int s'il s'agit d'un nombre entier, sinon en float.
    
    Args:
        number: nombre à convertir
        
    Returns:
        Integer si nombre entier, sinon float        
        
    Exemple:
        >>> convert_to_decimal(5.0)
        5
        >>> convert_to_decimal(5.5)
        5.5
    """
    float_value = float(number)
    if float_value % 1 == 0:
        return int(float_value)
    return float_value


def configure_logger(logger: logging.Logger, log_level: str) -> None:
    """
    Configuration du logger
    
    Args:
        logger: Logger instance to configure
        log_level: Niveau de Log string (INFO or DEBUG)
    """
    if log_level == LOG_LEVEL_INFO:
        logger.setLevel(logging.INFO)
    elif log_level == LOG_LEVEL_DEBUG:
        logger.setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.INFO)


def format_contact_log(contact_id: str, message: str) -> str:
    """
    Format du message avec le contact ID.
    
    Args:
        contact_id: Amazon Connect contact ID
        message: Log message
        
    Returns:
        format de log préfixé du contact ID
    """
    return f"[{contact_id}] {message}"
