"""
Event parser for Amazon Connect events.

This module handles parsing of Amazon Connect events to extract
parameters and contact attributes needed for validation.
"""


class EventParsingError(Exception):
    """Exception raised when an Amazon Connect event cannot be parsed."""
    pass


def parse_connect_event(event):
    """
    Extrait les données nécessaires de l'event Amazon Connect.

    Args:
        event (dict): Amazon Connect event structure

    Returns:
        tuple: (parameters, contact_attributes)

    Raises:
        EventParsingError: If the event structure is invalid or malformed
    """
    if not isinstance(event, dict):
        raise EventParsingError("Event must be a dictionary")

    # Validate basic event structure
    if "Details" not in event:
        raise EventParsingError("Missing 'Details' in event")

    details = event["Details"]
    if not isinstance(details, dict):
        raise EventParsingError("'Details' must be a dictionary")

    # Extract parameters
    parameters = details.get("Parameters", {})
    if not isinstance(parameters, dict):
        raise EventParsingError("'Parameters' must be a dictionary")

    # Extract contact attributes
    contact_data = details.get("ContactData", {})
    if not isinstance(contact_data, dict):
        raise EventParsingError("'ContactData' must be a dictionary")

    contact_attributes = contact_data.get("Attributes", {})
    if not isinstance(contact_attributes, dict):
        raise EventParsingError("'Attributes' must be a dictionary")

    return parameters, contact_attributes


def validate_parameters(parameters):
    """
    Valide que les paramètres contiennent soit attribute_name soit attribute_names.

    Args:
        parameters (dict): Parameters extracted from the event

    Returns:
        tuple: (is_single, attribute_name_or_names)

    Raises:
        EventParsingError: If parameters are invalid or missing required fields
    """
    if not parameters:
        raise EventParsingError("No parameters provided")

    has_single = "attribute_name" in parameters
    has_multiple = "attribute_names" in parameters

    if not has_single and not has_multiple:
        raise EventParsingError(
            "Missing required parameter: 'attribute_name' or 'attribute_names'"
        )

    if has_single and has_multiple:
        raise EventParsingError(
            "Cannot specify both 'attribute_name' and 'attribute_names'"
        )

    if has_single:
        attribute_name = parameters["attribute_name"]
        if not isinstance(attribute_name, str) or not attribute_name.strip():
            raise EventParsingError(
                "'attribute_name' must be a non-empty string"
            )
        return True, attribute_name.strip()

    else:  # has_multiple
        attribute_names = parameters["attribute_names"]
        
        # Handle both list and comma-separated string formats
        if isinstance(attribute_names, str):
            # Amazon Connect sends comma-separated string, convert to list
            attribute_names = [name.strip() for name in attribute_names.split(',')]
        elif isinstance(attribute_names, list):
            # Already a list, use as-is
            pass
        else:
            raise EventParsingError("'attribute_names' must be a list or comma-separated string")

        if not attribute_names:
            raise EventParsingError("'attribute_names' cannot be empty")

        # Validate each attribute name
        validated_names = []
        for name in attribute_names:
            if not isinstance(name, str) or not name.strip():
                raise EventParsingError(
                    "All attribute names must be non-empty strings"
                )
            validated_names.append(name.strip())

        return False, validated_names