import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

client = boto3.client('connect')

INSTANCE_ID   = '0f3658fc-4902-45ad-9575-1baf3529f440'
DATA_TABLE_ID = 'arn:aws:connect:eu-central-1:167497311447:instance/0f3658fc-4902-45ad-9575-1baf3529f440/data-table/1d5b60aa-8c9e-49e9-befa-198eb7dcb775'

# Types valides pour list_contact_flows (CONTACT_MODULE exclu → API séparée)
FLOW_TYPES = [
    'CONTACT_FLOW',
    'CUSTOMER_QUEUE',
    'CUSTOMER_HOLD',
    'CUSTOMER_WHISPER',
    'AGENT_HOLD',
    'AGENT_WHISPER',
    'OUTBOUND_WHISPER',
    'AGENT_TRANSFER',
]

def list_all_flows():
    """Récupère tous les flows via list_contact_flows (avec pagination)."""
    flows = []
    paginator = client.get_paginator('list_contact_flows')
    pages = paginator.paginate(
        InstanceId=INSTANCE_ID,
        ContactFlowTypes=FLOW_TYPES,
        PaginationConfig={'PageSize': 100}
    )
    for page in pages:
        flows.extend(page['ContactFlowSummaryList'])

    logger.info(f"Flows récupérés : {len(flows)}")
    return flows


def list_all_modules():
    """
    Récupère tous les modules via list_contact_flow_modules (API dédiée).
    Normalise la structure pour être compatible avec le reste du code.
    """
    modules = []
    paginator = client.get_paginator('list_contact_flow_modules')
    pages = paginator.paginate(
        InstanceId=INSTANCE_ID,
        PaginationConfig={'PageSize': 100}
    )
    for page in pages:
        logger.info(f"page['ContactFlowModulesSummaryList']: {page['ContactFlowModulesSummaryList']}")
        for m in page['ContactFlowModulesSummaryList']:
            # Normalisation : on aligne sur la structure des flows
            modules.append({
                'Id':                m.get('Id', ''),
                'Arn':               m.get('Arn', ''),
                'Name':              m.get('Name', ''),
                'ContactFlowType':   'CONTACT_MODULE',
                'ContactFlowState':  '',                          # Non applicable pour les modules
                'ContactFlowStatus': m.get('ContactFlowModuleStatus', ''),
            })

    logger.info(f"Modules récupérés : {len(modules)}")
    return modules


def extract_key_from_name(name):
    """
    Extrait la clé depuis le Name en retirant le préfixe 'shared-core-euc1-flux-'.
    Exemple: 'shared-core-euc1-flux-mod-CollecteParam' → 'mod-CollecteParam'
    """
    prefix = 'shared-core-euc1-flux-'
    if name.startswith(prefix):
        return name[len(prefix):]
    # Si le préfixe n'est pas présent, retourner le nom complet
    return name


def build_values(contact):
    """
    Construit la liste Values pour batch_create / batch_update.
    Chaque colonne (hors clé primaire) = un élément dans la liste.
    La clé primaire est 'Key', répétée dans PrimaryValues de chaque élément.
    """
    # Extraire la clé depuis le Name
    key_value = extract_key_from_name(contact['Name'])
    primary = [{'AttributeName': 'Key', 'Value': key_value}]

    # Colonnes à insérer (Name est maintenant une colonne normale)
    columns = {
        'Name':              contact.get('Name', ''),
        'Id':                contact.get('Id', ''),
        'Arn':               contact.get('Arn', ''),
        'ContactFlowType':   contact.get('ContactFlowType', ''),
        'ContactFlowState':  contact.get('ContactFlowState', ''),
        'ContactFlowStatus': contact.get('ContactFlowStatus', ''),
    }

    values = []
    for attr_name, attr_value in columns.items():
        logger.info(f"Colonne {attr_name}: {attr_value}")
        values.append({
            'PrimaryValues': primary,
            'AttributeName': attr_name,
            'Value':         str(attr_value),
        })

    return values


def upsert_contact(contact):
    """
    Tente d'abord un batch_create. Si la ligne existe déjà,
    bascule sur batch_update pour mettre à jour les valeurs.
    """
    values = build_values(contact)
    key_value = extract_key_from_name(contact['Name'])
    logger.info(f"Upsert : {contact['Name']} → Key: {key_value} ({contact['ContactFlowType']})")

    try:
        client.batch_create_data_table_value(
            InstanceId=INSTANCE_ID,
            DataTableId=DATA_TABLE_ID,
            Values=values
        )
        logger.info(f"  → Créé avec Key={key_value}")

    except client.exceptions.ResourceConflictException:
        logger.info(f"  → Existe déjà (Key={key_value}), mise à jour...")
        client.batch_update_data_table_value(
            InstanceId=INSTANCE_ID,
            DataTableId=DATA_TABLE_ID,
            Values=values
        )
        logger.info(f"  → Mis à jour avec Key={key_value}")

    except Exception as e:
        logger.error(f"  → Erreur pour {contact['Name']} (Key={key_value}) : {e}")
        raise


def lambda_handler(event, context):
    logger.info("Démarrage de la mise à jour de la Data Table Object_Arn")

    all_objects = list_all_flows() + list_all_modules()
    logger.info(f"Total objets à traiter : {len(all_objects)}")

    success, errors = 0, 0
    for contact in all_objects:
        try:
            upsert_contact(contact)
            success += 1
        except Exception:
            errors += 1

    logger.info(f"Terminé — Succès: {success} | Erreurs: {errors}")
    return {
        'statusCode': 200,
        'body': json.dumps({'success': success, 'errors': errors})
    }