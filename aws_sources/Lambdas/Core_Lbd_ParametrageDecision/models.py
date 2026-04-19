"""
Data models for AAN Parametrage Decision Lambda
"""
from dataclasses import dataclass
from typing import Dict, Any, Optional


@dataclass
class InputEvent:
    """Model for incoming Lambda event"""
    UC_Domaine: str
    UC_SousDomaine: Optional[str] = None
    
    @classmethod
    def from_dict(cls, data: dict) -> 'InputEvent':
        """Create InputEvent from dictionary, validating required fields"""
        # Handle Amazon Connect event structure - try multiple locations
        uc_domaine = None
        uc_sous_domaine = None
        
        # Priority 1: Amazon Connect Parameters (when explicitly configured)
        if 'Details' in data and 'Parameters' in data['Details']:
            parameters = data['Details']['Parameters']
            uc_domaine = parameters.get('UC_Domaine')
            uc_sous_domaine = parameters.get('UC_SousDomaine')
        
        # Priority 2: Amazon Connect Contact Attributes (fallback)
        if uc_domaine is None and 'Details' in data and 'ContactData' in data['Details'] and 'Attributes' in data['Details']['ContactData']:
            attributes = data['Details']['ContactData']['Attributes']
            uc_domaine = attributes.get('UC_Domaine')
            uc_sous_domaine = attributes.get('UC_SousDomaine')
        
        # Priority 3: Direct access for simple event structure (backward compatibility)
        if uc_domaine is None and 'UC_Domaine' in data:
            uc_domaine = data['UC_Domaine']
        if uc_sous_domaine is None and 'UC_SousDomaine' in data:
            uc_sous_domaine = data['UC_SousDomaine']
        
        if uc_domaine is None:
            raise ValueError("UC_Domaine is required")
        if not uc_domaine or not isinstance(uc_domaine, str):
            raise ValueError("UC_Domaine must be a non-empty string")
        if not uc_domaine.strip():
            raise ValueError("UC_Domaine must not be empty or whitespace only")
        
        # UC_SousDomaine is optional but if provided must be valid
        if uc_sous_domaine is not None:
            if not isinstance(uc_sous_domaine, str) or not uc_sous_domaine.strip():
                uc_sous_domaine = None  # Treat invalid as None
        
        return cls(UC_Domaine=uc_domaine, UC_SousDomaine=uc_sous_domaine)


@dataclass
class SuccessResponse:
    """Model for successful Lambda response"""
    statusCode: int = 200
    body: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary format for Lambda response"""
        return {
            "statusCode": self.statusCode,
            "body": self.body
        }


@dataclass
class ErrorResponse:
    """Model for error Lambda response"""
    statusCode: int
    body: Dict[str, Any]
    
    def to_dict(self) -> dict:
        """Convert to dictionary format for Lambda response"""
        return {
            "statusCode": self.statusCode,
            "body": self.body
        }


@dataclass
class ParametrageItem:
    """Model for DynamoDB parametrage item"""
    Structure: str
    MoteurDecision: str
    Type: Optional[str] = None
    Etat: Optional[str] = None
    Parent: Optional[str] = None
    
    @classmethod
    def from_dynamodb_item(cls, item: dict) -> 'ParametrageItem':
        """Create ParametrageItem from DynamoDB response item"""
        return cls(
            Structure=item['Structure']['S'],
            MoteurDecision=item['MoteurDecision']['S'],
            Type=item.get('Type', {}).get('S'),
            Etat=item.get('Etat', {}).get('S'),
            Parent=item.get('Parent', {}).get('S')
        )