/**
 * dynamodb-service.js
 * Service centralisé pour toutes les interactions avec DynamoDB.
 * Gère les méthodes CRUD de base (get, put, delete, scan) avec gestion d'erreurs intégrée.
 */

class DynamoDBService {
    constructor() {
        this.docClient = null;
    }

    /**
     * Initialise ou récupère le client DynamoDB.
     * @returns {AWS.DynamoDB.DocumentClient}
     */
    getClient() {
        if (!this.docClient) {
            if (typeof AWS === 'undefined') {
                throw new Error("AWS SDK n'est pas chargé.");
            }
            this.docClient = new AWS.DynamoDB.DocumentClient();
        }
        return this.docClient;
    }

    /**
     * Récupère un élément par sa clé primaire.
     * @param {string} tableName - Nom de la table
     * @param {object} key - Clé primaire (ex: { Id: "monId" })
     * @returns {Promise<object>} - L'élément trouvé ou null
     */
    async get(tableName, key) {
        try {
            const params = {
                TableName: tableName,
                Key: key
            };
            const result = await this.getClient().get(params).promise();
            return result.Item;
        } catch (error) {
            this.handleError(`Erreur lors de la récupération (GET) sur ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Ajoute ou met à jour un élément.
     * @param {string} tableName - Nom de la table
     * @param {object} item - L'objet à sauvegarder
     * @returns {Promise<void>}
     */
    async put(tableName, item) {
        try {
            const params = {
                TableName: tableName,
                Item: item
            };
            await this.getClient().put(params).promise();
        } catch (error) {
            this.handleError(`Erreur lors de la sauvegarde (PUT) sur ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Supprime un élément par sa clé primaire.
     * @param {string} tableName - Nom de la table
     * @param {object} key - Clé primaire (ex: { Id: "monId" })
     * @returns {Promise<void>}
     */
    async delete(tableName, key) {
        try {
            const params = {
                TableName: tableName,
                Key: key
            };
            await this.getClient().delete(params).promise();
        } catch (error) {
            this.handleError(`Erreur lors de la suppression (DELETE) sur ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Scanne une table entière avec pagination automatique.
     * @param {string} tableName - Nom de la table
     * @param {object} [options] - Options optionnelles
     * @param {string} [options.filterExpression] - Expression de filtre DynamoDB
     * @param {object} [options.expressionAttributeValues] - Valeurs pour le filtre
     * @param {object} [options.expressionAttributeNames] - Noms d'attributs pour le filtre
     * @returns {Promise<Array>} - Liste complète des éléments
     */
    async scan(tableName, options = {}) {
        try {
            const params = {
                TableName: tableName
            };

            if (options.filterExpression) {
                params.FilterExpression = options.filterExpression;
            }
            if (options.expressionAttributeValues) {
                params.ExpressionAttributeValues = options.expressionAttributeValues;
            }
            if (options.expressionAttributeNames) {
                params.ExpressionAttributeNames = options.expressionAttributeNames;
            }

            let allItems = [];
            let lastEvaluatedKey = null;

            do {
                if (lastEvaluatedKey) {
                    params.ExclusiveStartKey = lastEvaluatedKey;
                }
                const result = await this.getClient().scan(params).promise();
                allItems = allItems.concat(result.Items || []);
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);

            return allItems;
        } catch (error) {
            this.handleError(`Erreur lors du scan de ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Interroge une table par clé primaire (plus performant que scan).
     * @param {string} tableName - Nom de la table
     * @param {string} keyConditionExpression - Expression de condition (ex: "id = :id")
     * @param {object} expressionAttributeValues - Valeurs (ex: { ":id": "123" })
     * @param {object} [options] - Options optionnelles
     * @param {string} [options.indexName] - Nom de l'index secondaire
     * @param {string} [options.filterExpression] - Filtre additionnel
     * @param {object} [options.expressionAttributeNames] - Noms d'attributs
     * @returns {Promise<Array>} - Liste des éléments
     */
    async query(tableName, keyConditionExpression, expressionAttributeValues, options = {}) {
        try {
            const params = {
                TableName: tableName,
                KeyConditionExpression: keyConditionExpression,
                ExpressionAttributeValues: expressionAttributeValues
            };

            if (options.indexName) {
                params.IndexName = options.indexName;
            }
            if (options.filterExpression) {
                params.FilterExpression = options.filterExpression;
            }
            if (options.expressionAttributeNames) {
                params.ExpressionAttributeNames = options.expressionAttributeNames;
            }

            let allItems = [];
            let lastEvaluatedKey = null;

            do {
                if (lastEvaluatedKey) {
                    params.ExclusiveStartKey = lastEvaluatedKey;
                }
                const result = await this.getClient().query(params).promise();
                allItems = allItems.concat(result.Items || []);
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);

            return allItems;
        } catch (error) {
            this.handleError(`Erreur lors du query sur ${tableName}`, error);
            throw error;
        }
    }

    /**
     * Gestion centralisée des erreurs.
     * Utilise le handler global s'il est disponible.
     */
    handleError(contextMessage, error) {
        console.error(`${contextMessage}:`, error);

        // Utiliser le gestionnaire d'erreurs AWS centralisé s'il existe
        if (window.handleAWSError) {
            const handled = window.handleAWSError(error, contextMessage);
            if (handled) return; // Redirection déjà gérée
        }

        // Sinon, on affiche un toast générique si possible
        if (window.showToast) {
            const message = error.message || "Erreur inconnue";
            window.showToast(`${contextMessage} : ${message}`, 'error', 5000);
        }
    }
}

// Export global (Singleton)
window.dynamoDBService = new DynamoDBService();
