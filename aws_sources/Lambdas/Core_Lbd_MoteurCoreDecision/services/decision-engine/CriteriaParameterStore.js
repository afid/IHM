"use strict";
/**
 * Service de gestion des critères secondaires via AWS Systems Manager Parameter Store
 *
 * Fonctionnalités :
 * - Cache en mémoire avec TTL configurable
 * - Warm-up au démarrage pour éviter la latence du premier appel
 * - Refresh asynchrone pour maintenir le cache à jour sans bloquer
 * - Métriques de performance pour monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CriteriaParameterStore = void 0;
const client_ssm_1 = require("@aws-sdk/client-ssm");
class CriteriaParameterStore {
    /**
     * Obtient le client SSM (singleton)
     */
    static getClient() {
        if (!this.ssmClient) {
            this.ssmClient = new client_ssm_1.SSMClient({});
        }
        return this.ssmClient;
    }
    /**
     * Configure le TTL du cache (en millisecondes)
     */
    static setCacheTTL(ttl) {
        this.cacheTTL = ttl;
        console.log(`✅ Cache TTL set to ${ttl}ms (${ttl / 1000}s)`);
    }
    /**
     * Charge tous les critères secondaires avec cache intelligent
     *
     * Stratégie :
     * 1. Si cache valide (< TTL) : retour immédiat
     * 2. Si cache périmé mais récent (< 2*TTL) : retour immédiat + refresh async
     * 3. Si cache trop vieux ou absent : refresh synchrone
     */
    static async loadAll() {
        const now = Date.now();
        const cacheAge = now - this.cacheTimestamp;
        // ✅ Cache valide : retour immédiat
        if (this.cache && cacheAge < this.cacheTTL) {
            this.metrics.hits++;
            console.log(`📦 Cache HIT (age: ${Math.round(cacheAge / 1000)}s, hits: ${this.metrics.hits})`);
            return this.cache;
        }
        // ✅ Cache périmé mais récent : retour immédiat + refresh async
        if (this.cache && cacheAge < this.STALE_CACHE_TTL) {
            this.metrics.hits++;
            console.log(`📦 Cache HIT (stale, age: ${Math.round(cacheAge / 1000)}s) - refreshing async`);
            // Refresh en arrière-plan sans bloquer
            this.refreshCacheAsync();
            return this.cache;
        }
        // ⚠️ Cache absent ou trop vieux : refresh synchrone
        this.metrics.misses++;
        console.log(`🌐 Cache MISS (age: ${Math.round(cacheAge / 1000)}s, misses: ${this.metrics.misses})`);
        return await this.refreshCache();
    }
    /**
     * Rafraîchit le cache de manière synchrone
     */
    static async refreshCache() {
        var _a, _b, _c;
        // Éviter les refresh concurrents
        if (this.isRefreshing) {
            console.log('[CACHE] Refresh already in progress, waiting...');
            // Attendre un peu et retourner le cache actuel si disponible
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.cache || [];
        }
        this.isRefreshing = true;
        const startTime = Date.now();
        try {
            console.log('[CACHE] Refreshing criteria cache from Parameter Store...');
            console.log('[CACHE] Path:', this.PARAMETER_PATH);
            const client = this.getClient();
            console.log('[CACHE] SSM Client created:', !!client);
            const command = new client_ssm_1.GetParametersByPathCommand({
                Path: this.PARAMETER_PATH,
                Recursive: true,
                WithDecryption: false
            });
            console.log('[CACHE] Command created with input:', JSON.stringify(command.input));
            console.log('[CACHE] Sending command to SSM...');
            const result = await client.send(command);
            console.log('[CACHE] Command completed successfully');
            console.log('[CACHE] Raw parameters received:', ((_a = result.Parameters) === null || _a === void 0 ? void 0 : _a.length) || 0);
            console.log('[CACHE] Result structure:', JSON.stringify({
                hasParameters: !!result.Parameters,
                parametersIsArray: Array.isArray(result.Parameters),
                parametersLength: (_b = result.Parameters) === null || _b === void 0 ? void 0 : _b.length
            }));
            // Parser les paramètres
            const criteria = this.parseParameters(result.Parameters || []);
            console.log('[CACHE] Parsed criteria:', criteria.length);
            criteria.forEach(c => {
                console.log('[CACHE] Criterion:', c.name, 'enabled:', c.enabled);
            });
            // Mettre à jour le cache
            this.cache = criteria;
            this.cacheTimestamp = Date.now();
            // Métriques
            const duration = Date.now() - startTime;
            this.metrics.lastRefreshDuration = duration;
            this.metrics.lastRefreshTimestamp = this.cacheTimestamp;
            console.log('[CACHE] Cache refreshed:', criteria.length, 'criteria loaded in', duration, 'ms');
            return this.cache;
        }
        catch (error) {
            console.error('[ERROR] Failed to refresh cache from Parameter Store');
            console.error('[ERROR] Error type:', typeof error);
            console.error('[ERROR] Error name:', error === null || error === void 0 ? void 0 : error.name);
            console.error('[ERROR] Error message:', error === null || error === void 0 ? void 0 : error.message);
            console.error('[ERROR] Error code:', error === null || error === void 0 ? void 0 : error.code);
            console.error('[ERROR] Error statusCode:', (_c = error === null || error === void 0 ? void 0 : error.$metadata) === null || _c === void 0 ? void 0 : _c.httpStatusCode);
            console.error('[ERROR] Error stack:', error === null || error === void 0 ? void 0 : error.stack);
            // Serialiser l'erreur complète
            try {
                const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
                console.error('[ERROR] Full error details:', errorDetails);
            }
            catch (serializeError) {
                console.error('[ERROR] Could not serialize error:', serializeError);
            }
            // En cas d'erreur, retourner le cache existant si disponible
            if (this.cache) {
                console.warn('[WARN] Using stale cache due to refresh error');
                return this.cache;
            }
            // Sinon, retourner un tableau vide
            console.warn('[WARN] No cache available, returning empty array');
            return [];
        }
        finally {
            this.isRefreshing = false;
        }
    }
    /**
     * Rafraîchit le cache de manière asynchrone (non-bloquant)
     */
    static refreshCacheAsync() {
        // Fire and forget
        this.refreshCache().catch(error => {
            console.error('❌ Async cache refresh failed:', error);
        });
    }
    /**
     * Parse les paramètres SSM en objets SecondaryCriteriaConfig
     */
    static parseParameters(parameters) {
        console.log('[PARSE] Starting to parse', parameters.length, 'parameters');
        const parsed = parameters.map((param, index) => {
            var _a, _b;
            try {
                console.log('[PARSE] Parameter', index, '- Name:', param.Name);
                console.log('[PARSE] Parameter', index, '- Value:', param.Value);
                const value = JSON.parse(param.Value || '{}');
                // Extraire le nom du critère depuis le chemin du paramètre
                // Ex: /decision-engine/criteria/secondary/TypeClient -> TypeClient
                const name = ((_a = param.Name) === null || _a === void 0 ? void 0 : _a.split('/').pop()) || 'unknown';
                const config = {
                    name,
                    enabled: (_b = value.enabled) !== null && _b !== void 0 ? _b : false,
                    description: value.description,
                    businessJustification: value.businessJustification,
                    addedDate: value.addedDate
                };
                console.log('[PARSE] Parameter', index, '- Parsed successfully:', name);
                return config;
            }
            catch (error) {
                console.error('[PARSE] Failed to parse parameter', param.Name);
                console.error('[PARSE] Parse error:', error === null || error === void 0 ? void 0 : error.message);
                return null;
            }
        });
        const filtered = parsed.filter((c) => c !== null);
        console.log('[PARSE] Successfully parsed', filtered.length, 'out of', parameters.length, 'parameters');
        return filtered;
    }
    /**
     * Ajoute ou met à jour un critère secondaire
     */
    static async putCriteria(criteria) {
        const client = this.getClient();
        const parameterName = `${this.PARAMETER_PATH}/${criteria.name}`;
        const parameterValue = JSON.stringify({
            enabled: criteria.enabled,
            description: criteria.description,
            businessJustification: criteria.businessJustification,
            addedDate: criteria.addedDate || new Date().toISOString().split('T')[0]
        });
        const command = new client_ssm_1.PutParameterCommand({
            Name: parameterName,
            Value: parameterValue,
            Type: 'String',
            Overwrite: true,
            Description: `Secondary criteria: ${criteria.description || criteria.name}`
        });
        await client.send(command);
        console.log(`✅ Criteria ${criteria.name} saved to Parameter Store`);
        // Invalider le cache pour forcer un refresh
        this.invalidateCache();
    }
    /**
     * Supprime un critère secondaire
     */
    static async deleteCriteria(criteriaName) {
        const client = this.getClient();
        const parameterName = `${this.PARAMETER_PATH}/${criteriaName}`;
        const command = new client_ssm_1.DeleteParameterCommand({
            Name: parameterName
        });
        await client.send(command);
        console.log(`✅ Criteria ${criteriaName} deleted from Parameter Store`);
        // Invalider le cache pour forcer un refresh
        this.invalidateCache();
    }
    /**
     * Récupère un critère spécifique
     */
    static async getCriteria(criteriaName) {
        var _a, _b;
        const client = this.getClient();
        const parameterName = `${this.PARAMETER_PATH}/${criteriaName}`;
        try {
            const command = new client_ssm_1.GetParameterCommand({
                Name: parameterName
            });
            const result = await client.send(command);
            if (!((_a = result.Parameter) === null || _a === void 0 ? void 0 : _a.Value)) {
                return null;
            }
            const value = JSON.parse(result.Parameter.Value);
            return {
                name: criteriaName,
                enabled: (_b = value.enabled) !== null && _b !== void 0 ? _b : false,
                description: value.description,
                businessJustification: value.businessJustification,
                addedDate: value.addedDate
            };
        }
        catch (error) {
            if (error.name === 'ParameterNotFound') {
                return null;
            }
            throw error;
        }
    }
    /**
     * Invalide le cache (force un refresh au prochain appel)
     */
    static invalidateCache() {
        this.cache = null;
        this.cacheTimestamp = 0;
        console.log('🗑️ Cache invalidated');
    }
    /**
     * Pré-charge le cache (warm-up)
     */
    static async warmUp() {
        console.log('🔥 Warming up criteria cache...');
        await this.refreshCache();
        console.log('✅ Cache warmed up successfully');
    }
    /**
     * Retourne les métriques du cache
     */
    static getMetrics() {
        var _a;
        return {
            ...this.metrics,
            cacheAge: Date.now() - this.cacheTimestamp,
            cacheSize: ((_a = this.cache) === null || _a === void 0 ? void 0 : _a.length) || 0
        };
    }
    /**
     * Réinitialise les métriques
     */
    static resetMetrics() {
        this.metrics = {
            hits: 0,
            misses: 0,
            lastRefreshDuration: 0,
            lastRefreshTimestamp: 0
        };
        console.log('📊 Metrics reset');
    }
}
exports.CriteriaParameterStore = CriteriaParameterStore;
CriteriaParameterStore.PARAMETER_PATH = '/decision-engine/criteria/secondary';
CriteriaParameterStore.DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
CriteriaParameterStore.STALE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (pour refresh async)
// Cache en mémoire
CriteriaParameterStore.cache = null;
CriteriaParameterStore.cacheTimestamp = 0;
CriteriaParameterStore.cacheTTL = CriteriaParameterStore.DEFAULT_CACHE_TTL;
// Métriques
CriteriaParameterStore.metrics = {
    hits: 0,
    misses: 0,
    lastRefreshDuration: 0,
    lastRefreshTimestamp: 0
};
// Flag pour éviter les refresh concurrents
CriteriaParameterStore.isRefreshing = false;
// Client SSM réutilisable
CriteriaParameterStore.ssmClient = null;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7O0dBUUc7OztBQUVILG9EQUE4STtBQWlCOUksTUFBYSxzQkFBc0I7SUF3QmpDOztPQUVHO0lBQ0ssTUFBTSxDQUFDLFNBQVM7UUFDdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3hCLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBVztRQUM1QixJQUFJLENBQUMsUUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLE9BQU8sR0FBRyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSCxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU87UUFDbEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1FBRTNDLG1DQUFtQztRQUNuQyxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMzQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxZQUFZ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O0FBQy9DLHNDQUFlLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxrQ0FBa0M7QUFFNUYsbUJBQW1CO0FBQ0osNEJBQUssR0FBcUMsSUFBSSxDQUFDO0FBQy9DLHFDQUFjLEdBQVcsQ0FBQyxDQUFDO0FBQzNCLCtCQUFRLEdBQVcsc0JBQXNCLENBQUMsaUJBQWlCLENBQUM7QUFFM0UsWUFBWTtBQUNHLDhCQUFPLEdBQWlCO0lBQ3JDLElBQUksRUFBRSxDQUFDO0lBQ1AsTUFBTSxFQUFFLENBQUM7SUFDVCxtQkFBbUIsRUFBRSxDQUFDO0lBQ3RCLG9CQUFvQixFQUFFLENBQUM7Q0FDeEIsQ0FBQztBQUVGLDJDQUEyQztBQUM1QixtQ0FBWSxHQUFZLEtBQUssQ0FBQztBQUU3QywwQkFBMEI7QUFDWCxnQ0FBUyxHQUFxQixJQUFJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogU2VydmljZSBkZSBnZXN0aW9uIGRlcyBjcml0w6hyZXMgc2Vjb25kYWlyZXMgdmlhIEFXUyBTeXN0ZW1zIE1hbmFnZXIgUGFyYW1ldGVyIFN0b3JlXHJcbiAqIFxyXG4gKiBGb25jdGlvbm5hbGl0w6lzIDpcclxuICogLSBDYWNoZSBlbiBtw6ltb2lyZSBhdmVjIFRUTCBjb25maWd1cmFibGVcclxuICogLSBXYXJtLXVwIGF1IGTDqW1hcnJhZ2UgcG91ciDDqXZpdGVyIGxhIGxhdGVuY2UgZHUgcHJlbWllciBhcHBlbFxyXG4gKiAtIFJlZnJlc2ggYXN5bmNocm9uZSBwb3VyIG1haW50ZW5pciBsZSBjYWNoZSDDoCBqb3VyIHNhbnMgYmxvcXVlclxyXG4gKiAtIE3DqXRyaXF1ZXMgZGUgcGVyZm9ybWFuY2UgcG91ciBtb25pdG9yaW5nXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJzQnlQYXRoQ29tbWFuZCwgUHV0UGFyYW1ldGVyQ29tbWFuZCwgRGVsZXRlUGFyYW1ldGVyQ29tbWFuZCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZyB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIGVuYWJsZWQ6IGJvb2xlYW47XHJcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XHJcbiAgYnVzaW5lc3NKdXN0aWZpY2F0aW9uPzogc3RyaW5nO1xyXG4gIGFkZGVkRGF0ZT86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIENhY2hlTWV0cmljcyB7XHJcbiAgaGl0czogbnVtYmVyO1xyXG4gIG1pc3NlczogbnVtYmVyO1xyXG4gIGxhc3RSZWZyZXNoRHVyYXRpb246IG51bWJlcjtcclxuICBsYXN0UmVmcmVzaFRpbWVzdGFtcDogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZSB7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUEFSQU1FVEVSX1BBVEggPSAnL2RlY2lzaW9uLWVuZ2luZS9jcml0ZXJpYS9zZWNvbmRhcnknO1xyXG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfQ0FDSEVfVFRMID0gNSAqIDYwICogMTAwMDsgLy8gNSBtaW51dGVzXHJcbiAgcHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1RBTEVfQ0FDSEVfVFRMID0gMTAgKiA2MCAqIDEwMDA7IC8vIDEwIG1pbnV0ZXMgKHBvdXIgcmVmcmVzaCBhc3luYylcclxuICBcclxuICAvLyBDYWNoZSBlbiBtw6ltb2lyZVxyXG4gIHByaXZhdGUgc3RhdGljIGNhY2hlOiBTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZ1tdIHwgbnVsbCA9IG51bGw7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgY2FjaGVUaW1lc3RhbXA6IG51bWJlciA9IDA7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgY2FjaGVUVEw6IG51bWJlciA9IENyaXRlcmlhUGFyYW1ldGVyU3RvcmUuREVGQVVMVF9DQUNIRV9UVEw7XHJcbiAgXHJcbiAgLy8gTcOpdHJpcXVlc1xyXG4gIHByaXZhdGUgc3RhdGljIG1ldHJpY3M6IENhY2hlTWV0cmljcyA9IHtcclxuICAgIGhpdHM6IDAsXHJcbiAgICBtaXNzZXM6IDAsXHJcbiAgICBsYXN0UmVmcmVzaER1cmF0aW9uOiAwLFxyXG4gICAgbGFzdFJlZnJlc2hUaW1lc3RhbXA6IDBcclxuICB9O1xyXG4gIFxyXG4gIC8vIEZsYWcgcG91ciDDqXZpdGVyIGxlcyByZWZyZXNoIGNvbmN1cnJlbnRzXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaXNSZWZyZXNoaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgXHJcbiAgLy8gQ2xpZW50IFNTTSByw6l1dGlsaXNhYmxlXHJcbiAgcHJpdmF0ZSBzdGF0aWMgc3NtQ2xpZW50OiBTU01DbGllbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgLyoqXHJcbiAgICogT2J0aWVudCBsZSBjbGllbnQgU1NNIChzaW5nbGV0b24pXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzdGF0aWMgZ2V0Q2xpZW50KCk6IFNTTUNsaWVudCB7XHJcbiAgICBpZiAoIXRoaXMuc3NtQ2xpZW50KSB7XHJcbiAgICAgIHRoaXMuc3NtQ2xpZW50ID0gbmV3IFNTTUNsaWVudCh7fSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5zc21DbGllbnQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDb25maWd1cmUgbGUgVFRMIGR1IGNhY2hlIChlbiBtaWxsaXNlY29uZGVzKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBzZXRDYWNoZVRUTCh0dGw6IG51bWJlcik6IHZvaWQge1xyXG4gICAgdGhpcy5jYWNoZVRUTCA9IHR0bDtcclxuICAgIGNvbnNvbGUubG9nKGDinIUgQ2FjaGUgVFRMIHNldCB0byAke3R0bH1tcyAoJHt0dGwgLyAxMDAwfXMpYCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGFyZ2UgdG91cyBsZXMgY3JpdMOocmVzIHNlY29uZGFpcmVzIGF2ZWMgY2FjaGUgaW50ZWxsaWdlbnRcclxuICAgKiBcclxuICAgKiBTdHJhdMOpZ2llIDpcclxuICAgKiAxLiBTaSBjYWNoZSB2YWxpZGUgKDwgVFRMKSA6IHJldG91ciBpbW3DqWRpYXRcclxuICAgKiAyLiBTaSBjYWNoZSBww6lyaW3DqSBtYWlzIHLDqWNlbnQgKDwgMipUVEwpIDogcmV0b3VyIGltbcOpZGlhdCArIHJlZnJlc2ggYXN5bmNcclxuICAgKiAzLiBTaSBjYWNoZSB0cm9wIHZpZXV4IG91IGFic2VudCA6IHJlZnJlc2ggc3luY2hyb25lXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIGxvYWRBbGwoKTogUHJvbWlzZTxTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZ1tdPiB7XHJcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gICAgY29uc3QgY2FjaGVBZ2UgPSBub3cgLSB0aGlzLmNhY2hlVGltZXN0YW1wO1xyXG5cclxuICAgIC8vIOKchSBDYWNoZSB2YWxpZGUgOiByZXRvdXIgaW1tw6lkaWF0XHJcbiAgICBpZiAodGhpcy5jYWNoZSAmJiBjYWNoZUFnZSA8IHRoaXMuY2FjaGVUVEwpIHtcclxuICAgICAgdGhpcy5tZXRyaWNzLmhpdHMrKztcclxuICAgICAgY29uc29sZS5sb2coYPCfk6YgQ2FjaGUgSElUIChhZ2U6ICR7TWF0aC5yb3VuZChjYWNoZUFnZSAvIDEwMDApfXMsIGhpdHM6ICR7dGhpcy5tZXRyaWNzLmhpdHN9KWApO1xyXG4gICAgICByZXR1cm4gdGhpcy5jYWNoZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyDinIUgQ2FjaGUgcMOpcmltw6kgbWFpcyByw6ljZW50IDogcmV0b3VyIGltbcOpZGlhdCArIHJlZnJlc2ggYXN5bmNcclxuICAgIGlmICh0aGlzLmNhY2hlICYmIGNhY2hlQWdlIDwgdGhpcy5TVEFMRV9DQUNIRV9UVEwpIHtcclxuICAgICAgdGhpcy5tZXRyaWNzLmhpdHMrKztcclxuICAgICAgY29uc29sZS5sb2coYPCfk6YgQ2FjaGUgSElUIChzdGFsZSwgYWdlOiAke01hdGgucm91bmQoY2FjaGVBZ2UgLyAxMDAwKX1zKSAtIHJlZnJlc2hpbmcgYXN5bmNgKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFJlZnJlc2ggZW4gYXJyacOocmUtcGxhbiBzYW5zIGJsb3F1ZXJcclxuICAgICAgdGhpcy5yZWZyZXNoQ2FjaGVBc3luYygpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHRoaXMuY2FjaGU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g4pqg77iPIENhY2hlIGFic2VudCBvdSB0cm9wIHZpZXV4IDogcmVmcmVzaCBzeW5jaHJvbmVcclxuICAgIHRoaXMubWV0cmljcy5taXNzZXMrKztcclxuICAgIGNvbnNvbGUubG9nKGDwn4yQIENhY2hlIE1JU1MgKGFnZTogJHtNYXRoLnJvdW5kKGNhY2hlQWdlIC8gMTAwMCl9cywgbWlzc2VzOiAke3RoaXMubWV0cmljcy5taXNzZXN9KWApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5yZWZyZXNoQ2FjaGUoKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJhZnJhw65jaGl0IGxlIGNhY2hlIGRlIG1hbmnDqHJlIHN5bmNocm9uZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgc3RhdGljIGFzeW5jIHJlZnJlc2hDYWNoZSgpOiBQcm9taXNlPFNlY29uZGFyeUNyaXRlcmlhQ29uZmlnW10+IHtcclxuICAgIC8vIMOJdml0ZXIgbGVzIHJlZnJlc2ggY29uY3VycmVudHNcclxuICAgIGlmICh0aGlzLmlzUmVmcmVzaGluZykge1xyXG4gICAgICBjb25zb2xlLmxvZygnW0NBQ0hFXSBSZWZyZXNoIGFscmVhZHkgaW4gcHJvZ3Jlc3MsIHdhaXRpbmcuLi4nKTtcclxuICAgICAgLy8gQXR0ZW5kcmUgdW4gcGV1IGV0IHJldG91cm5lciBsZSBjYWNoZSBhY3R1ZWwgc2kgZGlzcG9uaWJsZVxyXG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XHJcbiAgICAgIHJldHVybiB0aGlzLmNhY2hlIHx8IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuaXNSZWZyZXNoaW5nID0gdHJ1ZTtcclxuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc29sZS5sb2coJ1tDQUNIRV0gUmVmcmVzaGluZyBjcml0ZXJpYSBjYWNoZSBmcm9tIFBhcmFtZXRlciBTdG9yZS4uLicpO1xyXG4gICAgICBjb25zb2xlLmxvZygnW0NBQ0hFXSBQYXRoOicsIHRoaXMuUEFSQU1FVEVSX1BBVEgpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5nZXRDbGllbnQoKTtcclxuICAgICAgY29uc29sZS5sb2coJ1tDQUNIRV0gU1NNIENsaWVudCBjcmVhdGVkOicsICEhY2xpZW50KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyc0J5UGF0aENvbW1hbmQoe1xyXG4gICAgICAgIFBhdGg6IHRoaXMuUEFSQU1FVEVSX1BBVEgsXHJcbiAgICAgICAgUmVjdXJzaXZlOiB0cnVlLFxyXG4gICAgICAgIFdpdGhEZWNyeXB0aW9uOiBmYWxzZVxyXG4gICAgICB9KTtcclxuICAgICAgY29uc29sZS5sb2coJ1tDQUNIRV0gQ29tbWFuZCBjcmVhdGVkIHdpdGggaW5wdXQ6JywgSlNPTi5zdHJpbmdpZnkoY29tbWFuZC5pbnB1dCkpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coJ1tDQUNIRV0gU2VuZGluZyBjb21tYW5kIHRvIFNTTS4uLicpO1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjbGllbnQuc2VuZChjb21tYW5kKTtcclxuICAgICAgY29uc29sZS5sb2coJ1tDQUNIRV0gQ29tbWFuZCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZygnW0NBQ0hFXSBSYXcgcGFyYW1ldGVycyByZWNlaXZlZDonLCByZXN1bHQuUGFyYW1ldGVycz8ubGVuZ3RoIHx8IDApO1xyXG4gICAgICBjb25zb2xlLmxvZygnW0NBQ0hFXSBSZXN1bHQgc3RydWN0dXJlOicsIEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICBoYXNQYXJhbWV0ZXJzOiAhIXJlc3VsdC5QYXJhbWV0ZXJzLFxyXG4gICAgICAgIHBhcmFtZXRlcnNJc0FycmF5OiBBcnJheS5pc0FycmF5KHJlc3VsdC5QYXJhbWV0ZXJzKSxcclxuICAgICAgICBwYXJhbWV0ZXJzTGVuZ3RoOiByZXN1bHQuUGFyYW1ldGVycz8ubGVuZ3RoXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFBhcnNlciBsZXMgcGFyYW3DqHRyZXNcclxuICAgICAgY29uc3QgY3JpdGVyaWEgPSB0aGlzLnBhcnNlUGFyYW1ldGVycyhyZXN1bHQuUGFyYW1ldGVycyB8fCBbXSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZygnW0NBQ0hFXSBQYXJzZWQgY3JpdGVyaWE6JywgY3JpdGVyaWEubGVuZ3RoKTtcclxuICAgICAgY3JpdGVyaWEuZm9yRWFjaChjID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZygnW0NBQ0hFXSBDcml0ZXJpb246JywgYy5uYW1lLCAnZW5hYmxlZDonLCBjLmVuYWJsZWQpO1xyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIC8vIE1ldHRyZSDDoCBqb3VyIGxlIGNhY2hlXHJcbiAgICAgIHRoaXMuY2FjaGUgPSBjcml0ZXJpYTtcclxuICAgICAgdGhpcy5jYWNoZVRpbWVzdGFtcCA9IERhdGUubm93KCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBNw6l0cmlxdWVzXHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcclxuICAgICAgdGhpcy5tZXRyaWNzLmxhc3RSZWZyZXNoRHVyYXRpb24gPSBkdXJhdGlvbjtcclxuICAgICAgdGhpcy5tZXRyaWNzLmxhc3RSZWZyZXNoVGltZXN0YW1wID0gdGhpcy5jYWNoZVRpbWVzdGFtcDtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKCdbQ0FDSEVdIENhY2hlIHJlZnJlc2hlZDonLCBjcml0ZXJpYS5sZW5ndGgsICdjcml0ZXJpYSBsb2FkZWQgaW4nLCBkdXJhdGlvbiwgJ21zJyk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4gdGhpcy5jYWNoZTtcclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gRmFpbGVkIHRvIHJlZnJlc2ggY2FjaGUgZnJvbSBQYXJhbWV0ZXIgU3RvcmUnKTtcclxuICAgICAgY29uc29sZS5lcnJvcignW0VSUk9SXSBFcnJvciB0eXBlOicsIHR5cGVvZiBlcnJvcik7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gRXJyb3IgbmFtZTonLCBlcnJvcj8ubmFtZSk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gRXJyb3IgbWVzc2FnZTonLCBlcnJvcj8ubWVzc2FnZSk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gRXJyb3IgY29kZTonLCBlcnJvcj8uY29kZSk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gRXJyb3Igc3RhdHVzQ29kZTonLCBlcnJvcj8uJG1ldGFkYXRhPy5odHRwU3RhdHVzQ29kZSk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFUlJPUl0gRXJyb3Igc3RhY2s6JywgZXJyb3I/LnN0YWNrKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFNlcmlhbGlzZXIgbCdlcnJldXIgY29tcGzDqHRlXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgZXJyb3JEZXRhaWxzID0gSlNPTi5zdHJpbmdpZnkoZXJyb3IsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGVycm9yKSwgMik7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignW0VSUk9SXSBGdWxsIGVycm9yIGRldGFpbHM6JywgZXJyb3JEZXRhaWxzKTtcclxuICAgICAgfSBjYXRjaCAoc2VyaWFsaXplRXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdbRVJST1JdIENvdWxkIG5vdCBzZXJpYWxpemUgZXJyb3I6Jywgc2VyaWFsaXplRXJyb3IpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyBFbiBjYXMgZCdlcnJldXIsIHJldG91cm5lciBsZSBjYWNoZSBleGlzdGFudCBzaSBkaXNwb25pYmxlXHJcbiAgICAgIGlmICh0aGlzLmNhY2hlKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdbV0FSTl0gVXNpbmcgc3RhbGUgY2FjaGUgZHVlIHRvIHJlZnJlc2ggZXJyb3InKTtcclxuICAgICAgICByZXR1cm4gdGhpcy5jYWNoZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gU2lub24sIHJldG91cm5lciB1biB0YWJsZWF1IHZpZGVcclxuICAgICAgY29uc29sZS53YXJuKCdbV0FSTl0gTm8gY2FjaGUgYXZhaWxhYmxlLCByZXR1cm5pbmcgZW1wdHkgYXJyYXknKTtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICBcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHRoaXMuaXNSZWZyZXNoaW5nID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSYWZyYcOuY2hpdCBsZSBjYWNoZSBkZSBtYW5pw6hyZSBhc3luY2hyb25lIChub24tYmxvcXVhbnQpXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzdGF0aWMgcmVmcmVzaENhY2hlQXN5bmMoKTogdm9pZCB7XHJcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXRcclxuICAgIHRoaXMucmVmcmVzaENhY2hlKCkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgQXN5bmMgY2FjaGUgcmVmcmVzaCBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQYXJzZSBsZXMgcGFyYW3DqHRyZXMgU1NNIGVuIG9iamV0cyBTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZ1xyXG4gICAqL1xyXG4gIHByaXZhdGUgc3RhdGljIHBhcnNlUGFyYW1ldGVycyhwYXJhbWV0ZXJzOiBhbnlbXSk6IFNlY29uZGFyeUNyaXRlcmlhQ29uZmlnW10ge1xyXG4gICAgY29uc29sZS5sb2coJ1tQQVJTRV0gU3RhcnRpbmcgdG8gcGFyc2UnLCBwYXJhbWV0ZXJzLmxlbmd0aCwgJ3BhcmFtZXRlcnMnKTtcclxuICAgIFxyXG4gICAgY29uc3QgcGFyc2VkOiAoU2Vjb25kYXJ5Q3JpdGVyaWFDb25maWcgfCBudWxsKVtdID0gcGFyYW1ldGVycy5tYXAoKHBhcmFtLCBpbmRleCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbUEFSU0VdIFBhcmFtZXRlcicsIGluZGV4LCAnLSBOYW1lOicsIHBhcmFtLk5hbWUpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbUEFSU0VdIFBhcmFtZXRlcicsIGluZGV4LCAnLSBWYWx1ZTonLCBwYXJhbS5WYWx1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSBKU09OLnBhcnNlKHBhcmFtLlZhbHVlIHx8ICd7fScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEV4dHJhaXJlIGxlIG5vbSBkdSBjcml0w6hyZSBkZXB1aXMgbGUgY2hlbWluIGR1IHBhcmFtw6h0cmVcclxuICAgICAgICAvLyBFeDogL2RlY2lzaW9uLWVuZ2luZS9jcml0ZXJpYS9zZWNvbmRhcnkvVHlwZUNsaWVudCAtPiBUeXBlQ2xpZW50XHJcbiAgICAgICAgY29uc3QgbmFtZSA9IHBhcmFtLk5hbWU/LnNwbGl0KCcvJykucG9wKCkgfHwgJ3Vua25vd24nO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGNvbmZpZzogU2Vjb25kYXJ5Q3JpdGVyaWFDb25maWcgPSB7XHJcbiAgICAgICAgICBuYW1lLFxyXG4gICAgICAgICAgZW5hYmxlZDogdmFsdWUuZW5hYmxlZCA/PyBmYWxzZSxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiB2YWx1ZS5kZXNjcmlwdGlvbixcclxuICAgICAgICAgIGJ1c2luZXNzSnVzdGlmaWNhdGlvbjogdmFsdWUuYnVzaW5lc3NKdXN0aWZpY2F0aW9uLFxyXG4gICAgICAgICAgYWRkZWREYXRlOiB2YWx1ZS5hZGRlZERhdGVcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbUEFSU0VdIFBhcmFtZXRlcicsIGluZGV4LCAnLSBQYXJzZWQgc3VjY2Vzc2Z1bGx5OicsIG5hbWUpO1xyXG4gICAgICAgIHJldHVybiBjb25maWc7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdbUEFSU0VdIEZhaWxlZCB0byBwYXJzZSBwYXJhbWV0ZXInLCBwYXJhbS5OYW1lKTtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdbUEFSU0VdIFBhcnNlIGVycm9yOicsIGVycm9yPy5tZXNzYWdlKTtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGZpbHRlcmVkID0gcGFyc2VkLmZpbHRlcigoYyk6IGMgaXMgU2Vjb25kYXJ5Q3JpdGVyaWFDb25maWcgPT4gYyAhPT0gbnVsbCk7XHJcbiAgICBjb25zb2xlLmxvZygnW1BBUlNFXSBTdWNjZXNzZnVsbHkgcGFyc2VkJywgZmlsdGVyZWQubGVuZ3RoLCAnb3V0IG9mJywgcGFyYW1ldGVycy5sZW5ndGgsICdwYXJhbWV0ZXJzJyk7XHJcbiAgICBcclxuICAgIHJldHVybiBmaWx0ZXJlZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEFqb3V0ZSBvdSBtZXQgw6Agam91ciB1biBjcml0w6hyZSBzZWNvbmRhaXJlXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIHB1dENyaXRlcmlhKGNyaXRlcmlhOiBTZWNvbmRhcnlDcml0ZXJpYUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5nZXRDbGllbnQoKTtcclxuICAgIFxyXG4gICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9IGAke3RoaXMuUEFSQU1FVEVSX1BBVEh9LyR7Y3JpdGVyaWEubmFtZX1gO1xyXG4gICAgY29uc3QgcGFyYW1ldGVyVmFsdWUgPSBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgIGVuYWJsZWQ6IGNyaXRlcmlhLmVuYWJsZWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBjcml0ZXJpYS5kZXNjcmlwdGlvbixcclxuICAgICAgYnVzaW5lc3NKdXN0aWZpY2F0aW9uOiBjcml0ZXJpYS5idXNpbmVzc0p1c3RpZmljYXRpb24sXHJcbiAgICAgIGFkZGVkRGF0ZTogY3JpdGVyaWEuYWRkZWREYXRlIHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dFBhcmFtZXRlckNvbW1hbmQoe1xyXG4gICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxyXG4gICAgICBWYWx1ZTogcGFyYW1ldGVyVmFsdWUsXHJcbiAgICAgIFR5cGU6ICdTdHJpbmcnLFxyXG4gICAgICBPdmVyd3JpdGU6IHRydWUsXHJcbiAgICAgIERlc2NyaXB0aW9uOiBgU2Vjb25kYXJ5IGNyaXRlcmlhOiAke2NyaXRlcmlhLmRlc2NyaXB0aW9uIHx8IGNyaXRlcmlhLm5hbWV9YFxyXG4gICAgfSk7XHJcblxyXG4gICAgYXdhaXQgY2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICBjb25zb2xlLmxvZyhg4pyFIENyaXRlcmlhICR7Y3JpdGVyaWEubmFtZX0gc2F2ZWQgdG8gUGFyYW1ldGVyIFN0b3JlYCk7XHJcbiAgICBcclxuICAgIC8vIEludmFsaWRlciBsZSBjYWNoZSBwb3VyIGZvcmNlciB1biByZWZyZXNoXHJcbiAgICB0aGlzLmludmFsaWRhdGVDYWNoZSgpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3VwcHJpbWUgdW4gY3JpdMOocmUgc2Vjb25kYWlyZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3luYyBkZWxldGVDcml0ZXJpYShjcml0ZXJpYU5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5nZXRDbGllbnQoKTtcclxuICAgIFxyXG4gICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9IGAke3RoaXMuUEFSQU1FVEVSX1BBVEh9LyR7Y3JpdGVyaWFOYW1lfWA7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgRGVsZXRlUGFyYW1ldGVyQ29tbWFuZCh7XHJcbiAgICAgIE5hbWU6IHBhcmFtZXRlck5hbWVcclxuICAgIH0pO1xyXG5cclxuICAgIGF3YWl0IGNsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgY29uc29sZS5sb2coYOKchSBDcml0ZXJpYSAke2NyaXRlcmlhTmFtZX0gZGVsZXRlZCBmcm9tIFBhcmFtZXRlciBTdG9yZWApO1xyXG4gICAgXHJcbiAgICAvLyBJbnZhbGlkZXIgbGUgY2FjaGUgcG91ciBmb3JjZXIgdW4gcmVmcmVzaFxyXG4gICAgdGhpcy5pbnZhbGlkYXRlQ2FjaGUoKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFLDqWN1cMOocmUgdW4gY3JpdMOocmUgc3DDqWNpZmlxdWVcclxuICAgKi9cclxuICBzdGF0aWMgYXN5bmMgZ2V0Q3JpdGVyaWEoY3JpdGVyaWFOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNlY29uZGFyeUNyaXRlcmlhQ29uZmlnIHwgbnVsbD4ge1xyXG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5nZXRDbGllbnQoKTtcclxuICAgIFxyXG4gICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9IGAke3RoaXMuUEFSQU1FVEVSX1BBVEh9LyR7Y3JpdGVyaWFOYW1lfWA7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7XHJcbiAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFyZXN1bHQuUGFyYW1ldGVyPy5WYWx1ZSkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCB2YWx1ZSA9IEpTT04ucGFyc2UocmVzdWx0LlBhcmFtZXRlci5WYWx1ZSk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIG5hbWU6IGNyaXRlcmlhTmFtZSxcclxuICAgICAgICBlbmFibGVkOiB2YWx1ZS5lbmFibGVkID8/IGZhbHNlLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiB2YWx1ZS5kZXNjcmlwdGlvbixcclxuICAgICAgICBidXNpbmVzc0p1c3RpZmljYXRpb246IHZhbHVlLmJ1c2luZXNzSnVzdGlmaWNhdGlvbixcclxuICAgICAgICBhZGRlZERhdGU6IHZhbHVlLmFkZGVkRGF0ZVxyXG4gICAgICB9O1xyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdQYXJhbWV0ZXJOb3RGb3VuZCcpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEludmFsaWRlIGxlIGNhY2hlIChmb3JjZSB1biByZWZyZXNoIGF1IHByb2NoYWluIGFwcGVsKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBpbnZhbGlkYXRlQ2FjaGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLmNhY2hlID0gbnVsbDtcclxuICAgIHRoaXMuY2FjaGVUaW1lc3RhbXAgPSAwO1xyXG4gICAgY29uc29sZS5sb2coJ/Cfl5HvuI8gQ2FjaGUgaW52YWxpZGF0ZWQnKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFByw6ktY2hhcmdlIGxlIGNhY2hlICh3YXJtLXVwKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBhc3luYyB3YXJtVXAoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UpSBXYXJtaW5nIHVwIGNyaXRlcmlhIGNhY2hlLi4uJyk7XHJcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hDYWNoZSgpO1xyXG4gICAgY29uc29sZS5sb2coJ+KchSBDYWNoZSB3YXJtZWQgdXAgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXRvdXJuZSBsZXMgbcOpdHJpcXVlcyBkdSBjYWNoZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRNZXRyaWNzKCk6IENhY2hlTWV0cmljcyAmIHsgY2FjaGVBZ2U6IG51bWJlcjsgY2FjaGVTaXplOiBudW1iZXIgfSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAuLi50aGlzLm1ldHJpY3MsXHJcbiAgICAgIGNhY2hlQWdlOiBEYXRlLm5vdygpIC0gdGhpcy5jYWNoZVRpbWVzdGFtcCxcclxuICAgICAgY2FjaGVTaXplOiB0aGlzLmNhY2hlPy5sZW5ndGggfHwgMFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFLDqWluaXRpYWxpc2UgbGVzIG3DqXRyaXF1ZXNcclxuICAgKi9cclxuICBzdGF0aWMgcmVzZXRNZXRyaWNzKCk6IHZvaWQge1xyXG4gICAgdGhpcy5tZXRyaWNzID0ge1xyXG4gICAgICBoaXRzOiAwLFxyXG4gICAgICBtaXNzZXM6IDAsXHJcbiAgICAgIGxhc3RSZWZyZXNoRHVyYXRpb246IDAsXHJcbiAgICAgIGxhc3RSZWZyZXNoVGltZXN0YW1wOiAwXHJcbiAgICB9O1xyXG4gICAgY29uc29sZS5sb2coJ/Cfk4ogTWV0cmljcyByZXNldCcpO1xyXG4gIH1cclxufVxyXG4iXX0=