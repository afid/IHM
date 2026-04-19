"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridRuleRepositoryV3 = void 0;
const OptimizedRuleRepositoryV2_1 = require("./OptimizedRuleRepositoryV2");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const GSIManager_1 = require("./GSIManager");
const HybridCriteriaManager_1 = require("./HybridCriteriaManager");
class HybridRuleRepositoryV3 extends OptimizedRuleRepositoryV2_1.OptimizedRuleRepositoryV2 {
    // Le gestionnaire de critères remplace la configuration statique
    // Plus besoin de CRITERIA_CONFIG ici !
    /**
     * Méthode principale optimisée avec stratégie hybride
     */
    async loadHybridOptimizedRules(contactAttributes) {
        console.log('🚀 Loading rules with hybrid strategy for:', Object.keys(contactAttributes));
        // Classifier les critères
        const classification = await this.classifyCriteria(contactAttributes);
        // Générer clé de cache hybride
        const cacheKey = this.generateHybridCacheKey(classification);
        // Vérifier le cache
        if (this.optimizedCache.has(cacheKey)) {
            console.log(`📋 Hybrid cache hit: ${cacheKey}`);
            return this.optimizedCache.get(cacheKey);
        }
        // Déterminer la stratégie hybride optimale
        const strategy = this.determineHybridStrategy(classification);
        // Exécuter la requête hybride
        const rules = await this.executeHybridQuery(strategy);
        // Appliquer le tri déterministe
        const sortedRules = this.applyDeterministicSort(rules);
        // Mettre en cache
        this.optimizedCache.set(cacheKey, sortedRules);
        console.log(`✅ Hybrid strategy loaded ${sortedRules.length} rules (reduction: ${strategy.estimatedReduction}%)`);
        return sortedRules;
    }
    /**
     * Classifie les critères en primaires (GSI) et secondaires (Filter)
     */
    async classifyCriteria(contactAttributes) {
        const primaryCriteria = {};
        const secondaryCriteria = {};
        // Charger les critères secondaires actifs une seule fois
        const activeSecondaryCriteria = await HybridCriteriaManager_1.HybridCriteriaManager.getActiveSecondaryCriteria();
        // Utiliser le gestionnaire de critères pour la classification
        Object.entries(contactAttributes).forEach(([key, value]) => {
            if (HybridCriteriaManager_1.HybridCriteriaManager.isPrimaryCriteria(key)) {
                primaryCriteria[key] = value;
            }
            else if (activeSecondaryCriteria.includes(key)) {
                secondaryCriteria[key] = value;
            }
            // Les critères inconnus sont automatiquement ignorés
        });
        console.log(`📊 Criteria classification:`, {
            primary: Object.keys(primaryCriteria),
            secondary: Object.keys(secondaryCriteria)
        });
        return { primaryCriteria, secondaryCriteria };
    }
    /**
     * Détermine la stratégie hybride optimale
     */
    determineHybridStrategy(classification) {
        const { primaryCriteria, secondaryCriteria } = classification;
        // Trouver le meilleur critère primaire pour GSI
        const bestPrimaryCriteria = this.selectBestPrimaryCriteria(primaryCriteria);
        if (bestPrimaryCriteria) {
            // Stratégie GSI + FilterExpression
            const filterExpression = this.buildSecondaryFilterExpression(secondaryCriteria);
            const attributeValues = this.buildAttributeValues(bestPrimaryCriteria, secondaryCriteria);
            return {
                useGSI: true,
                indexName: `${bestPrimaryCriteria.name}-Weight-Index`,
                keyCondition: `${bestPrimaryCriteria.name} = :primary`,
                filterExpression: filterExpression,
                attributeValues: attributeValues,
                estimatedReduction: this.calculateHybridReduction(bestPrimaryCriteria, secondaryCriteria)
            };
        }
        else {
            // Stratégie FilterExpression uniquement
            const filterExpression = this.buildSecondaryFilterExpression(secondaryCriteria);
            const attributeValues = this.buildAttributeValues(null, secondaryCriteria);
            return {
                useGSI: false,
                filterExpression: filterExpression,
                attributeValues: attributeValues,
                estimatedReduction: this.calculateFilterOnlyReduction(secondaryCriteria)
            };
        }
    }
    /**
     * Sélectionne le meilleur critère primaire selon la priorité GSI
     */
    selectBestPrimaryCriteria(primaryCriteria) {
        const priorityOrder = GSIManager_1.GSIManager.getActivePriorityAttributes();
        for (const criteriaName of priorityOrder) {
            if (primaryCriteria[criteriaName]) {
                return { name: criteriaName, value: primaryCriteria[criteriaName] };
            }
        }
        return null;
    }
    /**
     * Construit l'expression de filtre pour les critères secondaires
     */
    buildSecondaryFilterExpression(secondaryCriteria) {
        const filters = [];
        Object.keys(secondaryCriteria).forEach((criteria, index) => {
            // Utiliser #expr pour échapper le mot réservé "expression"
            filters.push(`contains(#expr, :secondary${index})`);
        });
        return filters.length > 0 ? filters.join(' AND ') : '';
    }
    /**
     * Construit les valeurs d'attributs pour la requête
     */
    buildAttributeValues(primaryCriteria, secondaryCriteria) {
        const attributeValues = {};
        // Ajouter le critère primaire
        if (primaryCriteria) {
            attributeValues[':primary'] = primaryCriteria.value;
        }
        // Ajouter les critères secondaires
        Object.entries(secondaryCriteria).forEach(([criteria, value], index) => {
            attributeValues[`:secondary${index}`] = `${criteria} == "${value}"`;
        });
        return attributeValues;
    }
    /**
     * Exécute la requête hybride
     */
    async executeHybridQuery(strategy) {
        try {
            if (strategy.useGSI && strategy.indexName) {
                console.log(`🎯 Executing hybrid GSI query: ${strategy.indexName}`);
                console.log(`   Primary filter: ${strategy.keyCondition}`);
                console.log(`   Secondary filters: ${strategy.filterExpression}`);
                const params = {
                    TableName: this.tableName,
                    IndexName: strategy.indexName,
                    KeyConditionExpression: strategy.keyCondition,
                    ExpressionAttributeValues: strategy.attributeValues,
                    ScanIndexForward: false,
                    Limit: this.MAX_RULES_PER_QUERY
                };
                // Ajouter FilterExpression si des critères secondaires existent
                if (strategy.filterExpression) {
                    params.FilterExpression = strategy.filterExpression;
                    // Ajouter ExpressionAttributeNames pour échapper le mot réservé "expression"
                    params.ExpressionAttributeNames = {
                        '#expr': 'expression'
                    };
                }
                const command = new lib_dynamodb_1.QueryCommand(params);
                const response = await this.dynamoClient.send(command);
                const rules = this.convertItemsToOptimizedRules(response.Items || []);
                console.log(`   📊 Hybrid GSI returned ${rules.length} rules`);
                return rules;
            }
            else {
                console.log('🔍 Executing hybrid scan with secondary filters only');
                // Fallback vers scan avec filtres secondaires
                return this.scanWithSecondaryFilters(strategy);
            }
        }
        catch (error) {
            console.error('❌ Error in hybrid query:', error);
            console.log('🔄 Falling back to standard optimized load...');
            return this.loadRulesFromDatabaseOptimized();
        }
    }
    /**
     * Scan avec filtres secondaires uniquement
     */
    async scanWithSecondaryFilters(strategy) {
        const params = {
            TableName: this.tableName,
            ExpressionAttributeValues: strategy.attributeValues,
            Limit: this.MAX_RULES_PER_QUERY
        };
        if (strategy.filterExpression) {
            params.FilterExpression = strategy.filterExpression;
        }
        const command = new lib_dynamodb_1.ScanCommand(params);
        const response = await this.dynamoClient.send(command);
        return this.convertItemsToOptimizedRules(response.Items || []);
    }
    /**
     * Calcule la réduction estimée avec stratégie hybride
     */
    calculateHybridReduction(primaryCriteria, secondaryCriteria) {
        // Réduction GSI (niveau 1)
        const gsiReduction = this.getGSISelectivity(primaryCriteria.name);
        // Réduction FilterExpression (niveau 2)
        const secondaryCount = Object.keys(secondaryCriteria).length;
        const filterReduction = Math.min(secondaryCount * 15, 80); // Max 80% supplémentaire
        // Réduction combinée (non additive)
        const combinedReduction = gsiReduction + (filterReduction * (100 - gsiReduction) / 100);
        return Math.round(combinedReduction);
    }
    /**
     * Calcule la réduction avec filtres uniquement
     */
    calculateFilterOnlyReduction(secondaryCriteria) {
        const secondaryCount = Object.keys(secondaryCriteria).length;
        return Math.min(secondaryCount * 10, 60); // Max 60% avec filtres seuls
    }
    /**
     * Obtient la sélectivité d'un GSI
     */
    getGSISelectivity(criteriaName) {
        const selectivityMap = {
            // Critères Amazon Connect réels
            'UC_IntentionDeduite': 85, // Très sélectif - basé sur numéro appelé
            'UC_IntentionCaptee': 70, // Moyennement sélectif - dépend du bot/SVI
            // Critères futurs (désactivés pour l'instant)
            'TypeClient': 75, // Particulier/Professionnel/Entreprise
            'RegionClient': 65, // Région géographique
            'NiveauUrgence': 60, // Critique/Normale/Faible
            'CanalOrigine': 55, // Téléphone/Web/Mobile
            'HistoriqueClient': 80 // Nouveau/Récurrent/VIP
        };
        return selectivityMap[criteriaName] || 50;
    }
    /**
     * Génère une clé de cache hybride
     */
    generateHybridCacheKey(classification) {
        const { primaryCriteria, secondaryCriteria } = classification;
        // Partie primaire (GSI)
        const primaryKeys = Object.keys(primaryCriteria).sort();
        const primaryPart = primaryKeys.map(key => `${key}:${primaryCriteria[key]}`).join('|');
        // Partie secondaire (limitée pour éviter explosion du cache)
        const secondaryKeys = Object.keys(secondaryCriteria).sort().slice(0, 5); // Max 5 critères secondaires
        const secondaryPart = secondaryKeys.map(key => `${key}:${secondaryCriteria[key]}`).join('|');
        return `${primaryPart}#${secondaryPart}`;
    }
    /**
     * Statistiques de performance hybride
     */
    async analyzeHybridPerformance(contactAttributes) {
        const classification = await this.classifyCriteria(contactAttributes);
        const strategy = this.determineHybridStrategy(classification);
        const baseRules = 1050; // Nombre total de règles en production
        const primaryReduction = strategy.useGSI ?
            this.getGSISelectivity(Object.keys(classification.primaryCriteria)[0] || '') : 0;
        const secondaryCount = Object.keys(classification.secondaryCriteria).length;
        const secondaryReduction = Math.min(secondaryCount * 15, 80);
        const totalReduction = strategy.estimatedReduction;
        const rulesLoaded = Math.round(baseRules * (100 - totalReduction) / 100);
        // Estimation de durée basée sur le nombre de règles
        const estimatedDuration = rulesLoaded < 50 ? '25-35ms' :
            rulesLoaded < 150 ? '35-50ms' :
                rulesLoaded < 300 ? '50-80ms' : '80-120ms';
        return {
            strategy: strategy.useGSI ? 'HYBRID_GSI_FILTER' : 'FILTER_ONLY',
            primaryReduction,
            secondaryReduction,
            totalReduction,
            rulesLoaded,
            estimatedDuration
        };
    }
}
exports.HybridRuleRepositoryV3 = HybridRuleRepositoryV3;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSHlicmlkUnVsZVJlcG9zaXRvcnlWMy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvSHlicmlkUnVsZVJlcG9zaXRvcnlWMy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwyRUFBd0U7QUFDeEUsd0RBQTBGO0FBRTFGLDZDQUEwQztBQUMxQyxtRUFBZ0U7QUFnQmhFLE1BQWEsc0JBQXVCLFNBQVEscURBQXlCO0lBRW5FLGlFQUFpRTtJQUNqRSx1Q0FBdUM7SUFFdkM7O09BRUc7SUFDSCxLQUFLLENBQUMsd0JBQXdCLENBQUMsaUJBQXNDO1FBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsNENBQTRDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7UUFFMUYsMEJBQTBCO1FBQzFCLE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFdEUsK0JBQStCO1FBQy9CLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUU3RCxvQkFBb0I7UUFDcEIsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDaEQsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUUsQ0FBQztRQUM1QyxDQUFDO1FBRUQsMkNBQTJDO1FBQzNDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUU5RCw4QkFBOEI7UUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFdEQsZ0NB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O1lBQy9CLFdBQVcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMvQixXQUFXLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUVwRSxPQUFPO1lBQ0wsUUFBUSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxhQUFhO1lBQy9ELGdCQUFnQjtZQUNoQixrQkFBa0I7WUFDbEIsY0FBYztZQUNkLFdBQVc7WUFDWCxpQkFBaUI7U0FDbEIsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQXJVRCx3REFxVUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBPcHRpbWl6ZWRSdWxlUmVwb3NpdG9yeVYyIH0gZnJvbSAnLi9PcHRpbWl6ZWRSdWxlUmVwb3NpdG9yeVYyJztcclxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUXVlcnlDb21tYW5kLCBTY2FuQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IFF1YWxpZmljYXRpb25SdWxlIH0gZnJvbSAnLi4vLi4vdHlwZXMvZGVjaXNpb24tZW5naW5lJztcclxuaW1wb3J0IHsgR1NJTWFuYWdlciB9IGZyb20gJy4vR1NJTWFuYWdlcic7XHJcbmltcG9ydCB7IEh5YnJpZENyaXRlcmlhTWFuYWdlciB9IGZyb20gJy4vSHlicmlkQ3JpdGVyaWFNYW5hZ2VyJztcclxuXHJcbmludGVyZmFjZSBDcml0ZXJpYUNsYXNzaWZpY2F0aW9uIHtcclxuICBwcmltYXJ5Q3JpdGVyaWE6IFJlY29yZDxzdHJpbmcsIGFueT47ICAgIC8vIFV0aWxpc8OpcyBwb3VyIEdTSVxyXG4gIHNlY29uZGFyeUNyaXRlcmlhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+OyAgLy8gVXRpbGlzw6lzIHBvdXIgRmlsdGVyRXhwcmVzc2lvblxyXG59XHJcblxyXG5pbnRlcmZhY2UgSHlicmlkUXVlcnlTdHJhdGVneSB7XHJcbiAgdXNlR1NJOiBib29sZWFuO1xyXG4gIGluZGV4TmFtZT86IHN0cmluZztcclxuICBrZXlDb25kaXRpb24/OiBzdHJpbmc7XHJcbiAgZmlsdGVyRXhwcmVzc2lvbj86IHN0cmluZztcclxuICBhdHRyaWJ1dGVWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgZXN0aW1hdGVkUmVkdWN0aW9uOiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBIeWJyaWRSdWxlUmVwb3NpdG9yeVYzIGV4dGVuZHMgT3B0aW1pemVkUnVsZVJlcG9zaXRvcnlWMiB7XHJcbiAgXHJcbiAgLy8gTGUgZ2VzdGlvbm5haXJlIGRlIGNyaXTDqHJlcyByZW1wbGFjZSBsYSBjb25maWd1cmF0aW9uIHN0YXRpcXVlXHJcbiAgLy8gUGx1cyBiZXNvaW4gZGUgQ1JJVEVSSUFfQ09ORklHIGljaSAhXHJcblxyXG4gIC8qKlxyXG4gICAqIE3DqXRob2RlIHByaW5jaXBhbGUgb3B0aW1pc8OpZSBhdmVjIHN0cmF0w6lnaWUgaHlicmlkZVxyXG4gICAqL1xyXG4gIGFzeW5jIGxvYWRIeWJyaWRPcHRpbWl6ZWRSdWxlcyhjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8UXVhbGlmaWNhdGlvblJ1bGVbXT4ge1xyXG4gICAgY29uc29sZS5sb2coJ/CfmoAgTG9hZGluZyBydWxlcyB3aXRoIGh5YnJpZCBzdHJhdGVneSBmb3I6JywgT2JqZWN0LmtleXMoY29udGFjdEF0dHJpYnV0ZXMpKTtcclxuICAgIFxyXG4gICAgLy8gQ2xhc3NpZmllciBsZXMgY3JpdMOocmVzXHJcbiAgICBjb25zdCBjbGFzc2lmaWNhdGlvbiA9IGF3YWl0IHRoaXMuY2xhc3NpZnlDcml0ZXJpYShjb250YWN0QXR0cmlidXRlcyk7XHJcbiAgICBcclxuICAgIC8vIEfDqW7DqXJlciBjbMOpIGRlIGNhY2hlIGh5YnJpZGVcclxuICAgIGNvbnN0IGNhY2hlS2V5ID0gdGhpcy5nZW5lcmF0ZUh5YnJpZENhY2hlS2V5KGNsYXNzaWZpY2F0aW9uKTtcclxuICAgIFxyXG4gICAgLy8gVsOpcmlmaWVyIGxlIGNhY2hlXHJcbiAgICBpZiAodGhpcy5vcHRpbWl6ZWRDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OLIEh5YnJpZCBjYWNoZSBoaXQ6ICR7Y2FjaGVLZXl9YCk7XHJcbiAgICAgIHJldHVybiB0aGlzLm9wdGltaXplZENhY2hlLmdldChjYWNoZUtleSkhO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIETDqXRlcm1pbmVyIGxhIHN0cmF0w6lnaWUgaHlicmlkZSBvcHRpbWFsZVxyXG4gICAgY29uc3Qgc3RyYXRlZ3kgPSB0aGlzLmRldGVybWluZUh5YnJpZFN0cmF0ZWd5KGNsYXNzaWZpY2F0aW9uKTtcclxuICAgIFxyXG4gICAgLy8gRXjDqWN1dGVyIGxhIHJlcXXDqnRlIGh5YnJpZGVcclxuICAgIGNvbnN0IHJ1bGVzID0gYXdhaXQgdGhpcy5leGVjdXRlSHlicmlkUXVlcnkoc3RyYXRlZ3kpO1xyXG4gICAgXHJcbiAgICAvLyBBcHBsaXF1ZXIgbGUgdHJpIGTDqXRlcm1pbmlzdGVcclxuICAgIGNvbnN0IHNvcnRlZFJ1bGVzID0gdGhpcy5hcHBseURldGVybWluaXN0aWNTb3J0KHJ1bGVzKTtcclxuICAgIFxyXG4gICAgLy8gTWV0dHJlIGVuIGNhY2hlXHJcbiAgICB0aGlzLm9wdGltaXplZENhY2hlLnNldChjYWNoZUtleSwgc29ydGVkUnVsZXMpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIEh5YnJpZCBzdHJhdGVneSBsb2FkZWQgJHtzb3J0ZWRSdWxlcy5sZW5ndGh9IHJ1bGVzIChyZWR1Y3Rpb246ICR7c3RyYXRlZ3kuZXN0aW1hdGVkUmVkdWN0aW9ufSUpYCk7XHJcbiAgICByZXR1cm4gc29ydGVkUnVsZXM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDbGFzc2lmaWUgbGVzIGNyaXTDqHJlcyBlbiBwcmltYWlyZXMgKEdTSSkgZXQgc2Vjb25kYWlyZXMgKEZpbHRlcilcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIGNsYXNzaWZ5Q3JpdGVyaWEoY29udGFjdEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBQcm9taXNlPENyaXRlcmlhQ2xhc3NpZmljYXRpb24+IHtcclxuICAgIGNvbnN0IHByaW1hcnlDcml0ZXJpYTogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xyXG4gICAgY29uc3Qgc2Vjb25kYXJ5Q3JpdGVyaWE6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcclxuICAgIFxyXG4gICAgLy8gQ2hhcmdlciBsZXMgY3JpdMOocmVzIHNlY29uZGFpcmVzIGFjdGlmcyB1bmUgc2V1bGUgZm9pc1xyXG4gICAgY29uc3QgYWN0aXZlU2Vjb25kYXJ5Q3JpdGVyaWEgPSBhd2FpdCBIeWJyaWRDcml0ZXJpYU1hbmFnZXIuZ2V0QWN0aXZlU2Vjb25kYXJ5Q3JpdGVyaWEoKTtcclxuICAgIFxyXG4gICAgLy8gVXRpbGlzZXIgbGUgZ2VzdGlvbm5haXJlIGRlIGNyaXTDqHJlcyBwb3VyIGxhIGNsYXNzaWZpY2F0aW9uXHJcbiAgICBPYmplY3QuZW50cmllcyhjb250YWN0QXR0cmlidXRlcykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XHJcbiAgICAgIGlmIChIeWJyaWRDcml0ZXJpYU1hbmFnZXIuaXNQcmltYXJ5Q3JpdGVyaWEoa2V5KSkge1xyXG4gICAgICAgIHByaW1hcnlDcml0ZXJpYVtrZXldID0gdmFsdWU7XHJcbiAgICAgIH0gZWxzZSBpZiAoYWN0aXZlU2Vjb25kYXJ5Q3JpdGVyaWEuaW5jbHVkZXMoa2V5KSkge1xyXG4gICAgICAgIHNlY29uZGFyeUNyaXRlcmlhW2tleV0gPSB2YWx1ZTtcclxuICAgICAgfVxyXG4gICAgICAvLyBMZXMgY3JpdMOocmVzIGluY29ubnVzIHNvbnQgYXV0b21hdGlxdWVtZW50IGlnbm9yw6lzXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfk4ogQ3JpdGVyaWEgY2xhc3NpZmljYXRpb246YCwge1xyXG4gICAgICBwcmltYXJ5OiBPYmplY3Qua2V5cyhwcmltYXJ5Q3JpdGVyaWEpLFxyXG4gICAgICBzZWNvbmRhcnk6IE9iamVjdC5rZXlzKHNlY29uZGFyeUNyaXRlcmlhKVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB7IHByaW1hcnlDcml0ZXJpYSwgc2Vjb25kYXJ5Q3JpdGVyaWEgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIETDqXRlcm1pbmUgbGEgc3RyYXTDqWdpZSBoeWJyaWRlIG9wdGltYWxlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBkZXRlcm1pbmVIeWJyaWRTdHJhdGVneShjbGFzc2lmaWNhdGlvbjogQ3JpdGVyaWFDbGFzc2lmaWNhdGlvbik6IEh5YnJpZFF1ZXJ5U3RyYXRlZ3kge1xyXG4gICAgY29uc3QgeyBwcmltYXJ5Q3JpdGVyaWEsIHNlY29uZGFyeUNyaXRlcmlhIH0gPSBjbGFzc2lmaWNhdGlvbjtcclxuICAgIFxyXG4gICAgLy8gVHJvdXZlciBsZSBtZWlsbGV1ciBjcml0w6hyZSBwcmltYWlyZSBwb3VyIEdTSVxyXG4gICAgY29uc3QgYmVzdFByaW1hcnlDcml0ZXJpYSA9IHRoaXMuc2VsZWN0QmVzdFByaW1hcnlDcml0ZXJpYShwcmltYXJ5Q3JpdGVyaWEpO1xyXG4gICAgXHJcbiAgICBpZiAoYmVzdFByaW1hcnlDcml0ZXJpYSkge1xyXG4gICAgICAvLyBTdHJhdMOpZ2llIEdTSSArIEZpbHRlckV4cHJlc3Npb25cclxuICAgICAgY29uc3QgZmlsdGVyRXhwcmVzc2lvbiA9IHRoaXMuYnVpbGRTZWNvbmRhcnlGaWx0ZXJFeHByZXNzaW9uKHNlY29uZGFyeUNyaXRlcmlhKTtcclxuICAgICAgY29uc3QgYXR0cmlidXRlVmFsdWVzID0gdGhpcy5idWlsZEF0dHJpYnV0ZVZhbHVlcyhiZXN0UHJpbWFyeUNyaXRlcmlhLCBzZWNvbmRhcnlDcml0ZXJpYSk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHVzZUdTSTogdHJ1ZSxcclxuICAgICAgICBpbmRleE5hbWU6IGAke2Jlc3RQcmltYXJ5Q3JpdGVyaWEubmFtZX0tV2VpZ2h0LUluZGV4YCxcclxuICAgICAgICBrZXlDb25kaXRpb246IGAke2Jlc3RQcmltYXJ5Q3JpdGVyaWEubmFtZX0gPSA6cHJpbWFyeWAsXHJcbiAgICAgICAgZmlsdGVyRXhwcmVzc2lvbjogZmlsdGVyRXhwcmVzc2lvbixcclxuICAgICAgICBhdHRyaWJ1dGVWYWx1ZXM6IGF0dHJpYnV0ZVZhbHVlcyxcclxuICAgICAgICBlc3RpbWF0ZWRSZWR1Y3Rpb246IHRoaXMuY2FsY3VsYXRlSHlicmlkUmVkdWN0aW9uKGJlc3RQcmltYXJ5Q3JpdGVyaWEsIHNlY29uZGFyeUNyaXRlcmlhKVxyXG4gICAgICB9O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gU3RyYXTDqWdpZSBGaWx0ZXJFeHByZXNzaW9uIHVuaXF1ZW1lbnRcclxuICAgICAgY29uc3QgZmlsdGVyRXhwcmVzc2lvbiA9IHRoaXMuYnVpbGRTZWNvbmRhcnlGaWx0ZXJFeHByZXNzaW9uKHNlY29uZGFyeUNyaXRlcmlhKTtcclxuICAgICAgY29uc3QgYXR0cmlidXRlVmFsdWVzID0gdGhpcy5idWlsZEF0dHJpYnV0ZVZhbHVlcyhudWxsLCBzZWNvbmRhcnlDcml0ZXJpYSk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHVzZUdTSTogZmFsc2UsXHJcbiAgICAgICAgZmlsdGVyRXhwcmVzc2lvbjogZmlsdGVyRXhwcmVzc2lvbixcclxuICAgICAgICBhdHRyaWJ1dGVWYWx1ZXM6IGF0dHJpYnV0ZVZhbHVlcyxcclxuICAgICAgICBlc3RpbWF0ZWRSZWR1Y3Rpb246IHRoaXMuY2FsY3VsYXRlRmlsdGVyT25seVJlZHVjdGlvbihzZWNvbmRhcnlDcml0ZXJpYSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFPDqWxlY3Rpb25uZSBsZSBtZWlsbGV1ciBjcml0w6hyZSBwcmltYWlyZSBzZWxvbiBsYSBwcmlvcml0w6kgR1NJXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzZWxlY3RCZXN0UHJpbWFyeUNyaXRlcmlhKHByaW1hcnlDcml0ZXJpYTogUmVjb3JkPHN0cmluZywgYW55Pik6IHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogYW55IH0gfCBudWxsIHtcclxuICAgIGNvbnN0IHByaW9yaXR5T3JkZXIgPSBHU0lNYW5hZ2VyLmdldEFjdGl2ZVByaW9yaXR5QXR0cmlidXRlcygpO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IGNyaXRlcmlhTmFtZSBvZiBwcmlvcml0eU9yZGVyKSB7XHJcbiAgICAgIGlmIChwcmltYXJ5Q3JpdGVyaWFbY3JpdGVyaWFOYW1lXSkge1xyXG4gICAgICAgIHJldHVybiB7IG5hbWU6IGNyaXRlcmlhTmFtZSwgdmFsdWU6IHByaW1hcnlDcml0ZXJpYVtjcml0ZXJpYU5hbWVdIH07XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDb25zdHJ1aXQgbCdleHByZXNzaW9uIGRlIGZpbHRyZSBwb3VyIGxlcyBjcml0w6hyZXMgc2Vjb25kYWlyZXNcclxuICAgKi9cclxuICBwcml2YXRlIGJ1aWxkU2Vjb25kYXJ5RmlsdGVyRXhwcmVzc2lvbihzZWNvbmRhcnlDcml0ZXJpYTogUmVjb3JkPHN0cmluZywgYW55Pik6IHN0cmluZyB7XHJcbiAgICBjb25zdCBmaWx0ZXJzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgXHJcbiAgICBPYmplY3Qua2V5cyhzZWNvbmRhcnlDcml0ZXJpYSkuZm9yRWFjaCgoY3JpdGVyaWEsIGluZGV4KSA9PiB7XHJcbiAgICAgIC8vIFV0aWxpc2VyICNleHByIHBvdXIgw6ljaGFwcGVyIGxlIG1vdCByw6lzZXJ2w6kgXCJleHByZXNzaW9uXCJcclxuICAgICAgZmlsdGVycy5wdXNoKGBjb250YWlucygjZXhwciwgOnNlY29uZGFyeSR7aW5kZXh9KWApO1xyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiBmaWx0ZXJzLmxlbmd0aCA+IDAgPyBmaWx0ZXJzLmpvaW4oJyBBTkQgJykgOiAnJztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnN0cnVpdCBsZXMgdmFsZXVycyBkJ2F0dHJpYnV0cyBwb3VyIGxhIHJlcXXDqnRlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBidWlsZEF0dHJpYnV0ZVZhbHVlcyhcclxuICAgIHByaW1hcnlDcml0ZXJpYTogeyBuYW1lOiBzdHJpbmc7IHZhbHVlOiBhbnkgfSB8IG51bGwsIFxyXG4gICAgc2Vjb25kYXJ5Q3JpdGVyaWE6IFJlY29yZDxzdHJpbmcsIGFueT5cclxuICApOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcclxuICAgIGNvbnN0IGF0dHJpYnV0ZVZhbHVlczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xyXG4gICAgXHJcbiAgICAvLyBBam91dGVyIGxlIGNyaXTDqHJlIHByaW1haXJlXHJcbiAgICBpZiAocHJpbWFyeUNyaXRlcmlhKSB7XHJcbiAgICAgIGF0dHJpYnV0ZVZhbHVlc1snOnByaW1hcnknXSA9IHByaW1hcnlDcml0ZXJpYS52YWx1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQWpvdXRlciBsZXMgY3JpdMOocmVzIHNlY29uZGFpcmVzXHJcbiAgICBPYmplY3QuZW50cmllcyhzZWNvbmRhcnlDcml0ZXJpYSkuZm9yRWFjaCgoW2NyaXRlcmlhLCB2YWx1ZV0sIGluZGV4KSA9PiB7XHJcbiAgICAgIGF0dHJpYnV0ZVZhbHVlc1tgOnNlY29uZGFyeSR7aW5kZXh9YF0gPSBgJHtjcml0ZXJpYX0gPT0gXCIke3ZhbHVlfVwiYDtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gYXR0cmlidXRlVmFsdWVzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRXjDqWN1dGUgbGEgcmVxdcOqdGUgaHlicmlkZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUh5YnJpZFF1ZXJ5KHN0cmF0ZWd5OiBIeWJyaWRRdWVyeVN0cmF0ZWd5KTogUHJvbWlzZTxRdWFsaWZpY2F0aW9uUnVsZVtdPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAoc3RyYXRlZ3kudXNlR1NJICYmIHN0cmF0ZWd5LmluZGV4TmFtZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn46vIEV4ZWN1dGluZyBoeWJyaWQgR1NJIHF1ZXJ5OiAke3N0cmF0ZWd5LmluZGV4TmFtZX1gKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAgUHJpbWFyeSBmaWx0ZXI6ICR7c3RyYXRlZ3kua2V5Q29uZGl0aW9ufWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICBTZWNvbmRhcnkgZmlsdGVyczogJHtzdHJhdGVneS5maWx0ZXJFeHByZXNzaW9ufWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHBhcmFtczogYW55ID0ge1xyXG4gICAgICAgICAgVGFibGVOYW1lOiB0aGlzLnRhYmxlTmFtZSxcclxuICAgICAgICAgIEluZGV4TmFtZTogc3RyYXRlZ3kuaW5kZXhOYW1lLFxyXG4gICAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogc3RyYXRlZ3kua2V5Q29uZGl0aW9uLFxyXG4gICAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogc3RyYXRlZ3kuYXR0cmlidXRlVmFsdWVzLFxyXG4gICAgICAgICAgU2NhbkluZGV4Rm9yd2FyZDogZmFsc2UsXHJcbiAgICAgICAgICBMaW1pdDogdGhpcy5NQVhfUlVMRVNfUEVSX1FVRVJZXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBam91dGVyIEZpbHRlckV4cHJlc3Npb24gc2kgZGVzIGNyaXTDqHJlcyBzZWNvbmRhaXJlcyBleGlzdGVudFxyXG4gICAgICAgIGlmIChzdHJhdGVneS5maWx0ZXJFeHByZXNzaW9uKSB7XHJcbiAgICAgICAgICBwYXJhbXMuRmlsdGVyRXhwcmVzc2lvbiA9IHN0cmF0ZWd5LmZpbHRlckV4cHJlc3Npb247XHJcbiAgICAgICAgICAvLyBBam91dGVyIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lcyBwb3VyIMOpY2hhcHBlciBsZSBtb3QgcsOpc2VydsOpIFwiZXhwcmVzc2lvblwiXHJcbiAgICAgICAgICBwYXJhbXMuRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzID0ge1xyXG4gICAgICAgICAgICAnI2V4cHInOiAnZXhwcmVzc2lvbidcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgUXVlcnlDb21tYW5kKHBhcmFtcyk7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHJ1bGVzID0gdGhpcy5jb252ZXJ0SXRlbXNUb09wdGltaXplZFJ1bGVzKHJlc3BvbnNlLkl0ZW1zIHx8IFtdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg8J+TiiBIeWJyaWQgR1NJIHJldHVybmVkICR7cnVsZXMubGVuZ3RofSBydWxlc2ApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBydWxlcztcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZygn8J+UjSBFeGVjdXRpbmcgaHlicmlkIHNjYW4gd2l0aCBzZWNvbmRhcnkgZmlsdGVycyBvbmx5Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmFsbGJhY2sgdmVycyBzY2FuIGF2ZWMgZmlsdHJlcyBzZWNvbmRhaXJlc1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNjYW5XaXRoU2Vjb25kYXJ5RmlsdGVycyhzdHJhdGVneSk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBoeWJyaWQgcXVlcnk6JywgZXJyb3IpO1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+UhCBGYWxsaW5nIGJhY2sgdG8gc3RhbmRhcmQgb3B0aW1pemVkIGxvYWQuLi4nKTtcclxuICAgICAgcmV0dXJuIHRoaXMubG9hZFJ1bGVzRnJvbURhdGFiYXNlT3B0aW1pemVkKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTY2FuIGF2ZWMgZmlsdHJlcyBzZWNvbmRhaXJlcyB1bmlxdWVtZW50XHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBzY2FuV2l0aFNlY29uZGFyeUZpbHRlcnMoc3RyYXRlZ3k6IEh5YnJpZFF1ZXJ5U3RyYXRlZ3kpOiBQcm9taXNlPFF1YWxpZmljYXRpb25SdWxlW10+IHtcclxuICAgIGNvbnN0IHBhcmFtczogYW55ID0ge1xyXG4gICAgICBUYWJsZU5hbWU6IHRoaXMudGFibGVOYW1lLFxyXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBzdHJhdGVneS5hdHRyaWJ1dGVWYWx1ZXMsXHJcbiAgICAgIExpbWl0OiB0aGlzLk1BWF9SVUxFU19QRVJfUVVFUllcclxuICAgIH07XHJcbiAgICBcclxuICAgIGlmIChzdHJhdGVneS5maWx0ZXJFeHByZXNzaW9uKSB7XHJcbiAgICAgIHBhcmFtcy5GaWx0ZXJFeHByZXNzaW9uID0gc3RyYXRlZ3kuZmlsdGVyRXhwcmVzc2lvbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBTY2FuQ29tbWFuZChwYXJhbXMpO1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy5jb252ZXJ0SXRlbXNUb09wdGltaXplZFJ1bGVzKHJlc3BvbnNlLkl0ZW1zIHx8IFtdKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENhbGN1bGUgbGEgcsOpZHVjdGlvbiBlc3RpbcOpZSBhdmVjIHN0cmF0w6lnaWUgaHlicmlkZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgY2FsY3VsYXRlSHlicmlkUmVkdWN0aW9uKFxyXG4gICAgcHJpbWFyeUNyaXRlcmlhOiB7IG5hbWU6IHN0cmluZzsgdmFsdWU6IGFueSB9LCBcclxuICAgIHNlY29uZGFyeUNyaXRlcmlhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+XHJcbiAgKTogbnVtYmVyIHtcclxuICAgIC8vIFLDqWR1Y3Rpb24gR1NJIChuaXZlYXUgMSlcclxuICAgIGNvbnN0IGdzaVJlZHVjdGlvbiA9IHRoaXMuZ2V0R1NJU2VsZWN0aXZpdHkocHJpbWFyeUNyaXRlcmlhLm5hbWUpO1xyXG4gICAgXHJcbiAgICAvLyBSw6lkdWN0aW9uIEZpbHRlckV4cHJlc3Npb24gKG5pdmVhdSAyKVxyXG4gICAgY29uc3Qgc2Vjb25kYXJ5Q291bnQgPSBPYmplY3Qua2V5cyhzZWNvbmRhcnlDcml0ZXJpYSkubGVuZ3RoO1xyXG4gICAgY29uc3QgZmlsdGVyUmVkdWN0aW9uID0gTWF0aC5taW4oc2Vjb25kYXJ5Q291bnQgKiAxNSwgODApOyAvLyBNYXggODAlIHN1cHBsw6ltZW50YWlyZVxyXG4gICAgXHJcbiAgICAvLyBSw6lkdWN0aW9uIGNvbWJpbsOpZSAobm9uIGFkZGl0aXZlKVxyXG4gICAgY29uc3QgY29tYmluZWRSZWR1Y3Rpb24gPSBnc2lSZWR1Y3Rpb24gKyAoZmlsdGVyUmVkdWN0aW9uICogKDEwMCAtIGdzaVJlZHVjdGlvbikgLyAxMDApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gTWF0aC5yb3VuZChjb21iaW5lZFJlZHVjdGlvbik7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDYWxjdWxlIGxhIHLDqWR1Y3Rpb24gYXZlYyBmaWx0cmVzIHVuaXF1ZW1lbnRcclxuICAgKi9cclxuICBwcml2YXRlIGNhbGN1bGF0ZUZpbHRlck9ubHlSZWR1Y3Rpb24oc2Vjb25kYXJ5Q3JpdGVyaWE6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBudW1iZXIge1xyXG4gICAgY29uc3Qgc2Vjb25kYXJ5Q291bnQgPSBPYmplY3Qua2V5cyhzZWNvbmRhcnlDcml0ZXJpYSkubGVuZ3RoO1xyXG4gICAgcmV0dXJuIE1hdGgubWluKHNlY29uZGFyeUNvdW50ICogMTAsIDYwKTsgLy8gTWF4IDYwJSBhdmVjIGZpbHRyZXMgc2V1bHNcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE9idGllbnQgbGEgc8OpbGVjdGl2aXTDqSBkJ3VuIEdTSVxyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2V0R1NJU2VsZWN0aXZpdHkoY3JpdGVyaWFOYW1lOiBzdHJpbmcpOiBudW1iZXIge1xyXG4gICAgY29uc3Qgc2VsZWN0aXZpdHlNYXA6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7XHJcbiAgICAgIC8vIENyaXTDqHJlcyBBbWF6b24gQ29ubmVjdCByw6llbHNcclxuICAgICAgJ1VDX0ludGVudGlvbkRlZHVpdGUnOiA4NSwgICAgIC8vIFRyw6hzIHPDqWxlY3RpZiAtIGJhc8OpIHN1ciBudW3DqXJvIGFwcGVsw6lcclxuICAgICAgJ1VDX0ludGVudGlvbkNhcHRlZSc6IDcwLCAgICAgIC8vIE1veWVubmVtZW50IHPDqWxlY3RpZiAtIGTDqXBlbmQgZHUgYm90L1NWSVxyXG4gICAgICBcclxuICAgICAgLy8gQ3JpdMOocmVzIGZ1dHVycyAoZMOpc2FjdGl2w6lzIHBvdXIgbCdpbnN0YW50KVxyXG4gICAgICAnVHlwZUNsaWVudCc6IDc1LCAgICAgICAgICAgICAgLy8gUGFydGljdWxpZXIvUHJvZmVzc2lvbm5lbC9FbnRyZXByaXNlXHJcbiAgICAgICdSZWdpb25DbGllbnQnOiA2NSwgICAgICAgICAgICAvLyBSw6lnaW9uIGfDqW9ncmFwaGlxdWVcclxuICAgICAgJ05pdmVhdVVyZ2VuY2UnOiA2MCwgICAgICAgICAgIC8vIENyaXRpcXVlL05vcm1hbGUvRmFpYmxlXHJcbiAgICAgICdDYW5hbE9yaWdpbmUnOiA1NSwgICAgICAgICAgICAvLyBUw6lsw6lwaG9uZS9XZWIvTW9iaWxlXHJcbiAgICAgICdIaXN0b3JpcXVlQ2xpZW50JzogODAgICAgICAgICAvLyBOb3V2ZWF1L1LDqWN1cnJlbnQvVklQXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICByZXR1cm4gc2VsZWN0aXZpdHlNYXBbY3JpdGVyaWFOYW1lXSB8fCA1MDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEfDqW7DqHJlIHVuZSBjbMOpIGRlIGNhY2hlIGh5YnJpZGVcclxuICAgKi9cclxuICBwcml2YXRlIGdlbmVyYXRlSHlicmlkQ2FjaGVLZXkoY2xhc3NpZmljYXRpb246IENyaXRlcmlhQ2xhc3NpZmljYXRpb24pOiBzdHJpbmcge1xyXG4gICAgY29uc3QgeyBwcmltYXJ5Q3JpdGVyaWEsIHNlY29uZGFyeUNyaXRlcmlhIH0gPSBjbGFzc2lmaWNhdGlvbjtcclxuICAgIFxyXG4gICAgLy8gUGFydGllIHByaW1haXJlIChHU0kpXHJcbiAgICBjb25zdCBwcmltYXJ5S2V5cyA9IE9iamVjdC5rZXlzKHByaW1hcnlDcml0ZXJpYSkuc29ydCgpO1xyXG4gICAgY29uc3QgcHJpbWFyeVBhcnQgPSBwcmltYXJ5S2V5cy5tYXAoa2V5ID0+IGAke2tleX06JHtwcmltYXJ5Q3JpdGVyaWFba2V5XX1gKS5qb2luKCd8Jyk7XHJcbiAgICBcclxuICAgIC8vIFBhcnRpZSBzZWNvbmRhaXJlIChsaW1pdMOpZSBwb3VyIMOpdml0ZXIgZXhwbG9zaW9uIGR1IGNhY2hlKVxyXG4gICAgY29uc3Qgc2Vjb25kYXJ5S2V5cyA9IE9iamVjdC5rZXlzKHNlY29uZGFyeUNyaXRlcmlhKS5zb3J0KCkuc2xpY2UoMCwgNSk7IC8vIE1heCA1IGNyaXTDqHJlcyBzZWNvbmRhaXJlc1xyXG4gICAgY29uc3Qgc2Vjb25kYXJ5UGFydCA9IHNlY29uZGFyeUtleXMubWFwKGtleSA9PiBgJHtrZXl9OiR7c2Vjb25kYXJ5Q3JpdGVyaWFba2V5XX1gKS5qb2luKCd8Jyk7XHJcbiAgICBcclxuICAgIHJldHVybiBgJHtwcmltYXJ5UGFydH0jJHtzZWNvbmRhcnlQYXJ0fWA7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdGF0aXN0aXF1ZXMgZGUgcGVyZm9ybWFuY2UgaHlicmlkZVxyXG4gICAqL1xyXG4gIGFzeW5jIGFuYWx5emVIeWJyaWRQZXJmb3JtYW5jZShjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8e1xyXG4gICAgc3RyYXRlZ3k6IHN0cmluZztcclxuICAgIHByaW1hcnlSZWR1Y3Rpb246IG51bWJlcjtcclxuICAgIHNlY29uZGFyeVJlZHVjdGlvbjogbnVtYmVyO1xyXG4gICAgdG90YWxSZWR1Y3Rpb246IG51bWJlcjtcclxuICAgIHJ1bGVzTG9hZGVkOiBudW1iZXI7XHJcbiAgICBlc3RpbWF0ZWREdXJhdGlvbjogc3RyaW5nO1xyXG4gIH0+IHtcclxuICAgIGNvbnN0IGNsYXNzaWZpY2F0aW9uID0gYXdhaXQgdGhpcy5jbGFzc2lmeUNyaXRlcmlhKGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgIGNvbnN0IHN0cmF0ZWd5ID0gdGhpcy5kZXRlcm1pbmVIeWJyaWRTdHJhdGVneShjbGFzc2lmaWNhdGlvbik7XHJcbiAgICBcclxuICAgIGNvbnN0IGJhc2VSdWxlcyA9IDEwNTA7IC8vIE5vbWJyZSB0b3RhbCBkZSByw6hnbGVzIGVuIHByb2R1Y3Rpb25cclxuICAgIGNvbnN0IHByaW1hcnlSZWR1Y3Rpb24gPSBzdHJhdGVneS51c2VHU0kgPyBcclxuICAgICAgdGhpcy5nZXRHU0lTZWxlY3Rpdml0eShPYmplY3Qua2V5cyhjbGFzc2lmaWNhdGlvbi5wcmltYXJ5Q3JpdGVyaWEpWzBdIHx8ICcnKSA6IDA7XHJcbiAgICBcclxuICAgIGNvbnN0IHNlY29uZGFyeUNvdW50ID0gT2JqZWN0LmtleXMoY2xhc3NpZmljYXRpb24uc2Vjb25kYXJ5Q3JpdGVyaWEpLmxlbmd0aDtcclxuICAgIGNvbnN0IHNlY29uZGFyeVJlZHVjdGlvbiA9IE1hdGgubWluKHNlY29uZGFyeUNvdW50ICogMTUsIDgwKTtcclxuICAgIFxyXG4gICAgY29uc3QgdG90YWxSZWR1Y3Rpb24gPSBzdHJhdGVneS5lc3RpbWF0ZWRSZWR1Y3Rpb247XHJcbiAgICBjb25zdCBydWxlc0xvYWRlZCA9IE1hdGgucm91bmQoYmFzZVJ1bGVzICogKDEwMCAtIHRvdGFsUmVkdWN0aW9uKSAvIDEwMCk7XHJcbiAgICBcclxuICAgIC8vIEVzdGltYXRpb24gZGUgZHVyw6llIGJhc8OpZSBzdXIgbGUgbm9tYnJlIGRlIHLDqGdsZXNcclxuICAgIGNvbnN0IGVzdGltYXRlZER1cmF0aW9uID0gcnVsZXNMb2FkZWQgPCA1MCA/ICcyNS0zNW1zJyA6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcnVsZXNMb2FkZWQgPCAxNTAgPyAnMzUtNTBtcycgOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJ1bGVzTG9hZGVkIDwgMzAwID8gJzUwLTgwbXMnIDogJzgwLTEyMG1zJztcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RyYXRlZ3k6IHN0cmF0ZWd5LnVzZUdTSSA/ICdIWUJSSURfR1NJX0ZJTFRFUicgOiAnRklMVEVSX09OTFknLFxyXG4gICAgICBwcmltYXJ5UmVkdWN0aW9uLFxyXG4gICAgICBzZWNvbmRhcnlSZWR1Y3Rpb24sXHJcbiAgICAgIHRvdGFsUmVkdWN0aW9uLFxyXG4gICAgICBydWxlc0xvYWRlZCxcclxuICAgICAgZXN0aW1hdGVkRHVyYXRpb25cclxuICAgIH07XHJcbiAgfVxyXG59Il19