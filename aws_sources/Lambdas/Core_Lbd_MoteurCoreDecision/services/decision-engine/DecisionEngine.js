"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionEngine = void 0;
const HybridRuleRepositoryV3_1 = require("./HybridRuleRepositoryV3");
const RuleEvaluator_1 = require("./RuleEvaluator");
const ValidationUtils_1 = require("../../utils/decision-engine/ValidationUtils");
const LoggingUtils_1 = require("../../utils/decision-engine/LoggingUtils");
const HybridCriteriaManager_1 = require("./HybridCriteriaManager");
class DecisionEngine {
    constructor() {
        this.ruleRepository = new HybridRuleRepositoryV3_1.HybridRuleRepositoryV3();
        this.ruleEvaluator = new RuleEvaluator_1.RuleEvaluator();
    }
    /**
     * Filtre les attributs du contact pour ne garder que les critères actifs
     * (primaires + secondaires actifs dans Parameter Store)
     */
    async filterActiveAttributes(contactAttributes) {
        const activeCriteria = await HybridCriteriaManager_1.HybridCriteriaManager.getAllActiveCriteria();
        const filtered = {};
        for (const [key, value] of Object.entries(contactAttributes)) {
            if (activeCriteria.includes(key)) {
                filtered[key] = value;
            }
            else {
                console.log(`[FILTER] Ignoring inactive criterion: ${key}`);
            }
        }
        console.log(`[FILTER] Filtered attributes: ${Object.keys(filtered).length} active out of ${Object.keys(contactAttributes).length} total`);
        return filtered;
    }
    async processDecision(request) {
        const timestamp = new Date().toISOString();
        const logContext = {
            requestId: request.interactionId,
            interactionId: request.interactionId,
            timestamp
        };
        try {
            // Validate input request
            const validationResult = ValidationUtils_1.ValidationUtils.validateQualificationRequest(request);
            if (!validationResult.isValid) {
                LoggingUtils_1.LoggingUtils.logError(logContext, `Input validation failed: ${validationResult.error}`);
                return ValidationUtils_1.ValidationUtils.formatValidationError(validationResult.error, request.interactionId);
            }
            // Sanitize contact attributes
            const sanitizedAttributes = ValidationUtils_1.ValidationUtils.sanitizeContactAttributes(request.contactAttributes);
            // ✅ Filtrer les attributs pour ne garder que les critères actifs
            // Ceci garantit que seuls les critères activés dans Parameter Store sont utilisés pour l'évaluation
            const filteredAttributes = await this.filterActiveAttributes(sanitizedAttributes);
            // Log decision process start
            LoggingUtils_1.LoggingUtils.logDecisionStart(logContext, filteredAttributes);
            // Load optimized rules from database with enhanced error handling
            let rules;
            try {
                // Use hybrid loading based on contact attributes (utilise les attributs filtrés)
                rules = await this.ruleRepository.loadHybridOptimizedRules(filteredAttributes);
                LoggingUtils_1.LoggingUtils.logRulesLoaded(logContext, rules.length, rules);
                // Check for empty rule set
                if (rules.length === 0) {
                    const errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleBusinessLogicError('EMPTY_RULE_SET', {}, logContext);
                    return ValidationUtils_1.ErrorHandlingFramework.toErrorResponse(errorDetails, request.interactionId);
                }
            }
            catch (error) {
                const errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleDatabaseError(error, 'loadOptimizedRules', logContext);
                return ValidationUtils_1.ErrorHandlingFramework.toErrorResponse(errorDetails, request.interactionId);
            }
            // Evaluate rules against contact attributes with enhanced error handling
            let evaluationResult;
            try {
                // ✅ Utiliser les attributs filtrés pour l'évaluation
                evaluationResult = this.ruleEvaluator.evaluateRules(filteredAttributes, rules);
            }
            catch (error) {
                const errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleRuleProcessingError(error, 'evaluation', 'multiple_rules', logContext);
                return ValidationUtils_1.ErrorHandlingFramework.toErrorResponse(errorDetails, request.interactionId);
            }
            // Log elimination steps with enhanced tracking
            if (evaluationResult.eliminationTrace) {
                evaluationResult.eliminationTrace.forEach(step => {
                    LoggingUtils_1.LoggingUtils.logEliminationStep(logContext, step, evaluationResult.eliminatedRules);
                });
            }
            // Handle evaluation results with enhanced error handling
            if (evaluationResult.error) {
                let errorDetails;
                if (evaluationResult.error.includes('poids identiques')) {
                    // Extract rule IDs from error message for better error handling
                    const ruleIds = this.extractRuleIdsFromError(evaluationResult.error);
                    errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleBusinessLogicError('EQUAL_WEIGHTS', { ruleIds, weight: 'unknown' }, logContext);
                }
                else if (evaluationResult.error.includes('Aucune règle')) {
                    errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleBusinessLogicError('NO_MATCHING_RULES', { contactAttributes: sanitizedAttributes }, logContext);
                }
                else if (evaluationResult.error.includes('Segment de distribution')) {
                    const ruleId = this.extractRuleIdFromSegmentError(evaluationResult.error);
                    errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleBusinessLogicError('MISSING_DISTRIBUTION_SEGMENT', { ruleId }, logContext);
                }
                else {
                    errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleBusinessLogicError('UNKNOWN_BUSINESS_ERROR', { originalError: evaluationResult.error }, logContext);
                }
                LoggingUtils_1.LoggingUtils.logDecisionComplete(logContext, false, undefined, errorDetails.code);
                return ValidationUtils_1.ErrorHandlingFramework.toErrorResponse(errorDetails, request.interactionId);
            }
            if (evaluationResult.selectedRule) {
                LoggingUtils_1.LoggingUtils.logRuleSelected(logContext, evaluationResult.selectedRule, `Selected rule with highest weight: ${evaluationResult.selectedRule.weight}`, evaluationResult.eligibleRules);
                LoggingUtils_1.LoggingUtils.logDecisionComplete(logContext, true, evaluationResult.distributionSegment);
                return {
                    success: true,
                    distributionSegment: evaluationResult.distributionSegment,
                    selectedRuleId: evaluationResult.selectedRule.id,
                    libellé: evaluationResult.selectedRule.libellé, // Nouveau champ
                    priority: evaluationResult.selectedRule.priority, // Nouveau champ
                    timestamp,
                    requestId: request.interactionId,
                    eliminationTrace: evaluationResult.eliminationTrace || []
                };
            }
            // Handle case where no rule was selected (shouldn't happen if evaluation is correct)
            const errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleBusinessLogicError('NO_MATCHING_RULES', { contactAttributes: sanitizedAttributes }, logContext);
            LoggingUtils_1.LoggingUtils.logDecisionComplete(logContext, false, undefined, errorDetails.code);
            return ValidationUtils_1.ErrorHandlingFramework.toErrorResponse(errorDetails, request.interactionId);
        }
        catch (error) {
            // Handle unexpected errors with comprehensive error handling
            const errorDetails = ValidationUtils_1.ErrorHandlingFramework.handleInfrastructureError(error, 'DecisionEngine', logContext);
            LoggingUtils_1.LoggingUtils.logDecisionComplete(logContext, false, undefined, errorDetails.code);
            return ValidationUtils_1.ErrorHandlingFramework.toErrorResponse(errorDetails, request.interactionId);
        }
    }
    /**
     * Extracts rule IDs from equal weights error message
     */
    extractRuleIdsFromError(error) {
        // Extract rule IDs from error message like "Les règles rule1 et rule2 ont des poids identiques"
        const match = error.match(/Les règles (.+) ont des poids identiques/);
        if (match) {
            return match[1].split(' et ').map(id => id.trim());
        }
        return ['unknown'];
    }
    /**
     * Extracts rule ID from distribution segment error message
     */
    extractRuleIdFromSegmentError(error) {
        // Extract rule ID from error message like "Segment de distribution manquant pour la règle ruleId"
        const match = error.match(/pour la règle (\w+)/);
        return match ? match[1] : 'unknown';
    }
}
exports.DecisionEngine = DecisionEngine;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRGVjaXNpb25FbmdpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmljZXMvZGVjaXNpb24tZW5naW5lL0RlY2lzaW9uRW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFFQUFrRTtBQUNsRSxtREFBZ0Q7QUFDaEQsaUZBQXNHO0FBQ3RHLDJFQUFvRjtBQUNwRixtRUFBZ0U7QUFFaEUsTUFBYSxjQUFjO0lBSXpCO1FBQ0UsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLCtDQUFzQixFQUFFLENBQUM7UUFDbkQsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLDZCQUFhLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssS0FBSyxDQUFDLHNCQUFzQixDQUFDLGlCQUFzQztRQUN6RSxNQUFNLGNBQWMsR0FBRyxNQUFNLDZDQUFxQixDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDMUUsTUFBTSxRQUFRLEdBQXdCLEVBQUUsQ0FBQztRQUV6QyxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7WUFDN0QsSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDeEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDOUQsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sa0JBQWtCLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDO1FBQzFJLE9BQU8s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QTZCLENBQUMsS0FBYTtRQUNqRCxrR0FBa0c7UUFDbEcsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ2pELE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUN0QyxDQUFDO0NBQ0Y7QUEzTUQsd0NBMk1DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUXVhbGlmaWNhdGlvblJlcXVlc3QsIERlY2lzaW9uUmVzcG9uc2UsIFF1YWxpZmljYXRpb25SdWxlLCBFdmFsdWF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vdHlwZXMvZGVjaXNpb24tZW5naW5lJztcclxuaW1wb3J0IHsgSHlicmlkUnVsZVJlcG9zaXRvcnlWMyB9IGZyb20gJy4vSHlicmlkUnVsZVJlcG9zaXRvcnlWMyc7XHJcbmltcG9ydCB7IFJ1bGVFdmFsdWF0b3IgfSBmcm9tICcuL1J1bGVFdmFsdWF0b3InO1xyXG5pbXBvcnQgeyBWYWxpZGF0aW9uVXRpbHMsIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsgfSBmcm9tICcuLi8uLi91dGlscy9kZWNpc2lvbi1lbmdpbmUvVmFsaWRhdGlvblV0aWxzJztcclxuaW1wb3J0IHsgTG9nZ2luZ1V0aWxzLCBMb2dDb250ZXh0IH0gZnJvbSAnLi4vLi4vdXRpbHMvZGVjaXNpb24tZW5naW5lL0xvZ2dpbmdVdGlscyc7XHJcbmltcG9ydCB7IEh5YnJpZENyaXRlcmlhTWFuYWdlciB9IGZyb20gJy4vSHlicmlkQ3JpdGVyaWFNYW5hZ2VyJztcclxuXHJcbmV4cG9ydCBjbGFzcyBEZWNpc2lvbkVuZ2luZSB7XHJcbiAgcHJpdmF0ZSBydWxlUmVwb3NpdG9yeTogSHlicmlkUnVsZVJlcG9zaXRvcnlWMztcclxuICBwcml2YXRlIHJ1bGVFdmFsdWF0b3I6IFJ1bGVFdmFsdWF0b3I7XHJcblxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgdGhpcy5ydWxlUmVwb3NpdG9yeSA9IG5ldyBIeWJyaWRSdWxlUmVwb3NpdG9yeVYzKCk7XHJcbiAgICB0aGlzLnJ1bGVFdmFsdWF0b3IgPSBuZXcgUnVsZUV2YWx1YXRvcigpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmlsdHJlIGxlcyBhdHRyaWJ1dHMgZHUgY29udGFjdCBwb3VyIG5lIGdhcmRlciBxdWUgbGVzIGNyaXTDqHJlcyBhY3RpZnNcclxuICAgKiAocHJpbWFpcmVzICsgc2Vjb25kYWlyZXMgYWN0aWZzIGRhbnMgUGFyYW1ldGVyIFN0b3JlKVxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgZmlsdGVyQWN0aXZlQXR0cmlidXRlcyhjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8UmVjb3JkPHN0cmluZywgYW55Pj4ge1xyXG4gICAgY29uc3QgYWN0aXZlQ3JpdGVyaWEgPSBhd2FpdCBIeWJyaWRDcml0ZXJpYU1hbmFnZXIuZ2V0QWxsQWN0aXZlQ3JpdGVyaWEoKTtcclxuICAgIGNvbnN0IGZpbHRlcmVkOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XHJcbiAgICBcclxuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbnRhY3RBdHRyaWJ1dGVzKSkge1xyXG4gICAgICBpZiAoYWN0aXZlQ3JpdGVyaWEuaW5jbHVkZXMoa2V5KSkge1xyXG4gICAgICAgIGZpbHRlcmVkW2tleV0gPSB2YWx1ZTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgW0ZJTFRFUl0gSWdub3JpbmcgaW5hY3RpdmUgY3JpdGVyaW9uOiAke2tleX1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgW0ZJTFRFUl0gRmlsdGVyZWQgYXR0cmlidXRlczogJHtPYmplY3Qua2V5cyhmaWx0ZXJlZCkubGVuZ3RofSBhY3RpdmUgb3V0IG9mICR7T2JqZWN0LmtleXMoY29udGFjdEF0dHJpYnV0ZXMpLmxlbmd0aH0gdG90YWxgKTtcclxuICAgIHJldHVybiBmaWx0ZXJlZDtcclxuICB9XHJcblxyXG4gIGFzeW5jIHByb2Nlc3NEZWNpc2lvbihyZXF1ZXN0OiBRdWFsaWZpY2F0aW9uUmVxdWVzdCk6IFByb21pc2U8RGVjaXNpb25SZXNwb25zZT4ge1xyXG4gICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgY29uc3QgbG9nQ29udGV4dDogTG9nQ29udGV4dCA9IHtcclxuICAgICAgcmVxdWVzdElkOiByZXF1ZXN0LmludGVyYWN0aW9uSWQsXHJcbiAgICAgIGludGVyYWN0aW9uSWQ6IHJlcXVlc3QuaW50ZXJhY3Rpb25JZCxcclxuICAgICAgdGltZXN0YW1wXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFZhbGlkYXRlIGlucHV0IHJlcXVlc3RcclxuICAgICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IFZhbGlkYXRpb25VdGlscy52YWxpZGF0ZVF1YWxpZmljYXRpb25SZXF1ZXN0KHJlcXVlc3QpO1xyXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuaXNWYWxpZCkge1xyXG4gICAgICAgIExvZ2dpbmdVdGlscy5sb2dFcnJvcihsb2dDb250ZXh0LCBgSW5wdXQgdmFsaWRhdGlvbiBmYWlsZWQ6ICR7dmFsaWRhdGlvblJlc3VsdC5lcnJvcn1gKTtcclxuICAgICAgICByZXR1cm4gVmFsaWRhdGlvblV0aWxzLmZvcm1hdFZhbGlkYXRpb25FcnJvcih2YWxpZGF0aW9uUmVzdWx0LmVycm9yISwgcmVxdWVzdC5pbnRlcmFjdGlvbklkKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gU2FuaXRpemUgY29udGFjdCBhdHRyaWJ1dGVzXHJcbiAgICAgIGNvbnN0IHNhbml0aXplZEF0dHJpYnV0ZXMgPSBWYWxpZGF0aW9uVXRpbHMuc2FuaXRpemVDb250YWN0QXR0cmlidXRlcyhyZXF1ZXN0LmNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgICAgXHJcbiAgICAgIC8vIOKchSBGaWx0cmVyIGxlcyBhdHRyaWJ1dHMgcG91ciBuZSBnYXJkZXIgcXVlIGxlcyBjcml0w6hyZXMgYWN0aWZzXHJcbiAgICAgIC8vIENlY2kgZ2FyYW50aXQgcXVlIHNldWxzIGxlcyBjcml0w6hyZXMgYWN0aXbDqXMgZGFucyBQYXJhbWV0ZXIgU3RvcmUgc29udCB1dGlsaXPDqXMgcG91ciBsJ8OpdmFsdWF0aW9uXHJcbiAgICAgIGNvbnN0IGZpbHRlcmVkQXR0cmlidXRlcyA9IGF3YWl0IHRoaXMuZmlsdGVyQWN0aXZlQXR0cmlidXRlcyhzYW5pdGl6ZWRBdHRyaWJ1dGVzKTtcclxuICAgICAgXHJcbiAgICAgIC8vIExvZyBkZWNpc2lvbiBwcm9jZXNzIHN0YXJ0XHJcbiAgICAgIExvZ2dpbmdVdGlscy5sb2dEZWNpc2lvblN0YXJ0KGxvZ0NvbnRleHQsIGZpbHRlcmVkQXR0cmlidXRlcyk7XHJcblxyXG4gICAgICAvLyBMb2FkIG9wdGltaXplZCBydWxlcyBmcm9tIGRhdGFiYXNlIHdpdGggZW5oYW5jZWQgZXJyb3IgaGFuZGxpbmdcclxuICAgICAgbGV0IHJ1bGVzOiBRdWFsaWZpY2F0aW9uUnVsZVtdO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIFVzZSBoeWJyaWQgbG9hZGluZyBiYXNlZCBvbiBjb250YWN0IGF0dHJpYnV0ZXMgKHV0aWxpc2UgbGVzIGF0dHJpYnV0cyBmaWx0csOpcylcclxuICAgICAgICBydWxlcyA9IGF3YWl0IHRoaXMucnVsZVJlcG9zaXRvcnkubG9hZEh5YnJpZE9wdGltaXplZFJ1bGVzKGZpbHRlcmVkQXR0cmlidXRlcyk7XHJcbiAgICAgICAgTG9nZ2luZ1V0aWxzLmxvZ1J1bGVzTG9hZGVkKGxvZ0NvbnRleHQsIHJ1bGVzLmxlbmd0aCwgcnVsZXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGZvciBlbXB0eSBydWxlIHNldFxyXG4gICAgICAgIGlmIChydWxlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIGNvbnN0IGVycm9yRGV0YWlscyA9IEVycm9ySGFuZGxpbmdGcmFtZXdvcmsuaGFuZGxlQnVzaW5lc3NMb2dpY0Vycm9yKFxyXG4gICAgICAgICAgICAnRU1QVFlfUlVMRV9TRVQnLCBcclxuICAgICAgICAgICAge30sIFxyXG4gICAgICAgICAgICBsb2dDb250ZXh0XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgICAgcmV0dXJuIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsudG9FcnJvclJlc3BvbnNlKGVycm9yRGV0YWlscywgcmVxdWVzdC5pbnRlcmFjdGlvbklkKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgZXJyb3JEZXRhaWxzID0gRXJyb3JIYW5kbGluZ0ZyYW1ld29yay5oYW5kbGVEYXRhYmFzZUVycm9yKFxyXG4gICAgICAgICAgZXJyb3IgYXMgRXJyb3IsIFxyXG4gICAgICAgICAgJ2xvYWRPcHRpbWl6ZWRSdWxlcycsIFxyXG4gICAgICAgICAgbG9nQ29udGV4dFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsudG9FcnJvclJlc3BvbnNlKGVycm9yRGV0YWlscywgcmVxdWVzdC5pbnRlcmFjdGlvbklkKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gRXZhbHVhdGUgcnVsZXMgYWdhaW5zdCBjb250YWN0IGF0dHJpYnV0ZXMgd2l0aCBlbmhhbmNlZCBlcnJvciBoYW5kbGluZ1xyXG4gICAgICBsZXQgZXZhbHVhdGlvblJlc3VsdDogRXZhbHVhdGlvblJlc3VsdDtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICAvLyDinIUgVXRpbGlzZXIgbGVzIGF0dHJpYnV0cyBmaWx0csOpcyBwb3VyIGwnw6l2YWx1YXRpb25cclxuICAgICAgICBldmFsdWF0aW9uUmVzdWx0ID0gdGhpcy5ydWxlRXZhbHVhdG9yLmV2YWx1YXRlUnVsZXMoZmlsdGVyZWRBdHRyaWJ1dGVzLCBydWxlcyk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgZXJyb3JEZXRhaWxzID0gRXJyb3JIYW5kbGluZ0ZyYW1ld29yay5oYW5kbGVSdWxlUHJvY2Vzc2luZ0Vycm9yKFxyXG4gICAgICAgICAgZXJyb3IgYXMgRXJyb3IsIFxyXG4gICAgICAgICAgJ2V2YWx1YXRpb24nLCBcclxuICAgICAgICAgICdtdWx0aXBsZV9ydWxlcycsIFxyXG4gICAgICAgICAgbG9nQ29udGV4dFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsudG9FcnJvclJlc3BvbnNlKGVycm9yRGV0YWlscywgcmVxdWVzdC5pbnRlcmFjdGlvbklkKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gTG9nIGVsaW1pbmF0aW9uIHN0ZXBzIHdpdGggZW5oYW5jZWQgdHJhY2tpbmdcclxuICAgICAgaWYgKGV2YWx1YXRpb25SZXN1bHQuZWxpbWluYXRpb25UcmFjZSkge1xyXG4gICAgICAgIGV2YWx1YXRpb25SZXN1bHQuZWxpbWluYXRpb25UcmFjZS5mb3JFYWNoKHN0ZXAgPT4ge1xyXG4gICAgICAgICAgTG9nZ2luZ1V0aWxzLmxvZ0VsaW1pbmF0aW9uU3RlcChsb2dDb250ZXh0LCBzdGVwLCBldmFsdWF0aW9uUmVzdWx0LmVsaW1pbmF0ZWRSdWxlcyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEhhbmRsZSBldmFsdWF0aW9uIHJlc3VsdHMgd2l0aCBlbmhhbmNlZCBlcnJvciBoYW5kbGluZ1xyXG4gICAgICBpZiAoZXZhbHVhdGlvblJlc3VsdC5lcnJvcikge1xyXG4gICAgICAgIGxldCBlcnJvckRldGFpbHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGV2YWx1YXRpb25SZXN1bHQuZXJyb3IuaW5jbHVkZXMoJ3BvaWRzIGlkZW50aXF1ZXMnKSkge1xyXG4gICAgICAgICAgLy8gRXh0cmFjdCBydWxlIElEcyBmcm9tIGVycm9yIG1lc3NhZ2UgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZ1xyXG4gICAgICAgICAgY29uc3QgcnVsZUlkcyA9IHRoaXMuZXh0cmFjdFJ1bGVJZHNGcm9tRXJyb3IoZXZhbHVhdGlvblJlc3VsdC5lcnJvcik7XHJcbiAgICAgICAgICBlcnJvckRldGFpbHMgPSBFcnJvckhhbmRsaW5nRnJhbWV3b3JrLmhhbmRsZUJ1c2luZXNzTG9naWNFcnJvcihcclxuICAgICAgICAgICAgJ0VRVUFMX1dFSUdIVFMnLFxyXG4gICAgICAgICAgICB7IHJ1bGVJZHMsIHdlaWdodDogJ3Vua25vd24nIH0sXHJcbiAgICAgICAgICAgIGxvZ0NvbnRleHRcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChldmFsdWF0aW9uUmVzdWx0LmVycm9yLmluY2x1ZGVzKCdBdWN1bmUgcsOoZ2xlJykpIHtcclxuICAgICAgICAgIGVycm9yRGV0YWlscyA9IEVycm9ySGFuZGxpbmdGcmFtZXdvcmsuaGFuZGxlQnVzaW5lc3NMb2dpY0Vycm9yKFxyXG4gICAgICAgICAgICAnTk9fTUFUQ0hJTkdfUlVMRVMnLFxyXG4gICAgICAgICAgICB7IGNvbnRhY3RBdHRyaWJ1dGVzOiBzYW5pdGl6ZWRBdHRyaWJ1dGVzIH0sXHJcbiAgICAgICAgICAgIGxvZ0NvbnRleHRcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChldmFsdWF0aW9uUmVzdWx0LmVycm9yLmluY2x1ZGVzKCdTZWdtZW50IGRlIGRpc3RyaWJ1dGlvbicpKSB7XHJcbiAgICAgICAgICBjb25zdCBydWxlSWQgPSB0aGlzLmV4dHJhY3RSdWxlSWRGcm9tU2VnbWVudEVycm9yKGV2YWx1YXRpb25SZXN1bHQuZXJyb3IpO1xyXG4gICAgICAgICAgZXJyb3JEZXRhaWxzID0gRXJyb3JIYW5kbGluZ0ZyYW1ld29yay5oYW5kbGVCdXNpbmVzc0xvZ2ljRXJyb3IoXHJcbiAgICAgICAgICAgICdNSVNTSU5HX0RJU1RSSUJVVElPTl9TRUdNRU5UJyxcclxuICAgICAgICAgICAgeyBydWxlSWQgfSxcclxuICAgICAgICAgICAgbG9nQ29udGV4dFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZXJyb3JEZXRhaWxzID0gRXJyb3JIYW5kbGluZ0ZyYW1ld29yay5oYW5kbGVCdXNpbmVzc0xvZ2ljRXJyb3IoXHJcbiAgICAgICAgICAgICdVTktOT1dOX0JVU0lORVNTX0VSUk9SJyxcclxuICAgICAgICAgICAgeyBvcmlnaW5hbEVycm9yOiBldmFsdWF0aW9uUmVzdWx0LmVycm9yIH0sXHJcbiAgICAgICAgICAgIGxvZ0NvbnRleHRcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIExvZ2dpbmdVdGlscy5sb2dEZWNpc2lvbkNvbXBsZXRlKGxvZ0NvbnRleHQsIGZhbHNlLCB1bmRlZmluZWQsIGVycm9yRGV0YWlscy5jb2RlKTtcclxuICAgICAgICByZXR1cm4gRXJyb3JIYW5kbGluZ0ZyYW1ld29yay50b0Vycm9yUmVzcG9uc2UoZXJyb3JEZXRhaWxzLCByZXF1ZXN0LmludGVyYWN0aW9uSWQpO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZXZhbHVhdGlvblJlc3VsdC5zZWxlY3RlZFJ1bGUpIHtcclxuICAgICAgICBMb2dnaW5nVXRpbHMubG9nUnVsZVNlbGVjdGVkKFxyXG4gICAgICAgICAgbG9nQ29udGV4dCwgXHJcbiAgICAgICAgICBldmFsdWF0aW9uUmVzdWx0LnNlbGVjdGVkUnVsZSwgXHJcbiAgICAgICAgICBgU2VsZWN0ZWQgcnVsZSB3aXRoIGhpZ2hlc3Qgd2VpZ2h0OiAke2V2YWx1YXRpb25SZXN1bHQuc2VsZWN0ZWRSdWxlLndlaWdodH1gLFxyXG4gICAgICAgICAgZXZhbHVhdGlvblJlc3VsdC5lbGlnaWJsZVJ1bGVzXHJcbiAgICAgICAgKTtcclxuICAgICAgICBMb2dnaW5nVXRpbHMubG9nRGVjaXNpb25Db21wbGV0ZShsb2dDb250ZXh0LCB0cnVlLCBldmFsdWF0aW9uUmVzdWx0LmRpc3RyaWJ1dGlvblNlZ21lbnQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgZGlzdHJpYnV0aW9uU2VnbWVudDogZXZhbHVhdGlvblJlc3VsdC5kaXN0cmlidXRpb25TZWdtZW50LFxyXG4gICAgICAgICAgc2VsZWN0ZWRSdWxlSWQ6IGV2YWx1YXRpb25SZXN1bHQuc2VsZWN0ZWRSdWxlLmlkLFxyXG4gICAgICAgICAgbGliZWxsw6k6IGV2YWx1YXRpb25SZXN1bHQuc2VsZWN0ZWRSdWxlLmxpYmVsbMOpLCAgLy8gTm91dmVhdSBjaGFtcFxyXG4gICAgICAgICAgcHJpb3JpdHk6IGV2YWx1YXRpb25SZXN1bHQuc2VsZWN0ZWRSdWxlLnByaW9yaXR5LCAgLy8gTm91dmVhdSBjaGFtcFxyXG4gICAgICAgICAgdGltZXN0YW1wLFxyXG4gICAgICAgICAgcmVxdWVzdElkOiByZXF1ZXN0LmludGVyYWN0aW9uSWQsXHJcbiAgICAgICAgICBlbGltaW5hdGlvblRyYWNlOiBldmFsdWF0aW9uUmVzdWx0LmVsaW1pbmF0aW9uVHJhY2UgfHwgW11cclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyBIYW5kbGUgY2FzZSB3aGVyZSBubyBydWxlIHdhcyBzZWxlY3RlZCAoc2hvdWxkbid0IGhhcHBlbiBpZiBldmFsdWF0aW9uIGlzIGNvcnJlY3QpXHJcbiAgICAgIGNvbnN0IGVycm9yRGV0YWlscyA9IEVycm9ySGFuZGxpbmdGcmFtZXdvcmsuaGFuZGxlQnVzaW5lc3NMb2dpY0Vycm9yKFxyXG4gICAgICAgICdOT19NQVRDSElOR19SVUxFUycsXHJcbiAgICAgICAgeyBjb250YWN0QXR0cmlidXRlczogc2FuaXRpemVkQXR0cmlidXRlcyB9LFxyXG4gICAgICAgIGxvZ0NvbnRleHRcclxuICAgICAgKTtcclxuICAgICAgTG9nZ2luZ1V0aWxzLmxvZ0RlY2lzaW9uQ29tcGxldGUobG9nQ29udGV4dCwgZmFsc2UsIHVuZGVmaW5lZCwgZXJyb3JEZXRhaWxzLmNvZGUpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsudG9FcnJvclJlc3BvbnNlKGVycm9yRGV0YWlscywgcmVxdWVzdC5pbnRlcmFjdGlvbklkKTtcclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyBIYW5kbGUgdW5leHBlY3RlZCBlcnJvcnMgd2l0aCBjb21wcmVoZW5zaXZlIGVycm9yIGhhbmRsaW5nXHJcbiAgICAgIGNvbnN0IGVycm9yRGV0YWlscyA9IEVycm9ySGFuZGxpbmdGcmFtZXdvcmsuaGFuZGxlSW5mcmFzdHJ1Y3R1cmVFcnJvcihcclxuICAgICAgICBlcnJvciBhcyBFcnJvcixcclxuICAgICAgICAnRGVjaXNpb25FbmdpbmUnLFxyXG4gICAgICAgIGxvZ0NvbnRleHRcclxuICAgICAgKTtcclxuICAgICAgTG9nZ2luZ1V0aWxzLmxvZ0RlY2lzaW9uQ29tcGxldGUobG9nQ29udGV4dCwgZmFsc2UsIHVuZGVmaW5lZCwgZXJyb3JEZXRhaWxzLmNvZGUpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsudG9FcnJvclJlc3BvbnNlKGVycm9yRGV0YWlscywgcmVxdWVzdC5pbnRlcmFjdGlvbklkKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV4dHJhY3RzIHJ1bGUgSURzIGZyb20gZXF1YWwgd2VpZ2h0cyBlcnJvciBtZXNzYWdlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBleHRyYWN0UnVsZUlkc0Zyb21FcnJvcihlcnJvcjogc3RyaW5nKTogc3RyaW5nW10ge1xyXG4gICAgLy8gRXh0cmFjdCBydWxlIElEcyBmcm9tIGVycm9yIG1lc3NhZ2UgbGlrZSBcIkxlcyByw6hnbGVzIHJ1bGUxIGV0IHJ1bGUyIG9udCBkZXMgcG9pZHMgaWRlbnRpcXVlc1wiXHJcbiAgICBjb25zdCBtYXRjaCA9IGVycm9yLm1hdGNoKC9MZXMgcsOoZ2xlcyAoLispIG9udCBkZXMgcG9pZHMgaWRlbnRpcXVlcy8pO1xyXG4gICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgIHJldHVybiBtYXRjaFsxXS5zcGxpdCgnIGV0ICcpLm1hcChpZCA9PiBpZC50cmltKCkpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIFsndW5rbm93biddO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRXh0cmFjdHMgcnVsZSBJRCBmcm9tIGRpc3RyaWJ1dGlvbiBzZWdtZW50IGVycm9yIG1lc3NhZ2VcclxuICAgKi9cclxuICBwcml2YXRlIGV4dHJhY3RSdWxlSWRGcm9tU2VnbWVudEVycm9yKGVycm9yOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgLy8gRXh0cmFjdCBydWxlIElEIGZyb20gZXJyb3IgbWVzc2FnZSBsaWtlIFwiU2VnbWVudCBkZSBkaXN0cmlidXRpb24gbWFucXVhbnQgcG91ciBsYSByw6hnbGUgcnVsZUlkXCJcclxuICAgIGNvbnN0IG1hdGNoID0gZXJyb3IubWF0Y2goL3BvdXIgbGEgcsOoZ2xlIChcXHcrKS8pO1xyXG4gICAgcmV0dXJuIG1hdGNoID8gbWF0Y2hbMV0gOiAndW5rbm93bic7XHJcbiAgfVxyXG59Il19