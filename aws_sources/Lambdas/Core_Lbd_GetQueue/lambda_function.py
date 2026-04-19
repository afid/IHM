import json
import boto3
import os
import logging
from botocore.exceptions import ClientError

# Configuration du logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialisation des clients AWS
dynamodb = boto3.resource('dynamodb')
connect_client = boto3.client('connect')

def lambda_handler(event, context):
    """
    Fonction Lambda pour récupérer la queue associée à un parcours théorique
    depuis la table DynamoDB Core_Parcours.
    
    Args:
        event: Événement contenant les attributs Amazon Connect
        context: Contexte d'exécution Lambda
        
    Returns:
        dict: Réponse formatée pour Amazon Connect avec la queue trouvée
    """
    
    try:
        # Récupération du nom de la table depuis les variables d'environnement
        table_name = os.environ.get('DYNAMODB_TABLE_NAME', 'Core_Ddb_CiblageParametrageParcours')
        connect_instance_id = os.environ.get('CONNECT_INSTANCE_ID')
        
        if not connect_instance_id:
            logger.error("Variable d'environnement CONNECT_INSTANCE_ID non définie")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Configuration manquante',
                    'message': 'CONNECT_INSTANCE_ID non configuré'
                }, ensure_ascii=False)
            }
        
        logger.info(f"Utilisation de la table DynamoDB: {table_name}")
        logger.info(f"Instance Amazon Connect: {connect_instance_id}")
        
        # Récupération de l'attribut UC_ParcoursTheorique depuis l'événement Connect
        parcours_theorique = None
        
        # Amazon Connect peut passer les attributs de différentes façons
        if 'Details' in event and 'ContactData' in event['Details']:
            contact_data = event['Details']['ContactData']
            if 'Attributes' in contact_data:
                parcours_theorique = contact_data['Attributes'].get('UC_ParcoursTheorique')
        
        # Fallback: vérifier directement dans l'événement
        if not parcours_theorique and 'UC_ParcoursTheorique' in event:
            parcours_theorique = event['UC_ParcoursTheorique']
            
        # Fallback: vérifier dans les attributs à la racine
        if not parcours_theorique and 'Attributes' in event:
            parcours_theorique = event['Attributes'].get('UC_ParcoursTheorique')
        
        if not parcours_theorique:
            logger.error("Attribut UC_ParcoursTheorique non trouvé dans l'événement")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'UC_ParcoursTheorique manquant',
                    'message': 'L\'attribut UC_ParcoursTheorique est requis'
                }, ensure_ascii=False)
            }
        
        logger.info(f"Recherche de la queue pour le parcours: {parcours_theorique}")
        
        # Accès à la table DynamoDB
        table = dynamodb.Table(table_name)
        
        # Récupération de l'élément avec la clé primaire "Parcours"
        response = table.get_item(
            Key={
                'Parcours': parcours_theorique
            }
        )
        
        # Vérification si l'élément existe
        if 'Item' not in response:
            logger.warning(f"Aucun parcours trouvé pour: {parcours_theorique}")
            return {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Parcours non trouvé',
                    'message': f'Aucun parcours trouvé pour UC_ParcoursTheorique: {parcours_theorique}'
                }, ensure_ascii=False)
            }
        
        item = response['Item']
        queue_name = item.get('Queue')
        action = item.get('Action')
        
        if not queue_name:
            logger.warning(f"Aucune queue définie pour le parcours: {parcours_theorique}")
            return {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Queue non définie',
                    'message': f'Aucune queue définie pour le parcours: {parcours_theorique}'
                }, ensure_ascii=False)
            }
        
        logger.info(f"Queue trouvée: {queue_name} pour le parcours: {parcours_theorique}")
        
        if action:
            logger.info(f"Action trouvée: {action} pour le parcours: {parcours_theorique}")
        
        # Récupération de l'ARN de la queue depuis Amazon Connect
        try:
            logger.info(f"Recherche de l'ARN pour la queue: {queue_name}")
            
            # Lister toutes les queues de l'instance Connect
            queues_response = connect_client.list_queues(
                InstanceId=connect_instance_id,
                QueueTypes=['STANDARD']  # On peut aussi inclure 'AGENT' si nécessaire
            )
            
            queue_arn = None
            for queue_summary in queues_response.get('QueueSummaryList', []):
                if queue_summary['Name'] == queue_name:
                    queue_arn = queue_summary['Arn']
                    logger.info(f"ARN trouvé pour {queue_name}: {queue_arn}")
                    break
            
            if not queue_arn:
                logger.warning(f"Queue '{queue_name}' non trouvée dans l'instance Connect {connect_instance_id}")
                return {
                    'statusCode': 404,
                    'body': json.dumps({
                        'error': 'Queue non trouvée dans Connect',
                        'message': f'La queue "{queue_name}" n\'existe pas dans l\'instance Amazon Connect'
                    }, ensure_ascii=False)
                }
                
        except ClientError as connect_error:
            logger.error(f"Erreur lors de la récupération des queues Connect: {connect_error}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Erreur Amazon Connect',
                    'message': f'Impossible de récupérer les queues: {str(connect_error)}'
                }, ensure_ascii=False)
            }
        
        logger.info(f"Queue trouvée: {queue_name} (ARN: {queue_arn}) pour le parcours: {parcours_theorique}")
        
        # Réponse formatée pour Amazon Connect
        # Amazon Connect attend généralement les attributs dans un format spécifique
        response_data = {
            'statusCode': 200,
            'Queue': queue_name,
            'QueueArn': queue_arn,
            'Parcours': parcours_theorique,
            'body': json.dumps({
                'success': True,
                'Queue': queue_name,
                'QueueArn': queue_arn,
                'Parcours': parcours_theorique
            }, ensure_ascii=False)
        }
        
        # Ajouter l'attribut Action s'il existe
        if action:
            response_data['Action'] = action
            response_data['body'] = json.dumps({
                'success': True,
                'Queue': queue_name,
                'QueueArn': queue_arn,
                'Parcours': parcours_theorique,
                'Action': action
            }, ensure_ascii=False)
        
        return response_data
        
    except ClientError as e:
        logger.error(f"Erreur DynamoDB: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Erreur base de données',
                'message': f'Erreur lors de l\'accès à DynamoDB: {str(e)}'
            }, ensure_ascii=False)
        }
        
    except Exception as e:
        logger.error(f"Erreur inattendue: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Erreur interne',
                'message': f'Erreur inattendue: {str(e)}'
            }, ensure_ascii=False)
        }