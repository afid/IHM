"""
Validator module for CheckEmpty Lambda function.

This module contains the core validation logic for Amazon Connect contact attributes.
It determines whether contact attributes are considered "empty" or "filled" according
to the business rules defined in the requirements.
"""


def is_attribute_valid(value):
    """
    Détermine si un contact attribute est valide (renseigné).

    Un attribute est considéré comme vide dans les cas suivants:
    - La valeur est None
    - La valeur est une chaîne vide ""

    Args:
        value: Valeur à valider (peut être None, str, ou autre type)

    Returns:
        bool: True si l'attribute est renseigné, False s'il est vide
    """
    if value is None:
        return False
    if isinstance(value, str) and value == "":
        return False
    return True


def validate_single_attribute(attribute_name, contact_attributes):
    """
    Valide un seul contact attribute.

    Args:
        attribute_name (str): Nom de l'attribute à valider
        contact_attributes (dict): Dictionnaire des contact attributes

    Returns:
        bool: True si l'attribute est renseigné, False sinon
    """
    if not isinstance(contact_attributes, dict):
        return False

    # Récupérer la valeur de l'attribute (None si inexistant)
    attribute_value = contact_attributes.get(attribute_name)

    # Utiliser la logique de validation core
    return is_attribute_valid(attribute_value)


def validate_multiple_attributes(attribute_names, contact_attributes):
    """
    Valide plusieurs contact attributes.

    Args:
        attribute_names (list): Liste des noms d'attributes à valider
        contact_attributes (dict): Dictionnaire des contact attributes

    Returns:
        dict: Dictionnaire avec chaque nom d'attribute comme clé et
              sa validation (bool) comme valeur
    """
    if not isinstance(attribute_names, list):
        return {}

    if not isinstance(contact_attributes, dict):
        contact_attributes = {}

    results = {}

    # Valider chaque attribute individuellement
    for attribute_name in attribute_names:
        results[attribute_name] = validate_single_attribute(
            attribute_name, contact_attributes
        )

    return results