"use strict";
/**
 * Gestionnaire des critères hybrides pour l'architecture GSI + FilterExpression
 *
 * Ce gestionnaire permet de :
 * 1. Configurer facilement les critères primaires (GSI) - EN DUR dans le code
 * 2. Gérer les critères secondaires (FilterExpression) - DYNAMIQUES via Parameter Store
 * 3. Gérer la priorité et l'activation des critères
 *
 * ARCHITECTURE :
 * - Critères PRIMAIRES : restent en dur (nécessitent un redéploiement pour modification)
 * - Critères SECONDAIRES : stockés dans Parameter Store (modification sans redéploiement)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridCriteriaManager = void 0;
const CriteriaParameterStore_1 = require("./CriteriaParameterStore");
class HybridCriteriaManager {
    /**
     * Initialise le gestionnaire (warm-up du cache)
     * À appeler au démarrage de la Lambda pour optimiser les performances
     */
    static async initialize() {
        if (this.initialized) {
            console.log('✅ HybridCriteriaManager already initialized');
            return;
        }
        console.log('🔥 Initializing HybridCriteriaManager...');
        try {
            // Warm-up du cache Parameter Store
            await CriteriaParameterStore_1.CriteriaParameterStore.warmUp();
            this.initialized = true;
            console.log('✅ HybridCriteriaManager initialized successfully');
        }
        catch (error) {
            console.error('❌ Failed to initialize HybridCriteriaManager:', error);
            // Ne pas bloquer le démarrage en cas d'erreur
            // Le cache sera chargé au premier appel
        }
    }
    /**
     * Retourne tous les critères primaires actifs (pour GSI)
     * SYNCHRONE - Les critères primaires sont en dur
     */
    static getActivePrimaryCriteria() {
        return this.PRIMARY_CRITERIA
            .filter(c => c.enabled)
            .sort((a, b) => (a.priority || 0) - (b.priority || 0))
            .map(c => c.name);
    }
    /**
     * Retourne tous les critères secondaires actifs (pour FilterExpression)
     * ASYNCHRONE - Les critères secondaires sont chargés depuis Parameter Store
     *
     * FALLBACK : Si Parameter Store retourne vide, utilise les critères en dur
     */
    static async getActiveSecondaryCriteria() {
        console.log('[HYBRID] Loading secondary criteria from Parameter Store...');
        const secondaryCriteria = await CriteriaParameterStore_1.CriteriaParameterStore.loadAll();
        console.log('[HYBRID] Total criteria loaded:', secondaryCriteria.length);
        // ⚠️ FALLBACK : Si Parameter Store retourne vide, utiliser les critères en dur
        if (secondaryCriteria.length === 0) {
            console.warn('[HYBRID] Parameter Store returned empty - using FALLBACK criteria');
            const fallbackActive = this.SECONDARY_CRITERIA_FALLBACK.filter(c => c.enabled);
            console.log('[HYBRID] Fallback criteria:', fallbackActive.length, 'active out of', this.SECONDARY_CRITERIA_FALLBACK.length);
            fallbackActive.forEach(c => {
                console.log('[HYBRID] Fallback criterion:', c.name, 'enabled:', c.enabled);
            });
            return fallbackActive.map(c => c.name);
        }
        const activeCriteria = secondaryCriteria.filter(c => c.enabled);
        console.log('[HYBRID] Active criteria:', activeCriteria.length);
        activeCriteria.forEach(c => {
            console.log('[HYBRID] Active criterion:', c.name, 'enabled:', c.enabled);
        });
        return activeCriteria.map(c => c.name);
    }
    /**
     * Retourne TOUS les critères actifs (primaires + secondaires)
     * ASYNCHRONE - Combine les critères primaires (en dur) et secondaires (Parameter Store)
     */
    static async getAllActiveCriteria() {
        const primaryNames = this.getActivePrimaryCriteria();
        const secondaryNames = await this.getActiveSecondaryCriteria();
        return [...primaryNames, ...secondaryNames];
    }
    /**
     * Vérifie si un critère est primaire (GSI)
     * SYNCHRONE - Les critères primaires sont en dur
     */
    static isPrimaryCriteria(criteriaName) {
        const criteria = this.PRIMARY_CRITERIA.find(c => c.name === criteriaName);
        return criteria ? criteria.enabled : false;
    }
    /**
     * Vérifie si un critère est secondaire (FilterExpression)
     * ASYNCHRONE - Les critères secondaires sont dans Parameter Store
     */
    static async isSecondaryCriteria(criteriaName) {
        const secondaryCriteria = await CriteriaParameterStore_1.CriteriaParameterStore.loadAll();
        const criteria = secondaryCriteria.find(c => c.name === criteriaName);
        return criteria ? criteria.enabled : false;
    }
    /**
     * Active/désactive un critère SECONDAIRE
     * ASYNCHRONE - Modifie le critère dans Parameter Store
     *
     * Note : Les critères primaires ne peuvent pas être modifiés dynamiquement
     */
    static async toggleSecondaryCriteria(criteriaName, enabled) {
        try {
            // Récupérer le critère existant
            const criteria = await CriteriaParameterStore_1.CriteriaParameterStore.getCriteria(criteriaName);
            if (!criteria) {
                console.warn(`⚠️ Secondary criteria ${criteriaName} not found`);
                return false;
            }
            // Mettre à jour le critère
            criteria.enabled = enabled;
            await CriteriaParameterStore_1.CriteriaParameterStore.putCriteria(criteria);
            console.log(`✅ Secondary criteria ${criteriaName} ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        }
        catch (error) {
            console.error(`❌ Failed to toggle criteria ${criteriaName}:`, error);
            return false;
        }
    }
    /**
     * Ajoute un nouveau critère secondaire
     * ASYNCHRONE - Ajoute le critère dans Parameter Store
     */
    static async addSecondaryCriteria(name, description, businessJustification) {
        try {
            // Vérifier que le critère n'existe pas déjà
            const existing = await CriteriaParameterStore_1.CriteriaParameterStore.getCriteria(name);
            if (existing) {
                console.warn(`⚠️ Secondary criteria ${name} already exists`);
                return false;
            }
            // Créer le nouveau critère
            const newCriteria = {
                name,
                enabled: true,
                description,
                businessJustification,
                addedDate: new Date().toISOString().split('T')[0]
            };
            await CriteriaParameterStore_1.CriteriaParameterStore.putCriteria(newCriteria);
            console.log(`✅ New secondary criteria ${name} added successfully`);
            return true;
        }
        catch (error) {
            console.error(`❌ Failed to add criteria ${name}:`, error);
            return false;
        }
    }
    /**
     * Supprime un critère secondaire
     * ASYNCHRONE - Supprime le critère de Parameter Store
     */
    static async deleteSecondaryCriteria(criteriaName) {
        try {
            await CriteriaParameterStore_1.CriteriaParameterStore.deleteCriteria(criteriaName);
            console.log(`✅ Secondary criteria ${criteriaName} deleted successfully`);
            return true;
        }
        catch (error) {
            console.error(`❌ Failed to delete criteria ${criteriaName}:`, error);
            return false;
        }
    }
    /**
     * Retourne les statistiques des critères
     * ASYNCHRONE - Inclut les critères secondaires depuis Parameter Store
     *
     * FALLBACK : Si Parameter Store retourne vide, utilise les critères en dur
     */
    static async getCriteriaStats() {
        const primaryCriteria = this.PRIMARY_CRITERIA;
        const secondaryCriteria = await CriteriaParameterStore_1.CriteriaParameterStore.loadAll();
        // ⚠️ FALLBACK : Si Parameter Store retourne vide, utiliser les critères en dur
        const criteriaToUse = secondaryCriteria.length > 0
            ? secondaryCriteria
            : this.SECONDARY_CRITERIA_FALLBACK;
        if (secondaryCriteria.length === 0) {
            console.warn('⚠️ Using FALLBACK criteria in getCriteriaStats()');
        }
        const enabledPrimary = primaryCriteria.filter(c => c.enabled);
        const enabledSecondary = criteriaToUse.filter(c => c.enabled);
        // Estimation du coût GSI (5€ par GSI actif)
        const gsiCost = `${enabledPrimary.length * 5}€/mois`;
        // Estimation de performance
        const estimatedPerformance = enabledPrimary.length > 0 ?
            `${85 + Math.min(enabledSecondary.length * 2, 13)}% réduction` :
            `${Math.min(enabledSecondary.length * 5, 60)}% réduction`;
        // Métriques du cache
        const cacheMetrics = CriteriaParameterStore_1.CriteriaParameterStore.getMetrics();
        return {
            totalCriteria: primaryCriteria.length + criteriaToUse.length,
            primaryCount: primaryCriteria.length,
            secondaryCount: criteriaToUse.length,
            enabledPrimary: enabledPrimary.length,
            enabledSecondary: enabledSecondary.length,
            gsiCost,
            estimatedPerformance,
            cacheMetrics
        };
    }
    /**
     * Retourne la configuration complète (primaires + secondaires)
     * ASYNCHRONE - Inclut les critères secondaires depuis Parameter Store
     *
     * FALLBACK : Si Parameter Store retourne vide, utilise les critères en dur
     */
    static async getFullConfiguration() {
        const secondaryCriteria = await CriteriaParameterStore_1.CriteriaParameterStore.loadAll();
        // ⚠️ FALLBACK : Si Parameter Store retourne vide, utiliser les critères en dur
        const criteriaToUse = secondaryCriteria.length > 0
            ? secondaryCriteria
            : this.SECONDARY_CRITERIA_FALLBACK;
        if (secondaryCriteria.length === 0) {
            console.warn('⚠️ Using FALLBACK criteria in getFullConfiguration()');
        }
        // Convertir les critères secondaires au format CriteriaConfig
        const secondaryAsConfig = criteriaToUse.map(c => ({
            name: c.name,
            type: 'secondary',
            enabled: c.enabled,
            description: c.description,
            businessJustification: c.businessJustification,
            addedDate: c.addedDate
        }));
        return [...this.PRIMARY_CRITERIA, ...secondaryAsConfig];
    }
    /**
     * Valide qu'un ensemble d'attributs contient des critères connus
     * ASYNCHRONE - Vérifie contre les critères primaires et secondaires
     */
    static async validateContactAttributes(contactAttributes) {
        const allKnownCriteria = await this.getAllActiveCriteria();
        const attributeKeys = Object.keys(contactAttributes);
        const knownCriteria = attributeKeys.filter(key => allKnownCriteria.includes(key));
        const unknownCriteria = attributeKeys.filter(key => !allKnownCriteria.includes(key));
        // Vérifier les critères primaires (synchrone)
        const primaryCriteriaFound = knownCriteria.filter(key => this.isPrimaryCriteria(key));
        // Vérifier les critères secondaires (asynchrone)
        const secondaryCriteriaChecks = await Promise.all(knownCriteria.map(async (key) => ({
            key,
            isSecondary: await this.isSecondaryCriteria(key)
        })));
        const secondaryCriteriaFound = secondaryCriteriaChecks
            .filter(c => c.isSecondary)
            .map(c => c.key);
        return {
            knownCriteria,
            unknownCriteria,
            primaryCriteriaFound,
            secondaryCriteriaFound
        };
    }
    /**
     * Configure le TTL du cache Parameter Store
     */
    static setCacheTTL(ttl) {
        CriteriaParameterStore_1.CriteriaParameterStore.setCacheTTL(ttl);
    }
    /**
     * Invalide le cache Parameter Store (force un refresh)
     */
    static invalidateCache() {
        CriteriaParameterStore_1.CriteriaParameterStore.invalidateCache();
    }
}
exports.HybridCriteriaManager = HybridCriteriaManager;
// ========== CRITÈRES PRIMAIRES (GSI) - EN DUR ==========
// Ces critères restent dans le code car ils nécessitent des GSI DynamoDB
// Toute modification nécessite un redéploiement de l'infrastructure
HybridCriteriaManager.PRIMARY_CRITERIA = [
    {
        name: 'UC_IntentionDeduite',
        type: 'primary',
        enabled: true,
        priority: 1,
        selectivity: 'high',
        description: 'Intention déduite du numéro appelé (ex: "Gestion Sinistre", "Souscription", "SAV")',
        businessJustification: 'Critère principal de routage basé sur le numéro appelé - très sélectif',
        addedDate: '2024-12-31'
    },
    {
        name: 'UC_IntentionCaptee',
        type: 'primary',
        enabled: true,
        priority: 2,
        selectivity: 'medium',
        description: 'Intention captée par bot/SVI (ex: "AUTO_SOUSC", "HABITAT_SINISTRE", "INFO_CONTRAT")',
        businessJustification: 'Intention précise identifiée par le bot - complément de UC_IntentionDeduite',
        addedDate: '2024-12-31'
    }
];
// ========== CRITÈRES SECONDAIRES FALLBACK ==========
// Ces critères sont utilisés si Parameter Store est indisponible ou retourne vide
// Ils permettent de continuer à fonctionner même en cas de problème avec Parameter Store
HybridCriteriaManager.SECONDARY_CRITERIA_FALLBACK = [
    {
        name: 'TypeClient',
        enabled: false,
        description: 'Type de client (Particulier, Professionnel, Entreprise)',
        businessJustification: 'Routage différencié selon le type de client',
        addedDate: '2025-01-15'
    },
    {
        name: 'RegionClient',
        enabled: false,
        description: 'Région géographique du client',
        businessJustification: 'Routage vers équipes régionales',
        addedDate: '2025-01-15'
    },
    {
        name: 'NiveauUrgence',
        enabled: false,
        description: 'Niveau d\'urgence détecté (Critique, Normale, Faible)',
        businessJustification: 'Priorisation des appels urgents',
        addedDate: '2025-01-15'
    },
    {
        name: 'CanalOrigine',
        enabled: false,
        description: 'Canal d\'origine de l\'appel (Téléphone, Web, Mobile App)',
        businessJustification: 'Routage selon le canal d\'origine',
        addedDate: '2025-01-15'
    },
    {
        name: 'HistoriqueClient',
        enabled: false,
        description: 'Historique client (Nouveau, Récurrent, VIP)',
        businessJustification: 'Traitement différencié selon l\'historique',
        addedDate: '2025-01-15'
    }
];
// Flag d'initialisation
HybridCriteriaManager.initialized = false;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSHlicmlkQ3JpdGVyaWFNYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZpY2VzL2RlY2lzaW9uLWVuZ2luZS9IeWJyaWRDcml0ZXJpYU1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7OztHQVdHOzs7QUFFSCxxRUFBMkY7QUF3QjNGLE1BQWEscUJBQXFCO0lBMEVoQzs7O09BR0c7SUFDSCxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVU7UUFDckIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1lBQzNELE9BQU87UUFDVCxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1FBRXhELElBQUksQ0FBQztZQUNILG1DQUFtQztZQUNuQyxNQUFNLCtDQUFzQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBRXRDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0RBQWtELENBQUMsQ0FBQztRQUVsRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEUsOENBQThDO1lBQzlDLHdDQUF3QztRQUMxQyxDQUFDO0lBQ0gsQ0FBQztJQUVEOzs7T0FHRztJQUNILE1BQU0sQ0FBQyx3QkFBd0I7UUFDN0IsT0FBTyxJQUFJLENBQUMsZ0JBQWdCO2FBQ3pCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7YUFDdEIsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FB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LHlEQUF5RDtRQUN0RSxxQkFBcUIsRUFBRSw2Q0FBNkM7UUFDcEUsU0FBUyxFQUFFLFlBQVk7S0FDeEI7SUFDRDtRQUNFLElBQUksRUFBRSxjQUFjO1FBQ3BCLE9BQU8sRUFBRSxLQUFLO1FBQ2QsV0FBVyxFQUFFLCtCQUErQjtRQUM1QyxxQkFBcUIsRUFBRSxpQ0FBaUM7UUFDeEQsU0FBUyxFQUFFLFlBQVk7S0FDeEI7SUFDRDtRQUNFLElBQUksRUFBRSxlQUFlO1FBQ3JCLE9BQU8sRUFBRSxLQUFLO1FBQ2QsV0FBVyxFQUFFLHVEQUF1RDtRQUNwRSxxQkFBcUIsRUFBRSxpQ0FBaUM7UUFDeEQsU0FBUyxFQUFFLFlBQVk7S0FDeEI7SUFDRDtRQUNFLElBQUksRUFBRSxjQUFjO1FBQ3BCLE9BQU8sRUFBRSxLQUFLO1FBQ2QsV0FBVyxFQUFFLDJEQUEyRDtRQUN4RSxxQkFBcUIsRUFBRSxtQ0FBbUM7UUFDMUQsU0FBUyxFQUFFLFlBQVk7S0FDeEI7SUFDRDtRQUNFLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUUsNkNBQTZDO1FBQzFELHFCQUFxQixFQUFFLDRDQUE0QztRQUNuRSxTQUFTLEVBQUUsWUFBWTtLQUN4QjtDQUNGLENBQUM7QUFFRix3QkFBd0I7QUFDVCxpQ0FBVyxHQUFHLEtBQUssQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBHZXN0aW9ubmFpcmUgZGVzIGNyaXTDqHJlcyBoeWJyaWRlcyBwb3VyIGwnYXJjaGl0ZWN0dXJlIEdTSSArIEZpbHRlckV4cHJlc3Npb25cclxuICogXHJcbiAqIENlIGdlc3Rpb25uYWlyZSBwZXJtZXQgZGUgOlxyXG4gKiAxLiBDb25maWd1cmVyIGZhY2lsZW1lbnQgbGVzIGNyaXTDqHJlcyBwcmltYWlyZXMgKEdTSSkgLSBFTiBEVVIgZGFucyBsZSBjb2RlXHJcbiAqIDIuIEfDqXJlciBsZXMgY3JpdMOocmVzIHNlY29uZGFpcmVzIChGaWx0ZXJFeHByZXNzaW9uKSAtIERZTkFNSVFVRVMgdmlhIFBhcmFtZXRlciBTdG9yZVxyXG4gKiAzLiBHw6lyZXIgbGEgcHJpb3JpdMOpIGV0IGwnYWN0aXZhdGlvbiBkZXMgY3JpdMOocmVzXHJcbiAqIFxyXG4gKiBBUkNISVRFQ1RVUkUgOlxyXG4gKiAtIENyaXTDqHJlcyBQUklNQUlSRVMgOiByZXN0ZW50IGVuIGR1ciAobsOpY2Vzc2l0ZW50IHVuIHJlZMOpcGxvaWVtZW50IHBvdXIgbW9kaWZpY2F0aW9uKVxyXG4gKiAtIENyaXTDqHJlcyBTRUNPTkRBSVJFUyA6IHN0b2Nrw6lzIGRhbnMgUGFyYW1ldGVyIFN0b3JlIChtb2RpZmljYXRpb24gc2FucyByZWTDqXBsb2llbWVudClcclxuICovXHJcblxyXG5pbXBvcnQgeyBDcml0ZXJpYVBhcmFtZXRlclN0b3JlLCBTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZyB9IGZyb20gJy4vQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZSc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENyaXRlcmlhQ29uZmlnIHtcclxuICBuYW1lOiBzdHJpbmc7XHJcbiAgdHlwZTogJ3ByaW1hcnknIHwgJ3NlY29uZGFyeSc7XHJcbiAgZW5hYmxlZDogYm9vbGVhbjtcclxuICBwcmlvcml0eT86IG51bWJlcjsgICAgICAgICAgIC8vIFBvdXIgbGVzIGNyaXTDqHJlcyBwcmltYWlyZXMgdW5pcXVlbWVudFxyXG4gIHNlbGVjdGl2aXR5PzogJ2hpZ2gnIHwgJ21lZGl1bScgfCAnbG93JzsgIC8vIFBvdXIgbGVzIGNyaXTDqHJlcyBwcmltYWlyZXNcclxuICBkZXNjcmlwdGlvbj86IHN0cmluZztcclxuICBidXNpbmVzc0p1c3RpZmljYXRpb24/OiBzdHJpbmc7XHJcbiAgYWRkZWREYXRlPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENyaXRlcmlhU3RhdHMge1xyXG4gIHRvdGFsQ3JpdGVyaWE6IG51bWJlcjtcclxuICBwcmltYXJ5Q291bnQ6IG51bWJlcjtcclxuICBzZWNvbmRhcnlDb3VudDogbnVtYmVyO1xyXG4gIGVuYWJsZWRQcmltYXJ5OiBudW1iZXI7XHJcbiAgZW5hYmxlZFNlY29uZGFyeTogbnVtYmVyO1xyXG4gIGdzaUNvc3Q6IHN0cmluZztcclxuICBlc3RpbWF0ZWRQZXJmb3JtYW5jZTogc3RyaW5nO1xyXG4gIGNhY2hlTWV0cmljcz86IGFueTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEh5YnJpZENyaXRlcmlhTWFuYWdlciB7XHJcbiAgXHJcbiAgLy8gPT09PT09PT09PSBDUklUw4hSRVMgUFJJTUFJUkVTIChHU0kpIC0gRU4gRFVSID09PT09PT09PT1cclxuICAvLyBDZXMgY3JpdMOocmVzIHJlc3RlbnQgZGFucyBsZSBjb2RlIGNhciBpbHMgbsOpY2Vzc2l0ZW50IGRlcyBHU0kgRHluYW1vREJcclxuICAvLyBUb3V0ZSBtb2RpZmljYXRpb24gbsOpY2Vzc2l0ZSB1biByZWTDqXBsb2llbWVudCBkZSBsJ2luZnJhc3RydWN0dXJlXHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFJJTUFSWV9DUklURVJJQTogQ3JpdGVyaWFDb25maWdbXSA9IFtcclxuICAgIHtcclxuICAgICAgbmFtZTogJ1VDX0ludGVudGlvbkRlZHVpdGUnLFxyXG4gICAgICB0eXBlOiAncHJpbWFyeScsXHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIHByaW9yaXR5OiAxLFxyXG4gICAgICBzZWxlY3Rpdml0eTogJ2hpZ2gnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0ludGVudGlvbiBkw6lkdWl0ZSBkdSBudW3DqXJvIGFwcGVsw6kgKGV4OiBcIkdlc3Rpb24gU2luaXN0cmVcIiwgXCJTb3VzY3JpcHRpb25cIiwgXCJTQVZcIiknLFxyXG4gICAgICBidXNpbmVzc0p1c3RpZmljYXRpb246ICdDcml0w6hyZSBwcmluY2lwYWwgZGUgcm91dGFnZSBiYXPDqSBzdXIgbGUgbnVtw6lybyBhcHBlbMOpIC0gdHLDqHMgc8OpbGVjdGlmJyxcclxuICAgICAgYWRkZWREYXRlOiAnMjAyNC0xMi0zMSdcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIG5hbWU6ICdVQ19JbnRlbnRpb25DYXB0ZWUnLFxyXG4gICAgICB0eXBlOiAncHJpbWFyeScsXHJcbiAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIHByaW9yaXR5OiAyLFxyXG4gICAgICBzZWxlY3Rpdml0eTogJ21lZGl1bScsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSW50ZW50aW9uIGNhcHTDqWUgcGFyIGJvdC9TVkkgKGV4OiBcIkFVVE9fU09VU0NcIiwgXCJIQUJJVEFUX1NJTklTVFJFXCIsIFwiSU5GT19DT05UUkFUXCIpJyxcclxuICAgICAgYnVzaW5lc3NKdXN0aWZpY2F0aW9uOiAnSW50ZW50aW9uIHByw6ljaXNlIGlkZW50aWZpw6llIHBhciBsZSBib3QgLSBjb21wbMOpbWVudCBkZSBVQ19JbnRlbnRpb25EZWR1aXRlJyxcclxuICAgICAgYWRkZWREYXRlOiAnMjAyNC0xMi0zMSdcclxuICAgIH1cclxuICBdO1xyXG5cclxuICAvLyA9PT09PT09PT09IENSSVTDiFJFUyBTRUNPTkRBSVJFUyBGQUxMQkFDSyA9PT09PT09PT09XHJcbiAgLy8gQ2VzIGNyaXTDqHJlcyBzb250IHV0aWxpc8OpcyBzaSBQYXJhbWV0ZXIgU3RvcmUgZXN0IGluZGlzcG9uaWJsZSBvdSByZXRvdXJuZSB2aWRlXHJcbiAgLy8gSWxzIHBlcm1ldHRlbnQgZGUgY29udGludWVyIMOgIGZvbmN0aW9ubmVyIG3Dqm1lIGVuIGNhcyBkZSBwcm9ibMOobWUgYXZlYyBQYXJhbWV0ZXIgU3RvcmVcclxuICBcclxuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUNPTkRBUllfQ1JJVEVSSUFfRkFMTEJBQ0s6IFNlY29uZGFyeUNyaXRlcmlhQ29uZmlnW10gPSBbXHJcbiAgICB7XHJcbiAgICAgIG5hbWU6ICdUeXBlQ2xpZW50JyxcclxuICAgICAgZW5hYmxlZDogZmFsc2UsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHlwZSBkZSBjbGllbnQgKFBhcnRpY3VsaWVyLCBQcm9mZXNzaW9ubmVsLCBFbnRyZXByaXNlKScsXHJcbiAgICAgIGJ1c2luZXNzSnVzdGlmaWNhdGlvbjogJ1JvdXRhZ2UgZGlmZsOpcmVuY2nDqSBzZWxvbiBsZSB0eXBlIGRlIGNsaWVudCcsXHJcbiAgICAgIGFkZGVkRGF0ZTogJzIwMjUtMDEtMTUnXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAnUmVnaW9uQ2xpZW50JyxcclxuICAgICAgZW5hYmxlZDogZmFsc2UsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUsOpZ2lvbiBnw6lvZ3JhcGhpcXVlIGR1IGNsaWVudCcsXHJcbiAgICAgIGJ1c2luZXNzSnVzdGlmaWNhdGlvbjogJ1JvdXRhZ2UgdmVycyDDqXF1aXBlcyByw6lnaW9uYWxlcycsXHJcbiAgICAgIGFkZGVkRGF0ZTogJzIwMjUtMDEtMTUnXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAnTml2ZWF1VXJnZW5jZScsXHJcbiAgICAgIGVuYWJsZWQ6IGZhbHNlLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05pdmVhdSBkXFwndXJnZW5jZSBkw6l0ZWN0w6kgKENyaXRpcXVlLCBOb3JtYWxlLCBGYWlibGUpJyxcclxuICAgICAgYnVzaW5lc3NKdXN0aWZpY2F0aW9uOiAnUHJpb3Jpc2F0aW9uIGRlcyBhcHBlbHMgdXJnZW50cycsXHJcbiAgICAgIGFkZGVkRGF0ZTogJzIwMjUtMDEtMTUnXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAnQ2FuYWxPcmlnaW5lJyxcclxuICAgICAgZW5hYmxlZDogZmFsc2UsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2FuYWwgZFxcJ29yaWdpbmUgZGUgbFxcJ2FwcGVsIChUw6lsw6lwaG9uZSwgV2ViLCBNb2JpbGUgQXBwKScsXHJcbiAgICAgIGJ1c2luZXNzSnVzdGlmaWNhdGlvbjogJ1JvdXRhZ2Ugc2Vsb24gbGUgY2FuYWwgZFxcJ29yaWdpbmUnLFxyXG4gICAgICBhZGRlZERhdGU6ICcyMDI1LTAxLTE1J1xyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgbmFtZTogJ0hpc3RvcmlxdWVDbGllbnQnLFxyXG4gICAgICBlbmFibGVkOiBmYWxzZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdIaXN0b3JpcXVlIGNsaWVudCAoTm91dmVhdSwgUsOpY3VycmVudCwgVklQKScsXHJcbiAgICAgIGJ1c2luZXNzSnVzdGlmaWNhdGlvbjogJ1RyYWl0ZW1lbnQgZGlmZsOpcmVuY2nDqSBzZWxvbiBsXFwnaGlzdG9yaXF1ZScsXHJcbiAgICAgIGFkZGVkRGF0ZTogJzIwMjUtMDEtMTUnXHJcbiAgICB9XHJcbiAgXTtcclxuXHJcbiAgLy8gRmxhZyBkJ2luaXRpYWxpc2F0aW9uXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcclxuXHJcbiAgLyoqXHJcbiAgICogSW5pdGlhbGlzZSBsZSBnZXN0aW9ubmFpcmUgKHdhcm0tdXAgZHUgY2FjaGUpXHJcbiAgICogw4AgYXBwZWxlciBhdSBkw6ltYXJyYWdlIGRlIGxhIExhbWJkYSBwb3VyIG9wdGltaXNlciBsZXMgcGVyZm9ybWFuY2VzXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAodGhpcy5pbml0aWFsaXplZCkge1xyXG4gICAgICBjb25zb2xlLmxvZygn4pyFIEh5YnJpZENyaXRlcmlhTWFuYWdlciBhbHJlYWR5IGluaXRpYWxpemVkJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ/CflKUgSW5pdGlhbGl6aW5nIEh5YnJpZENyaXRlcmlhTWFuYWdlci4uLicpO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBXYXJtLXVwIGR1IGNhY2hlIFBhcmFtZXRlciBTdG9yZVxyXG4gICAgICBhd2FpdCBDcml0ZXJpYVBhcmFtZXRlclN0b3JlLndhcm1VcCgpO1xyXG4gICAgICBcclxuICAgICAgdGhpcy5pbml0aWFsaXplZCA9IHRydWU7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgSHlicmlkQ3JpdGVyaWFNYW5hZ2VyIGluaXRpYWxpemVkIHN1Y2Nlc3NmdWxseScpO1xyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBIeWJyaWRDcml0ZXJpYU1hbmFnZXI6JywgZXJyb3IpO1xyXG4gICAgICAvLyBOZSBwYXMgYmxvcXVlciBsZSBkw6ltYXJyYWdlIGVuIGNhcyBkJ2VycmV1clxyXG4gICAgICAvLyBMZSBjYWNoZSBzZXJhIGNoYXJnw6kgYXUgcHJlbWllciBhcHBlbFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmV0b3VybmUgdG91cyBsZXMgY3JpdMOocmVzIHByaW1haXJlcyBhY3RpZnMgKHBvdXIgR1NJKVxyXG4gICAqIFNZTkNIUk9ORSAtIExlcyBjcml0w6hyZXMgcHJpbWFpcmVzIHNvbnQgZW4gZHVyXHJcbiAgICovXHJcbiAgc3RhdGljIGdldEFjdGl2ZVByaW1hcnlDcml0ZXJpYSgpOiBzdHJpbmdbXSB7XHJcbiAgICByZXR1cm4gdGhpcy5QUklNQVJZX0NSSVRFUklBXHJcbiAgICAgIC5maWx0ZXIoYyA9PiBjLmVuYWJsZWQpXHJcbiAgICAgIC5zb3J0KChhLCBiKSA9PiAoYS5wcmlvcml0eSB8fCAwKSAtIChiLnByaW9yaXR5IHx8IDApKVxyXG4gICAgICAubWFwKGMgPT4gYy5uYW1lKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJldG91cm5lIHRvdXMgbGVzIGNyaXTDqHJlcyBzZWNvbmRhaXJlcyBhY3RpZnMgKHBvdXIgRmlsdGVyRXhwcmVzc2lvbilcclxuICAgKiBBU1lOQ0hST05FIC0gTGVzIGNyaXTDqHJlcyBzZWNvbmRhaXJlcyBzb250IGNoYXJnw6lzIGRlcHVpcyBQYXJhbWV0ZXIgU3RvcmVcclxuICAgKiBcclxuICAgKiBGQUxMQkFDSyA6IFNpIFBhcmFtZXRlciBTdG9yZSByZXRvdXJuZSB2aWRlLCB1dGlsaXNlIGxlcyBjcml0w6hyZXMgZW4gZHVyXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIGdldEFjdGl2ZVNlY29uZGFyeUNyaXRlcmlhKCk6IFByb21pc2U8c3RyaW5nW10+IHtcclxuICAgIGNvbnNvbGUubG9nKCdbSFlCUklEXSBMb2FkaW5nIHNlY29uZGFyeSBjcml0ZXJpYSBmcm9tIFBhcmFtZXRlciBTdG9yZS4uLicpO1xyXG4gICAgY29uc3Qgc2Vjb25kYXJ5Q3JpdGVyaWEgPSBhd2FpdCBDcml0ZXJpYVBhcmFtZXRlclN0b3JlLmxvYWRBbGwoKTtcclxuICAgIGNvbnNvbGUubG9nKCdbSFlCUklEXSBUb3RhbCBjcml0ZXJpYSBsb2FkZWQ6Jywgc2Vjb25kYXJ5Q3JpdGVyaWEubGVuZ3RoKTtcclxuICAgIFxyXG4gICAgLy8g4pqg77iPIEZBTExCQUNLIDogU2kgUGFyYW1ldGVyIFN0b3JlIHJldG91cm5lIHZpZGUsIHV0aWxpc2VyIGxlcyBjcml0w6hyZXMgZW4gZHVyXHJcbiAgICBpZiAoc2Vjb25kYXJ5Q3JpdGVyaWEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybignW0hZQlJJRF0gUGFyYW1ldGVyIFN0b3JlIHJldHVybmVkIGVtcHR5IC0gdXNpbmcgRkFMTEJBQ0sgY3JpdGVyaWEnKTtcclxuICAgICAgY29uc3QgZmFsbGJhY2tBY3RpdmUgPSB0aGlzLlNFQ09OREFSWV9DUklURVJJQV9GQUxMQkFDSy5maWx0ZXIoYyA9PiBjLmVuYWJsZWQpO1xyXG4gICAgICBjb25zb2xlLmxvZygnW0hZQlJJRF0gRmFsbGJhY2sgY3JpdGVyaWE6JywgZmFsbGJhY2tBY3RpdmUubGVuZ3RoLCAnYWN0aXZlIG91dCBvZicsIHRoaXMuU0VDT05EQVJZX0NSSVRFUklBX0ZBTExCQUNLLmxlbmd0aCk7XHJcbiAgICAgIGZhbGxiYWNrQWN0aXZlLmZvckVhY2goYyA9PiB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tIWUJSSURdIEZhbGxiYWNrIGNyaXRlcmlvbjonLCBjLm5hbWUsICdlbmFibGVkOicsIGMuZW5hYmxlZCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gZmFsbGJhY2tBY3RpdmUubWFwKGMgPT4gYy5uYW1lKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgYWN0aXZlQ3JpdGVyaWEgPSBzZWNvbmRhcnlDcml0ZXJpYS5maWx0ZXIoYyA9PiBjLmVuYWJsZWQpO1xyXG4gICAgY29uc29sZS5sb2coJ1tIWUJSSURdIEFjdGl2ZSBjcml0ZXJpYTonLCBhY3RpdmVDcml0ZXJpYS5sZW5ndGgpO1xyXG4gICAgYWN0aXZlQ3JpdGVyaWEuZm9yRWFjaChjID0+IHtcclxuICAgICAgY29uc29sZS5sb2coJ1tIWUJSSURdIEFjdGl2ZSBjcml0ZXJpb246JywgYy5uYW1lLCAnZW5hYmxlZDonLCBjLmVuYWJsZWQpO1xyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiBhY3RpdmVDcml0ZXJpYS5tYXAoYyA9PiBjLm5hbWUpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmV0b3VybmUgVE9VUyBsZXMgY3JpdMOocmVzIGFjdGlmcyAocHJpbWFpcmVzICsgc2Vjb25kYWlyZXMpXHJcbiAgICogQVNZTkNIUk9ORSAtIENvbWJpbmUgbGVzIGNyaXTDqHJlcyBwcmltYWlyZXMgKGVuIGR1cikgZXQgc2Vjb25kYWlyZXMgKFBhcmFtZXRlciBTdG9yZSlcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgZ2V0QWxsQWN0aXZlQ3JpdGVyaWEoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG4gICAgY29uc3QgcHJpbWFyeU5hbWVzID0gdGhpcy5nZXRBY3RpdmVQcmltYXJ5Q3JpdGVyaWEoKTtcclxuICAgIGNvbnN0IHNlY29uZGFyeU5hbWVzID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVTZWNvbmRhcnlDcml0ZXJpYSgpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gWy4uLnByaW1hcnlOYW1lcywgLi4uc2Vjb25kYXJ5TmFtZXNdO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVsOpcmlmaWUgc2kgdW4gY3JpdMOocmUgZXN0IHByaW1haXJlIChHU0kpXHJcbiAgICogU1lOQ0hST05FIC0gTGVzIGNyaXTDqHJlcyBwcmltYWlyZXMgc29udCBlbiBkdXJcclxuICAgKi9cclxuICBzdGF0aWMgaXNQcmltYXJ5Q3JpdGVyaWEoY3JpdGVyaWFOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGNyaXRlcmlhID0gdGhpcy5QUklNQVJZX0NSSVRFUklBLmZpbmQoYyA9PiBjLm5hbWUgPT09IGNyaXRlcmlhTmFtZSk7XHJcbiAgICByZXR1cm4gY3JpdGVyaWEgPyBjcml0ZXJpYS5lbmFibGVkIDogZmFsc2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWw6lyaWZpZSBzaSB1biBjcml0w6hyZSBlc3Qgc2Vjb25kYWlyZSAoRmlsdGVyRXhwcmVzc2lvbilcclxuICAgKiBBU1lOQ0hST05FIC0gTGVzIGNyaXTDqHJlcyBzZWNvbmRhaXJlcyBzb250IGRhbnMgUGFyYW1ldGVyIFN0b3JlXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIGlzU2Vjb25kYXJ5Q3JpdGVyaWEoY3JpdGVyaWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGNvbnN0IHNlY29uZGFyeUNyaXRlcmlhID0gYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5sb2FkQWxsKCk7XHJcbiAgICBjb25zdCBjcml0ZXJpYSA9IHNlY29uZGFyeUNyaXRlcmlhLmZpbmQoYyA9PiBjLm5hbWUgPT09IGNyaXRlcmlhTmFtZSk7XHJcbiAgICByZXR1cm4gY3JpdGVyaWEgPyBjcml0ZXJpYS5lbmFibGVkIDogZmFsc2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBY3RpdmUvZMOpc2FjdGl2ZSB1biBjcml0w6hyZSBTRUNPTkRBSVJFXHJcbiAgICogQVNZTkNIUk9ORSAtIE1vZGlmaWUgbGUgY3JpdMOocmUgZGFucyBQYXJhbWV0ZXIgU3RvcmVcclxuICAgKiBcclxuICAgKiBOb3RlIDogTGVzIGNyaXTDqHJlcyBwcmltYWlyZXMgbmUgcGV1dmVudCBwYXMgw6p0cmUgbW9kaWZpw6lzIGR5bmFtaXF1ZW1lbnRcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgdG9nZ2xlU2Vjb25kYXJ5Q3JpdGVyaWEoY3JpdGVyaWFOYW1lOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFLDqWN1cMOpcmVyIGxlIGNyaXTDqHJlIGV4aXN0YW50XHJcbiAgICAgIGNvbnN0IGNyaXRlcmlhID0gYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5nZXRDcml0ZXJpYShjcml0ZXJpYU5hbWUpO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFjcml0ZXJpYSkge1xyXG4gICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIFNlY29uZGFyeSBjcml0ZXJpYSAke2NyaXRlcmlhTmFtZX0gbm90IGZvdW5kYCk7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBNZXR0cmUgw6Agam91ciBsZSBjcml0w6hyZVxyXG4gICAgICBjcml0ZXJpYS5lbmFibGVkID0gZW5hYmxlZDtcclxuICAgICAgYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5wdXRDcml0ZXJpYShjcml0ZXJpYSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFNlY29uZGFyeSBjcml0ZXJpYSAke2NyaXRlcmlhTmFtZX0gJHtlbmFibGVkID8gJ2VuYWJsZWQnIDogJ2Rpc2FibGVkJ31gKTtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIFxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byB0b2dnbGUgY3JpdGVyaWEgJHtjcml0ZXJpYU5hbWV9OmAsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQWpvdXRlIHVuIG5vdXZlYXUgY3JpdMOocmUgc2Vjb25kYWlyZVxyXG4gICAqIEFTWU5DSFJPTkUgLSBBam91dGUgbGUgY3JpdMOocmUgZGFucyBQYXJhbWV0ZXIgU3RvcmVcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgYWRkU2Vjb25kYXJ5Q3JpdGVyaWEoXHJcbiAgICBuYW1lOiBzdHJpbmcsIFxyXG4gICAgZGVzY3JpcHRpb246IHN0cmluZywgXHJcbiAgICBidXNpbmVzc0p1c3RpZmljYXRpb246IHN0cmluZ1xyXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVsOpcmlmaWVyIHF1ZSBsZSBjcml0w6hyZSBuJ2V4aXN0ZSBwYXMgZMOpasOgXHJcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5nZXRDcml0ZXJpYShuYW1lKTtcclxuICAgICAgaWYgKGV4aXN0aW5nKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gU2Vjb25kYXJ5IGNyaXRlcmlhICR7bmFtZX0gYWxyZWFkeSBleGlzdHNgKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENyw6llciBsZSBub3V2ZWF1IGNyaXTDqHJlXHJcbiAgICAgIGNvbnN0IG5ld0NyaXRlcmlhOiBTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZyA9IHtcclxuICAgICAgICBuYW1lLFxyXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgZGVzY3JpcHRpb24sXHJcbiAgICAgICAgYnVzaW5lc3NKdXN0aWZpY2F0aW9uLFxyXG4gICAgICAgIGFkZGVkRGF0ZTogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF1cclxuICAgICAgfTtcclxuXHJcbiAgICAgIGF3YWl0IENyaXRlcmlhUGFyYW1ldGVyU3RvcmUucHV0Q3JpdGVyaWEobmV3Q3JpdGVyaWEpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBOZXcgc2Vjb25kYXJ5IGNyaXRlcmlhICR7bmFtZX0gYWRkZWQgc3VjY2Vzc2Z1bGx5YCk7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gYWRkIGNyaXRlcmlhICR7bmFtZX06YCwgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdXBwcmltZSB1biBjcml0w6hyZSBzZWNvbmRhaXJlXHJcbiAgICogQVNZTkNIUk9ORSAtIFN1cHByaW1lIGxlIGNyaXTDqHJlIGRlIFBhcmFtZXRlciBTdG9yZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3luYyBkZWxldGVTZWNvbmRhcnlDcml0ZXJpYShjcml0ZXJpYU5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5kZWxldGVDcml0ZXJpYShjcml0ZXJpYU5hbWUpO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFNlY29uZGFyeSBjcml0ZXJpYSAke2NyaXRlcmlhTmFtZX0gZGVsZXRlZCBzdWNjZXNzZnVsbHlgKTtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIFxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBkZWxldGUgY3JpdGVyaWEgJHtjcml0ZXJpYU5hbWV9OmAsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmV0b3VybmUgbGVzIHN0YXRpc3RpcXVlcyBkZXMgY3JpdMOocmVzXHJcbiAgICogQVNZTkNIUk9ORSAtIEluY2x1dCBsZXMgY3JpdMOocmVzIHNlY29uZGFpcmVzIGRlcHVpcyBQYXJhbWV0ZXIgU3RvcmVcclxuICAgKiBcclxuICAgKiBGQUxMQkFDSyA6IFNpIFBhcmFtZXRlciBTdG9yZSByZXRvdXJuZSB2aWRlLCB1dGlsaXNlIGxlcyBjcml0w6hyZXMgZW4gZHVyXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIGdldENyaXRlcmlhU3RhdHMoKTogUHJvbWlzZTxDcml0ZXJpYVN0YXRzPiB7XHJcbiAgICBjb25zdCBwcmltYXJ5Q3JpdGVyaWEgPSB0aGlzLlBSSU1BUllfQ1JJVEVSSUE7XHJcbiAgICBjb25zdCBzZWNvbmRhcnlDcml0ZXJpYSA9IGF3YWl0IENyaXRlcmlhUGFyYW1ldGVyU3RvcmUubG9hZEFsbCgpO1xyXG4gICAgXHJcbiAgICAvLyDimqDvuI8gRkFMTEJBQ0sgOiBTaSBQYXJhbWV0ZXIgU3RvcmUgcmV0b3VybmUgdmlkZSwgdXRpbGlzZXIgbGVzIGNyaXTDqHJlcyBlbiBkdXJcclxuICAgIGNvbnN0IGNyaXRlcmlhVG9Vc2UgPSBzZWNvbmRhcnlDcml0ZXJpYS5sZW5ndGggPiAwIFxyXG4gICAgICA/IHNlY29uZGFyeUNyaXRlcmlhIFxyXG4gICAgICA6IHRoaXMuU0VDT05EQVJZX0NSSVRFUklBX0ZBTExCQUNLO1xyXG4gICAgXHJcbiAgICBpZiAoc2Vjb25kYXJ5Q3JpdGVyaWEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIFVzaW5nIEZBTExCQUNLIGNyaXRlcmlhIGluIGdldENyaXRlcmlhU3RhdHMoKScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBlbmFibGVkUHJpbWFyeSA9IHByaW1hcnlDcml0ZXJpYS5maWx0ZXIoYyA9PiBjLmVuYWJsZWQpO1xyXG4gICAgY29uc3QgZW5hYmxlZFNlY29uZGFyeSA9IGNyaXRlcmlhVG9Vc2UuZmlsdGVyKGMgPT4gYy5lbmFibGVkKTtcclxuXHJcbiAgICAvLyBFc3RpbWF0aW9uIGR1IGNvw7t0IEdTSSAoNeKCrCBwYXIgR1NJIGFjdGlmKVxyXG4gICAgY29uc3QgZ3NpQ29zdCA9IGAke2VuYWJsZWRQcmltYXJ5Lmxlbmd0aCAqIDV94oKsL21vaXNgO1xyXG5cclxuICAgIC8vIEVzdGltYXRpb24gZGUgcGVyZm9ybWFuY2VcclxuICAgIGNvbnN0IGVzdGltYXRlZFBlcmZvcm1hbmNlID0gZW5hYmxlZFByaW1hcnkubGVuZ3RoID4gMCA/IFxyXG4gICAgICBgJHs4NSArIE1hdGgubWluKGVuYWJsZWRTZWNvbmRhcnkubGVuZ3RoICogMiwgMTMpfSUgcsOpZHVjdGlvbmAgOiBcclxuICAgICAgYCR7TWF0aC5taW4oZW5hYmxlZFNlY29uZGFyeS5sZW5ndGggKiA1LCA2MCl9JSByw6lkdWN0aW9uYDtcclxuXHJcbiAgICAvLyBNw6l0cmlxdWVzIGR1IGNhY2hlXHJcbiAgICBjb25zdCBjYWNoZU1ldHJpY3MgPSBDcml0ZXJpYVBhcmFtZXRlclN0b3JlLmdldE1ldHJpY3MoKTtcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0b3RhbENyaXRlcmlhOiBwcmltYXJ5Q3JpdGVyaWEubGVuZ3RoICsgY3JpdGVyaWFUb1VzZS5sZW5ndGgsXHJcbiAgICAgIHByaW1hcnlDb3VudDogcHJpbWFyeUNyaXRlcmlhLmxlbmd0aCxcclxuICAgICAgc2Vjb25kYXJ5Q291bnQ6IGNyaXRlcmlhVG9Vc2UubGVuZ3RoLFxyXG4gICAgICBlbmFibGVkUHJpbWFyeTogZW5hYmxlZFByaW1hcnkubGVuZ3RoLFxyXG4gICAgICBlbmFibGVkU2Vjb25kYXJ5OiBlbmFibGVkU2Vjb25kYXJ5Lmxlbmd0aCxcclxuICAgICAgZ3NpQ29zdCxcclxuICAgICAgZXN0aW1hdGVkUGVyZm9ybWFuY2UsXHJcbiAgICAgIGNhY2hlTWV0cmljc1xyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJldG91cm5lIGxhIGNvbmZpZ3VyYXRpb24gY29tcGzDqHRlIChwcmltYWlyZXMgKyBzZWNvbmRhaXJlcylcclxuICAgKiBBU1lOQ0hST05FIC0gSW5jbHV0IGxlcyBjcml0w6hyZXMgc2Vjb25kYWlyZXMgZGVwdWlzIFBhcmFtZXRlciBTdG9yZVxyXG4gICAqIFxyXG4gICAqIEZBTExCQUNLIDogU2kgUGFyYW1ldGVyIFN0b3JlIHJldG91cm5lIHZpZGUsIHV0aWxpc2UgbGVzIGNyaXTDqHJlcyBlbiBkdXJcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgZ2V0RnVsbENvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTxDcml0ZXJpYUNvbmZpZ1tdPiB7XHJcbiAgICBjb25zdCBzZWNvbmRhcnlDcml0ZXJpYSA9IGF3YWl0IENyaXRlcmlhUGFyYW1ldGVyU3RvcmUubG9hZEFsbCgpO1xyXG4gICAgXHJcbiAgICAvLyDimqDvuI8gRkFMTEJBQ0sgOiBTaSBQYXJhbWV0ZXIgU3RvcmUgcmV0b3VybmUgdmlkZSwgdXRpbGlzZXIgbGVzIGNyaXTDqHJlcyBlbiBkdXJcclxuICAgIGNvbnN0IGNyaXRlcmlhVG9Vc2UgPSBzZWNvbmRhcnlDcml0ZXJpYS5sZW5ndGggPiAwIFxyXG4gICAgICA/IHNlY29uZGFyeUNyaXRlcmlhIFxyXG4gICAgICA6IHRoaXMuU0VDT05EQVJZX0NSSVRFUklBX0ZBTExCQUNLO1xyXG4gICAgXHJcbiAgICBpZiAoc2Vjb25kYXJ5Q3JpdGVyaWEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIFVzaW5nIEZBTExCQUNLIGNyaXRlcmlhIGluIGdldEZ1bGxDb25maWd1cmF0aW9uKCknKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ29udmVydGlyIGxlcyBjcml0w6hyZXMgc2Vjb25kYWlyZXMgYXUgZm9ybWF0IENyaXRlcmlhQ29uZmlnXHJcbiAgICBjb25zdCBzZWNvbmRhcnlBc0NvbmZpZzogQ3JpdGVyaWFDb25maWdbXSA9IGNyaXRlcmlhVG9Vc2UubWFwKGMgPT4gKHtcclxuICAgICAgbmFtZTogYy5uYW1lLFxyXG4gICAgICB0eXBlOiAnc2Vjb25kYXJ5JyBhcyBjb25zdCxcclxuICAgICAgZW5hYmxlZDogYy5lbmFibGVkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogYy5kZXNjcmlwdGlvbixcclxuICAgICAgYnVzaW5lc3NKdXN0aWZpY2F0aW9uOiBjLmJ1c2luZXNzSnVzdGlmaWNhdGlvbixcclxuICAgICAgYWRkZWREYXRlOiBjLmFkZGVkRGF0ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIHJldHVybiBbLi4udGhpcy5QUklNQVJZX0NSSVRFUklBLCAuLi5zZWNvbmRhcnlBc0NvbmZpZ107XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGUgcXUndW4gZW5zZW1ibGUgZCdhdHRyaWJ1dHMgY29udGllbnQgZGVzIGNyaXTDqHJlcyBjb25udXNcclxuICAgKiBBU1lOQ0hST05FIC0gVsOpcmlmaWUgY29udHJlIGxlcyBjcml0w6hyZXMgcHJpbWFpcmVzIGV0IHNlY29uZGFpcmVzXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIHZhbGlkYXRlQ29udGFjdEF0dHJpYnV0ZXMoY29udGFjdEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIGFueT4pOiBQcm9taXNlPHtcclxuICAgIGtub3duQ3JpdGVyaWE6IHN0cmluZ1tdO1xyXG4gICAgdW5rbm93bkNyaXRlcmlhOiBzdHJpbmdbXTtcclxuICAgIHByaW1hcnlDcml0ZXJpYUZvdW5kOiBzdHJpbmdbXTtcclxuICAgIHNlY29uZGFyeUNyaXRlcmlhRm91bmQ6IHN0cmluZ1tdO1xyXG4gIH0+IHtcclxuICAgIGNvbnN0IGFsbEtub3duQ3JpdGVyaWEgPSBhd2FpdCB0aGlzLmdldEFsbEFjdGl2ZUNyaXRlcmlhKCk7XHJcbiAgICBjb25zdCBhdHRyaWJ1dGVLZXlzID0gT2JqZWN0LmtleXMoY29udGFjdEF0dHJpYnV0ZXMpO1xyXG5cclxuICAgIGNvbnN0IGtub3duQ3JpdGVyaWEgPSBhdHRyaWJ1dGVLZXlzLmZpbHRlcihrZXkgPT4gYWxsS25vd25Dcml0ZXJpYS5pbmNsdWRlcyhrZXkpKTtcclxuICAgIGNvbnN0IHVua25vd25Dcml0ZXJpYSA9IGF0dHJpYnV0ZUtleXMuZmlsdGVyKGtleSA9PiAhYWxsS25vd25Dcml0ZXJpYS5pbmNsdWRlcyhrZXkpKTtcclxuICAgIFxyXG4gICAgLy8gVsOpcmlmaWVyIGxlcyBjcml0w6hyZXMgcHJpbWFpcmVzIChzeW5jaHJvbmUpXHJcbiAgICBjb25zdCBwcmltYXJ5Q3JpdGVyaWFGb3VuZCA9IGtub3duQ3JpdGVyaWEuZmlsdGVyKGtleSA9PiB0aGlzLmlzUHJpbWFyeUNyaXRlcmlhKGtleSkpO1xyXG4gICAgXHJcbiAgICAvLyBWw6lyaWZpZXIgbGVzIGNyaXTDqHJlcyBzZWNvbmRhaXJlcyAoYXN5bmNocm9uZSlcclxuICAgIGNvbnN0IHNlY29uZGFyeUNyaXRlcmlhQ2hlY2tzID0gYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIGtub3duQ3JpdGVyaWEubWFwKGFzeW5jIGtleSA9PiAoe1xyXG4gICAgICAgIGtleSxcclxuICAgICAgICBpc1NlY29uZGFyeTogYXdhaXQgdGhpcy5pc1NlY29uZGFyeUNyaXRlcmlhKGtleSlcclxuICAgICAgfSkpXHJcbiAgICApO1xyXG4gICAgY29uc3Qgc2Vjb25kYXJ5Q3JpdGVyaWFGb3VuZCA9IHNlY29uZGFyeUNyaXRlcmlhQ2hlY2tzXHJcbiAgICAgIC5maWx0ZXIoYyA9PiBjLmlzU2Vjb25kYXJ5KVxyXG4gICAgICAubWFwKGMgPT4gYy5rZXkpO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGtub3duQ3JpdGVyaWEsXHJcbiAgICAgIHVua25vd25Dcml0ZXJpYSxcclxuICAgICAgcHJpbWFyeUNyaXRlcmlhRm91bmQsXHJcbiAgICAgIHNlY29uZGFyeUNyaXRlcmlhRm91bmRcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDb25maWd1cmUgbGUgVFRMIGR1IGNhY2hlIFBhcmFtZXRlciBTdG9yZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBzZXRDYWNoZVRUTCh0dGw6IG51bWJlcik6IHZvaWQge1xyXG4gICAgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5zZXRDYWNoZVRUTCh0dGwpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW52YWxpZGUgbGUgY2FjaGUgUGFyYW1ldGVyIFN0b3JlIChmb3JjZSB1biByZWZyZXNoKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBpbnZhbGlkYXRlQ2FjaGUoKTogdm9pZCB7XHJcbiAgICBDcml0ZXJpYVBhcmFtZXRlclN0b3JlLmludmFsaWRhdGVDYWNoZSgpO1xyXG4gIH1cclxufVxyXG4iXX0=