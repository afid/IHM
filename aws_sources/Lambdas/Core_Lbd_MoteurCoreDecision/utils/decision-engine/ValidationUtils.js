"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationUtils = exports.ErrorHandlingFramework = exports.ErrorCategory = void 0;
const LoggingUtils_1 = require("./LoggingUtils");
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["VALIDATION"] = "VALIDATION";
    ErrorCategory["DATABASE"] = "DATABASE";
    ErrorCategory["BUSINESS_LOGIC"] = "BUSINESS_LOGIC";
    ErrorCategory["INFRASTRUCTURE"] = "INFRASTRUCTURE";
    ErrorCategory["RULE_PROCESSING"] = "RULE_PROCESSING";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class ErrorHandlingFramework {
    /**
     * Handles database failures gracefully
     * Requirements: 3.3 - Handle database operations failures gracefully
     */
    static handleDatabaseError(error, operation, context) {
        const errorDetails = {
            category: ErrorCategory.DATABASE,
            code: 'DATABASE_ERROR',
            message: `Database operation '${operation}' failed: ${error.message}`,
            userMessage: 'Erreur de base de données, veuillez réessayer',
            retryable: true,
            context: { operation, timestamp: new Date().toISOString() },
            originalError: error
        };
        // Log detailed error information
        if (context) {
            LoggingUtils_1.LoggingUtils.logError(context, errorDetails.message, {
                operation,
                errorName: error.name,
                errorMessage: error.message,
                stackTrace: error.stack,
                retryable: errorDetails.retryable
            }, errorDetails.code);
        }
        return errorDetails;
    }
    /**
     * Handles rule processing errors gracefully
     * Requirements: 3.5 - Handle rule evaluation malformed expressions
     */
    static handleRuleProcessingError(error, ruleId, expression, context) {
        const errorDetails = {
            category: ErrorCategory.RULE_PROCESSING,
            code: 'RULE_PROCESSING_ERROR',
            message: `Rule processing failed for rule ${ruleId}: ${error.message}`,
            userMessage: `Erreur lors du traitement de la règle ${ruleId}, vérifier le paramétrage`,
            retryable: false,
            context: { ruleId, expression, timestamp: new Date().toISOString() },
            originalError: error
        };
        // Log detailed error information
        if (context) {
            LoggingUtils_1.LoggingUtils.logError(context, errorDetails.message, {
                ruleId,
                expression,
                errorName: error.name,
                errorMessage: error.message,
                stackTrace: error.stack,
                retryable: errorDetails.retryable
            }, errorDetails.code);
        }
        return errorDetails;
    }
    /**
     * Handles business logic errors (no rules, equal weights, etc.)
     * Requirements: 3.3 - Provide meaningful error messages
     */
    static handleBusinessLogicError(errorType, details, context) {
        let errorDetails;
        switch (errorType) {
            case 'NO_MATCHING_RULES':
                errorDetails = {
                    category: ErrorCategory.BUSINESS_LOGIC,
                    code: 'NO_MATCHING_RULES',
                    message: 'No rules matched the provided contact attributes',
                    userMessage: 'Aucune règle ne correspond, vérifier le paramétrage',
                    retryable: false,
                    context: { contactAttributes: details.contactAttributes, timestamp: new Date().toISOString() }
                };
                break;
            case 'EQUAL_WEIGHTS':
                const ruleIds = details.ruleIds.join(' et ');
                errorDetails = {
                    category: ErrorCategory.BUSINESS_LOGIC,
                    code: 'EQUAL_WEIGHTS',
                    message: `Multiple rules have equal weights: ${ruleIds}`,
                    userMessage: `Les règles ${ruleIds} ont des poids identiques, vérifier le paramétrage`,
                    retryable: false,
                    context: { ruleIds: details.ruleIds, weight: details.weight, timestamp: new Date().toISOString() }
                };
                break;
            case 'MISSING_DISTRIBUTION_SEGMENT':
                errorDetails = {
                    category: ErrorCategory.BUSINESS_LOGIC,
                    code: 'MISSING_DISTRIBUTION_SEGMENT',
                    message: `Distribution segment missing for rule ${details.ruleId}`,
                    userMessage: `Segment de distribution manquant pour la règle ${details.ruleId}, vérifier le paramétrage`,
                    retryable: false,
                    context: { ruleId: details.ruleId, timestamp: new Date().toISOString() }
                };
                break;
            case 'EMPTY_RULE_SET':
                errorDetails = {
                    category: ErrorCategory.BUSINESS_LOGIC,
                    code: 'EMPTY_RULE_SET',
                    message: 'No rules available in the system',
                    userMessage: 'Aucune règle disponible dans le système, vérifier la configuration',
                    retryable: true,
                    context: { timestamp: new Date().toISOString() }
                };
                break;
            default:
                errorDetails = {
                    category: ErrorCategory.BUSINESS_LOGIC,
                    code: 'UNKNOWN_BUSINESS_ERROR',
                    message: `Unknown business logic error: ${errorType}`,
                    userMessage: 'Erreur de logique métier, veuillez contacter le support',
                    retryable: false,
                    context: { errorType, details, timestamp: new Date().toISOString() }
                };
        }
        // Log business logic error
        if (context) {
            LoggingUtils_1.LoggingUtils.logError(context, errorDetails.message, errorDetails.context, errorDetails.code);
        }
        return errorDetails;
    }
    /**
     * Handles infrastructure errors (timeouts, network issues, etc.)
     * Requirements: 3.3 - Handle infrastructure failures gracefully
     */
    static handleInfrastructureError(error, component, context) {
        const errorDetails = {
            category: ErrorCategory.INFRASTRUCTURE,
            code: 'INFRASTRUCTURE_ERROR',
            message: `Infrastructure error in ${component}: ${error.message}`,
            userMessage: 'Erreur technique temporaire, veuillez réessayer',
            retryable: true,
            context: { component, timestamp: new Date().toISOString() },
            originalError: error
        };
        // Determine if error is retryable based on error type
        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
            errorDetails.code = 'TIMEOUT_ERROR';
            errorDetails.retryable = true;
        }
        else if (error.message.includes('network') || error.message.includes('connection')) {
            errorDetails.code = 'NETWORK_ERROR';
            errorDetails.retryable = true;
        }
        // Log infrastructure error
        if (context) {
            LoggingUtils_1.LoggingUtils.logError(context, errorDetails.message, {
                component,
                errorName: error.name,
                errorMessage: error.message,
                stackTrace: error.stack,
                retryable: errorDetails.retryable
            }, errorDetails.code);
        }
        return errorDetails;
    }
    /**
     * Converts ErrorDetails to ErrorResponse format
     */
    static toErrorResponse(errorDetails, requestId) {
        return {
            success: false,
            error: errorDetails.userMessage,
            errorCode: errorDetails.code,
            timestamp: new Date().toISOString(),
            requestId,
            details: {
                category: errorDetails.category,
                retryable: errorDetails.retryable,
                context: errorDetails.context
            }
        };
    }
    /**
     * Determines if an error should trigger a retry
     */
    static shouldRetry(errorDetails, attemptCount, maxAttempts = 3) {
        return errorDetails.retryable && attemptCount < maxAttempts;
    }
}
exports.ErrorHandlingFramework = ErrorHandlingFramework;
class ValidationUtils {
    static validateQualificationRequest(request) {
        if (!request) {
            return { isValid: false, error: 'Request body is required' };
        }
        if (!request.interactionId || typeof request.interactionId !== 'string') {
            return { isValid: false, error: 'interactionId is required and must be a string' };
        }
        if (!request.contactAttributes || typeof request.contactAttributes !== 'object') {
            return { isValid: false, error: 'contactAttributes is required and must be an object' };
        }
        const attributesValidation = this.validateContactAttributes(request.contactAttributes);
        if (!attributesValidation.isValid) {
            return attributesValidation;
        }
        return { isValid: true };
    }
    static validateContactAttributes(attributes) {
        if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
            return { isValid: false, error: 'Contact attributes must be an object' };
        }
        for (const [key, value] of Object.entries(attributes)) {
            if (typeof key !== 'string' || key.trim() === '') {
                return { isValid: false, error: 'All attribute keys must be non-empty strings' };
            }
            const valueType = typeof value;
            if (valueType !== 'boolean' && valueType !== 'string' && valueType !== 'number') {
                return {
                    isValid: false,
                    error: `Attribute '${key}' has invalid type '${valueType}'. Only boolean, string, and number are allowed.`
                };
            }
            // Additional validation for string values
            if (valueType === 'string' && value.length > 1000) {
                return {
                    isValid: false,
                    error: `Attribute '${key}' string value exceeds maximum length of 1000 characters`
                };
            }
            // Additional validation for number values
            if (valueType === 'number' && (!Number.isFinite(value))) {
                return {
                    isValid: false,
                    error: `Attribute '${key}' must be a finite number`
                };
            }
        }
        return { isValid: true };
    }
    static sanitizeContactAttributes(attributes) {
        const sanitized = {};
        for (const [key, value] of Object.entries(attributes)) {
            const cleanKey = key.trim();
            if (cleanKey) {
                if (typeof value === 'string') {
                    sanitized[cleanKey] = value.trim();
                }
                else {
                    sanitized[cleanKey] = value;
                }
            }
        }
        return sanitized;
    }
    static formatErrorResponse(error, errorCode, requestId, details) {
        return {
            success: false,
            error,
            errorCode,
            timestamp: new Date().toISOString(),
            requestId,
            details
        };
    }
    static formatValidationError(validationError, requestId) {
        return this.formatErrorResponse(`Format de contact attributes invalide: ${validationError}`, 'VALIDATION_ERROR', requestId);
    }
    /**
     * Enhanced error response formatting using the error handling framework
     */
    static formatEnhancedErrorResponse(errorDetails, requestId) {
        return ErrorHandlingFramework.toErrorResponse(errorDetails, requestId);
    }
}
exports.ValidationUtils = ValidationUtils;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmFsaWRhdGlvblV0aWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3V0aWxzL2RlY2lzaW9uLWVuZ2luZS9WYWxpZGF0aW9uVXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsaURBQTBEO0FBRTFELElBQVksYUFNWDtBQU5ELFdBQVksYUFBYTtJQUN2QiwwQ0FBeUIsQ0FBQTtJQUN6QixzQ0FBcUIsQ0FBQTtJQUNyQixrREFBaUMsQ0FBQTtJQUNqQyxrREFBaUMsQ0FBQTtJQUNqQyxvREFBbUMsQ0FBQTtBQUNyQyxDQUFDLEVBTlcsYUFBYSw2QkFBYixhQUFhLFFBTXhCO0FBWUQsTUFBYSxzQkFBc0I7SUFFakM7OztPQUdHO0lBQ0gsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEtBQVksRUFBRSxTQUFpQixFQUFFLE9BQW9CO1FBQzlFLE1BQU0sWUFBWSxHQUFpQjtZQUNqQyxRQUFRLEVBQUUsYUFBYSxDQUFDLFFBQVE7WUFDaEMsSUFBSSxFQUFFLGdCQUFnQjtZQUN0QixPQUFPLEVBQUUsdUJBQXVCLFNBQVMsYUFBYSxLQUFLLENBQUMsT0FBTyxFQUFFO1lBQ3JFLFdBQVcsRUFBRSwrQ0FBK0M7WUFDNUQsU0FBUyxFQUFFLElBQUk7WUFDZixPQUFPLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUU7WUFDM0QsYUFBYSxFQUFFLEtBQUs7U0FDckIsQ0FBQztRQUVGLGlDQUFpQztRQUNqQyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osMkJBQVksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxPQUFPLEVBQUU7Z0JBQ25ELFNBQVM7Z0JBQ1QsU0FBUyxFQUFFLEtBQUssQ0FBQyxJQUFJO2dCQUNyQixZQUFZLEVBQUUsS0FBSyxDQUFDLE9BQU87Z0JBQzNCLFVBQVUsRUFBRSxLQUFLLENBQUMsS0FBSztnQkFDdkIsU0FBUyxF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bUIsQ0FBQyxLQUFhLEVBQUUsU0FBaUIsRUFBRSxTQUFpQixFQUFFLE9BQWE7UUFDM0YsT0FBTztZQUNMLE9BQU8sRUFBRSxLQUFLO1lBQ2QsS0FBSztZQUNMLFNBQVM7WUFDVCxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsU0FBUztZQUNULE9BQU87U0FDUixDQUFDO0lBQ0osQ0FBQztJQUVELE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxlQUF1QixFQUFFLFNBQWlCO1FBQ3JFLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUM3QiwwQ0FBMEMsZUFBZSxFQUFFLEVBQzNELGtCQUFrQixFQUNsQixTQUFTLENBQ1YsQ0FBQztJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxZQUEwQixFQUFFLFNBQWlCO1FBQzlFLE9BQU8sc0JBQXNCLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN6RSxDQUFDO0NBQ0Y7QUF2R0QsMENBdUdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29udGFjdEF0dHJpYnV0ZXMsIEVycm9yUmVzcG9uc2UgfSBmcm9tICcuLi8uLi90eXBlcy9kZWNpc2lvbi1lbmdpbmUnO1xyXG5pbXBvcnQgeyBMb2dnaW5nVXRpbHMsIExvZ0NvbnRleHQgfSBmcm9tICcuL0xvZ2dpbmdVdGlscyc7XHJcblxyXG5leHBvcnQgZW51bSBFcnJvckNhdGVnb3J5IHtcclxuICBWQUxJREFUSU9OID0gJ1ZBTElEQVRJT04nLFxyXG4gIERBVEFCQVNFID0gJ0RBVEFCQVNFJyxcclxuICBCVVNJTkVTU19MT0dJQyA9ICdCVVNJTkVTU19MT0dJQycsXHJcbiAgSU5GUkFTVFJVQ1RVUkUgPSAnSU5GUkFTVFJVQ1RVUkUnLFxyXG4gIFJVTEVfUFJPQ0VTU0lORyA9ICdSVUxFX1BST0NFU1NJTkcnXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRXJyb3JEZXRhaWxzIHtcclxuICBjYXRlZ29yeTogRXJyb3JDYXRlZ29yeTtcclxuICBjb2RlOiBzdHJpbmc7XHJcbiAgbWVzc2FnZTogc3RyaW5nO1xyXG4gIHVzZXJNZXNzYWdlOiBzdHJpbmc7XHJcbiAgcmV0cnlhYmxlOiBib29sZWFuO1xyXG4gIGNvbnRleHQ/OiBhbnk7XHJcbiAgb3JpZ2luYWxFcnJvcj86IEVycm9yO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRXJyb3JIYW5kbGluZ0ZyYW1ld29yayB7XHJcbiAgXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlcyBkYXRhYmFzZSBmYWlsdXJlcyBncmFjZWZ1bGx5XHJcbiAgICogUmVxdWlyZW1lbnRzOiAzLjMgLSBIYW5kbGUgZGF0YWJhc2Ugb3BlcmF0aW9ucyBmYWlsdXJlcyBncmFjZWZ1bGx5XHJcbiAgICovXHJcbiAgc3RhdGljIGhhbmRsZURhdGFiYXNlRXJyb3IoZXJyb3I6IEVycm9yLCBvcGVyYXRpb246IHN0cmluZywgY29udGV4dD86IExvZ0NvbnRleHQpOiBFcnJvckRldGFpbHMge1xyXG4gICAgY29uc3QgZXJyb3JEZXRhaWxzOiBFcnJvckRldGFpbHMgPSB7XHJcbiAgICAgIGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5LkRBVEFCQVNFLFxyXG4gICAgICBjb2RlOiAnREFUQUJBU0VfRVJST1InLFxyXG4gICAgICBtZXNzYWdlOiBgRGF0YWJhc2Ugb3BlcmF0aW9uICcke29wZXJhdGlvbn0nIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWAsXHJcbiAgICAgIHVzZXJNZXNzYWdlOiAnRXJyZXVyIGRlIGJhc2UgZGUgZG9ubsOpZXMsIHZldWlsbGV6IHLDqWVzc2F5ZXInLFxyXG4gICAgICByZXRyeWFibGU6IHRydWUsXHJcbiAgICAgIGNvbnRleHQ6IHsgb3BlcmF0aW9uLCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxyXG4gICAgICBvcmlnaW5hbEVycm9yOiBlcnJvclxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBMb2cgZGV0YWlsZWQgZXJyb3IgaW5mb3JtYXRpb25cclxuICAgIGlmIChjb250ZXh0KSB7XHJcbiAgICAgIExvZ2dpbmdVdGlscy5sb2dFcnJvcihjb250ZXh0LCBlcnJvckRldGFpbHMubWVzc2FnZSwge1xyXG4gICAgICAgIG9wZXJhdGlvbixcclxuICAgICAgICBlcnJvck5hbWU6IGVycm9yLm5hbWUsXHJcbiAgICAgICAgZXJyb3JNZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxyXG4gICAgICAgIHN0YWNrVHJhY2U6IGVycm9yLnN0YWNrLFxyXG4gICAgICAgIHJldHJ5YWJsZTogZXJyb3JEZXRhaWxzLnJldHJ5YWJsZVxyXG4gICAgICB9LCBlcnJvckRldGFpbHMuY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGVycm9yRGV0YWlscztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhhbmRsZXMgcnVsZSBwcm9jZXNzaW5nIGVycm9ycyBncmFjZWZ1bGx5XHJcbiAgICogUmVxdWlyZW1lbnRzOiAzLjUgLSBIYW5kbGUgcnVsZSBldmFsdWF0aW9uIG1hbGZvcm1lZCBleHByZXNzaW9uc1xyXG4gICAqL1xyXG4gIHN0YXRpYyBoYW5kbGVSdWxlUHJvY2Vzc2luZ0Vycm9yKGVycm9yOiBFcnJvciwgcnVsZUlkOiBzdHJpbmcsIGV4cHJlc3Npb24/OiBzdHJpbmcsIGNvbnRleHQ/OiBMb2dDb250ZXh0KTogRXJyb3JEZXRhaWxzIHtcclxuICAgIGNvbnN0IGVycm9yRGV0YWlsczogRXJyb3JEZXRhaWxzID0ge1xyXG4gICAgICBjYXRlZ29yeTogRXJyb3JDYXRlZ29yeS5SVUxFX1BST0NFU1NJTkcsXHJcbiAgICAgIGNvZGU6ICdSVUxFX1BST0NFU1NJTkdfRVJST1InLFxyXG4gICAgICBtZXNzYWdlOiBgUnVsZSBwcm9jZXNzaW5nIGZhaWxlZCBmb3IgcnVsZSAke3J1bGVJZH06ICR7ZXJyb3IubWVzc2FnZX1gLFxyXG4gICAgICB1c2VyTWVzc2FnZTogYEVycmV1ciBsb3JzIGR1IHRyYWl0ZW1lbnQgZGUgbGEgcsOoZ2xlICR7cnVsZUlkfSwgdsOpcmlmaWVyIGxlIHBhcmFtw6l0cmFnZWAsXHJcbiAgICAgIHJldHJ5YWJsZTogZmFsc2UsXHJcbiAgICAgIGNvbnRleHQ6IHsgcnVsZUlkLCBleHByZXNzaW9uLCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxyXG4gICAgICBvcmlnaW5hbEVycm9yOiBlcnJvclxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBMb2cgZGV0YWlsZWQgZXJyb3IgaW5mb3JtYXRpb25cclxuICAgIGlmIChjb250ZXh0KSB7XHJcbiAgICAgIExvZ2dpbmdVdGlscy5sb2dFcnJvcihjb250ZXh0LCBlcnJvckRldGFpbHMubWVzc2FnZSwge1xyXG4gICAgICAgIHJ1bGVJZCxcclxuICAgICAgICBleHByZXNzaW9uLFxyXG4gICAgICAgIGVycm9yTmFtZTogZXJyb3IubmFtZSxcclxuICAgICAgICBlcnJvck1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXHJcbiAgICAgICAgc3RhY2tUcmFjZTogZXJyb3Iuc3RhY2ssXHJcbiAgICAgICAgcmV0cnlhYmxlOiBlcnJvckRldGFpbHMucmV0cnlhYmxlXHJcbiAgICAgIH0sIGVycm9yRGV0YWlscy5jb2RlKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZXJyb3JEZXRhaWxzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlcyBidXNpbmVzcyBsb2dpYyBlcnJvcnMgKG5vIHJ1bGVzLCBlcXVhbCB3ZWlnaHRzLCBldGMuKVxyXG4gICAqIFJlcXVpcmVtZW50czogMy4zIC0gUHJvdmlkZSBtZWFuaW5nZnVsIGVycm9yIG1lc3NhZ2VzXHJcbiAgICovXHJcbiAgc3RhdGljIGhhbmRsZUJ1c2luZXNzTG9naWNFcnJvcihlcnJvclR5cGU6IHN0cmluZywgZGV0YWlsczogYW55LCBjb250ZXh0PzogTG9nQ29udGV4dCk6IEVycm9yRGV0YWlscyB7XHJcbiAgICBsZXQgZXJyb3JEZXRhaWxzOiBFcnJvckRldGFpbHM7XHJcblxyXG4gICAgc3dpdGNoIChlcnJvclR5cGUpIHtcclxuICAgICAgY2FzZSAnTk9fTUFUQ0hJTkdfUlVMRVMnOlxyXG4gICAgICAgIGVycm9yRGV0YWlscyA9IHtcclxuICAgICAgICAgIGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5LkJVU0lORVNTX0xPR0lDLFxyXG4gICAgICAgICAgY29kZTogJ05PX01BVENISU5HX1JVTEVTJyxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdObyBydWxlcyBtYXRjaGVkIHRoZSBwcm92aWRlZCBjb250YWN0IGF0dHJpYnV0ZXMnLFxyXG4gICAgICAgICAgdXNlck1lc3NhZ2U6ICdBdWN1bmUgcsOoZ2xlIG5lIGNvcnJlc3BvbmQsIHbDqXJpZmllciBsZSBwYXJhbcOpdHJhZ2UnLFxyXG4gICAgICAgICAgcmV0cnlhYmxlOiBmYWxzZSxcclxuICAgICAgICAgIGNvbnRleHQ6IHsgY29udGFjdEF0dHJpYnV0ZXM6IGRldGFpbHMuY29udGFjdEF0dHJpYnV0ZXMsIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgY2FzZSAnRVFVQUxfV0VJR0hUUyc6XHJcbiAgICAgICAgY29uc3QgcnVsZUlkcyA9IGRldGFpbHMucnVsZUlkcy5qb2luKCcgZXQgJyk7XHJcbiAgICAgICAgZXJyb3JEZXRhaWxzID0ge1xyXG4gICAgICAgICAgY2F0ZWdvcnk6IEVycm9yQ2F0ZWdvcnkuQlVTSU5FU1NfTE9HSUMsXHJcbiAgICAgICAgICBjb2RlOiAnRVFVQUxfV0VJR0hUUycsXHJcbiAgICAgICAgICBtZXNzYWdlOiBgTXVsdGlwbGUgcnVsZXMgaGF2ZSBlcXVhbCB3ZWlnaHRzOiAke3J1bGVJZHN9YCxcclxuICAgICAgICAgIHVzZXJNZXNzYWdlOiBgTGVzIHLDqGdsZXMgJHtydWxlSWRzfSBvbnQgZGVzIHBvaWRzIGlkZW50aXF1ZXMsIHbDqXJpZmllciBsZSBwYXJhbcOpdHJhZ2VgLFxyXG4gICAgICAgICAgcmV0cnlhYmxlOiBmYWxzZSxcclxuICAgICAgICAgIGNvbnRleHQ6IHsgcnVsZUlkczogZGV0YWlscy5ydWxlSWRzLCB3ZWlnaHQ6IGRldGFpbHMud2VpZ2h0LCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGNhc2UgJ01JU1NJTkdfRElTVFJJQlVUSU9OX1NFR01FTlQnOlxyXG4gICAgICAgIGVycm9yRGV0YWlscyA9IHtcclxuICAgICAgICAgIGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5LkJVU0lORVNTX0xPR0lDLFxyXG4gICAgICAgICAgY29kZTogJ01JU1NJTkdfRElTVFJJQlVUSU9OX1NFR01FTlQnLFxyXG4gICAgICAgICAgbWVzc2FnZTogYERpc3RyaWJ1dGlvbiBzZWdtZW50IG1pc3NpbmcgZm9yIHJ1bGUgJHtkZXRhaWxzLnJ1bGVJZH1gLFxyXG4gICAgICAgICAgdXNlck1lc3NhZ2U6IGBTZWdtZW50IGRlIGRpc3RyaWJ1dGlvbiBtYW5xdWFudCBwb3VyIGxhIHLDqGdsZSAke2RldGFpbHMucnVsZUlkfSwgdsOpcmlmaWVyIGxlIHBhcmFtw6l0cmFnZWAsXHJcbiAgICAgICAgICByZXRyeWFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgY29udGV4dDogeyBydWxlSWQ6IGRldGFpbHMucnVsZUlkLCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGNhc2UgJ0VNUFRZX1JVTEVfU0VUJzpcclxuICAgICAgICBlcnJvckRldGFpbHMgPSB7XHJcbiAgICAgICAgICBjYXRlZ29yeTogRXJyb3JDYXRlZ29yeS5CVVNJTkVTU19MT0dJQyxcclxuICAgICAgICAgIGNvZGU6ICdFTVBUWV9SVUxFX1NFVCcsXHJcbiAgICAgICAgICBtZXNzYWdlOiAnTm8gcnVsZXMgYXZhaWxhYmxlIGluIHRoZSBzeXN0ZW0nLFxyXG4gICAgICAgICAgdXNlck1lc3NhZ2U6ICdBdWN1bmUgcsOoZ2xlIGRpc3BvbmlibGUgZGFucyBsZSBzeXN0w6htZSwgdsOpcmlmaWVyIGxhIGNvbmZpZ3VyYXRpb24nLFxyXG4gICAgICAgICAgcmV0cnlhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgY29udGV4dDogeyB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgZXJyb3JEZXRhaWxzID0ge1xyXG4gICAgICAgICAgY2F0ZWdvcnk6IEVycm9yQ2F0ZWdvcnkuQlVTSU5FU1NfTE9HSUMsXHJcbiAgICAgICAgICBjb2RlOiAnVU5LTk9XTl9CVVNJTkVTU19FUlJPUicsXHJcbiAgICAgICAgICBtZXNzYWdlOiBgVW5rbm93biBidXNpbmVzcyBsb2dpYyBlcnJvcjogJHtlcnJvclR5cGV9YCxcclxuICAgICAgICAgIHVzZXJNZXNzYWdlOiAnRXJyZXVyIGRlIGxvZ2lxdWUgbcOpdGllciwgdmV1aWxsZXogY29udGFjdGVyIGxlIHN1cHBvcnQnLFxyXG4gICAgICAgICAgcmV0cnlhYmxlOiBmYWxzZSxcclxuICAgICAgICAgIGNvbnRleHQ6IHsgZXJyb3JUeXBlLCBkZXRhaWxzLCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbG9naWMgZXJyb3JcclxuICAgIGlmIChjb250ZXh0KSB7XHJcbiAgICAgIExvZ2dpbmdVdGlscy5sb2dFcnJvcihjb250ZXh0LCBlcnJvckRldGFpbHMubWVzc2FnZSwgZXJyb3JEZXRhaWxzLmNvbnRleHQsIGVycm9yRGV0YWlscy5jb2RlKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZXJyb3JEZXRhaWxzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlcyBpbmZyYXN0cnVjdHVyZSBlcnJvcnMgKHRpbWVvdXRzLCBuZXR3b3JrIGlzc3VlcywgZXRjLilcclxuICAgKiBSZXF1aXJlbWVudHM6IDMuMyAtIEhhbmRsZSBpbmZyYXN0cnVjdHVyZSBmYWlsdXJlcyBncmFjZWZ1bGx5XHJcbiAgICovXHJcbiAgc3RhdGljIGhhbmRsZUluZnJhc3RydWN0dXJlRXJyb3IoZXJyb3I6IEVycm9yLCBjb21wb25lbnQ6IHN0cmluZywgY29udGV4dD86IExvZ0NvbnRleHQpOiBFcnJvckRldGFpbHMge1xyXG4gICAgY29uc3QgZXJyb3JEZXRhaWxzOiBFcnJvckRldGFpbHMgPSB7XHJcbiAgICAgIGNhdGVnb3J5OiBFcnJvckNhdGVnb3J5LklORlJBU1RSVUNUVVJFLFxyXG4gICAgICBjb2RlOiAnSU5GUkFTVFJVQ1RVUkVfRVJST1InLFxyXG4gICAgICBtZXNzYWdlOiBgSW5mcmFzdHJ1Y3R1cmUgZXJyb3IgaW4gJHtjb21wb25lbnR9OiAke2Vycm9yLm1lc3NhZ2V9YCxcclxuICAgICAgdXNlck1lc3NhZ2U6ICdFcnJldXIgdGVjaG5pcXVlIHRlbXBvcmFpcmUsIHZldWlsbGV6IHLDqWVzc2F5ZXInLFxyXG4gICAgICByZXRyeWFibGU6IHRydWUsXHJcbiAgICAgIGNvbnRleHQ6IHsgY29tcG9uZW50LCB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxyXG4gICAgICBvcmlnaW5hbEVycm9yOiBlcnJvclxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBEZXRlcm1pbmUgaWYgZXJyb3IgaXMgcmV0cnlhYmxlIGJhc2VkIG9uIGVycm9yIHR5cGVcclxuICAgIGlmIChlcnJvci5uYW1lID09PSAnVGltZW91dEVycm9yJyB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCd0aW1lb3V0JykpIHtcclxuICAgICAgZXJyb3JEZXRhaWxzLmNvZGUgPSAnVElNRU9VVF9FUlJPUic7XHJcbiAgICAgIGVycm9yRGV0YWlscy5yZXRyeWFibGUgPSB0cnVlO1xyXG4gICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCduZXR3b3JrJykgfHwgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnY29ubmVjdGlvbicpKSB7XHJcbiAgICAgIGVycm9yRGV0YWlscy5jb2RlID0gJ05FVFdPUktfRVJST1InO1xyXG4gICAgICBlcnJvckRldGFpbHMucmV0cnlhYmxlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMb2cgaW5mcmFzdHJ1Y3R1cmUgZXJyb3JcclxuICAgIGlmIChjb250ZXh0KSB7XHJcbiAgICAgIExvZ2dpbmdVdGlscy5sb2dFcnJvcihjb250ZXh0LCBlcnJvckRldGFpbHMubWVzc2FnZSwge1xyXG4gICAgICAgIGNvbXBvbmVudCxcclxuICAgICAgICBlcnJvck5hbWU6IGVycm9yLm5hbWUsXHJcbiAgICAgICAgZXJyb3JNZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxyXG4gICAgICAgIHN0YWNrVHJhY2U6IGVycm9yLnN0YWNrLFxyXG4gICAgICAgIHJldHJ5YWJsZTogZXJyb3JEZXRhaWxzLnJldHJ5YWJsZVxyXG4gICAgICB9LCBlcnJvckRldGFpbHMuY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGVycm9yRGV0YWlscztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnZlcnRzIEVycm9yRGV0YWlscyB0byBFcnJvclJlc3BvbnNlIGZvcm1hdFxyXG4gICAqL1xyXG4gIHN0YXRpYyB0b0Vycm9yUmVzcG9uc2UoZXJyb3JEZXRhaWxzOiBFcnJvckRldGFpbHMsIHJlcXVlc3RJZDogc3RyaW5nKTogRXJyb3JSZXNwb25zZSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgZXJyb3I6IGVycm9yRGV0YWlscy51c2VyTWVzc2FnZSxcclxuICAgICAgZXJyb3JDb2RlOiBlcnJvckRldGFpbHMuY29kZSxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgZGV0YWlsczoge1xyXG4gICAgICAgIGNhdGVnb3J5OiBlcnJvckRldGFpbHMuY2F0ZWdvcnksXHJcbiAgICAgICAgcmV0cnlhYmxlOiBlcnJvckRldGFpbHMucmV0cnlhYmxlLFxyXG4gICAgICAgIGNvbnRleHQ6IGVycm9yRGV0YWlscy5jb250ZXh0XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZXRlcm1pbmVzIGlmIGFuIGVycm9yIHNob3VsZCB0cmlnZ2VyIGEgcmV0cnlcclxuICAgKi9cclxuICBzdGF0aWMgc2hvdWxkUmV0cnkoZXJyb3JEZXRhaWxzOiBFcnJvckRldGFpbHMsIGF0dGVtcHRDb3VudDogbnVtYmVyLCBtYXhBdHRlbXB0czogbnVtYmVyID0gMyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIGVycm9yRGV0YWlscy5yZXRyeWFibGUgJiYgYXR0ZW1wdENvdW50IDwgbWF4QXR0ZW1wdHM7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVmFsaWRhdGlvblV0aWxzIHtcclxuICBcclxuICBzdGF0aWMgdmFsaWRhdGVRdWFsaWZpY2F0aW9uUmVxdWVzdChyZXF1ZXN0OiBhbnkpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0ge1xyXG4gICAgaWYgKCFyZXF1ZXN0KSB7XHJcbiAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXJlcXVlc3QuaW50ZXJhY3Rpb25JZCB8fCB0eXBlb2YgcmVxdWVzdC5pbnRlcmFjdGlvbklkICE9PSAnc3RyaW5nJykge1xyXG4gICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgZXJyb3I6ICdpbnRlcmFjdGlvbklkIGlzIHJlcXVpcmVkIGFuZCBtdXN0IGJlIGEgc3RyaW5nJyB9O1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghcmVxdWVzdC5jb250YWN0QXR0cmlidXRlcyB8fCB0eXBlb2YgcmVxdWVzdC5jb250YWN0QXR0cmlidXRlcyAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgcmV0dXJuIHsgaXNWYWxpZDogZmFsc2UsIGVycm9yOiAnY29udGFjdEF0dHJpYnV0ZXMgaXMgcmVxdWlyZWQgYW5kIG11c3QgYmUgYW4gb2JqZWN0JyB9O1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGF0dHJpYnV0ZXNWYWxpZGF0aW9uID0gdGhpcy52YWxpZGF0ZUNvbnRhY3RBdHRyaWJ1dGVzKHJlcXVlc3QuY29udGFjdEF0dHJpYnV0ZXMpO1xyXG4gICAgaWYgKCFhdHRyaWJ1dGVzVmFsaWRhdGlvbi5pc1ZhbGlkKSB7XHJcbiAgICAgIHJldHVybiBhdHRyaWJ1dGVzVmFsaWRhdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyBpc1ZhbGlkOiB0cnVlIH07XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgdmFsaWRhdGVDb250YWN0QXR0cmlidXRlcyhhdHRyaWJ1dGVzOiBhbnkpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0ge1xyXG4gICAgaWYgKCFhdHRyaWJ1dGVzIHx8IHR5cGVvZiBhdHRyaWJ1dGVzICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGF0dHJpYnV0ZXMpKSB7XHJcbiAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBlcnJvcjogJ0NvbnRhY3QgYXR0cmlidXRlcyBtdXN0IGJlIGFuIG9iamVjdCcgfTtcclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhhdHRyaWJ1dGVzKSkge1xyXG4gICAgICBpZiAodHlwZW9mIGtleSAhPT0gJ3N0cmluZycgfHwga2V5LnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgZXJyb3I6ICdBbGwgYXR0cmlidXRlIGtleXMgbXVzdCBiZSBub24tZW1wdHkgc3RyaW5ncycgfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgdmFsdWVUeXBlID0gdHlwZW9mIHZhbHVlO1xyXG4gICAgICBpZiAodmFsdWVUeXBlICE9PSAnYm9vbGVhbicgJiYgdmFsdWVUeXBlICE9PSAnc3RyaW5nJyAmJiB2YWx1ZVR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgICBpc1ZhbGlkOiBmYWxzZSwgXHJcbiAgICAgICAgICBlcnJvcjogYEF0dHJpYnV0ZSAnJHtrZXl9JyBoYXMgaW52YWxpZCB0eXBlICcke3ZhbHVlVHlwZX0nLiBPbmx5IGJvb2xlYW4sIHN0cmluZywgYW5kIG51bWJlciBhcmUgYWxsb3dlZC5gIFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEFkZGl0aW9uYWwgdmFsaWRhdGlvbiBmb3Igc3RyaW5nIHZhbHVlc1xyXG4gICAgICBpZiAodmFsdWVUeXBlID09PSAnc3RyaW5nJyAmJiAodmFsdWUgYXMgc3RyaW5nKS5sZW5ndGggPiAxMDAwKSB7XHJcbiAgICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgICBpc1ZhbGlkOiBmYWxzZSwgXHJcbiAgICAgICAgICBlcnJvcjogYEF0dHJpYnV0ZSAnJHtrZXl9JyBzdHJpbmcgdmFsdWUgZXhjZWVkcyBtYXhpbXVtIGxlbmd0aCBvZiAxMDAwIGNoYXJhY3RlcnNgIFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIEFkZGl0aW9uYWwgdmFsaWRhdGlvbiBmb3IgbnVtYmVyIHZhbHVlc1xyXG4gICAgICBpZiAodmFsdWVUeXBlID09PSAnbnVtYmVyJyAmJiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSBhcyBudW1iZXIpKSkge1xyXG4gICAgICAgIHJldHVybiB7IFxyXG4gICAgICAgICAgaXNWYWxpZDogZmFsc2UsIFxyXG4gICAgICAgICAgZXJyb3I6IGBBdHRyaWJ1dGUgJyR7a2V5fScgbXVzdCBiZSBhIGZpbml0ZSBudW1iZXJgIFxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyBpc1ZhbGlkOiB0cnVlIH07XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2FuaXRpemVDb250YWN0QXR0cmlidXRlcyhhdHRyaWJ1dGVzOiBDb250YWN0QXR0cmlidXRlcyk6IENvbnRhY3RBdHRyaWJ1dGVzIHtcclxuICAgIGNvbnN0IHNhbml0aXplZDogQ29udGFjdEF0dHJpYnV0ZXMgPSB7fTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYXR0cmlidXRlcykpIHtcclxuICAgICAgY29uc3QgY2xlYW5LZXkgPSBrZXkudHJpbSgpO1xyXG4gICAgICBpZiAoY2xlYW5LZXkpIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgc2FuaXRpemVkW2NsZWFuS2V5XSA9ICh2YWx1ZSBhcyBzdHJpbmcpLnRyaW0oKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgc2FuaXRpemVkW2NsZWFuS2V5XSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gc2FuaXRpemVkO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIGZvcm1hdEVycm9yUmVzcG9uc2UoZXJyb3I6IHN0cmluZywgZXJyb3JDb2RlOiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCBkZXRhaWxzPzogYW55KTogRXJyb3JSZXNwb25zZSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgZXJyb3IsXHJcbiAgICAgIGVycm9yQ29kZSxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgZGV0YWlsc1xyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBmb3JtYXRWYWxpZGF0aW9uRXJyb3IodmFsaWRhdGlvbkVycm9yOiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nKTogRXJyb3JSZXNwb25zZSB7XHJcbiAgICByZXR1cm4gdGhpcy5mb3JtYXRFcnJvclJlc3BvbnNlKFxyXG4gICAgICBgRm9ybWF0IGRlIGNvbnRhY3QgYXR0cmlidXRlcyBpbnZhbGlkZTogJHt2YWxpZGF0aW9uRXJyb3J9YCxcclxuICAgICAgJ1ZBTElEQVRJT05fRVJST1InLFxyXG4gICAgICByZXF1ZXN0SWRcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFbmhhbmNlZCBlcnJvciByZXNwb25zZSBmb3JtYXR0aW5nIHVzaW5nIHRoZSBlcnJvciBoYW5kbGluZyBmcmFtZXdvcmtcclxuICAgKi9cclxuICBzdGF0aWMgZm9ybWF0RW5oYW5jZWRFcnJvclJlc3BvbnNlKGVycm9yRGV0YWlsczogRXJyb3JEZXRhaWxzLCByZXF1ZXN0SWQ6IHN0cmluZyk6IEVycm9yUmVzcG9uc2Uge1xyXG4gICAgcmV0dXJuIEVycm9ySGFuZGxpbmdGcmFtZXdvcmsudG9FcnJvclJlc3BvbnNlKGVycm9yRGV0YWlscywgcmVxdWVzdElkKTtcclxuICB9XHJcbn0iXX0=