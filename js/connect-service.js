/**
 * connect-service.js
 *
 * SERVICE POUR AMAZON CONNECT :
 * Ce fichier centralise les appels aux API d'Amazon Connect.
 * L'InstanceId est récupéré dynamiquement depuis la table Core_Ddb_IHM.
 */

(function () {
    /**
     * Initialise le client Amazon Connect
     */
    function getConnectClient() {
        const config = window.CONNECT_CONFIG || {};
        return new AWS.Connect({
            region: config.Region || 'eu-central-1'
        });
    }

    /**
     * Nettoie un InstanceId (enlève les crochets et guillemets indésirables liés à des erreurs de saisie)
     */
    function cleanInstanceId(id) {
        if (!id || typeof id !== 'string') return id;
        return id.replace(/[\[\]"']/g, '').trim();
    }

    /**
     * Résout l'InstanceId depuis DynamoDB s'il n'est pas déjà présent
     */
    async function resolveInstanceId() {
        if (window.CONNECT_CONFIG && window.CONNECT_CONFIG.InstanceId) {
            return cleanInstanceId(window.CONNECT_CONFIG.InstanceId);
        }

        console.log("Amazon ConnectService: Recherche de l'InstanceId dans DynamoDB (Core_Ddb_IHM)...");
        try {
            if (!window.dynamoDBService) {
                throw new Error("Le service DynamoDB n'est pas initialisé.");
            }

            const items = await window.dynamoDBService.scan('Core_Ddb_IHM');
            const config = (items || []).find(item => item.Type === 'Config' && item.Name === 'AmazonConnect');

            if (config && config.Parametres && config.Parametres.length > 0) {
                let instanceId = cleanInstanceId(config.Parametres[0]);
                if (window.CONNECT_CONFIG) {
                    window.CONNECT_CONFIG.InstanceId = instanceId;
                }
                console.log("Amazon ConnectService: InstanceId résolu avec succès :", instanceId);
                return instanceId;
            } else {
                console.warn("Amazon ConnectService: Aucun item 'Config/AmazonConnect' trouvé dans DynamoDB.");
                return null;
            }
        } catch (err) {
            console.error("Amazon ConnectService: Erreur lors de la récupération de l'InstanceId:", err);
            return null;
        }
    }

    /**
     * Récupère la liste complète des guides vocaux (prompts)
     * Gère la pagination automatique.
     */
    async function listAllPrompts() {
        const connect = getConnectClient();

        // Résolution dynamique de l'InstanceId
        const instanceId = await resolveInstanceId();

        if (!instanceId) {
            console.error("InstanceId Amazon Connect manquante. Impossible de lister les prompts.");
            return [];
        }

        console.log("Amazon ConnectService: Récupération des prompts pour l'instance", instanceId);

        let allPrompts = [];
        let nextToken = null;

        try {
            do {
                const params = {
                    InstanceId: instanceId,
                    NextToken: nextToken
                };

                const result = await connect.listPrompts(params).promise();

                if (result.PromptSummaryList) {
                    // On ne garde que les noms des prompts pour la compatibilité avec l'existant
                    const names = result.PromptSummaryList.map(p => p.Name);
                    allPrompts = allPrompts.concat(names);
                }

                nextToken = result.NextToken;
            } while (nextToken);

            console.log(`Amazon ConnectService: ${allPrompts.length} prompts récupérés avec succès.`);
            return allPrompts;

        } catch (err) {
            console.error("Amazon ConnectService: Erreur lors de la récupération des prompts:", err);
            throw err;
        }
    }

    // Exportation globale
    window.connectService = {
        listAllPrompts,
        resolveInstanceId // Utile si on veut forcer la résolution
    };
})();
