"""
Définition des constantes
"""
import os

# Routing constraints
MAX_ROUTING_STEPS = 5
MAX_AND_CONDITIONS = 8
MAX_OR_CONDITIONS = 3
MIN_STEP_DURATION = 30
DEFAULT_EXPIRY_DURATION = 9999

# DynamoDB configuration
JOURNEYS_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME', 'Core_Ddb_CiblageParametrageParcours')
MAX_JOURNEY_STEPS = 5

# Logging levels
LOG_LEVEL_INFO = 'INFO'
LOG_LEVEL_DEBUG = 'DEBUG'
