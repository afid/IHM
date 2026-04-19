"use strict";
/**
 * Lambda Function pour gérer les critères secondaires via API
 * Endpoint: POST /admin/criteria
 *
 * Actions supportées :
 * - list: Liste tous les critères (primaires + secondaires)
 * - get: Récupère un critère spécifique
 * - add: Ajoute un nouveau critère secondaire
 * - update: Met à jour un critère secondaire existant
 * - delete: Supprime un critère secondaire
 * - toggle: Active/désactive un critère secondaire
 * - stats: Retourne les statistiques des critères
 * - invalidate-cache: Force le refresh du cache
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const HybridCriteriaManager_1 = require("../../services/decision-engine/HybridCriteriaManager");
const GSIManager_1 = require("../../services/decision-engine/GSIManager");
const CriteriaParameterStore_1 = require("../../services/decision-engine/CriteriaParameterStore");
const handler = async (event) => {
    console.log('🔧 Admin API - Gestion des critères secondaires');
    // Handle preflight OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
                'Access-Control-Max-Age': '86400'
            },
            body: ''
        };
    }
    try {
        // Parse request body
        const request = event.body ? JSON.parse(event.body) : {};
        const { action } = request;
        console.log(`📋 Action: ${action}`);
        let result;
        switch (action) {
            // ========== LIST - Liste tous les critères ==========
            case 'list':
                result = await HybridCriteriaManager_1.HybridCriteriaManager.getFullConfiguration();
                break;
            // ========== GET - Récupère un critère spécifique ==========
            case 'get':
                if (!request.criteriaName) {
                    throw new Error('criteriaName is required for get action');
                }
                result = await CriteriaParameterStore_1.CriteriaParameterStore.getCriteria(request.criteriaName);
                if (!result) {
                    return {
                        statusCode: 404,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: `Criteria ${request.criteriaName} not found`,
                            timestamp: new Date().toISOString()
                        })
                    };
                }
                break;
            // ========== ADD - Ajoute un nouveau critère secondaire ==========
            case 'add':
                if (!request.name || !request.description) {
                    throw new Error('name and description are required for add action');
                }
                result = await HybridCriteriaManager_1.HybridCriteriaManager.addSecondaryCriteria(request.name, request.description, request.businessJustification || '');
                break;
            // ========== UPDATE - Met à jour un critère secondaire ==========
            case 'update':
                if (!request.criteriaName) {
                    throw new Error('criteriaName is required for update action');
                }
                // Récupérer le critère existant
                const existingCriteria = await CriteriaParameterStore_1.CriteriaParameterStore.getCriteria(request.criteriaName);
                if (!existingCriteria) {
                    return {
                        statusCode: 404,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({
                            success: false,
                            error: `Criteria ${request.criteriaName} not found`,
                            timestamp: new Date().toISOString()
                        })
                    };
                }
                // Mettre à jour les champs fournis
                const updatedCriteria = {
                    ...existingCriteria,
                    enabled: request.enabled !== undefined ? request.enabled : existingCriteria.enabled,
                    description: request.description || existingCriteria.description,
                    businessJustification: request.businessJustification || existingCriteria.businessJustification
                };
                await CriteriaParameterStore_1.CriteriaParameterStore.putCriteria(updatedCriteria);
                result = updatedCriteria;
                break;
            // ========== DELETE - Supprime un critère secondaire ==========
            case 'delete':
                if (!request.criteriaName) {
                    throw new Error('criteriaName is required for delete action');
                }
                result = await HybridCriteriaManager_1.HybridCriteriaManager.deleteSecondaryCriteria(request.criteriaName);
                break;
            // ========== TOGGLE - Active/désactive un critère secondaire ==========
            case 'toggle':
                if (!request.criteriaName || request.enabled === undefined) {
                    throw new Error('criteriaName and enabled are required for toggle action');
                }
                result = await HybridCriteriaManager_1.HybridCriteriaManager.toggleSecondaryCriteria(request.criteriaName, request.enabled);
                break;
            // ========== STATS - Retourne les statistiques ==========
            case 'stats':
                result = {
                    criteria: await HybridCriteriaManager_1.HybridCriteriaManager.getCriteriaStats(),
                    gsi: GSIManager_1.GSIManager.getGSIStats(),
                    cache: CriteriaParameterStore_1.CriteriaParameterStore.getMetrics()
                };
                break;
            // ========== INVALIDATE-CACHE - Force le refresh du cache ==========
            case 'invalidate-cache':
                HybridCriteriaManager_1.HybridCriteriaManager.invalidateCache();
                result = { message: 'Cache invalidated successfully' };
                break;
            default:
                throw new Error(`Action non supportée: ${action}`);
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            })
        };
    }
    catch (error) {
        console.error('❌ Erreur dans criteria-management:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: (error === null || error === void 0 ? void 0 : error.message) || 'Erreur inconnue',
                timestamp: new Date().toISOString()
            })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JpdGVyaWEtbWFuYWdlbWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9mdW5jdGlvbnMvYWRtaW4vY3JpdGVyaWEtbWFuYWdlbWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7R0FhRzs7O0FBR0gsZ0dBQTZGO0FBQzdGLDBFQUF1RTtBQUN2RSxrR0FBK0Y7QUFXeEYsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQTJCLEVBQWtDLEVBQUU7SUFDM0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO0lBRS9ELDZDQUE2QztJQUM3QyxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDbkMsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLDZCQUE2QixFQUFFLEdBQUc7Z0JBQ2xDLDhCQUE4QixFQUFFLDZCQUE2QjtnQkFDN0QsOEJBQThCLEVBQUUsa0JBQWtCO2dCQUNsRCx3QkFBd0IsRUFBRSxPQUFPO2FBQ2xDO1lBQ0QsSUFBSSxFQUFFLEVBQUU7U0FDVCxDQUFDO0lBQ0osQ0FBQztJQUVELElBQUksQ0FBQztRQUNILHFCQUFxQjtRQUNyQixNQUFNLE9BQU8sR0FBb0IsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUMxRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDO1FBRTNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRXBDLElBQUksTUFBVyxDQUFDO1FBRWhCLFFBQVEsTUFBTSxFQUFFLENBQUM7WUFDZix1REFBdUQ7WUFDdkQsS0FBSyxNQUFNO2dCQUNULE1BQU0sR0FBRyxNQUFNLDZDQUFxQixDQUFDLG9C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Q0FBQyxTQUFTLENBQUM7Z0JBQ25CLE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRSxNQUFNO2dCQUNaLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTthQUNwQyxDQUFDO1NBQ0gsQ0FBQztJQUVKLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFM0QsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLENBQUEsS0FBSyxhQUFMLEtBQUssdUJBQUwsS0FBSyxDQUFFLE9BQU8sS0FBSSxpQkFBaUI7Z0JBQzFDLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTthQUNwQyxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF4S1csUUFBQSxPQUFPLFdBd0tsQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBMYW1iZGEgRnVuY3Rpb24gcG91ciBnw6lyZXIgbGVzIGNyaXTDqHJlcyBzZWNvbmRhaXJlcyB2aWEgQVBJXHJcbiAqIEVuZHBvaW50OiBQT1NUIC9hZG1pbi9jcml0ZXJpYVxyXG4gKiBcclxuICogQWN0aW9ucyBzdXBwb3J0w6llcyA6XHJcbiAqIC0gbGlzdDogTGlzdGUgdG91cyBsZXMgY3JpdMOocmVzIChwcmltYWlyZXMgKyBzZWNvbmRhaXJlcylcclxuICogLSBnZXQ6IFLDqWN1cMOocmUgdW4gY3JpdMOocmUgc3DDqWNpZmlxdWVcclxuICogLSBhZGQ6IEFqb3V0ZSB1biBub3V2ZWF1IGNyaXTDqHJlIHNlY29uZGFpcmVcclxuICogLSB1cGRhdGU6IE1ldCDDoCBqb3VyIHVuIGNyaXTDqHJlIHNlY29uZGFpcmUgZXhpc3RhbnRcclxuICogLSBkZWxldGU6IFN1cHByaW1lIHVuIGNyaXTDqHJlIHNlY29uZGFpcmVcclxuICogLSB0b2dnbGU6IEFjdGl2ZS9kw6lzYWN0aXZlIHVuIGNyaXTDqHJlIHNlY29uZGFpcmVcclxuICogLSBzdGF0czogUmV0b3VybmUgbGVzIHN0YXRpc3RpcXVlcyBkZXMgY3JpdMOocmVzXHJcbiAqIC0gaW52YWxpZGF0ZS1jYWNoZTogRm9yY2UgbGUgcmVmcmVzaCBkdSBjYWNoZVxyXG4gKi9cclxuXHJcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgSHlicmlkQ3JpdGVyaWFNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZGVjaXNpb24tZW5naW5lL0h5YnJpZENyaXRlcmlhTWFuYWdlcic7XHJcbmltcG9ydCB7IEdTSU1hbmFnZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvR1NJTWFuYWdlcic7XHJcbmltcG9ydCB7IENyaXRlcmlhUGFyYW1ldGVyU3RvcmUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZSc7XHJcblxyXG5pbnRlcmZhY2UgQ3JpdGVyaWFSZXF1ZXN0IHtcclxuICBhY3Rpb246ICdsaXN0JyB8ICdnZXQnIHwgJ2FkZCcgfCAndXBkYXRlJyB8ICdkZWxldGUnIHwgJ3RvZ2dsZScgfCAnc3RhdHMnIHwgJ2ludmFsaWRhdGUtY2FjaGUnO1xyXG4gIGNyaXRlcmlhTmFtZT86IHN0cmluZztcclxuICBuYW1lPzogc3RyaW5nO1xyXG4gIGVuYWJsZWQ/OiBib29sZWFuO1xyXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xyXG4gIGJ1c2luZXNzSnVzdGlmaWNhdGlvbj86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+UpyBBZG1pbiBBUEkgLSBHZXN0aW9uIGRlcyBjcml0w6hyZXMgc2Vjb25kYWlyZXMnKTtcclxuICBcclxuICAvLyBIYW5kbGUgcHJlZmxpZ2h0IE9QVElPTlMgcmVxdWVzdHMgZm9yIENPUlNcclxuICBpZiAoZXZlbnQuaHR0cE1ldGhvZCA9PT0gJ09QVElPTlMnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSwgQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnT1BUSU9OUyxQT1NULEdFVCcsXHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLU1heC1BZ2UnOiAnODY0MDAnXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6ICcnXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxyXG4gICAgY29uc3QgcmVxdWVzdDogQ3JpdGVyaWFSZXF1ZXN0ID0gZXZlbnQuYm9keSA/IEpTT04ucGFyc2UoZXZlbnQuYm9keSkgOiB7fTtcclxuICAgIGNvbnN0IHsgYWN0aW9uIH0gPSByZXF1ZXN0O1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5OLIEFjdGlvbjogJHthY3Rpb259YCk7XHJcblxyXG4gICAgbGV0IHJlc3VsdDogYW55O1xyXG5cclxuICAgIHN3aXRjaCAoYWN0aW9uKSB7XHJcbiAgICAgIC8vID09PT09PT09PT0gTElTVCAtIExpc3RlIHRvdXMgbGVzIGNyaXTDqHJlcyA9PT09PT09PT09XHJcbiAgICAgIGNhc2UgJ2xpc3QnOlxyXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IEh5YnJpZENyaXRlcmlhTWFuYWdlci5nZXRGdWxsQ29uZmlndXJhdGlvbigpO1xyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgLy8gPT09PT09PT09PSBHRVQgLSBSw6ljdXDDqHJlIHVuIGNyaXTDqHJlIHNww6ljaWZpcXVlID09PT09PT09PT1cclxuICAgICAgY2FzZSAnZ2V0JzpcclxuICAgICAgICBpZiAoIXJlcXVlc3QuY3JpdGVyaWFOYW1lKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NyaXRlcmlhTmFtZSBpcyByZXF1aXJlZCBmb3IgZ2V0IGFjdGlvbicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXN1bHQgPSBhd2FpdCBDcml0ZXJpYVBhcmFtZXRlclN0b3JlLmdldENyaXRlcmlhKHJlcXVlc3QuY3JpdGVyaWFOYW1lKTtcclxuICAgICAgICBpZiAoIXJlc3VsdCkge1xyXG4gICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxyXG4gICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgICAgICBlcnJvcjogYENyaXRlcmlhICR7cmVxdWVzdC5jcml0ZXJpYU5hbWV9IG5vdCBmb3VuZGAsXHJcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgLy8gPT09PT09PT09PSBBREQgLSBBam91dGUgdW4gbm91dmVhdSBjcml0w6hyZSBzZWNvbmRhaXJlID09PT09PT09PT1cclxuICAgICAgY2FzZSAnYWRkJzpcclxuICAgICAgICBpZiAoIXJlcXVlc3QubmFtZSB8fCAhcmVxdWVzdC5kZXNjcmlwdGlvbikge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCduYW1lIGFuZCBkZXNjcmlwdGlvbiBhcmUgcmVxdWlyZWQgZm9yIGFkZCBhY3Rpb24nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgSHlicmlkQ3JpdGVyaWFNYW5hZ2VyLmFkZFNlY29uZGFyeUNyaXRlcmlhKFxyXG4gICAgICAgICAgcmVxdWVzdC5uYW1lLFxyXG4gICAgICAgICAgcmVxdWVzdC5kZXNjcmlwdGlvbixcclxuICAgICAgICAgIHJlcXVlc3QuYnVzaW5lc3NKdXN0aWZpY2F0aW9uIHx8ICcnXHJcbiAgICAgICAgKTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIC8vID09PT09PT09PT0gVVBEQVRFIC0gTWV0IMOgIGpvdXIgdW4gY3JpdMOocmUgc2Vjb25kYWlyZSA9PT09PT09PT09XHJcbiAgICAgIGNhc2UgJ3VwZGF0ZSc6XHJcbiAgICAgICAgaWYgKCFyZXF1ZXN0LmNyaXRlcmlhTmFtZSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjcml0ZXJpYU5hbWUgaXMgcmVxdWlyZWQgZm9yIHVwZGF0ZSBhY3Rpb24nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUsOpY3Vww6lyZXIgbGUgY3JpdMOocmUgZXhpc3RhbnRcclxuICAgICAgICBjb25zdCBleGlzdGluZ0NyaXRlcmlhID0gYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5nZXRDcml0ZXJpYShyZXF1ZXN0LmNyaXRlcmlhTmFtZSk7XHJcbiAgICAgICAgaWYgKCFleGlzdGluZ0NyaXRlcmlhKSB7XHJcbiAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKidcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgICAgIGVycm9yOiBgQ3JpdGVyaWEgJHtyZXF1ZXN0LmNyaXRlcmlhTmFtZX0gbm90IGZvdW5kYCxcclxuICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1ldHRyZSDDoCBqb3VyIGxlcyBjaGFtcHMgZm91cm5pc1xyXG4gICAgICAgIGNvbnN0IHVwZGF0ZWRDcml0ZXJpYSA9IHtcclxuICAgICAgICAgIC4uLmV4aXN0aW5nQ3JpdGVyaWEsXHJcbiAgICAgICAgICBlbmFibGVkOiByZXF1ZXN0LmVuYWJsZWQgIT09IHVuZGVmaW5lZCA/IHJlcXVlc3QuZW5hYmxlZCA6IGV4aXN0aW5nQ3JpdGVyaWEuZW5hYmxlZCxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiByZXF1ZXN0LmRlc2NyaXB0aW9uIHx8IGV4aXN0aW5nQ3JpdGVyaWEuZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICBidXNpbmVzc0p1c3RpZmljYXRpb246IHJlcXVlc3QuYnVzaW5lc3NKdXN0aWZpY2F0aW9uIHx8IGV4aXN0aW5nQ3JpdGVyaWEuYnVzaW5lc3NKdXN0aWZpY2F0aW9uXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgYXdhaXQgQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5wdXRDcml0ZXJpYSh1cGRhdGVkQ3JpdGVyaWEpO1xyXG4gICAgICAgIHJlc3VsdCA9IHVwZGF0ZWRDcml0ZXJpYTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIC8vID09PT09PT09PT0gREVMRVRFIC0gU3VwcHJpbWUgdW4gY3JpdMOocmUgc2Vjb25kYWlyZSA9PT09PT09PT09XHJcbiAgICAgIGNhc2UgJ2RlbGV0ZSc6XHJcbiAgICAgICAgaWYgKCFyZXF1ZXN0LmNyaXRlcmlhTmFtZSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjcml0ZXJpYU5hbWUgaXMgcmVxdWlyZWQgZm9yIGRlbGV0ZSBhY3Rpb24nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgSHlicmlkQ3JpdGVyaWFNYW5hZ2VyLmRlbGV0ZVNlY29uZGFyeUNyaXRlcmlhKHJlcXVlc3QuY3JpdGVyaWFOYW1lKTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIC8vID09PT09PT09PT0gVE9HR0xFIC0gQWN0aXZlL2TDqXNhY3RpdmUgdW4gY3JpdMOocmUgc2Vjb25kYWlyZSA9PT09PT09PT09XHJcbiAgICAgIGNhc2UgJ3RvZ2dsZSc6XHJcbiAgICAgICAgaWYgKCFyZXF1ZXN0LmNyaXRlcmlhTmFtZSB8fCByZXF1ZXN0LmVuYWJsZWQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjcml0ZXJpYU5hbWUgYW5kIGVuYWJsZWQgYXJlIHJlcXVpcmVkIGZvciB0b2dnbGUgYWN0aW9uJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IEh5YnJpZENyaXRlcmlhTWFuYWdlci50b2dnbGVTZWNvbmRhcnlDcml0ZXJpYShcclxuICAgICAgICAgIHJlcXVlc3QuY3JpdGVyaWFOYW1lLFxyXG4gICAgICAgICAgcmVxdWVzdC5lbmFibGVkXHJcbiAgICAgICAgKTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIC8vID09PT09PT09PT0gU1RBVFMgLSBSZXRvdXJuZSBsZXMgc3RhdGlzdGlxdWVzID09PT09PT09PT1cclxuICAgICAgY2FzZSAnc3RhdHMnOlxyXG4gICAgICAgIHJlc3VsdCA9IHtcclxuICAgICAgICAgIGNyaXRlcmlhOiBhd2FpdCBIeWJyaWRDcml0ZXJpYU1hbmFnZXIuZ2V0Q3JpdGVyaWFTdGF0cygpLFxyXG4gICAgICAgICAgZ3NpOiBHU0lNYW5hZ2VyLmdldEdTSVN0YXRzKCksXHJcbiAgICAgICAgICBjYWNoZTogQ3JpdGVyaWFQYXJhbWV0ZXJTdG9yZS5nZXRNZXRyaWNzKClcclxuICAgICAgICB9O1xyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgLy8gPT09PT09PT09PSBJTlZBTElEQVRFLUNBQ0hFIC0gRm9yY2UgbGUgcmVmcmVzaCBkdSBjYWNoZSA9PT09PT09PT09XHJcbiAgICAgIGNhc2UgJ2ludmFsaWRhdGUtY2FjaGUnOlxyXG4gICAgICAgIEh5YnJpZENyaXRlcmlhTWFuYWdlci5pbnZhbGlkYXRlQ2FjaGUoKTtcclxuICAgICAgICByZXN1bHQgPSB7IG1lc3NhZ2U6ICdDYWNoZSBpbnZhbGlkYXRlZCBzdWNjZXNzZnVsbHknIH07XHJcbiAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQWN0aW9uIG5vbiBzdXBwb3J0w6llOiAke2FjdGlvbn1gKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKidcclxuICAgICAgfSxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgZGF0YTogcmVzdWx0LFxyXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgIH0pXHJcbiAgICB9O1xyXG5cclxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyZXVyIGRhbnMgY3JpdGVyaWEtbWFuYWdlbWVudDonLCBlcnJvcik7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzQ29kZTogNTAwLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgfHwgJ0VycmV1ciBpbmNvbm51ZScsXHJcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgfSlcclxuICAgIH07XHJcbiAgfVxyXG59O1xyXG4iXX0=