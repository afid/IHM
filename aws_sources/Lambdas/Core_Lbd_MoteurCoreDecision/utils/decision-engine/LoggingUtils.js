"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingUtils = void 0;
class LoggingUtils {
    /**
     * Creates a new audit trail for a decision process
     * Requirements: 5.5 - Include timestamps and unique request identifiers
     */
    static createAuditTrail(context, contactAttributes) {
        const auditTrail = {
            requestId: context.requestId,
            interactionId: context.interactionId,
            startTime: context.timestamp,
            inputAttributes: contactAttributes,
            rulesLoaded: 0,
            eliminationSteps: [],
            eliminatedRules: [],
            success: false
        };
        this.auditTrails.set(context.requestId, auditTrail);
        console.log(JSON.stringify({
            level: 'INFO',
            message: 'Audit trail created',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            auditTrailId: context.requestId
        }));
    }
    /**
     * Logs the start of decision process with comprehensive input tracking
     * Requirements: 5.1 - Log input criteria and selected rule
     */
    static logDecisionStart(context, contactAttributes) {
        this.createAuditTrail(context, contactAttributes);
        console.log(JSON.stringify({
            level: 'INFO',
            message: 'Decision process started',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            contactAttributes,
            attributeCount: Object.keys(contactAttributes).length,
            attributeKeys: Object.keys(contactAttributes)
        }));
    }
    /**
     * Logs rules loaded from database with detailed information
     * Requirements: 5.1 - Log the input criteria and selected rule
     */
    static logRulesLoaded(context, ruleCount, rules) {
        const auditTrail = this.auditTrails.get(context.requestId);
        if (auditTrail) {
            auditTrail.rulesLoaded = ruleCount;
        }
        const logData = {
            level: 'INFO',
            message: 'Rules loaded from database',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            ruleCount
        };
        // Add rule summary for audit purposes
        if (rules && rules.length > 0) {
            logData.ruleSummary = rules.map(rule => ({
                id: rule.id,
                name: rule.name,
                weight: rule.weight,
                distributionSegment: rule.distributionSegment
            }));
            logData.weightRange = {
                min: Math.min(...rules.map(r => r.weight)),
                max: Math.max(...rules.map(r => r.weight))
            };
        }
        console.log(JSON.stringify(logData));
    }
    /**
     * Logs each elimination step with detailed tracking
     * Requirements: 5.2 - Record which rules were eliminated and why
     */
    static logEliminationStep(context, step, eliminatedRules) {
        const auditTrail = this.auditTrails.get(context.requestId);
        if (auditTrail) {
            auditTrail.eliminationSteps.push(step);
            if (eliminatedRules) {
                auditTrail.eliminatedRules.push(...eliminatedRules);
            }
        }
        const logData = {
            level: 'INFO',
            message: 'Rule elimination step executed',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            eliminationStep: step,
            progressSummary: {
                remainingRules: step.remainingRules,
                eliminatedInStep: step.eliminatedCount,
                totalProcessed: step.remainingRules + step.eliminatedCount
            }
        };
        // Add details about eliminated rules if provided
        if (eliminatedRules && eliminatedRules.length > 0) {
            logData.eliminatedRules = eliminatedRules.map(er => ({
                ruleId: er.rule.id,
                ruleName: er.rule.name,
                reason: er.reason,
                attributeKey: er.contactAttributeKey,
                attributeValue: er.contactAttributeValue
            }));
        }
        console.log(JSON.stringify(logData));
    }
    /**
     * Logs rule selection with comprehensive decision rationale
     * Requirements: 5.3 - Log decision rationale including weight comparison
     */
    static logRuleSelected(context, rule, reason, eligibleRules) {
        const auditTrail = this.auditTrails.get(context.requestId);
        if (auditTrail) {
            auditTrail.selectedRule = rule;
            auditTrail.distributionSegment = rule.distributionSegment;
        }
        const logData = {
            level: 'INFO',
            message: 'Rule selected for decision',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            selectedRule: {
                id: rule.id,
                name: rule.name,
                weight: rule.weight,
                distributionSegment: rule.distributionSegment,
                expression: rule.expression
            },
            selectionReason: reason,
            decisionRationale: {
                selectedWeight: rule.weight,
                selectionCriteria: 'highest_weight'
            }
        };
        // Add weight comparison details if multiple eligible rules
        if (eligibleRules && eligibleRules.length > 1) {
            const weights = eligibleRules.map(r => r.weight).sort((a, b) => b - a);
            logData.decisionRationale.weightComparison = {
                eligibleRuleCount: eligibleRules.length,
                allWeights: weights,
                highestWeight: weights[0],
                secondHighestWeight: weights[1] || null,
                weightAdvantage: weights[1] ? weights[0] - weights[1] : null
            };
            logData.eligibleRules = eligibleRules.map(r => ({
                id: r.id,
                name: r.name,
                weight: r.weight
            }));
        }
        console.log(JSON.stringify(logData));
    }
    /**
     * Logs errors with detailed information for troubleshooting
     * Requirements: 5.4 - Log detailed error information for troubleshooting
     */
    static logError(context, error, details, errorCode) {
        const auditTrail = this.auditTrails.get(context.requestId);
        if (auditTrail) {
            auditTrail.error = error;
            auditTrail.errorCode = errorCode;
            auditTrail.success = false;
        }
        const logData = {
            level: 'ERROR',
            message: 'Decision process error occurred',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            error,
            errorCode: errorCode || 'UNKNOWN_ERROR',
            errorDetails: details
        };
        // Add stack trace if error is an Error object
        if (details instanceof Error) {
            logData.stackTrace = details.stack;
            logData.errorName = details.name;
            logData.errorMessage = details.message;
        }
        // Add context information for troubleshooting
        if (auditTrail) {
            logData.troubleshootingContext = {
                rulesLoaded: auditTrail.rulesLoaded,
                eliminationStepsCompleted: auditTrail.eliminationSteps.length,
                inputAttributeCount: Object.keys(auditTrail.inputAttributes).length,
                processingDuration: Date.now() - new Date(auditTrail.startTime).getTime()
            };
        }
        console.error(JSON.stringify(logData));
    }
    /**
     * Logs decision completion with comprehensive summary
     * Requirements: 5.1, 5.3 - Complete audit trail with decision rationale
     */
    static logDecisionComplete(context, success, distributionSegment, errorCode) {
        var _a;
        const endTime = new Date().toISOString();
        const auditTrail = this.auditTrails.get(context.requestId);
        if (auditTrail) {
            auditTrail.endTime = endTime;
            auditTrail.duration = new Date(endTime).getTime() - new Date(auditTrail.startTime).getTime();
            auditTrail.success = success;
            if (distributionSegment) {
                auditTrail.distributionSegment = distributionSegment;
            }
        }
        const logData = {
            level: 'INFO',
            message: 'Decision process completed',
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: endTime,
            success,
            distributionSegment,
            errorCode,
            processingDuration: (auditTrail === null || auditTrail === void 0 ? void 0 : auditTrail.duration) || null
        };
        // Add comprehensive summary
        if (auditTrail) {
            logData.processSummary = {
                inputAttributeCount: Object.keys(auditTrail.inputAttributes).length,
                rulesLoaded: auditTrail.rulesLoaded,
                eliminationSteps: auditTrail.eliminationSteps.length,
                rulesEliminated: auditTrail.eliminatedRules.length,
                finalRuleSelected: !!auditTrail.selectedRule,
                selectedRuleId: (_a = auditTrail.selectedRule) === null || _a === void 0 ? void 0 : _a.id,
                processingTimeMs: auditTrail.duration
            };
        }
        console.log(JSON.stringify(logData));
        // Clean up audit trail after completion
        if (auditTrail) {
            this.auditTrails.delete(context.requestId);
        }
    }
    /**
     * Logs database operations for monitoring and troubleshooting
     */
    static logDatabaseOperation(context, operation, success, details) {
        console.log(JSON.stringify({
            level: success ? 'INFO' : 'ERROR',
            message: `Database operation: ${operation}`,
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            operation,
            success,
            details
        }));
    }
    /**
     * Logs cache operations for performance monitoring
     */
    static logCacheOperation(context, operation, hit, details) {
        console.log(JSON.stringify({
            level: 'INFO',
            message: `Cache operation: ${operation}`,
            requestId: context.requestId,
            interactionId: context.interactionId,
            timestamp: context.timestamp,
            operation,
            cacheHit: hit,
            details
        }));
    }
    /**
     * Gets the current audit trail for a request (for testing/debugging)
     */
    static getAuditTrail(requestId) {
        return this.auditTrails.get(requestId);
    }
    /**
     * Clears all audit trails (for testing)
     */
    static clearAuditTrails() {
        this.auditTrails.clear();
    }
}
exports.LoggingUtils = LoggingUtils;
LoggingUtils.auditTrails = new Map();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nZ2luZ1V0aWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3V0aWxzL2RlY2lzaW9uLWVuZ2luZS9Mb2dnaW5nVXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBeUJBLE1BQWEsWUFBWTtJQUd2Qjs7O09BR0c7SUFDSCxNQUFNLENBQUMsZ0JBQWdCLENBQUMsT0FBbUIsRUFBRSxpQkFBb0M7UUFDL0UsTUFBTSxVQUFVLEdBQWU7WUFDN0IsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQzVCLGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYTtZQUNwQyxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDNUIsZUFBZSxFQUFFLGlCQUFpQjtZQUNsQyxXQUFXLEVBQUUsQ0FBQztZQUNkLGdCQUFnQixFQUFFLEVBQUU7WUFDcEIsZUFBZSxFQUFFLEVBQUU7WUFDbkIsT0FBTyxFQUFFLEtBQUs7U0FDZixDQUFDO1FBRUYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUVwRCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDekIsS0FBSyxFQUFFLE1BQU07WUFDYixPQUFPLEVBQUUscUJBQXFCO1lBQzlCLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUztZQUM1QixhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWE7WUFDcEMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQzVCLFlBQVksRUFBRSxPQUFPLENBQUMsU0FBUztTQUNoQyxDQUFDLENBQUMsQ0FBQztJQUNOLENBQUM7SUFFRDs7O09BR0c7SUFDSCxNQUFNLENBQUMsZ0JBQWdCLENBQUMsT0FBbUIsRUFBRSxpQkFBb0M7UUFDL0UsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRWxELE9BQU8sQ0FBQyxHQUFHLENB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VyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsZ0JBQWdCO1FBQ3JCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDM0IsQ0FBQzs7QUEzVEgsb0NBNFRDO0FBM1RnQix3QkFBVyxHQUE0QixJQUFJLEdBQUcsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29udGFjdEF0dHJpYnV0ZXMsIFF1YWxpZmljYXRpb25SdWxlLCBFbGltaW5hdGlvblN0ZXAsIEVsaW1pbmF0ZWRSdWxlIH0gZnJvbSAnLi4vLi4vdHlwZXMvZGVjaXNpb24tZW5naW5lJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTG9nQ29udGV4dCB7XHJcbiAgcmVxdWVzdElkOiBzdHJpbmc7XHJcbiAgaW50ZXJhY3Rpb25JZDogc3RyaW5nO1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEF1ZGl0VHJhaWwge1xyXG4gIHJlcXVlc3RJZDogc3RyaW5nO1xyXG4gIGludGVyYWN0aW9uSWQ6IHN0cmluZztcclxuICBzdGFydFRpbWU6IHN0cmluZztcclxuICBlbmRUaW1lPzogc3RyaW5nO1xyXG4gIGR1cmF0aW9uPzogbnVtYmVyO1xyXG4gIGlucHV0QXR0cmlidXRlczogQ29udGFjdEF0dHJpYnV0ZXM7XHJcbiAgcnVsZXNMb2FkZWQ6IG51bWJlcjtcclxuICBlbGltaW5hdGlvblN0ZXBzOiBFbGltaW5hdGlvblN0ZXBbXTtcclxuICBlbGltaW5hdGVkUnVsZXM6IEVsaW1pbmF0ZWRSdWxlW107XHJcbiAgc2VsZWN0ZWRSdWxlPzogUXVhbGlmaWNhdGlvblJ1bGU7XHJcbiAgZGlzdHJpYnV0aW9uU2VnbWVudD86IHN0cmluZztcclxuICBzdWNjZXNzOiBib29sZWFuO1xyXG4gIGVycm9yPzogc3RyaW5nO1xyXG4gIGVycm9yQ29kZT86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIExvZ2dpbmdVdGlscyB7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgYXVkaXRUcmFpbHM6IE1hcDxzdHJpbmcsIEF1ZGl0VHJhaWw+ID0gbmV3IE1hcCgpO1xyXG4gIFxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZXMgYSBuZXcgYXVkaXQgdHJhaWwgZm9yIGEgZGVjaXNpb24gcHJvY2Vzc1xyXG4gICAqIFJlcXVpcmVtZW50czogNS41IC0gSW5jbHVkZSB0aW1lc3RhbXBzIGFuZCB1bmlxdWUgcmVxdWVzdCBpZGVudGlmaWVyc1xyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVBdWRpdFRyYWlsKGNvbnRleHQ6IExvZ0NvbnRleHQsIGNvbnRhY3RBdHRyaWJ1dGVzOiBDb250YWN0QXR0cmlidXRlcyk6IHZvaWQge1xyXG4gICAgY29uc3QgYXVkaXRUcmFpbDogQXVkaXRUcmFpbCA9IHtcclxuICAgICAgcmVxdWVzdElkOiBjb250ZXh0LnJlcXVlc3RJZCxcclxuICAgICAgaW50ZXJhY3Rpb25JZDogY29udGV4dC5pbnRlcmFjdGlvbklkLFxyXG4gICAgICBzdGFydFRpbWU6IGNvbnRleHQudGltZXN0YW1wLFxyXG4gICAgICBpbnB1dEF0dHJpYnV0ZXM6IGNvbnRhY3RBdHRyaWJ1dGVzLFxyXG4gICAgICBydWxlc0xvYWRlZDogMCxcclxuICAgICAgZWxpbWluYXRpb25TdGVwczogW10sXHJcbiAgICAgIGVsaW1pbmF0ZWRSdWxlczogW10sXHJcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmF1ZGl0VHJhaWxzLnNldChjb250ZXh0LnJlcXVlc3RJZCwgYXVkaXRUcmFpbCk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgbGV2ZWw6ICdJTkZPJyxcclxuICAgICAgbWVzc2FnZTogJ0F1ZGl0IHRyYWlsIGNyZWF0ZWQnLFxyXG4gICAgICByZXF1ZXN0SWQ6IGNvbnRleHQucmVxdWVzdElkLFxyXG4gICAgICBpbnRlcmFjdGlvbklkOiBjb250ZXh0LmludGVyYWN0aW9uSWQsXHJcbiAgICAgIHRpbWVzdGFtcDogY29udGV4dC50aW1lc3RhbXAsXHJcbiAgICAgIGF1ZGl0VHJhaWxJZDogY29udGV4dC5yZXF1ZXN0SWRcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIExvZ3MgdGhlIHN0YXJ0IG9mIGRlY2lzaW9uIHByb2Nlc3Mgd2l0aCBjb21wcmVoZW5zaXZlIGlucHV0IHRyYWNraW5nXHJcbiAgICogUmVxdWlyZW1lbnRzOiA1LjEgLSBMb2cgaW5wdXQgY3JpdGVyaWEgYW5kIHNlbGVjdGVkIHJ1bGVcclxuICAgKi9cclxuICBzdGF0aWMgbG9nRGVjaXNpb25TdGFydChjb250ZXh0OiBMb2dDb250ZXh0LCBjb250YWN0QXR0cmlidXRlczogQ29udGFjdEF0dHJpYnV0ZXMpOiB2b2lkIHtcclxuICAgIHRoaXMuY3JlYXRlQXVkaXRUcmFpbChjb250ZXh0LCBjb250YWN0QXR0cmlidXRlcyk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgbGV2ZWw6ICdJTkZPJyxcclxuICAgICAgbWVzc2FnZTogJ0RlY2lzaW9uIHByb2Nlc3Mgc3RhcnRlZCcsXHJcbiAgICAgIHJlcXVlc3RJZDogY29udGV4dC5yZXF1ZXN0SWQsXHJcbiAgICAgIGludGVyYWN0aW9uSWQ6IGNvbnRleHQuaW50ZXJhY3Rpb25JZCxcclxuICAgICAgdGltZXN0YW1wOiBjb250ZXh0LnRpbWVzdGFtcCxcclxuICAgICAgY29udGFjdEF0dHJpYnV0ZXMsXHJcbiAgICAgIGF0dHJpYnV0ZUNvdW50OiBPYmplY3Qua2V5cyhjb250YWN0QXR0cmlidXRlcykubGVuZ3RoLFxyXG4gICAgICBhdHRyaWJ1dGVLZXlzOiBPYmplY3Qua2V5cyhjb250YWN0QXR0cmlidXRlcylcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIExvZ3MgcnVsZXMgbG9hZGVkIGZyb20gZGF0YWJhc2Ugd2l0aCBkZXRhaWxlZCBpbmZvcm1hdGlvblxyXG4gICAqIFJlcXVpcmVtZW50czogNS4xIC0gTG9nIHRoZSBpbnB1dCBjcml0ZXJpYSBhbmQgc2VsZWN0ZWQgcnVsZVxyXG4gICAqL1xyXG4gIHN0YXRpYyBsb2dSdWxlc0xvYWRlZChjb250ZXh0OiBMb2dDb250ZXh0LCBydWxlQ291bnQ6IG51bWJlciwgcnVsZXM/OiBRdWFsaWZpY2F0aW9uUnVsZVtdKTogdm9pZCB7XHJcbiAgICBjb25zdCBhdWRpdFRyYWlsID0gdGhpcy5hdWRpdFRyYWlscy5nZXQoY29udGV4dC5yZXF1ZXN0SWQpO1xyXG4gICAgaWYgKGF1ZGl0VHJhaWwpIHtcclxuICAgICAgYXVkaXRUcmFpbC5ydWxlc0xvYWRlZCA9IHJ1bGVDb3VudDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb2dEYXRhOiBhbnkgPSB7XHJcbiAgICAgIGxldmVsOiAnSU5GTycsXHJcbiAgICAgIG1lc3NhZ2U6ICdSdWxlcyBsb2FkZWQgZnJvbSBkYXRhYmFzZScsXHJcbiAgICAgIHJlcXVlc3RJZDogY29udGV4dC5yZXF1ZXN0SWQsXHJcbiAgICAgIGludGVyYWN0aW9uSWQ6IGNvbnRleHQuaW50ZXJhY3Rpb25JZCxcclxuICAgICAgdGltZXN0YW1wOiBjb250ZXh0LnRpbWVzdGFtcCxcclxuICAgICAgcnVsZUNvdW50XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEFkZCBydWxlIHN1bW1hcnkgZm9yIGF1ZGl0IHB1cnBvc2VzXHJcbiAgICBpZiAocnVsZXMgJiYgcnVsZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBsb2dEYXRhLnJ1bGVTdW1tYXJ5ID0gcnVsZXMubWFwKHJ1bGUgPT4gKHtcclxuICAgICAgICBpZDogcnVsZS5pZCxcclxuICAgICAgICBuYW1lOiBydWxlLm5hbWUsXHJcbiAgICAgICAgd2VpZ2h0OiBydWxlLndlaWdodCxcclxuICAgICAgICBkaXN0cmlidXRpb25TZWdtZW50OiBydWxlLmRpc3RyaWJ1dGlvblNlZ21lbnRcclxuICAgICAgfSkpO1xyXG4gICAgICBsb2dEYXRhLndlaWdodFJhbmdlID0ge1xyXG4gICAgICAgIG1pbjogTWF0aC5taW4oLi4ucnVsZXMubWFwKHIgPT4gci53ZWlnaHQpKSxcclxuICAgICAgICBtYXg6IE1hdGgubWF4KC4uLnJ1bGVzLm1hcChyID0+IHIud2VpZ2h0KSlcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShsb2dEYXRhKSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2dzIGVhY2ggZWxpbWluYXRpb24gc3RlcCB3aXRoIGRldGFpbGVkIHRyYWNraW5nXHJcbiAgICogUmVxdWlyZW1lbnRzOiA1LjIgLSBSZWNvcmQgd2hpY2ggcnVsZXMgd2VyZSBlbGltaW5hdGVkIGFuZCB3aHlcclxuICAgKi9cclxuICBzdGF0aWMgbG9nRWxpbWluYXRpb25TdGVwKGNvbnRleHQ6IExvZ0NvbnRleHQsIHN0ZXA6IEVsaW1pbmF0aW9uU3RlcCwgZWxpbWluYXRlZFJ1bGVzPzogRWxpbWluYXRlZFJ1bGVbXSk6IHZvaWQge1xyXG4gICAgY29uc3QgYXVkaXRUcmFpbCA9IHRoaXMuYXVkaXRUcmFpbHMuZ2V0KGNvbnRleHQucmVxdWVzdElkKTtcclxuICAgIGlmIChhdWRpdFRyYWlsKSB7XHJcbiAgICAgIGF1ZGl0VHJhaWwuZWxpbWluYXRpb25TdGVwcy5wdXNoKHN0ZXApO1xyXG4gICAgICBpZiAoZWxpbWluYXRlZFJ1bGVzKSB7XHJcbiAgICAgICAgYXVkaXRUcmFpbC5lbGltaW5hdGVkUnVsZXMucHVzaCguLi5lbGltaW5hdGVkUnVsZXMpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9nRGF0YTogYW55ID0ge1xyXG4gICAgICBsZXZlbDogJ0lORk8nLFxyXG4gICAgICBtZXNzYWdlOiAnUnVsZSBlbGltaW5hdGlvbiBzdGVwIGV4ZWN1dGVkJyxcclxuICAgICAgcmVxdWVzdElkOiBjb250ZXh0LnJlcXVlc3RJZCxcclxuICAgICAgaW50ZXJhY3Rpb25JZDogY29udGV4dC5pbnRlcmFjdGlvbklkLFxyXG4gICAgICB0aW1lc3RhbXA6IGNvbnRleHQudGltZXN0YW1wLFxyXG4gICAgICBlbGltaW5hdGlvblN0ZXA6IHN0ZXAsXHJcbiAgICAgIHByb2dyZXNzU3VtbWFyeToge1xyXG4gICAgICAgIHJlbWFpbmluZ1J1bGVzOiBzdGVwLnJlbWFpbmluZ1J1bGVzLFxyXG4gICAgICAgIGVsaW1pbmF0ZWRJblN0ZXA6IHN0ZXAuZWxpbWluYXRlZENvdW50LFxyXG4gICAgICAgIHRvdGFsUHJvY2Vzc2VkOiBzdGVwLnJlbWFpbmluZ1J1bGVzICsgc3RlcC5lbGltaW5hdGVkQ291bnRcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBBZGQgZGV0YWlscyBhYm91dCBlbGltaW5hdGVkIHJ1bGVzIGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoZWxpbWluYXRlZFJ1bGVzICYmIGVsaW1pbmF0ZWRSdWxlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGxvZ0RhdGEuZWxpbWluYXRlZFJ1bGVzID0gZWxpbWluYXRlZFJ1bGVzLm1hcChlciA9PiAoe1xyXG4gICAgICAgIHJ1bGVJZDogZXIucnVsZS5pZCxcclxuICAgICAgICBydWxlTmFtZTogZXIucnVsZS5uYW1lLFxyXG4gICAgICAgIHJlYXNvbjogZXIucmVhc29uLFxyXG4gICAgICAgIGF0dHJpYnV0ZUtleTogZXIuY29udGFjdEF0dHJpYnV0ZUtleSxcclxuICAgICAgICBhdHRyaWJ1dGVWYWx1ZTogZXIuY29udGFjdEF0dHJpYnV0ZVZhbHVlXHJcbiAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShsb2dEYXRhKSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2dzIHJ1bGUgc2VsZWN0aW9uIHdpdGggY29tcHJlaGVuc2l2ZSBkZWNpc2lvbiByYXRpb25hbGVcclxuICAgKiBSZXF1aXJlbWVudHM6IDUuMyAtIExvZyBkZWNpc2lvbiByYXRpb25hbGUgaW5jbHVkaW5nIHdlaWdodCBjb21wYXJpc29uXHJcbiAgICovXHJcbiAgc3RhdGljIGxvZ1J1bGVTZWxlY3RlZChjb250ZXh0OiBMb2dDb250ZXh0LCBydWxlOiBRdWFsaWZpY2F0aW9uUnVsZSwgcmVhc29uOiBzdHJpbmcsIGVsaWdpYmxlUnVsZXM/OiBRdWFsaWZpY2F0aW9uUnVsZVtdKTogdm9pZCB7XHJcbiAgICBjb25zdCBhdWRpdFRyYWlsID0gdGhpcy5hdWRpdFRyYWlscy5nZXQoY29udGV4dC5yZXF1ZXN0SWQpO1xyXG4gICAgaWYgKGF1ZGl0VHJhaWwpIHtcclxuICAgICAgYXVkaXRUcmFpbC5zZWxlY3RlZFJ1bGUgPSBydWxlO1xyXG4gICAgICBhdWRpdFRyYWlsLmRpc3RyaWJ1dGlvblNlZ21lbnQgPSBydWxlLmRpc3RyaWJ1dGlvblNlZ21lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9nRGF0YTogYW55ID0ge1xyXG4gICAgICBsZXZlbDogJ0lORk8nLFxyXG4gICAgICBtZXNzYWdlOiAnUnVsZSBzZWxlY3RlZCBmb3IgZGVjaXNpb24nLFxyXG4gICAgICByZXF1ZXN0SWQ6IGNvbnRleHQucmVxdWVzdElkLFxyXG4gICAgICBpbnRlcmFjdGlvbklkOiBjb250ZXh0LmludGVyYWN0aW9uSWQsXHJcbiAgICAgIHRpbWVzdGFtcDogY29udGV4dC50aW1lc3RhbXAsXHJcbiAgICAgIHNlbGVjdGVkUnVsZToge1xyXG4gICAgICAgIGlkOiBydWxlLmlkLFxyXG4gICAgICAgIG5hbWU6IHJ1bGUubmFtZSxcclxuICAgICAgICB3ZWlnaHQ6IHJ1bGUud2VpZ2h0LFxyXG4gICAgICAgIGRpc3RyaWJ1dGlvblNlZ21lbnQ6IHJ1bGUuZGlzdHJpYnV0aW9uU2VnbWVudCxcclxuICAgICAgICBleHByZXNzaW9uOiBydWxlLmV4cHJlc3Npb25cclxuICAgICAgfSxcclxuICAgICAgc2VsZWN0aW9uUmVhc29uOiByZWFzb24sXHJcbiAgICAgIGRlY2lzaW9uUmF0aW9uYWxlOiB7XHJcbiAgICAgICAgc2VsZWN0ZWRXZWlnaHQ6IHJ1bGUud2VpZ2h0LFxyXG4gICAgICAgIHNlbGVjdGlvbkNyaXRlcmlhOiAnaGlnaGVzdF93ZWlnaHQnXHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLy8gQWRkIHdlaWdodCBjb21wYXJpc29uIGRldGFpbHMgaWYgbXVsdGlwbGUgZWxpZ2libGUgcnVsZXNcclxuICAgIGlmIChlbGlnaWJsZVJ1bGVzICYmIGVsaWdpYmxlUnVsZXMubGVuZ3RoID4gMSkge1xyXG4gICAgICBjb25zdCB3ZWlnaHRzID0gZWxpZ2libGVSdWxlcy5tYXAociA9PiByLndlaWdodCkuc29ydCgoYSwgYikgPT4gYiAtIGEpO1xyXG4gICAgICBsb2dEYXRhLmRlY2lzaW9uUmF0aW9uYWxlLndlaWdodENvbXBhcmlzb24gPSB7XHJcbiAgICAgICAgZWxpZ2libGVSdWxlQ291bnQ6IGVsaWdpYmxlUnVsZXMubGVuZ3RoLFxyXG4gICAgICAgIGFsbFdlaWdodHM6IHdlaWdodHMsXHJcbiAgICAgICAgaGlnaGVzdFdlaWdodDogd2VpZ2h0c1swXSxcclxuICAgICAgICBzZWNvbmRIaWdoZXN0V2VpZ2h0OiB3ZWlnaHRzWzFdIHx8IG51bGwsXHJcbiAgICAgICAgd2VpZ2h0QWR2YW50YWdlOiB3ZWlnaHRzWzFdID8gd2VpZ2h0c1swXSAtIHdlaWdodHNbMV0gOiBudWxsXHJcbiAgICAgIH07XHJcbiAgICAgIGxvZ0RhdGEuZWxpZ2libGVSdWxlcyA9IGVsaWdpYmxlUnVsZXMubWFwKHIgPT4gKHtcclxuICAgICAgICBpZDogci5pZCxcclxuICAgICAgICBuYW1lOiByLm5hbWUsXHJcbiAgICAgICAgd2VpZ2h0OiByLndlaWdodFxyXG4gICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkobG9nRGF0YSkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9ncyBlcnJvcnMgd2l0aCBkZXRhaWxlZCBpbmZvcm1hdGlvbiBmb3IgdHJvdWJsZXNob290aW5nXHJcbiAgICogUmVxdWlyZW1lbnRzOiA1LjQgLSBMb2cgZGV0YWlsZWQgZXJyb3IgaW5mb3JtYXRpb24gZm9yIHRyb3VibGVzaG9vdGluZ1xyXG4gICAqL1xyXG4gIHN0YXRpYyBsb2dFcnJvcihjb250ZXh0OiBMb2dDb250ZXh0LCBlcnJvcjogc3RyaW5nLCBkZXRhaWxzPzogYW55LCBlcnJvckNvZGU/OiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIGNvbnN0IGF1ZGl0VHJhaWwgPSB0aGlzLmF1ZGl0VHJhaWxzLmdldChjb250ZXh0LnJlcXVlc3RJZCk7XHJcbiAgICBpZiAoYXVkaXRUcmFpbCkge1xyXG4gICAgICBhdWRpdFRyYWlsLmVycm9yID0gZXJyb3I7XHJcbiAgICAgIGF1ZGl0VHJhaWwuZXJyb3JDb2RlID0gZXJyb3JDb2RlO1xyXG4gICAgICBhdWRpdFRyYWlsLnN1Y2Nlc3MgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb2dEYXRhOiBhbnkgPSB7XHJcbiAgICAgIGxldmVsOiAnRVJST1InLFxyXG4gICAgICBtZXNzYWdlOiAnRGVjaXNpb24gcHJvY2VzcyBlcnJvciBvY2N1cnJlZCcsXHJcbiAgICAgIHJlcXVlc3RJZDogY29udGV4dC5yZXF1ZXN0SWQsXHJcbiAgICAgIGludGVyYWN0aW9uSWQ6IGNvbnRleHQuaW50ZXJhY3Rpb25JZCxcclxuICAgICAgdGltZXN0YW1wOiBjb250ZXh0LnRpbWVzdGFtcCxcclxuICAgICAgZXJyb3IsXHJcbiAgICAgIGVycm9yQ29kZTogZXJyb3JDb2RlIHx8ICdVTktOT1dOX0VSUk9SJyxcclxuICAgICAgZXJyb3JEZXRhaWxzOiBkZXRhaWxzXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEFkZCBzdGFjayB0cmFjZSBpZiBlcnJvciBpcyBhbiBFcnJvciBvYmplY3RcclxuICAgIGlmIChkZXRhaWxzIGluc3RhbmNlb2YgRXJyb3IpIHtcclxuICAgICAgbG9nRGF0YS5zdGFja1RyYWNlID0gZGV0YWlscy5zdGFjaztcclxuICAgICAgbG9nRGF0YS5lcnJvck5hbWUgPSBkZXRhaWxzLm5hbWU7XHJcbiAgICAgIGxvZ0RhdGEuZXJyb3JNZXNzYWdlID0gZGV0YWlscy5tZXNzYWdlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFkZCBjb250ZXh0IGluZm9ybWF0aW9uIGZvciB0cm91Ymxlc2hvb3RpbmdcclxuICAgIGlmIChhdWRpdFRyYWlsKSB7XHJcbiAgICAgIGxvZ0RhdGEudHJvdWJsZXNob290aW5nQ29udGV4dCA9IHtcclxuICAgICAgICBydWxlc0xvYWRlZDogYXVkaXRUcmFpbC5ydWxlc0xvYWRlZCxcclxuICAgICAgICBlbGltaW5hdGlvblN0ZXBzQ29tcGxldGVkOiBhdWRpdFRyYWlsLmVsaW1pbmF0aW9uU3RlcHMubGVuZ3RoLFxyXG4gICAgICAgIGlucHV0QXR0cmlidXRlQ291bnQ6IE9iamVjdC5rZXlzKGF1ZGl0VHJhaWwuaW5wdXRBdHRyaWJ1dGVzKS5sZW5ndGgsXHJcbiAgICAgICAgcHJvY2Vzc2luZ0R1cmF0aW9uOiBEYXRlLm5vdygpIC0gbmV3IERhdGUoYXVkaXRUcmFpbC5zdGFydFRpbWUpLmdldFRpbWUoKVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUuZXJyb3IoSlNPTi5zdHJpbmdpZnkobG9nRGF0YSkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9ncyBkZWNpc2lvbiBjb21wbGV0aW9uIHdpdGggY29tcHJlaGVuc2l2ZSBzdW1tYXJ5XHJcbiAgICogUmVxdWlyZW1lbnRzOiA1LjEsIDUuMyAtIENvbXBsZXRlIGF1ZGl0IHRyYWlsIHdpdGggZGVjaXNpb24gcmF0aW9uYWxlXHJcbiAgICovXHJcbiAgc3RhdGljIGxvZ0RlY2lzaW9uQ29tcGxldGUoY29udGV4dDogTG9nQ29udGV4dCwgc3VjY2VzczogYm9vbGVhbiwgZGlzdHJpYnV0aW9uU2VnbWVudD86IHN0cmluZywgZXJyb3JDb2RlPzogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjb25zdCBlbmRUaW1lID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgY29uc3QgYXVkaXRUcmFpbCA9IHRoaXMuYXVkaXRUcmFpbHMuZ2V0KGNvbnRleHQucmVxdWVzdElkKTtcclxuICAgIFxyXG4gICAgaWYgKGF1ZGl0VHJhaWwpIHtcclxuICAgICAgYXVkaXRUcmFpbC5lbmRUaW1lID0gZW5kVGltZTtcclxuICAgICAgYXVkaXRUcmFpbC5kdXJhdGlvbiA9IG5ldyBEYXRlKGVuZFRpbWUpLmdldFRpbWUoKSAtIG5ldyBEYXRlKGF1ZGl0VHJhaWwuc3RhcnRUaW1lKS5nZXRUaW1lKCk7XHJcbiAgICAgIGF1ZGl0VHJhaWwuc3VjY2VzcyA9IHN1Y2Nlc3M7XHJcbiAgICAgIGlmIChkaXN0cmlidXRpb25TZWdtZW50KSB7XHJcbiAgICAgICAgYXVkaXRUcmFpbC5kaXN0cmlidXRpb25TZWdtZW50ID0gZGlzdHJpYnV0aW9uU2VnbWVudDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGxvZ0RhdGE6IGFueSA9IHtcclxuICAgICAgbGV2ZWw6ICdJTkZPJyxcclxuICAgICAgbWVzc2FnZTogJ0RlY2lzaW9uIHByb2Nlc3MgY29tcGxldGVkJyxcclxuICAgICAgcmVxdWVzdElkOiBjb250ZXh0LnJlcXVlc3RJZCxcclxuICAgICAgaW50ZXJhY3Rpb25JZDogY29udGV4dC5pbnRlcmFjdGlvbklkLFxyXG4gICAgICB0aW1lc3RhbXA6IGVuZFRpbWUsXHJcbiAgICAgIHN1Y2Nlc3MsXHJcbiAgICAgIGRpc3RyaWJ1dGlvblNlZ21lbnQsXHJcbiAgICAgIGVycm9yQ29kZSxcclxuICAgICAgcHJvY2Vzc2luZ0R1cmF0aW9uOiBhdWRpdFRyYWlsPy5kdXJhdGlvbiB8fCBudWxsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEFkZCBjb21wcmVoZW5zaXZlIHN1bW1hcnlcclxuICAgIGlmIChhdWRpdFRyYWlsKSB7XHJcbiAgICAgIGxvZ0RhdGEucHJvY2Vzc1N1bW1hcnkgPSB7XHJcbiAgICAgICAgaW5wdXRBdHRyaWJ1dGVDb3VudDogT2JqZWN0LmtleXMoYXVkaXRUcmFpbC5pbnB1dEF0dHJpYnV0ZXMpLmxlbmd0aCxcclxuICAgICAgICBydWxlc0xvYWRlZDogYXVkaXRUcmFpbC5ydWxlc0xvYWRlZCxcclxuICAgICAgICBlbGltaW5hdGlvblN0ZXBzOiBhdWRpdFRyYWlsLmVsaW1pbmF0aW9uU3RlcHMubGVuZ3RoLFxyXG4gICAgICAgIHJ1bGVzRWxpbWluYXRlZDogYXVkaXRUcmFpbC5lbGltaW5hdGVkUnVsZXMubGVuZ3RoLFxyXG4gICAgICAgIGZpbmFsUnVsZVNlbGVjdGVkOiAhIWF1ZGl0VHJhaWwuc2VsZWN0ZWRSdWxlLFxyXG4gICAgICAgIHNlbGVjdGVkUnVsZUlkOiBhdWRpdFRyYWlsLnNlbGVjdGVkUnVsZT8uaWQsXHJcbiAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogYXVkaXRUcmFpbC5kdXJhdGlvblxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGxvZ0RhdGEpKTtcclxuXHJcbiAgICAvLyBDbGVhbiB1cCBhdWRpdCB0cmFpbCBhZnRlciBjb21wbGV0aW9uXHJcbiAgICBpZiAoYXVkaXRUcmFpbCkge1xyXG4gICAgICB0aGlzLmF1ZGl0VHJhaWxzLmRlbGV0ZShjb250ZXh0LnJlcXVlc3RJZCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2dzIGRhdGFiYXNlIG9wZXJhdGlvbnMgZm9yIG1vbml0b3JpbmcgYW5kIHRyb3VibGVzaG9vdGluZ1xyXG4gICAqL1xyXG4gIHN0YXRpYyBsb2dEYXRhYmFzZU9wZXJhdGlvbihjb250ZXh0OiBMb2dDb250ZXh0LCBvcGVyYXRpb246IHN0cmluZywgc3VjY2VzczogYm9vbGVhbiwgZGV0YWlscz86IGFueSk6IHZvaWQge1xyXG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICBsZXZlbDogc3VjY2VzcyA/ICdJTkZPJyA6ICdFUlJPUicsXHJcbiAgICAgIG1lc3NhZ2U6IGBEYXRhYmFzZSBvcGVyYXRpb246ICR7b3BlcmF0aW9ufWAsXHJcbiAgICAgIHJlcXVlc3RJZDogY29udGV4dC5yZXF1ZXN0SWQsXHJcbiAgICAgIGludGVyYWN0aW9uSWQ6IGNvbnRleHQuaW50ZXJhY3Rpb25JZCxcclxuICAgICAgdGltZXN0YW1wOiBjb250ZXh0LnRpbWVzdGFtcCxcclxuICAgICAgb3BlcmF0aW9uLFxyXG4gICAgICBzdWNjZXNzLFxyXG4gICAgICBkZXRhaWxzXHJcbiAgICB9KSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2dzIGNhY2hlIG9wZXJhdGlvbnMgZm9yIHBlcmZvcm1hbmNlIG1vbml0b3JpbmdcclxuICAgKi9cclxuICBzdGF0aWMgbG9nQ2FjaGVPcGVyYXRpb24oY29udGV4dDogTG9nQ29udGV4dCwgb3BlcmF0aW9uOiBzdHJpbmcsIGhpdDogYm9vbGVhbiwgZGV0YWlscz86IGFueSk6IHZvaWQge1xyXG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICBsZXZlbDogJ0lORk8nLFxyXG4gICAgICBtZXNzYWdlOiBgQ2FjaGUgb3BlcmF0aW9uOiAke29wZXJhdGlvbn1gLFxyXG4gICAgICByZXF1ZXN0SWQ6IGNvbnRleHQucmVxdWVzdElkLFxyXG4gICAgICBpbnRlcmFjdGlvbklkOiBjb250ZXh0LmludGVyYWN0aW9uSWQsXHJcbiAgICAgIHRpbWVzdGFtcDogY29udGV4dC50aW1lc3RhbXAsXHJcbiAgICAgIG9wZXJhdGlvbixcclxuICAgICAgY2FjaGVIaXQ6IGhpdCxcclxuICAgICAgZGV0YWlsc1xyXG4gICAgfSkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyB0aGUgY3VycmVudCBhdWRpdCB0cmFpbCBmb3IgYSByZXF1ZXN0IChmb3IgdGVzdGluZy9kZWJ1Z2dpbmcpXHJcbiAgICovXHJcbiAgc3RhdGljIGdldEF1ZGl0VHJhaWwocmVxdWVzdElkOiBzdHJpbmcpOiBBdWRpdFRyYWlsIHwgdW5kZWZpbmVkIHtcclxuICAgIHJldHVybiB0aGlzLmF1ZGl0VHJhaWxzLmdldChyZXF1ZXN0SWQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xlYXJzIGFsbCBhdWRpdCB0cmFpbHMgKGZvciB0ZXN0aW5nKVxyXG4gICAqL1xyXG4gIHN0YXRpYyBjbGVhckF1ZGl0VHJhaWxzKCk6IHZvaWQge1xyXG4gICAgdGhpcy5hdWRpdFRyYWlscy5jbGVhcigpO1xyXG4gIH1cclxufSJdfQ==