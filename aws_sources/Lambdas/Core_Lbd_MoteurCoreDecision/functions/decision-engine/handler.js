"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const DecisionEngine_1 = require("../../services/decision-engine/DecisionEngine");
const HybridCriteriaManager_1 = require("../../services/decision-engine/HybridCriteriaManager");
// Fonction pour détecter le type d'événement
function isApiGatewayEvent(event) {
    return event.httpMethod !== undefined;
}
// Fonction pour détecter un événement Connect
function isConnectEvent(event) {
    return event.Details !== undefined || (event.interactionId !== undefined && event.contactAttributes !== undefined);
}
// Traiter les événements API Gateway
async function handleApiGatewayRequest(event) {
    var _a, _b, _c, _d;
    // Handle preflight OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Max-Age': '86400'
            },
            body: ''
        };
    }
    try {
        // Validate HTTP method
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Method not allowed',
                    errorCode: 'METHOD_NOT_ALLOWED',
                    timestamp: new Date().toISOString(),
                    requestId: ((_a = event.requestContext) === null || _a === void 0 ? void 0 : _a.requestId) || 'unknown'
                })
            };
        }
        // Validate request body exists
        if (!event.body) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Request body is required',
                    errorCode: 'MISSING_BODY',
                    timestamp: new Date().toISOString(),
                    requestId: ((_b = event.requestContext) === null || _b === void 0 ? void 0 : _b.requestId) || 'unknown'
                })
            };
        }
        // Parse request body with error handling
        let request;
        try {
            request = JSON.parse(event.body);
        }
        catch (parseError) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid JSON in request body',
                    errorCode: 'INVALID_JSON',
                    timestamp: new Date().toISOString(),
                    requestId: ((_c = event.requestContext) === null || _c === void 0 ? void 0 : _c.requestId) || 'unknown'
                })
            };
        }
        // Initialize decision engine
        const decisionEngine = new DecisionEngine_1.DecisionEngine();
        // Process decision
        const response = await decisionEngine.processDecision(request);
        // Determine status code based on response
        const statusCode = response.success ? 200 : 400;
        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,POST'
            },
            body: JSON.stringify(response)
        };
    }
    catch (error) {
        console.error('Decision engine error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error',
                errorCode: 'INTERNAL_ERROR',
                timestamp: new Date().toISOString(),
                requestId: ((_d = event.requestContext) === null || _d === void 0 ? void 0 : _d.requestId) || 'unknown'
            })
        };
    }
}
// Traiter les événements Amazon Connect
async function handleConnectRequest(event) {
    var _a;
    try {
        console.log('Processing Connect event:', JSON.stringify(event, null, 2));
        let interactionId;
        let contactAttributes;
        // Extraire les données selon le format Connect ou format de test direct
        if ((_a = event.Details) === null || _a === void 0 ? void 0 : _a.ContactData) {
            // Format Amazon Connect standard
            interactionId = event.Details.ContactData.ContactId || 'unknown';
            contactAttributes = event.Details.ContactData.Attributes || {};
            // Convertir les valeurs string en types appropriés
            const convertedAttributes = {};
            for (const [key, value] of Object.entries(contactAttributes)) {
                // Essayer de convertir les booléens et nombres
                if (value === 'true')
                    convertedAttributes[key] = true;
                else if (value === 'false')
                    convertedAttributes[key] = false;
                else if (!isNaN(Number(value)) && value !== '')
                    convertedAttributes[key] = Number(value);
                else
                    convertedAttributes[key] = value;
            }
            contactAttributes = convertedAttributes;
        }
        else if (event.interactionId && event.contactAttributes) {
            // Format de test direct
            interactionId = event.interactionId;
            contactAttributes = event.contactAttributes;
        }
        else {
            throw new Error('Invalid Connect event format: missing ContactData or direct attributes');
        }
        // Créer la requête pour le moteur de décision
        const request = {
            interactionId,
            contactAttributes
        };
        console.log('Processed qualification request:', JSON.stringify(request, null, 2));
        // Initialize decision engine
        const decisionEngine = new DecisionEngine_1.DecisionEngine();
        // Process decision
        const response = await decisionEngine.processDecision(request);
        // Retourner la réponse au format Connect
        const connectResponse = {
            success: response.success,
            timestamp: new Date().toISOString(),
            requestId: interactionId
        };
        if (response.success && response.distributionSegment) {
            connectResponse.distributionSegment = response.distributionSegment;
            // Ajouter l'ID de la règle qui a matché
            if (response.selectedRuleId) {
                connectResponse.ruleId = response.selectedRuleId;
            }
            // Ajouter le libellé et la priorité
            if (response.libellé) {
                connectResponse.libellé = response.libellé;
            }
            if (response.priority !== undefined) {
                connectResponse.priority = response.priority;
            }
        }
        else {
            connectResponse.error = response.error || 'Decision processing failed';
            connectResponse.errorCode = response.errorCode || 'PROCESSING_ERROR';
        }
        console.log('Connect response:', JSON.stringify(connectResponse, null, 2));
        return connectResponse;
    }
    catch (error) {
        console.error('Connect decision engine error:', error);
        return {
            success: false,
            error: 'Internal server error',
            errorCode: 'INTERNAL_ERROR',
            timestamp: new Date().toISOString(),
            requestId: 'unknown'
        };
    }
}
const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    // ✅ Warm-up du cache au démarrage de la Lambda
    // Ceci pré-charge les critères secondaires depuis Parameter Store
    // pour éviter la latence du premier appel
    await HybridCriteriaManager_1.HybridCriteriaManager.initialize();
    // Détecter le type d'événement et router vers le bon handler
    if (isApiGatewayEvent(event)) {
        console.log('Processing as API Gateway event');
        return handleApiGatewayRequest(event);
    }
    else if (isConnectEvent(event)) {
        console.log('Processing as Connect event');
        return handleConnectRequest(event);
    }
    else {
        console.error('Unknown event type:', event);
        // Retourner une erreur générique
        const errorResponse = {
            success: false,
            error: 'Unsupported event type',
            errorCode: 'UNSUPPORTED_EVENT_TYPE',
            timestamp: new Date().toISOString(),
            requestId: 'unknown'
        };
        // Si ça ressemble à une requête API Gateway, retourner le format approprié
        if (event.httpMethod !== undefined) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify(errorResponse)
            };
        }
        // Sinon retourner directement l'erreur
        return errorResponse;
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9mdW5jdGlvbnMvZGVjaXNpb24tZW5naW5lL2hhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0Esa0ZBQStFO0FBRS9FLGdHQUE2RjtBQTRCN0YsNkNBQTZDO0FBQzdDLFNBQVMsaUJBQWlCLENBQUMsS0FBVTtJQUNuQyxPQUFPLEtBQUssQ0FBQyxVQUFVLEtBQUssU0FBUyxDQUFDO0FBQ3hDLENBQUM7QUFFRCw4Q0FBOEM7QUFDOUMsU0FBUyxjQUFjLENBQUMsS0FBVTtJQUNoQyxPQUFPLEtBQUssQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsS0FBSyxTQUFTLElBQUksS0FBSyxDQUFDLGlCQUFpQixLQUFLLFNBQVMsQ0FBQyxDQUFDO0FBQ3JILENBQUM7QUFFRCxxQ0FBcUM7QUFDckMsS0FBSyxVQUFVLHVCQUF1QixDQUFDLEtBQTJCOztJQUNoRSw2Q0FBNkM7SUFDN0MsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ25DLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCw2QkFBNkIsRUFBRSxHQUFHO2dCQUNsQyw4QkFBOEIsRUFBRSw2QkFBNkI7Z0JBQzdELDhCQUE4QixFQUFFLGNBQWM7Z0JBQzlDLHdCQUF3QixFQUFFLE9BQU87YUFDbEM7WUFDRCxJQUFJLEVBQUUsRUFBRTtTQUNULENBQUM7SUFDSixDQUFDO0lBRUQsSUFBSSxDQUFDO1FBQ0gsdUJBQXVCO1FBQ3ZCLElBQUksS0FBSyxDQUFDLFVBQVUsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2lCQUNuQztnQkFDRCxJQUFJ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QkFDbEMsNkJBQTZCLEVBQUUsR0FBRztpQkFDbkM7Z0JBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDO2FBQ3BDLENBQUM7UUFDSixDQUFDO1FBRUQsdUNBQXVDO1FBQ3ZDLE9BQU8sYUFBYSxDQUFDO0lBQ3ZCLENBQUM7QUFDSCxDQUFDLENBQUM7QUExQ1csUUFBQSxPQUFPLFdBMENsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgRGVjaXNpb25FbmdpbmUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvRGVjaXNpb25FbmdpbmUnO1xyXG5pbXBvcnQgeyBRdWFsaWZpY2F0aW9uUmVxdWVzdCwgRGVjaXNpb25SZXNwb25zZSB9IGZyb20gJy4uLy4uL3R5cGVzL2RlY2lzaW9uLWVuZ2luZSc7XHJcbmltcG9ydCB7IEh5YnJpZENyaXRlcmlhTWFuYWdlciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2RlY2lzaW9uLWVuZ2luZS9IeWJyaWRDcml0ZXJpYU1hbmFnZXInO1xyXG5cclxuLy8gVHlwZXMgcG91ciBBbWF6b24gQ29ubmVjdFxyXG5pbnRlcmZhY2UgQ29ubmVjdEV2ZW50IHtcclxuICBEZXRhaWxzPzoge1xyXG4gICAgQ29udGFjdERhdGE/OiB7XHJcbiAgICAgIEF0dHJpYnV0ZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xyXG4gICAgICBDb250YWN0SWQ/OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcbiAgfTtcclxuICAvLyBTdXBwb3J0IGRpcmVjdCBwb3VyIGxlcyB0ZXN0c1xyXG4gIGludGVyYWN0aW9uSWQ/OiBzdHJpbmc7XHJcbiAgY29udGFjdEF0dHJpYnV0ZXM/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29ubmVjdFJlc3BvbnNlIHtcclxuICBkaXN0cmlidXRpb25TZWdtZW50Pzogc3RyaW5nO1xyXG4gIHN1Y2Nlc3M6IGJvb2xlYW47XHJcbiAgZXJyb3I/OiBzdHJpbmc7XHJcbiAgZXJyb3JDb2RlPzogc3RyaW5nO1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG4gIHJlcXVlc3RJZD86IHN0cmluZztcclxuICBydWxlSWQ/OiBzdHJpbmc7ICAvLyBJRCBkZSBsYSByw6hnbGVcclxuICBsaWJlbGzDqT86IHN0cmluZzsgIC8vIERlc2NyaXB0aW9uIGRlIGxhIHLDqGdsZVxyXG4gIHByaW9yaXR5PzogbnVtYmVyOyAgLy8gUHJpb3JpdMOpIGRlIGxhIHLDqGdsZVxyXG59XHJcblxyXG4vLyBGb25jdGlvbiBwb3VyIGTDqXRlY3RlciBsZSB0eXBlIGQnw6l2w6luZW1lbnRcclxuZnVuY3Rpb24gaXNBcGlHYXRld2F5RXZlbnQoZXZlbnQ6IGFueSk6IGV2ZW50IGlzIEFQSUdhdGV3YXlQcm94eUV2ZW50IHtcclxuICByZXR1cm4gZXZlbnQuaHR0cE1ldGhvZCAhPT0gdW5kZWZpbmVkO1xyXG59XHJcblxyXG4vLyBGb25jdGlvbiBwb3VyIGTDqXRlY3RlciB1biDDqXbDqW5lbWVudCBDb25uZWN0XHJcbmZ1bmN0aW9uIGlzQ29ubmVjdEV2ZW50KGV2ZW50OiBhbnkpOiBldmVudCBpcyBDb25uZWN0RXZlbnQge1xyXG4gIHJldHVybiBldmVudC5EZXRhaWxzICE9PSB1bmRlZmluZWQgfHwgKGV2ZW50LmludGVyYWN0aW9uSWQgIT09IHVuZGVmaW5lZCAmJiBldmVudC5jb250YWN0QXR0cmlidXRlcyAhPT0gdW5kZWZpbmVkKTtcclxufVxyXG5cclxuLy8gVHJhaXRlciBsZXMgw6l2w6luZW1lbnRzIEFQSSBHYXRld2F5XHJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFwaUdhdGV3YXlSZXF1ZXN0KGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCk6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiB7XHJcbiAgLy8gSGFuZGxlIHByZWZsaWdodCBPUFRJT05TIHJlcXVlc3RzIGZvciBDT1JTXHJcbiAgaWYgKGV2ZW50Lmh0dHBNZXRob2QgPT09ICdPUFRJT05TJykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ09QVElPTlMsUE9TVCcsXHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLU1heC1BZ2UnOiAnODY0MDAnXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6ICcnXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFZhbGlkYXRlIEhUVFAgbWV0aG9kXHJcbiAgICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAhPT0gJ1BPU1QnKSB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogNDA1LFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIGVycm9yOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyxcclxuICAgICAgICAgIGVycm9yQ29kZTogJ01FVEhPRF9OT1RfQUxMT1dFRCcsXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHJlcXVlc3RJZDogZXZlbnQucmVxdWVzdENvbnRleHQ/LnJlcXVlc3RJZCB8fCAndW5rbm93bidcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZhbGlkYXRlIHJlcXVlc3QgYm9keSBleGlzdHNcclxuICAgIGlmICghZXZlbnQuYm9keSkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcsXHJcbiAgICAgICAgICBlcnJvckNvZGU6ICdNSVNTSU5HX0JPRFknLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICByZXF1ZXN0SWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5yZXF1ZXN0SWQgfHwgJ3Vua25vd24nXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHkgd2l0aCBlcnJvciBoYW5kbGluZ1xyXG4gICAgbGV0IHJlcXVlc3Q6IFF1YWxpZmljYXRpb25SZXF1ZXN0O1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XHJcbiAgICB9IGNhdGNoIChwYXJzZUVycm9yKSB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBKU09OIGluIHJlcXVlc3QgYm9keScsXHJcbiAgICAgICAgICBlcnJvckNvZGU6ICdJTlZBTElEX0pTT04nLFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICByZXF1ZXN0SWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5yZXF1ZXN0SWQgfHwgJ3Vua25vd24nXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gSW5pdGlhbGl6ZSBkZWNpc2lvbiBlbmdpbmVcclxuICAgIGNvbnN0IGRlY2lzaW9uRW5naW5lID0gbmV3IERlY2lzaW9uRW5naW5lKCk7XHJcbiAgICBcclxuICAgIC8vIFByb2Nlc3MgZGVjaXNpb25cclxuICAgIGNvbnN0IHJlc3BvbnNlOiBEZWNpc2lvblJlc3BvbnNlID0gYXdhaXQgZGVjaXNpb25FbmdpbmUucHJvY2Vzc0RlY2lzaW9uKHJlcXVlc3QpO1xyXG4gICAgXHJcbiAgICAvLyBEZXRlcm1pbmUgc3RhdHVzIGNvZGUgYmFzZWQgb24gcmVzcG9uc2VcclxuICAgIGNvbnN0IHN0YXR1c0NvZGUgPSByZXNwb25zZS5zdWNjZXNzID8gMjAwIDogNDAwO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXNDb2RlLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSwgQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnT1BUSU9OUyxQT1NUJ1xyXG4gICAgICB9LFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXNwb25zZSlcclxuICAgIH07XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0RlY2lzaW9uIGVuZ2luZSBlcnJvcjonLCBlcnJvcik7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJ1xyXG4gICAgICB9LFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxyXG4gICAgICAgIGVycm9yQ29kZTogJ0lOVEVSTkFMX0VSUk9SJyxcclxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICByZXF1ZXN0SWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5yZXF1ZXN0SWQgfHwgJ3Vua25vd24nXHJcbiAgICAgIH0pXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuLy8gVHJhaXRlciBsZXMgw6l2w6luZW1lbnRzIEFtYXpvbiBDb25uZWN0XHJcbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNvbm5lY3RSZXF1ZXN0KGV2ZW50OiBDb25uZWN0RXZlbnQpOiBQcm9taXNlPENvbm5lY3RSZXNwb25zZT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBDb25uZWN0IGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcblxyXG4gICAgbGV0IGludGVyYWN0aW9uSWQ6IHN0cmluZztcclxuICAgIGxldCBjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55PjtcclxuXHJcbiAgICAvLyBFeHRyYWlyZSBsZXMgZG9ubsOpZXMgc2Vsb24gbGUgZm9ybWF0IENvbm5lY3Qgb3UgZm9ybWF0IGRlIHRlc3QgZGlyZWN0XHJcbiAgICBpZiAoZXZlbnQuRGV0YWlscz8uQ29udGFjdERhdGEpIHtcclxuICAgICAgLy8gRm9ybWF0IEFtYXpvbiBDb25uZWN0IHN0YW5kYXJkXHJcbiAgICAgIGludGVyYWN0aW9uSWQgPSBldmVudC5EZXRhaWxzLkNvbnRhY3REYXRhLkNvbnRhY3RJZCB8fCAndW5rbm93bic7XHJcbiAgICAgIGNvbnRhY3RBdHRyaWJ1dGVzID0gZXZlbnQuRGV0YWlscy5Db250YWN0RGF0YS5BdHRyaWJ1dGVzIHx8IHt9O1xyXG4gICAgICBcclxuICAgICAgLy8gQ29udmVydGlyIGxlcyB2YWxldXJzIHN0cmluZyBlbiB0eXBlcyBhcHByb3ByacOpc1xyXG4gICAgICBjb25zdCBjb252ZXJ0ZWRBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XHJcbiAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbnRhY3RBdHRyaWJ1dGVzKSkge1xyXG4gICAgICAgIC8vIEVzc2F5ZXIgZGUgY29udmVydGlyIGxlcyBib29sw6llbnMgZXQgbm9tYnJlc1xyXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gJ3RydWUnKSBjb252ZXJ0ZWRBdHRyaWJ1dGVzW2tleV0gPSB0cnVlO1xyXG4gICAgICAgIGVsc2UgaWYgKHZhbHVlID09PSAnZmFsc2UnKSBjb252ZXJ0ZWRBdHRyaWJ1dGVzW2tleV0gPSBmYWxzZTtcclxuICAgICAgICBlbHNlIGlmICghaXNOYU4oTnVtYmVyKHZhbHVlKSkgJiYgdmFsdWUgIT09ICcnKSBjb252ZXJ0ZWRBdHRyaWJ1dGVzW2tleV0gPSBOdW1iZXIodmFsdWUpO1xyXG4gICAgICAgIGVsc2UgY29udmVydGVkQXR0cmlidXRlc1trZXldID0gdmFsdWU7XHJcbiAgICAgIH1cclxuICAgICAgY29udGFjdEF0dHJpYnV0ZXMgPSBjb252ZXJ0ZWRBdHRyaWJ1dGVzO1xyXG4gICAgfSBlbHNlIGlmIChldmVudC5pbnRlcmFjdGlvbklkICYmIGV2ZW50LmNvbnRhY3RBdHRyaWJ1dGVzKSB7XHJcbiAgICAgIC8vIEZvcm1hdCBkZSB0ZXN0IGRpcmVjdFxyXG4gICAgICBpbnRlcmFjdGlvbklkID0gZXZlbnQuaW50ZXJhY3Rpb25JZDtcclxuICAgICAgY29udGFjdEF0dHJpYnV0ZXMgPSBldmVudC5jb250YWN0QXR0cmlidXRlcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBDb25uZWN0IGV2ZW50IGZvcm1hdDogbWlzc2luZyBDb250YWN0RGF0YSBvciBkaXJlY3QgYXR0cmlidXRlcycpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENyw6llciBsYSByZXF1w6p0ZSBwb3VyIGxlIG1vdGV1ciBkZSBkw6ljaXNpb25cclxuICAgIGNvbnN0IHJlcXVlc3Q6IFF1YWxpZmljYXRpb25SZXF1ZXN0ID0ge1xyXG4gICAgICBpbnRlcmFjdGlvbklkLFxyXG4gICAgICBjb250YWN0QXR0cmlidXRlc1xyXG4gICAgfTtcclxuXHJcbiAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2VkIHF1YWxpZmljYXRpb24gcmVxdWVzdDonLCBKU09OLnN0cmluZ2lmeShyZXF1ZXN0LCBudWxsLCAyKSk7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBkZWNpc2lvbiBlbmdpbmVcclxuICAgIGNvbnN0IGRlY2lzaW9uRW5naW5lID0gbmV3IERlY2lzaW9uRW5naW5lKCk7XHJcbiAgICBcclxuICAgIC8vIFByb2Nlc3MgZGVjaXNpb25cclxuICAgIGNvbnN0IHJlc3BvbnNlOiBEZWNpc2lvblJlc3BvbnNlID0gYXdhaXQgZGVjaXNpb25FbmdpbmUucHJvY2Vzc0RlY2lzaW9uKHJlcXVlc3QpO1xyXG4gICAgXHJcbiAgICAvLyBSZXRvdXJuZXIgbGEgcsOpcG9uc2UgYXUgZm9ybWF0IENvbm5lY3RcclxuICAgIGNvbnN0IGNvbm5lY3RSZXNwb25zZTogQ29ubmVjdFJlc3BvbnNlID0ge1xyXG4gICAgICBzdWNjZXNzOiByZXNwb25zZS5zdWNjZXNzLFxyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgcmVxdWVzdElkOiBpbnRlcmFjdGlvbklkXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChyZXNwb25zZS5zdWNjZXNzICYmIHJlc3BvbnNlLmRpc3RyaWJ1dGlvblNlZ21lbnQpIHtcclxuICAgICAgY29ubmVjdFJlc3BvbnNlLmRpc3RyaWJ1dGlvblNlZ21lbnQgPSByZXNwb25zZS5kaXN0cmlidXRpb25TZWdtZW50O1xyXG4gICAgICAvLyBBam91dGVyIGwnSUQgZGUgbGEgcsOoZ2xlIHF1aSBhIG1hdGNow6lcclxuICAgICAgaWYgKHJlc3BvbnNlLnNlbGVjdGVkUnVsZUlkKSB7XHJcbiAgICAgICAgY29ubmVjdFJlc3BvbnNlLnJ1bGVJZCA9IHJlc3BvbnNlLnNlbGVjdGVkUnVsZUlkO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIEFqb3V0ZXIgbGUgbGliZWxsw6kgZXQgbGEgcHJpb3JpdMOpXHJcbiAgICAgIGlmIChyZXNwb25zZS5saWJlbGzDqSkge1xyXG4gICAgICAgIGNvbm5lY3RSZXNwb25zZS5saWJlbGzDqSA9IHJlc3BvbnNlLmxpYmVsbMOpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChyZXNwb25zZS5wcmlvcml0eSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29ubmVjdFJlc3BvbnNlLnByaW9yaXR5ID0gcmVzcG9uc2UucHJpb3JpdHk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbm5lY3RSZXNwb25zZS5lcnJvciA9IHJlc3BvbnNlLmVycm9yIHx8ICdEZWNpc2lvbiBwcm9jZXNzaW5nIGZhaWxlZCc7XHJcbiAgICAgIGNvbm5lY3RSZXNwb25zZS5lcnJvckNvZGUgPSByZXNwb25zZS5lcnJvckNvZGUgfHwgJ1BST0NFU1NJTkdfRVJST1InO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKCdDb25uZWN0IHJlc3BvbnNlOicsIEpTT04uc3RyaW5naWZ5KGNvbm5lY3RSZXNwb25zZSwgbnVsbCwgMikpO1xyXG4gICAgcmV0dXJuIGNvbm5lY3RSZXNwb25zZTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0Nvbm5lY3QgZGVjaXNpb24gZW5naW5lIGVycm9yOicsIGVycm9yKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcclxuICAgICAgZXJyb3JDb2RlOiAnSU5URVJOQUxfRVJST1InLFxyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgcmVxdWVzdElkOiAndW5rbm93bidcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KTogUHJvbWlzZTxhbnk+ID0+IHtcclxuICBjb25zb2xlLmxvZygnUmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuXHJcbiAgLy8g4pyFIFdhcm0tdXAgZHUgY2FjaGUgYXUgZMOpbWFycmFnZSBkZSBsYSBMYW1iZGFcclxuICAvLyBDZWNpIHByw6ktY2hhcmdlIGxlcyBjcml0w6hyZXMgc2Vjb25kYWlyZXMgZGVwdWlzIFBhcmFtZXRlciBTdG9yZVxyXG4gIC8vIHBvdXIgw6l2aXRlciBsYSBsYXRlbmNlIGR1IHByZW1pZXIgYXBwZWxcclxuICBhd2FpdCBIeWJyaWRDcml0ZXJpYU1hbmFnZXIuaW5pdGlhbGl6ZSgpO1xyXG5cclxuICAvLyBEw6l0ZWN0ZXIgbGUgdHlwZSBkJ8OpdsOpbmVtZW50IGV0IHJvdXRlciB2ZXJzIGxlIGJvbiBoYW5kbGVyXHJcbiAgaWYgKGlzQXBpR2F0ZXdheUV2ZW50KGV2ZW50KSkge1xyXG4gICAgY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgYXMgQVBJIEdhdGV3YXkgZXZlbnQnKTtcclxuICAgIHJldHVybiBoYW5kbGVBcGlHYXRld2F5UmVxdWVzdChldmVudCk7XHJcbiAgfSBlbHNlIGlmIChpc0Nvbm5lY3RFdmVudChldmVudCkpIHtcclxuICAgIGNvbnNvbGUubG9nKCdQcm9jZXNzaW5nIGFzIENvbm5lY3QgZXZlbnQnKTtcclxuICAgIHJldHVybiBoYW5kbGVDb25uZWN0UmVxdWVzdChldmVudCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gZXZlbnQgdHlwZTonLCBldmVudCk7XHJcbiAgICBcclxuICAgIC8vIFJldG91cm5lciB1bmUgZXJyZXVyIGfDqW7DqXJpcXVlXHJcbiAgICBjb25zdCBlcnJvclJlc3BvbnNlID0ge1xyXG4gICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgZXJyb3I6ICdVbnN1cHBvcnRlZCBldmVudCB0eXBlJyxcclxuICAgICAgZXJyb3JDb2RlOiAnVU5TVVBQT1JURURfRVZFTlRfVFlQRScsXHJcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICByZXF1ZXN0SWQ6ICd1bmtub3duJ1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTaSDDp2EgcmVzc2VtYmxlIMOgIHVuZSByZXF1w6p0ZSBBUEkgR2F0ZXdheSwgcmV0b3VybmVyIGxlIGZvcm1hdCBhcHByb3ByacOpXHJcbiAgICBpZiAoZXZlbnQuaHR0cE1ldGhvZCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgICAgfSxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShlcnJvclJlc3BvbnNlKVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNpbm9uIHJldG91cm5lciBkaXJlY3RlbWVudCBsJ2VycmV1clxyXG4gICAgcmV0dXJuIGVycm9yUmVzcG9uc2U7XHJcbiAgfVxyXG59OyJdfQ==