"""
Exceptions personnalisées .
"""


class RoutingConfigurationError(Exception):
    """Raised when routing configuration is invalid."""
    pass


class JourneyNotFoundError(Exception):
    """Raised when a journey cannot be found in DynamoDB."""
    pass


class InvalidParameterError(Exception):
    """Raised when required parameters are missing or invalid."""
    pass


class RoutingStepError(Exception):
    """Raised when there's an error building routing steps."""
    pass
