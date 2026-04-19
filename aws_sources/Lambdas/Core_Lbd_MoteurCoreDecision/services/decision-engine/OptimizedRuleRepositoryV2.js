"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedRuleRepositoryV2 = void 0;
const RuleRepository_1 = require("./RuleRepository");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const GSIManager_1 = require("./GSIManager");
class OptimizedRuleRepositoryV2 extends RuleRepository_1.RuleRepository {
    constructor() {
        super(...arguments);
        this.optimizedCache = new Map();
        this.MAX_RULES_PER_QUERY = 200; // Limite de sécurité
    }
    // Utilise le gestionnaire GSI pour la configuration dynamique
    get PRIORITY_ATTRIBUTES() {
        return GSIManager_1.GSIManager.getActivePriorityAttributes();
    }
    /**
     * Nouvelle méthode optimisée pour charger les règles selon les attributs
     */
    async loadOptimizedRules(contactAttributes) {
        console.log('🚀 Loading optimized rules for attributes:', contactAttributes);
        // Générer une clé de cache basée sur les attributs
        const cacheKey = this.generateOptimizedCacheKey(contactAttributes);
        // Vérifier le cache optimisé
        if (this.optimizedCache.has(cacheKey)) {
            console.log(`📋 Cache hit for optimized key: ${cacheKey}`);
            return this.optimizedCache.get(cacheKey);
        }
        // Déterminer la stratégie de requête optimale
        const strategy = this.determineOptimalStrategy(contactAttributes);
        let rules;
        if (strategy.useGSI && strategy.indexName) {
            // Utiliser Query avec GSI (le plus efficace)
            console.log(`🎯 Using GSI strategy: ${strategy.indexName}`);
            rules = await this.queryWithGSI(strategy);
        }
        else {
            // Fallback vers scan optimisé avec filtres
            console.log('🔍 Using optimized scan with filters');
            rules = await this.scanWithOptimizedFilters(contactAttributes);
        }
        // Appliquer le tri déterministe
        rules = this.applyDeterministicSort(rules);
        // Mettre en cache le résultat
        this.optimizedCache.set(cacheKey, rules);
        console.log(`✅ Loaded and cached ${rules.length} optimized rules`);
        return rules;
    }
    /**
     * Méthode de compatibilité - utilise l'optimisation si possible
     */
    async loadAllRules() {
        // Si aucun attribut spécifique, utiliser la méthode parent
        return super.loadAllRules();
    }
    /**
     * Détermine la stratégie optimale selon les attributs disponibles
     */
    determineOptimalStrategy(contactAttributes) {
        // Chercher le premier attribut prioritaire présent
        for (const attr of this.PRIORITY_ATTRIBUTES) {
            if (contactAttributes[attr]) {
                // Pour l'instant, simuler la stratégie GSI
                // En production, vérifier si l'index existe réellement
                return {
                    useGSI: this.shouldUseGSI(attr, contactAttributes[attr]),
                    indexName: `${attr}-Weight-Index`,
                    keyCondition: `${attr} = :${attr.toLowerCase()}`,
                    attributeValues: {
                        [`:${attr.toLowerCase()}`]: contactAttributes[attr]
                    }
                };
            }
        }
        // Aucun attribut prioritaire trouvé, utiliser scan avec filtres
        return {
            useGSI: false,
            filterExpression: this.buildFilterExpression(contactAttributes)
        };
    }
    /**
     * Détermine si on doit utiliser un GSI pour cet attribut
     */
    shouldUseGSI(attribute, value) {
        // Vérifier si l'optimisation GSI est activée via variable d'environnement
        const gsiEnabled = process.env.ENABLE_GSI_OPTIMIZATION === 'true';
        if (!gsiEnabled) {
            console.log('🔍 GSI optimization disabled via environment variable');
            return false;
        }
        // Logique pour déterminer si le GSI sera efficace
        return this.PRIORITY_ATTRIBUTES.includes(attribute) && value !== null && value !== undefined;
    }
    /**
     * Exécute une requête avec GSI
     */
    async queryWithGSI(strategy) {
        try {
            console.log(`🎯 Executing GSI query: ${strategy.indexName}`);
            console.log(`   Key condition: ${strategy.keyCondition}`);
            console.log(`   Attribute values: ${JSON.stringify(strategy.attributeValues)}`);
            const command = new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: strategy.indexName,
                KeyConditionExpression: strategy.keyCondition,
                ExpressionAttributeValues: strategy.attributeValues,
                ScanIndexForward: false, // Tri par poids décroissant
                Limit: this.MAX_RULES_PER_QUERY
            });
            const response = await this.dynamoClient.send(command);
            if (!response.Items) {
                console.log(`   📊 GSI query returned 0 rules from index ${strategy.indexName}`);
                return [];
            }
            const rules = this.convertItemsToOptimizedRules(response.Items);
            console.log(`   📊 GSI query returned ${rules.length} rules from index ${strategy.indexName}`);
            return rules;
        }
        catch (error) {
            console.error(`❌ Error in GSI query for ${strategy.indexName}:`, error);
            console.log('🔄 Falling back to optimized scan...');
            return this.scanWithOptimizedFilters({});
        }
    }
    /**
     * Exécute un scan avec filtres optimisés
     */
    async scanWithOptimizedFilters(contactAttributes) {
        try {
            console.log('🔍 Executing optimized filtered scan');
            // Construire les filtres dynamiquement
            const filterExpressions = [];
            const attributeValues = { ':active': 'true' };
            // Ajouter des filtres pour les attributs prioritaires présents
            Object.entries(contactAttributes).forEach(([key, value], index) => {
                if (this.PRIORITY_ATTRIBUTES.includes(key)) {
                    filterExpressions.push(`contains(expression, :filter${index})`);
                    attributeValues[`:filter${index}`] = `${key} == "${value}"`;
                }
            });
            const command = new lib_dynamodb_1.ScanCommand({
                TableName: this.tableName,
                FilterExpression: filterExpressions.length > 0
                    ? `(${filterExpressions.join(' OR ')}) AND (attribute_not_exists(active) OR active = :active)`
                    : 'attribute_not_exists(active) OR active = :active',
                ExpressionAttributeValues: attributeValues,
                Limit: this.MAX_RULES_PER_QUERY
            });
            const response = await this.dynamoClient.send(command);
            if (!response.Items) {
                return [];
            }
            const rules = this.convertItemsToOptimizedRules(response.Items);
            console.log(`📋 Filtered scan returned ${rules.length} rules`);
            return rules;
        }
        catch (error) {
            console.error('❌ Error in filtered scan, falling back to full scan:', error);
            return this.loadRulesFromDatabaseOptimized();
        }
    }
    /**
     * Charge toutes les règles avec optimisations mineures
     */
    async loadRulesFromDatabaseOptimized() {
        try {
            const command = new lib_dynamodb_1.ScanCommand({
                TableName: this.tableName,
                FilterExpression: 'attribute_not_exists(active) OR active = :active',
                ExpressionAttributeValues: {
                    ':active': 'true'
                }
            });
            const response = await this.dynamoClient.send(command);
            if (!response.Items) {
                return [];
            }
            const rules = this.convertItemsToOptimizedRules(response.Items);
            console.log(`📋 Full scan loaded ${rules.length} rules`);
            return rules;
        }
        catch (error) {
            console.error('❌ Error in optimized database load:', error);
            throw new Error(`Failed to load optimized rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Convertit les items DynamoDB en règles optimisées
     * Adapté pour le format AAN_Decision (Amazon Connect)
     */
    convertItemsToOptimizedRules(items) {
        return items.map(item => {
            // Validation des champs requis pour le format AAN_Decision
            if (!item.id || !item.expression || typeof item.weight !== 'number') {
                throw new Error(`Invalid rule data: missing required fields in rule ${item.id || 'unknown'}`);
            }
            return {
                id: item.id,
                name: item.distributionSegment, // Utiliser distributionSegment comme name
                expression: item.expression,
                weight: item.weight,
                distributionSegment: item.distributionSegment,
                libellé: item.libellé, // Nouveau champ
                priority: item.priority, // Nouveau champ
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                // Champs d'optimisation (optionnels pour l'instant)
                primaryAttribute: item.primaryAttribute,
                secondaryAttribute: item.secondaryAttribute
            };
        });
    }
    /**
     * Applique un tri déterministe aux règles
     */
    applyDeterministicSort(rules) {
        return rules.sort((a, b) => {
            // 1. Tri par poids (décroissant)
            if (a.weight !== b.weight) {
                return b.weight - a.weight;
            }
            // 2. Tri par ID (croissant) pour garantir la stabilité
            return a.id.localeCompare(b.id);
        });
    }
    /**
     * Génère une clé de cache optimisée
     */
    generateOptimizedCacheKey(contactAttributes) {
        // Utiliser seulement les attributs prioritaires pour la clé
        const relevantAttrs = {};
        this.PRIORITY_ATTRIBUTES.forEach(attr => {
            if (contactAttributes[attr]) {
                relevantAttrs[attr] = contactAttributes[attr];
            }
        });
        // Créer une clé stable et courte
        const sortedKeys = Object.keys(relevantAttrs).sort();
        const keyParts = sortedKeys.map(key => `${key}:${relevantAttrs[key]}`);
        return keyParts.join('|') || 'default';
    }
    /**
     * Construit une expression de filtre pour le scan
     */
    buildFilterExpression(contactAttributes) {
        const filters = [];
        Object.keys(contactAttributes).forEach(key => {
            if (this.PRIORITY_ATTRIBUTES.includes(key)) {
                filters.push(`contains(expression, '${key}')`);
            }
        });
        return filters.length > 0 ? filters.join(' OR ') : '';
    }
    /**
     * Invalide tous les caches (optimisé et standard)
     */
    async refreshCache() {
        await super.refreshCache();
        this.optimizedCache.clear();
        console.log('🧹 All caches (standard + optimized) cleared');
    }
    /**
     * Statistiques étendues incluant le cache optimisé
     */
    getCacheStats() {
        const baseStats = super.getCacheStats();
        return {
            ...baseStats,
            optimizedCache: {
                size: this.optimizedCache.size,
                keys: Array.from(this.optimizedCache.keys())
            }
        };
    }
    /**
     * Analyse les performances de l'optimisation
     */
    async analyzeOptimizationPerformance(contactAttributes) {
        const cacheKey = this.generateOptimizedCacheKey(contactAttributes);
        const cacheHit = this.optimizedCache.has(cacheKey);
        if (cacheHit) {
            const cachedRules = this.optimizedCache.get(cacheKey);
            return {
                strategy: 'CACHE_HIT',
                rulesLoaded: cachedRules.length,
                cacheHit: true,
                estimatedImprovement: '99% faster (cache)'
            };
        }
        const strategy = this.determineOptimalStrategy(contactAttributes);
        // Estimer le nombre de règles qui seraient chargées
        let estimatedRules = 112; // Nombre actuel de règles
        let improvement = '0%';
        if (strategy.useGSI) {
            // Estimation basée sur la sélectivité de l'attribut
            const primaryAttr = Object.keys(contactAttributes).find(attr => this.PRIORITY_ATTRIBUTES.includes(attr));
            if (primaryAttr === 'Client') {
                estimatedRules = Math.round(112 * 0.1); // 10% des règles
                improvement = '90% fewer rules loaded';
            }
            else if (primaryAttr === 'TypeSinistre') {
                estimatedRules = Math.round(112 * 0.2); // 20% des règles
                improvement = '80% fewer rules loaded';
            }
            else {
                estimatedRules = Math.round(112 * 0.3); // 30% des règles
                improvement = '70% fewer rules loaded';
            }
        }
        return {
            strategy: strategy.useGSI ? `GSI_${strategy.indexName}` : 'FILTERED_SCAN',
            rulesLoaded: estimatedRules,
            cacheHit: false,
            estimatedImprovement: improvement
        };
    }
}
exports.OptimizedRuleRepositoryV2 = OptimizedRuleRepositoryV2;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT3B0aW1pemVkUnVsZVJlcG9zaXRvcnlWMi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvT3B0aW1pemVkUnVsZVJlcG9zaXRvcnlWMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxxREFBa0Q7QUFDbEQsd0RBQTBGO0FBRTFGLDZDQUEwQztBQWdCMUMsTUFBYSx5QkFBMEIsU0FBUSwrQkFBYztJQUE3RDs7UUFDWSxtQkFBYyxHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO1FBQzNDLHdCQUFtQixHQUFHLEdBQUcsQ0FBQyxDQUFDLHFCQUFxQjtJQXlXckUsQ0FBQztJQXZXQyw4REFBOEQ7SUFDOUQsSUFBWSxtQkFBbUI7UUFDN0IsT0FBTyx1QkFBVSxDQUFDLDJCQUEyQixFQUFFLENBQUM7SUFDbEQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLGlCQUFzQztRQUM3RCxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFFN0UsbURBQW1EO1FBQ25ELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRW5FLDZCQUE2QjtRQUM3QixJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUMzRCxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBRSxDQUFDO1FBQzVDLENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFbEUsSUFBSSxLQUFzQixDQUFDO1FBRTNCLElBQUksUUFBUSxDQUFD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LHdCQUF3QixDQUFDO1lBQ3pDLENBQUM7aUJBQU0sQ0FBQztnQkFDTixjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxpQkFBaUI7Z0JBQ3pELFdBQVcsR0FBRyx3QkFBd0IsQ0FBQztZQUN6QyxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU87WUFDTCxRQUFRLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQWU7WUFDekUsV0FBVyxFQUFFLGNBQWM7WUFDM0IsUUFBUSxFQUFFLEtBQUs7WUFDZixvQkFBb0IsRUFBRSxXQUFXO1NBQ2xDLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUEzV0QsOERBMldDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUnVsZVJlcG9zaXRvcnkgfSBmcm9tICcuL1J1bGVSZXBvc2l0b3J5JztcclxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUXVlcnlDb21tYW5kLCBTY2FuQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IFF1YWxpZmljYXRpb25SdWxlIH0gZnJvbSAnLi4vLi4vdHlwZXMvZGVjaXNpb24tZW5naW5lJztcclxuaW1wb3J0IHsgR1NJTWFuYWdlciB9IGZyb20gJy4vR1NJTWFuYWdlcic7XHJcblxyXG5pbnRlcmZhY2UgT3B0aW1pemVkUnVsZSBleHRlbmRzIFF1YWxpZmljYXRpb25SdWxlIHtcclxuICAvLyBDaGFtcHMgZCdvcHRpbWlzYXRpb24gKHNlcm9udCBham91dMOpcyBwcm9ncmVzc2l2ZW1lbnQpXHJcbiAgcHJpbWFyeUF0dHJpYnV0ZT86IHN0cmluZzsgICAgLy8gQ2xpZW50LCBUeXBlU2luaXN0cmUsIFVyZ2VuY2UsIGV0Yy5cclxuICBzZWNvbmRhcnlBdHRyaWJ1dGU/OiBzdHJpbmc7ICAvLyBBdHRyaWJ1dCBzZWNvbmRhaXJlIHBvdXIgYWZmaW5hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIFF1ZXJ5U3RyYXRlZ3kge1xyXG4gIHVzZUdTSTogYm9vbGVhbjtcclxuICBpbmRleE5hbWU/OiBzdHJpbmc7XHJcbiAga2V5Q29uZGl0aW9uPzogc3RyaW5nO1xyXG4gIGF0dHJpYnV0ZVZhbHVlcz86IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgZmlsdGVyRXhwcmVzc2lvbj86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE9wdGltaXplZFJ1bGVSZXBvc2l0b3J5VjIgZXh0ZW5kcyBSdWxlUmVwb3NpdG9yeSB7XHJcbiAgcHJvdGVjdGVkIG9wdGltaXplZENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE9wdGltaXplZFJ1bGVbXT4oKTtcclxuICBwcm90ZWN0ZWQgcmVhZG9ubHkgTUFYX1JVTEVTX1BFUl9RVUVSWSA9IDIwMDsgLy8gTGltaXRlIGRlIHPDqWN1cml0w6lcclxuICBcclxuICAvLyBVdGlsaXNlIGxlIGdlc3Rpb25uYWlyZSBHU0kgcG91ciBsYSBjb25maWd1cmF0aW9uIGR5bmFtaXF1ZVxyXG4gIHByaXZhdGUgZ2V0IFBSSU9SSVRZX0FUVFJJQlVURVMoKTogc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIEdTSU1hbmFnZXIuZ2V0QWN0aXZlUHJpb3JpdHlBdHRyaWJ1dGVzKCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBOb3V2ZWxsZSBtw6l0aG9kZSBvcHRpbWlzw6llIHBvdXIgY2hhcmdlciBsZXMgcsOoZ2xlcyBzZWxvbiBsZXMgYXR0cmlidXRzXHJcbiAgICovXHJcbiAgYXN5bmMgbG9hZE9wdGltaXplZFJ1bGVzKGNvbnRhY3RBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUHJvbWlzZTxPcHRpbWl6ZWRSdWxlW10+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5qAIExvYWRpbmcgb3B0aW1pemVkIHJ1bGVzIGZvciBhdHRyaWJ1dGVzOicsIGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgIFxyXG4gICAgLy8gR8OpbsOpcmVyIHVuZSBjbMOpIGRlIGNhY2hlIGJhc8OpZSBzdXIgbGVzIGF0dHJpYnV0c1xyXG4gICAgY29uc3QgY2FjaGVLZXkgPSB0aGlzLmdlbmVyYXRlT3B0aW1pemVkQ2FjaGVLZXkoY29udGFjdEF0dHJpYnV0ZXMpO1xyXG4gICAgXHJcbiAgICAvLyBWw6lyaWZpZXIgbGUgY2FjaGUgb3B0aW1pc8OpXHJcbiAgICBpZiAodGhpcy5vcHRpbWl6ZWRDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIENhY2hlIGhpdCBmb3Igb3B0aW1pemVkIGtleTogJHtjYWNoZUtleX1gKTtcclxuICAgICAgcmV0dXJuIHRoaXMub3B0aW1pemVkQ2FjaGUuZ2V0KGNhY2hlS2V5KSE7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRMOpdGVybWluZXIgbGEgc3RyYXTDqWdpZSBkZSByZXF1w6p0ZSBvcHRpbWFsZVxyXG4gICAgY29uc3Qgc3RyYXRlZ3kgPSB0aGlzLmRldGVybWluZU9wdGltYWxTdHJhdGVneShjb250YWN0QXR0cmlidXRlcyk7XHJcbiAgICBcclxuICAgIGxldCBydWxlczogT3B0aW1pemVkUnVsZVtdO1xyXG4gICAgXHJcbiAgICBpZiAoc3RyYXRlZ3kudXNlR1NJICYmIHN0cmF0ZWd5LmluZGV4TmFtZSkge1xyXG4gICAgICAvLyBVdGlsaXNlciBRdWVyeSBhdmVjIEdTSSAobGUgcGx1cyBlZmZpY2FjZSlcclxuICAgICAgY29uc29sZS5sb2coYPCfjq8gVXNpbmcgR1NJIHN0cmF0ZWd5OiAke3N0cmF0ZWd5LmluZGV4TmFtZX1gKTtcclxuICAgICAgcnVsZXMgPSBhd2FpdCB0aGlzLnF1ZXJ5V2l0aEdTSShzdHJhdGVneSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBGYWxsYmFjayB2ZXJzIHNjYW4gb3B0aW1pc8OpIGF2ZWMgZmlsdHJlc1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBVc2luZyBvcHRpbWl6ZWQgc2NhbiB3aXRoIGZpbHRlcnMnKTtcclxuICAgICAgcnVsZXMgPSBhd2FpdCB0aGlzLnNjYW5XaXRoT3B0aW1pemVkRmlsdGVycyhjb250YWN0QXR0cmlidXRlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQXBwbGlxdWVyIGxlIHRyaSBkw6l0ZXJtaW5pc3RlXHJcbiAgICBydWxlcyA9IHRoaXMuYXBwbHlEZXRlcm1pbmlzdGljU29ydChydWxlcyk7XHJcbiAgICBcclxuICAgIC8vIE1ldHRyZSBlbiBjYWNoZSBsZSByw6lzdWx0YXRcclxuICAgIHRoaXMub3B0aW1pemVkQ2FjaGUuc2V0KGNhY2hlS2V5LCBydWxlcyk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgTG9hZGVkIGFuZCBjYWNoZWQgJHtydWxlcy5sZW5ndGh9IG9wdGltaXplZCBydWxlc2ApO1xyXG4gICAgcmV0dXJuIHJ1bGVzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTcOpdGhvZGUgZGUgY29tcGF0aWJpbGl0w6kgLSB1dGlsaXNlIGwnb3B0aW1pc2F0aW9uIHNpIHBvc3NpYmxlXHJcbiAgICovXHJcbiAgYXN5bmMgbG9hZEFsbFJ1bGVzKCk6IFByb21pc2U8UXVhbGlmaWNhdGlvblJ1bGVbXT4ge1xyXG4gICAgLy8gU2kgYXVjdW4gYXR0cmlidXQgc3DDqWNpZmlxdWUsIHV0aWxpc2VyIGxhIG3DqXRob2RlIHBhcmVudFxyXG4gICAgcmV0dXJuIHN1cGVyLmxvYWRBbGxSdWxlcygpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRMOpdGVybWluZSBsYSBzdHJhdMOpZ2llIG9wdGltYWxlIHNlbG9uIGxlcyBhdHRyaWJ1dHMgZGlzcG9uaWJsZXNcclxuICAgKi9cclxuICBwcml2YXRlIGRldGVybWluZU9wdGltYWxTdHJhdGVneShjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55Pik6IFF1ZXJ5U3RyYXRlZ3kge1xyXG4gICAgLy8gQ2hlcmNoZXIgbGUgcHJlbWllciBhdHRyaWJ1dCBwcmlvcml0YWlyZSBwcsOpc2VudFxyXG4gICAgZm9yIChjb25zdCBhdHRyIG9mIHRoaXMuUFJJT1JJVFlfQVRUUklCVVRFUykge1xyXG4gICAgICBpZiAoY29udGFjdEF0dHJpYnV0ZXNbYXR0cl0pIHtcclxuICAgICAgICAvLyBQb3VyIGwnaW5zdGFudCwgc2ltdWxlciBsYSBzdHJhdMOpZ2llIEdTSVxyXG4gICAgICAgIC8vIEVuIHByb2R1Y3Rpb24sIHbDqXJpZmllciBzaSBsJ2luZGV4IGV4aXN0ZSByw6llbGxlbWVudFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICB1c2VHU0k6IHRoaXMuc2hvdWxkVXNlR1NJKGF0dHIsIGNvbnRhY3RBdHRyaWJ1dGVzW2F0dHJdKSxcclxuICAgICAgICAgIGluZGV4TmFtZTogYCR7YXR0cn0tV2VpZ2h0LUluZGV4YCxcclxuICAgICAgICAgIGtleUNvbmRpdGlvbjogYCR7YXR0cn0gPSA6JHthdHRyLnRvTG93ZXJDYXNlKCl9YCxcclxuICAgICAgICAgIGF0dHJpYnV0ZVZhbHVlczoge1xyXG4gICAgICAgICAgICBbYDoke2F0dHIudG9Mb3dlckNhc2UoKX1gXTogY29udGFjdEF0dHJpYnV0ZXNbYXR0cl1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQXVjdW4gYXR0cmlidXQgcHJpb3JpdGFpcmUgdHJvdXbDqSwgdXRpbGlzZXIgc2NhbiBhdmVjIGZpbHRyZXNcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHVzZUdTSTogZmFsc2UsXHJcbiAgICAgIGZpbHRlckV4cHJlc3Npb246IHRoaXMuYnVpbGRGaWx0ZXJFeHByZXNzaW9uKGNvbnRhY3RBdHRyaWJ1dGVzKVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIETDqXRlcm1pbmUgc2kgb24gZG9pdCB1dGlsaXNlciB1biBHU0kgcG91ciBjZXQgYXR0cmlidXRcclxuICAgKi9cclxuICBwcml2YXRlIHNob3VsZFVzZUdTSShhdHRyaWJ1dGU6IHN0cmluZywgdmFsdWU6IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgLy8gVsOpcmlmaWVyIHNpIGwnb3B0aW1pc2F0aW9uIEdTSSBlc3QgYWN0aXbDqWUgdmlhIHZhcmlhYmxlIGQnZW52aXJvbm5lbWVudFxyXG4gICAgY29uc3QgZ3NpRW5hYmxlZCA9IHByb2Nlc3MuZW52LkVOQUJMRV9HU0lfT1BUSU1JWkFUSU9OID09PSAndHJ1ZSc7XHJcbiAgICBcclxuICAgIGlmICghZ3NpRW5hYmxlZCkge1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBHU0kgb3B0aW1pemF0aW9uIGRpc2FibGVkIHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIExvZ2lxdWUgcG91ciBkw6l0ZXJtaW5lciBzaSBsZSBHU0kgc2VyYSBlZmZpY2FjZVxyXG4gICAgcmV0dXJuIHRoaXMuUFJJT1JJVFlfQVRUUklCVVRFUy5pbmNsdWRlcyhhdHRyaWJ1dGUpICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlICE9PSB1bmRlZmluZWQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeMOpY3V0ZSB1bmUgcmVxdcOqdGUgYXZlYyBHU0lcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHF1ZXJ5V2l0aEdTSShzdHJhdGVneTogUXVlcnlTdHJhdGVneSk6IFByb21pc2U8T3B0aW1pemVkUnVsZVtdPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+OryBFeGVjdXRpbmcgR1NJIHF1ZXJ5OiAke3N0cmF0ZWd5LmluZGV4TmFtZX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIEtleSBjb25kaXRpb246ICR7c3RyYXRlZ3kua2V5Q29uZGl0aW9ufWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAgQXR0cmlidXRlIHZhbHVlczogJHtKU09OLnN0cmluZ2lmeShzdHJhdGVneS5hdHRyaWJ1dGVWYWx1ZXMpfWApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBRdWVyeUNvbW1hbmQoe1xyXG4gICAgICAgIFRhYmxlTmFtZTogdGhpcy50YWJsZU5hbWUsXHJcbiAgICAgICAgSW5kZXhOYW1lOiBzdHJhdGVneS5pbmRleE5hbWUsXHJcbiAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogc3RyYXRlZ3kua2V5Q29uZGl0aW9uLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHN0cmF0ZWd5LmF0dHJpYnV0ZVZhbHVlcyxcclxuICAgICAgICBTY2FuSW5kZXhGb3J3YXJkOiBmYWxzZSwgLy8gVHJpIHBhciBwb2lkcyBkw6ljcm9pc3NhbnRcclxuICAgICAgICBMaW1pdDogdGhpcy5NQVhfUlVMRVNfUEVSX1FVRVJZXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtcykge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDwn5OKIEdTSSBxdWVyeSByZXR1cm5lZCAwIHJ1bGVzIGZyb20gaW5kZXggJHtzdHJhdGVneS5pbmRleE5hbWV9YCk7XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBydWxlcyA9IHRoaXMuY29udmVydEl0ZW1zVG9PcHRpbWl6ZWRSdWxlcyhyZXNwb25zZS5JdGVtcyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICDwn5OKIEdTSSBxdWVyeSByZXR1cm5lZCAke3J1bGVzLmxlbmd0aH0gcnVsZXMgZnJvbSBpbmRleCAke3N0cmF0ZWd5LmluZGV4TmFtZX1gKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiBydWxlcztcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBpbiBHU0kgcXVlcnkgZm9yICR7c3RyYXRlZ3kuaW5kZXhOYW1lfTpgLCBlcnJvcik7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SEIEZhbGxpbmcgYmFjayB0byBvcHRpbWl6ZWQgc2Nhbi4uLicpO1xyXG4gICAgICByZXR1cm4gdGhpcy5zY2FuV2l0aE9wdGltaXplZEZpbHRlcnMoe30pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRXjDqWN1dGUgdW4gc2NhbiBhdmVjIGZpbHRyZXMgb3B0aW1pc8Opc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgc2NhbldpdGhPcHRpbWl6ZWRGaWx0ZXJzKGNvbnRhY3RBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUHJvbWlzZTxPcHRpbWl6ZWRSdWxlW10+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIEV4ZWN1dGluZyBvcHRpbWl6ZWQgZmlsdGVyZWQgc2NhbicpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ29uc3RydWlyZSBsZXMgZmlsdHJlcyBkeW5hbWlxdWVtZW50XHJcbiAgICAgIGNvbnN0IGZpbHRlckV4cHJlc3Npb25zOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICBjb25zdCBhdHRyaWJ1dGVWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7ICc6YWN0aXZlJzogJ3RydWUnIH07XHJcbiAgICAgIFxyXG4gICAgICAvLyBBam91dGVyIGRlcyBmaWx0cmVzIHBvdXIgbGVzIGF0dHJpYnV0cyBwcmlvcml0YWlyZXMgcHLDqXNlbnRzXHJcbiAgICAgIE9iamVjdC5lbnRyaWVzKGNvbnRhY3RBdHRyaWJ1dGVzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgaWYgKHRoaXMuUFJJT1JJVFlfQVRUUklCVVRFUy5pbmNsdWRlcyhrZXkpKSB7XHJcbiAgICAgICAgICBmaWx0ZXJFeHByZXNzaW9ucy5wdXNoKGBjb250YWlucyhleHByZXNzaW9uLCA6ZmlsdGVyJHtpbmRleH0pYCk7XHJcbiAgICAgICAgICBhdHRyaWJ1dGVWYWx1ZXNbYDpmaWx0ZXIke2luZGV4fWBdID0gYCR7a2V5fSA9PSBcIiR7dmFsdWV9XCJgO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFNjYW5Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRoaXMudGFibGVOYW1lLFxyXG4gICAgICAgIEZpbHRlckV4cHJlc3Npb246IGZpbHRlckV4cHJlc3Npb25zLmxlbmd0aCA+IDAgXHJcbiAgICAgICAgICA/IGAoJHtmaWx0ZXJFeHByZXNzaW9ucy5qb2luKCcgT1IgJyl9KSBBTkQgKGF0dHJpYnV0ZV9ub3RfZXhpc3RzKGFjdGl2ZSkgT1IgYWN0aXZlID0gOmFjdGl2ZSlgXHJcbiAgICAgICAgICA6ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyhhY3RpdmUpIE9SIGFjdGl2ZSA9IDphY3RpdmUnLFxyXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGF0dHJpYnV0ZVZhbHVlcyxcclxuICAgICAgICBMaW1pdDogdGhpcy5NQVhfUlVMRVNfUEVSX1FVRVJZXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFyZXNwb25zZS5JdGVtcykge1xyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgcnVsZXMgPSB0aGlzLmNvbnZlcnRJdGVtc1RvT3B0aW1pemVkUnVsZXMocmVzcG9uc2UuSXRlbXMpO1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+TiyBGaWx0ZXJlZCBzY2FuIHJldHVybmVkICR7cnVsZXMubGVuZ3RofSBydWxlc2ApO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHJ1bGVzO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGZpbHRlcmVkIHNjYW4sIGZhbGxpbmcgYmFjayB0byBmdWxsIHNjYW46JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gdGhpcy5sb2FkUnVsZXNGcm9tRGF0YWJhc2VPcHRpbWl6ZWQoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoYXJnZSB0b3V0ZXMgbGVzIHLDqGdsZXMgYXZlYyBvcHRpbWlzYXRpb25zIG1pbmV1cmVzXHJcbiAgICovXHJcbiAgcHJvdGVjdGVkIGFzeW5jIGxvYWRSdWxlc0Zyb21EYXRhYmFzZU9wdGltaXplZCgpOiBQcm9taXNlPE9wdGltaXplZFJ1bGVbXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBTY2FuQ29tbWFuZCh7XHJcbiAgICAgICAgVGFibGVOYW1lOiB0aGlzLnRhYmxlTmFtZSxcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHMoYWN0aXZlKSBPUiBhY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmFjdGl2ZSc6ICd0cnVlJ1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZHluYW1vQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIXJlc3BvbnNlLkl0ZW1zKSB7XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBydWxlcyA9IHRoaXMuY29udmVydEl0ZW1zVG9PcHRpbWl6ZWRSdWxlcyhyZXNwb25zZS5JdGVtcyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEZ1bGwgc2NhbiBsb2FkZWQgJHtydWxlcy5sZW5ndGh9IHJ1bGVzYCk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gcnVsZXM7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gb3B0aW1pemVkIGRhdGFiYXNlIGxvYWQ6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIG9wdGltaXplZCBydWxlczogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnZlcnRpdCBsZXMgaXRlbXMgRHluYW1vREIgZW4gcsOoZ2xlcyBvcHRpbWlzw6llc1xyXG4gICAqIEFkYXB0w6kgcG91ciBsZSBmb3JtYXQgQUFOX0RlY2lzaW9uIChBbWF6b24gQ29ubmVjdClcclxuICAgKi9cclxuICBwcm90ZWN0ZWQgY29udmVydEl0ZW1zVG9PcHRpbWl6ZWRSdWxlcyhpdGVtczogYW55W10pOiBPcHRpbWl6ZWRSdWxlW10ge1xyXG4gICAgcmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHtcclxuICAgICAgLy8gVmFsaWRhdGlvbiBkZXMgY2hhbXBzIHJlcXVpcyBwb3VyIGxlIGZvcm1hdCBBQU5fRGVjaXNpb25cclxuICAgICAgaWYgKCFpdGVtLmlkIHx8ICFpdGVtLmV4cHJlc3Npb24gfHwgdHlwZW9mIGl0ZW0ud2VpZ2h0ICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBydWxlIGRhdGE6IG1pc3NpbmcgcmVxdWlyZWQgZmllbGRzIGluIHJ1bGUgJHtpdGVtLmlkIHx8ICd1bmtub3duJ31gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogaXRlbS5pZCBhcyBzdHJpbmcsXHJcbiAgICAgICAgbmFtZTogaXRlbS5kaXN0cmlidXRpb25TZWdtZW50IGFzIHN0cmluZywgLy8gVXRpbGlzZXIgZGlzdHJpYnV0aW9uU2VnbWVudCBjb21tZSBuYW1lXHJcbiAgICAgICAgZXhwcmVzc2lvbjogaXRlbS5leHByZXNzaW9uIGFzIHN0cmluZyxcclxuICAgICAgICB3ZWlnaHQ6IGl0ZW0ud2VpZ2h0IGFzIG51bWJlcixcclxuICAgICAgICBkaXN0cmlidXRpb25TZWdtZW50OiBpdGVtLmRpc3RyaWJ1dGlvblNlZ21lbnQgYXMgc3RyaW5nLFxyXG4gICAgICAgIGxpYmVsbMOpOiBpdGVtLmxpYmVsbMOpIGFzIHN0cmluZywgIC8vIE5vdXZlYXUgY2hhbXBcclxuICAgICAgICBwcmlvcml0eTogaXRlbS5wcmlvcml0eSBhcyBudW1iZXIsICAvLyBOb3V2ZWF1IGNoYW1wXHJcbiAgICAgICAgY3JlYXRlZEF0OiBpdGVtLmNyZWF0ZWRBdCBhcyBzdHJpbmcsXHJcbiAgICAgICAgdXBkYXRlZEF0OiBpdGVtLnVwZGF0ZWRBdCBhcyBzdHJpbmcsXHJcbiAgICAgICAgLy8gQ2hhbXBzIGQnb3B0aW1pc2F0aW9uIChvcHRpb25uZWxzIHBvdXIgbCdpbnN0YW50KVxyXG4gICAgICAgIHByaW1hcnlBdHRyaWJ1dGU6IGl0ZW0ucHJpbWFyeUF0dHJpYnV0ZSBhcyBzdHJpbmcsXHJcbiAgICAgICAgc2Vjb25kYXJ5QXR0cmlidXRlOiBpdGVtLnNlY29uZGFyeUF0dHJpYnV0ZSBhcyBzdHJpbmdcclxuICAgICAgfTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQXBwbGlxdWUgdW4gdHJpIGTDqXRlcm1pbmlzdGUgYXV4IHLDqGdsZXNcclxuICAgKi9cclxuICBwcm90ZWN0ZWQgYXBwbHlEZXRlcm1pbmlzdGljU29ydChydWxlczogT3B0aW1pemVkUnVsZVtdKTogT3B0aW1pemVkUnVsZVtdIHtcclxuICAgIHJldHVybiBydWxlcy5zb3J0KChhLCBiKSA9PiB7XHJcbiAgICAgIC8vIDEuIFRyaSBwYXIgcG9pZHMgKGTDqWNyb2lzc2FudClcclxuICAgICAgaWYgKGEud2VpZ2h0ICE9PSBiLndlaWdodCkge1xyXG4gICAgICAgIHJldHVybiBiLndlaWdodCAtIGEud2VpZ2h0O1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyAyLiBUcmkgcGFyIElEIChjcm9pc3NhbnQpIHBvdXIgZ2FyYW50aXIgbGEgc3RhYmlsaXTDqVxyXG4gICAgICByZXR1cm4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHw6luw6hyZSB1bmUgY2zDqSBkZSBjYWNoZSBvcHRpbWlzw6llXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBnZW5lcmF0ZU9wdGltaXplZENhY2hlS2V5KGNvbnRhY3RBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogc3RyaW5nIHtcclxuICAgIC8vIFV0aWxpc2VyIHNldWxlbWVudCBsZXMgYXR0cmlidXRzIHByaW9yaXRhaXJlcyBwb3VyIGxhIGNsw6lcclxuICAgIGNvbnN0IHJlbGV2YW50QXR0cnM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcclxuICAgIFxyXG4gICAgdGhpcy5QUklPUklUWV9BVFRSSUJVVEVTLmZvckVhY2goYXR0ciA9PiB7XHJcbiAgICAgIGlmIChjb250YWN0QXR0cmlidXRlc1thdHRyXSkge1xyXG4gICAgICAgIHJlbGV2YW50QXR0cnNbYXR0cl0gPSBjb250YWN0QXR0cmlidXRlc1thdHRyXTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3LDqWVyIHVuZSBjbMOpIHN0YWJsZSBldCBjb3VydGVcclxuICAgIGNvbnN0IHNvcnRlZEtleXMgPSBPYmplY3Qua2V5cyhyZWxldmFudEF0dHJzKS5zb3J0KCk7XHJcbiAgICBjb25zdCBrZXlQYXJ0cyA9IHNvcnRlZEtleXMubWFwKGtleSA9PiBgJHtrZXl9OiR7cmVsZXZhbnRBdHRyc1trZXldfWApO1xyXG4gICAgXHJcbiAgICByZXR1cm4ga2V5UGFydHMuam9pbignfCcpIHx8ICdkZWZhdWx0JztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnN0cnVpdCB1bmUgZXhwcmVzc2lvbiBkZSBmaWx0cmUgcG91ciBsZSBzY2FuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBidWlsZEZpbHRlckV4cHJlc3Npb24oY29udGFjdEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBzdHJpbmcge1xyXG4gICAgY29uc3QgZmlsdGVyczogc3RyaW5nW10gPSBbXTtcclxuICAgIFxyXG4gICAgT2JqZWN0LmtleXMoY29udGFjdEF0dHJpYnV0ZXMpLmZvckVhY2goa2V5ID0+IHtcclxuICAgICAgaWYgKHRoaXMuUFJJT1JJVFlfQVRUUklCVVRFUy5pbmNsdWRlcyhrZXkpKSB7XHJcbiAgICAgICAgZmlsdGVycy5wdXNoKGBjb250YWlucyhleHByZXNzaW9uLCAnJHtrZXl9JylgKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiBmaWx0ZXJzLmxlbmd0aCA+IDAgPyBmaWx0ZXJzLmpvaW4oJyBPUiAnKSA6ICcnO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW52YWxpZGUgdG91cyBsZXMgY2FjaGVzIChvcHRpbWlzw6kgZXQgc3RhbmRhcmQpXHJcbiAgICovXHJcbiAgYXN5bmMgcmVmcmVzaENhY2hlKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgc3VwZXIucmVmcmVzaENhY2hlKCk7XHJcbiAgICB0aGlzLm9wdGltaXplZENhY2hlLmNsZWFyKCk7XHJcbiAgICBjb25zb2xlLmxvZygn8J+nuSBBbGwgY2FjaGVzIChzdGFuZGFyZCArIG9wdGltaXplZCkgY2xlYXJlZCcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RhdGlzdGlxdWVzIMOpdGVuZHVlcyBpbmNsdWFudCBsZSBjYWNoZSBvcHRpbWlzw6lcclxuICAgKi9cclxuICBnZXRDYWNoZVN0YXRzKCk6IGFueSB7XHJcbiAgICBjb25zdCBiYXNlU3RhdHMgPSBzdXBlci5nZXRDYWNoZVN0YXRzKCk7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAuLi5iYXNlU3RhdHMsXHJcbiAgICAgIG9wdGltaXplZENhY2hlOiB7XHJcbiAgICAgICAgc2l6ZTogdGhpcy5vcHRpbWl6ZWRDYWNoZS5zaXplLFxyXG4gICAgICAgIGtleXM6IEFycmF5LmZyb20odGhpcy5vcHRpbWl6ZWRDYWNoZS5rZXlzKCkpXHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBbmFseXNlIGxlcyBwZXJmb3JtYW5jZXMgZGUgbCdvcHRpbWlzYXRpb25cclxuICAgKi9cclxuICBhc3luYyBhbmFseXplT3B0aW1pemF0aW9uUGVyZm9ybWFuY2UoY29udGFjdEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBQcm9taXNlPHtcclxuICAgIHN0cmF0ZWd5OiBzdHJpbmc7XHJcbiAgICBydWxlc0xvYWRlZDogbnVtYmVyO1xyXG4gICAgY2FjaGVIaXQ6IGJvb2xlYW47XHJcbiAgICBlc3RpbWF0ZWRJbXByb3ZlbWVudDogc3RyaW5nO1xyXG4gIH0+IHtcclxuICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5nZW5lcmF0ZU9wdGltaXplZENhY2hlS2V5KGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgIGNvbnN0IGNhY2hlSGl0ID0gdGhpcy5vcHRpbWl6ZWRDYWNoZS5oYXMoY2FjaGVLZXkpO1xyXG4gICAgXHJcbiAgICBpZiAoY2FjaGVIaXQpIHtcclxuICAgICAgY29uc3QgY2FjaGVkUnVsZXMgPSB0aGlzLm9wdGltaXplZENhY2hlLmdldChjYWNoZUtleSkhO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0cmF0ZWd5OiAnQ0FDSEVfSElUJyxcclxuICAgICAgICBydWxlc0xvYWRlZDogY2FjaGVkUnVsZXMubGVuZ3RoLFxyXG4gICAgICAgIGNhY2hlSGl0OiB0cnVlLFxyXG4gICAgICAgIGVzdGltYXRlZEltcHJvdmVtZW50OiAnOTklIGZhc3RlciAoY2FjaGUpJ1xyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBzdHJhdGVneSA9IHRoaXMuZGV0ZXJtaW5lT3B0aW1hbFN0cmF0ZWd5KGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgIFxyXG4gICAgLy8gRXN0aW1lciBsZSBub21icmUgZGUgcsOoZ2xlcyBxdWkgc2VyYWllbnQgY2hhcmfDqWVzXHJcbiAgICBsZXQgZXN0aW1hdGVkUnVsZXMgPSAxMTI7IC8vIE5vbWJyZSBhY3R1ZWwgZGUgcsOoZ2xlc1xyXG4gICAgbGV0IGltcHJvdmVtZW50ID0gJzAlJztcclxuICAgIFxyXG4gICAgaWYgKHN0cmF0ZWd5LnVzZUdTSSkge1xyXG4gICAgICAvLyBFc3RpbWF0aW9uIGJhc8OpZSBzdXIgbGEgc8OpbGVjdGl2aXTDqSBkZSBsJ2F0dHJpYnV0XHJcbiAgICAgIGNvbnN0IHByaW1hcnlBdHRyID0gT2JqZWN0LmtleXMoY29udGFjdEF0dHJpYnV0ZXMpLmZpbmQoYXR0ciA9PiBcclxuICAgICAgICB0aGlzLlBSSU9SSVRZX0FUVFJJQlVURVMuaW5jbHVkZXMoYXR0cilcclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChwcmltYXJ5QXR0ciA9PT0gJ0NsaWVudCcpIHtcclxuICAgICAgICBlc3RpbWF0ZWRSdWxlcyA9IE1hdGgucm91bmQoMTEyICogMC4xKTsgLy8gMTAlIGRlcyByw6hnbGVzXHJcbiAgICAgICAgaW1wcm92ZW1lbnQgPSAnOTAlIGZld2VyIHJ1bGVzIGxvYWRlZCc7XHJcbiAgICAgIH0gZWxzZSBpZiAocHJpbWFyeUF0dHIgPT09ICdUeXBlU2luaXN0cmUnKSB7XHJcbiAgICAgICAgZXN0aW1hdGVkUnVsZXMgPSBNYXRoLnJvdW5kKDExMiAqIDAuMik7IC8vIDIwJSBkZXMgcsOoZ2xlc1xyXG4gICAgICAgIGltcHJvdmVtZW50ID0gJzgwJSBmZXdlciBydWxlcyBsb2FkZWQnO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGVzdGltYXRlZFJ1bGVzID0gTWF0aC5yb3VuZCgxMTIgKiAwLjMpOyAvLyAzMCUgZGVzIHLDqGdsZXNcclxuICAgICAgICBpbXByb3ZlbWVudCA9ICc3MCUgZmV3ZXIgcnVsZXMgbG9hZGVkJztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdHJhdGVneTogc3RyYXRlZ3kudXNlR1NJID8gYEdTSV8ke3N0cmF0ZWd5LmluZGV4TmFtZX1gIDogJ0ZJTFRFUkVEX1NDQU4nLFxyXG4gICAgICBydWxlc0xvYWRlZDogZXN0aW1hdGVkUnVsZXMsXHJcbiAgICAgIGNhY2hlSGl0OiBmYWxzZSxcclxuICAgICAgZXN0aW1hdGVkSW1wcm92ZW1lbnQ6IGltcHJvdmVtZW50XHJcbiAgICB9O1xyXG4gIH1cclxufSJdfQ==