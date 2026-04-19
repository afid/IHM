"""
DynamoDB service for Core_Lbd_ParametrageDecision Lambda
Handles querying the Core_Ddb_ParametrageCentralise table for domain-to-decision-engine mappings
"""
import boto3
import logging
import os
from typing import Optional
from botocore.exceptions import ClientError, BotoCoreError
from models import ParametrageItem

logger = logging.getLogger()


class DynamoDBService:
    """
    Service class for interacting with DynamoDB parametrage table
    Requirements: 3.1, 3.2
    """
    
    def __init__(self, table_name: Optional[str] = None):
        """
        Initialize DynamoDB service
        
        Args:
            table_name: Name of the DynamoDB table (default: from environment variable TABLE_NAME or Core_Ddb_ParametrageCentralise)
        """
        self.table_name = table_name or os.environ.get('TABLE_NAME', 'Core_Ddb_ParametrageCentralise')
        self.dynamodb = boto3.client('dynamodb')
    
    def get_moteur_decision(self, structure_key: str) -> Optional[ParametrageItem]:
        """
        Query DynamoDB table to find the decision engine for a given structure
        
        Args:
            structure_key: The structure value to search for (UC_SousDomaine or UC_Domaine)
            
        Returns:
            ParametrageItem: The parametrage item if found, None if not found
            
        Raises:
            ClientError: If DynamoDB operation fails
            BotoCoreError: If AWS service error occurs
            
        Requirements: 3.1, 3.2
        """
        try:
            # Query DynamoDB using GetItem operation
            response = self.dynamodb.get_item(
                TableName=self.table_name,
                Key={
                    'Structure': {'S': structure_key}
                }
            )
            
            # Check if item was found
            if 'Item' not in response:
                return None
            
            # Convert DynamoDB item to ParametrageItem
            return ParametrageItem.from_dynamodb_item(response['Item'])
            
        except (ClientError, BotoCoreError):
            raise
            
        except Exception as e:
            logger.error(f"Unexpected error querying DynamoDB: {str(e)}")
            raise
    
    def get_moteur_decision_with_hierarchy(self, uc_sous_domaine: Optional[str], uc_domaine: str) -> Optional[ParametrageItem]:
        """
        Query DynamoDB table with hierarchical lookup logic:
        1. Try UC_SousDomaine if provided
        2. If not found or not provided, try UC_Domaine
        
        Args:
            uc_sous_domaine: The UC_SousDomaine value (optional)
            uc_domaine: The UC_Domaine value (fallback)
            
        Returns:
            ParametrageItem: The parametrage item if found, None if not found
        """
        # Step 1: Try UC_SousDomaine if provided
        if uc_sous_domaine:
            result = self.get_moteur_decision(uc_sous_domaine)
            if result:
                return result
        
        # Step 2: Try UC_Domaine
        return self.get_moteur_decision(uc_domaine)
    
