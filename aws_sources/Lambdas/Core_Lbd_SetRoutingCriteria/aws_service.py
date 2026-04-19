import json
import boto3
import logging
from constants import JOURNEYS_TABLE_NAME
from typing import Union, Dict, Any

from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError


def updateContactRoutingData(instance_id: str, connect: boto3.client, contact_id: str, queuePriority: int, routingCriteria: Dict[str, Any], logger: logging.Logger) -> Dict[str, Any]:
    try:
        response = connect.update_contact_routing_data(
            InstanceId=instance_id,
            ContactId=contact_id,        
            QueuePriority=queuePriority,
            RoutingCriteria=routingCriteria
        )
        return response
    except ClientError as e:
        logger.error(f"[{contact_id}] Failed to update routing data: {e}")
        raise

def updateContactAttributes(instance_id: str, connect: boto3.client, contact_id: str, routingCriteria: Dict[str, Any], logger: logging.Logger) -> Dict[str, Any]:
    logger.debug(f"[{contact_id}] updateContactAttributes routingCriteria   -> {routingCriteria}")
    try:
        response = connect.update_contact_attributes(
                        InitialContactId=contact_id,
                        InstanceId=instance_id,
                        Attributes={
                            "routingCustomCriteria": routingCriteria                                                   
                        }
        )
        return response
    except ClientError as e:
        logger.error(f"[{contact_id}] Failed to update routing data: {e}")
        raise

def getItemsFromDynamoDB(dynamodb: boto3.resource, journeyName: str, logger: logging.Logger = None, contact_id: str = None) -> Dict[str, Any]:
    try:
        table = dynamodb.Table(JOURNEYS_TABLE_NAME)
        
        '''
        Scan - À éviter en production
            Lit toute la table séquentiellement
            Très coûteux en RCU
            Lent sur les grandes tables
        '''
        '''
        response = table.scan(
            FilterExpression=Attr('journeyName').eq(journeyName),
            Select='ALL_ATTRIBUTES',
        )
        '''

        '''
        Query par partition key seule - La plus rapide
            Accès direct via hash
            Complexité O(1) pour localiser la partition
            Consomme le moins de RCU (Read Capacity Units)
        '''
        
        response = table.query(
            KeyConditionExpression=Key('Parcours').eq(journeyName)
        )
        

        items = response['Items'][0]
        return items

    except ClientError as e:
        if logger and contact_id:
            logger.error(f"[{contact_id}] DynamoDB error: {e}")
        raise

def getGetCurrentMetricDataAgentsOnline(contact_id: str, instance_id: str, connect: boto3.client, queue_id: str, routing_criteria: Dict[str, Any], logger: logging.Logger) -> Dict[str, Union[int, float]]:
    try:
        total_step_level = 0
        agents_online = {}
        routing_step_expression = []

        for index, step in enumerate(routing_criteria.get('Steps', [])):            
            total_step_level = index
        total_step_level += 1

        for idx, rc in enumerate(routing_criteria['Steps']):                        
            expr = rc['Expression']            
            expr_str = json.dumps(expr)
            expr_str = (expr_str
                        .replace("OrExpression", "orExpression")
                        .replace("AndExpression", "andExpression")
                        .replace("AttributeCondition", "attributeCondition")
                        .replace("ComparisonOperator", "comparisonOperator")
                        .replace("Name", "name")
                        .replace("ProficiencyLevel", "proficiencyLevel")
                        .replace("Value", "value"))
            routing_step_expression.append(json.loads(expr_str))
        
        logger.debug(f"[{contact_id}] routing_step_expression -> {json.dumps(routing_step_expression)}")
                
        index_routing_step_expression = list(routing_step_expression)        
        
        resp_current = connect.get_current_metric_data(
            InstanceId=instance_id,
            Filters={
                        "Queues": [queue_id],
                        "Channels": ["VOICE"],
                        "RoutingStepExpressions": [json.dumps(e) for e in routing_step_expression],
                    },
                    Groupings=["ROUTING_STEP_EXPRESSION"],
                    CurrentMetrics=[                        
                        {"Name": "AGENTS_AVAILABLE", "Unit": "COUNT"}
                    ],
                    MaxResults=1,
        )        
        metric_results = resp_current.get('MetricResults', [])
        if metric_results:
            for result in metric_results:
                # Response uses Dimensions.RoutingStepExpression (note the casing differences across APIs)
                dim_expr_raw = result.get('Dimensions', {}).get('RoutingStepExpression')
                normalized_result_expr = json.dumps(json.loads(dim_expr_raw))

                for metric in result.get('Collections', []):
                    name = metric.get('Metric', {}).get('Name')
                    value = metric.get('Value')
                    if value is None:
                        continue

                    for idx, key in enumerate(index_routing_step_expression, start=1):
                        normalized_key = json.dumps(key)
                        if json.loads(normalized_result_expr) == json.loads(normalized_key):
                            if name == 'AGENTS_AVAILABLE':
                                agents_online[f"Step{idx}"] = value                            
                            break
        else:
            logger.debug(f"[{contact_id}] no CurrentMetricData publish : {json.dumps(metric_results)}")

        # ---- Build statistics result per step ----
        statistics_result = {}
        for idx, _expr in enumerate(index_routing_step_expression, start=1):
            step_key = f"Step{idx}"
            statistics_result[f"step{idx}_AgentsOnline"] = agents_online.get(step_key, 0)
        
        logger.info(f"[{contact_id}] statistics_result : {json.dumps(statistics_result)}")
        return statistics_result        
    except ClientError as e:
        logger.error(f"[{contact_id}] get_current_metric_data error: {e}")
        raise