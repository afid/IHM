"use strict";
/**
 * Lambda Function pour gérer les critères via API
 * Endpoint: POST /admin/criteria
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const HybridCriteriaManager_1 = require("../../services/decision-engine/HybridCriteriaManager");
const GSIManager_1 = require("../../services/decision-engine/GSIManager");
const handler = async (event) => {
    console.log('🔧 Admin API - Gestion des critères');
    try {
        const { action, criteriaName, enabled, name, description, justification } = JSON.parse(event.body || '{}');
        let result;
        switch (action) {
            case 'toggle':
                result = await HybridCriteriaManager_1.HybridCriteriaManager.toggleSecondaryCriteria(criteriaName, enabled);
                break;
            case 'add':
                result = HybridCriteriaManager_1.HybridCriteriaManager.addSecondaryCriteria(name, description, justification);
                break;
            case 'stats':
                result = {
                    criteria: HybridCriteriaManager_1.HybridCriteriaManager.getCriteriaStats(),
                    gsi: GSIManager_1.GSIManager.getGSIStats()
                };
                break;
            case 'list':
                result = HybridCriteriaManager_1.HybridCriteriaManager.getFullConfiguration();
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
        console.error('❌ Erreur dans manage-criteria:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlLWNyaXRlcmlhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2Z1bmN0aW9ucy9hZG1pbi9tYW5hZ2UtY3JpdGVyaWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsZ0dBQTZGO0FBQzdGLDBFQUF1RTtBQUdoRSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBMkIsRUFBa0MsRUFBRTtJQUMzRixPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7SUFFbkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDO1FBRTNHLElBQUksTUFBTSxDQUFDO1FBRVgsUUFBUSxNQUFNLEVBQUUsQ0FBQztZQUNmLEtBQUssUUFBUTtnQkFDWCxNQUFNLEdBQUcsTUFBTSw2Q0FBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3BGLE1BQU07WUFFUixLQUFLLEtBQUs7Z0JBQ1IsTUFBTSxHQUFHLDZDQUFxQixDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQ3RGLE1BQU07WUFFUixLQUFLLE9BQU87Z0JBQ1YsTUFBTSxHQUFHO29CQUNQLFFBQVEsRUFBRSw2Q0FBcUIsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDbEQsR0FBRyxFQUFFLHVCQUFVLENBQUMsV0FBVyxFQUFFO2lCQUM5QixDQUFDO2dCQUNGLE1BQU07WUFFUixLQUFLLE1BQU07Z0JBQ1QsTUFBTSxHQUFHLDZDQUFxQixDQUFDLG9CQUFvQixFQUFFLENBQUM7Z0JBQ3RELE1BQU07WUFFUjtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQkFDbEMsNkJBQTZCLEVBQUUsR0FBRzthQUNuQztZQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUUsTUFBTTtnQkFDWixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDcEMsQ0FBQztTQUNILENBQUM7SUFFSixDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXZELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLE9BQU8sRUFBRSxLQUFLO2dCQUNkLEtBQUssRUFBRSxDQUFBLEtBQUssYUFBTCxLQUFLLHVCQUFMLEtBQUssQ0FBRSxPQUFPLEtBQUksaUJBQWlCO2dCQUMxQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDcEMsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBN0RXLFFBQUEsT0FBTyxXQTZEbEIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogTGFtYmRhIEZ1bmN0aW9uIHBvdXIgZ8OpcmVyIGxlcyBjcml0w6hyZXMgdmlhIEFQSVxyXG4gKiBFbmRwb2ludDogUE9TVCAvYWRtaW4vY3JpdGVyaWFcclxuICovXHJcblxyXG5pbXBvcnQgeyBIeWJyaWRDcml0ZXJpYU1hbmFnZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvSHlicmlkQ3JpdGVyaWFNYW5hZ2VyJztcclxuaW1wb3J0IHsgR1NJTWFuYWdlciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2RlY2lzaW9uLWVuZ2luZS9HU0lNYW5hZ2VyJztcclxuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+UpyBBZG1pbiBBUEkgLSBHZXN0aW9uIGRlcyBjcml0w6hyZXMnKTtcclxuICBcclxuICB0cnkge1xyXG4gICAgY29uc3QgeyBhY3Rpb24sIGNyaXRlcmlhTmFtZSwgZW5hYmxlZCwgbmFtZSwgZGVzY3JpcHRpb24sIGp1c3RpZmljYXRpb24gfSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSB8fCAne30nKTtcclxuICAgIFxyXG4gICAgbGV0IHJlc3VsdDtcclxuICAgIFxyXG4gICAgc3dpdGNoIChhY3Rpb24pIHtcclxuICAgICAgY2FzZSAndG9nZ2xlJzpcclxuICAgICAgICByZXN1bHQgPSBhd2FpdCBIeWJyaWRDcml0ZXJpYU1hbmFnZXIudG9nZ2xlU2Vjb25kYXJ5Q3JpdGVyaWEoY3JpdGVyaWFOYW1lLCBlbmFibGVkKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2FkZCc6XHJcbiAgICAgICAgcmVzdWx0ID0gSHlicmlkQ3JpdGVyaWFNYW5hZ2VyLmFkZFNlY29uZGFyeUNyaXRlcmlhKG5hbWUsIGRlc2NyaXB0aW9uLCBqdXN0aWZpY2F0aW9uKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ3N0YXRzJzpcclxuICAgICAgICByZXN1bHQgPSB7XHJcbiAgICAgICAgICBjcml0ZXJpYTogSHlicmlkQ3JpdGVyaWFNYW5hZ2VyLmdldENyaXRlcmlhU3RhdHMoKSxcclxuICAgICAgICAgIGdzaTogR1NJTWFuYWdlci5nZXRHU0lTdGF0cygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgXHJcbiAgICAgIGNhc2UgJ2xpc3QnOlxyXG4gICAgICAgIHJlc3VsdCA9IEh5YnJpZENyaXRlcmlhTWFuYWdlci5nZXRGdWxsQ29uZmlndXJhdGlvbigpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFjdGlvbiBub24gc3VwcG9ydMOpZTogJHthY3Rpb259YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJ1xyXG4gICAgICB9LFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICBkYXRhOiByZXN1bHQsXHJcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgfSlcclxuICAgIH07XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyZXVyIGRhbnMgbWFuYWdlLWNyaXRlcmlhOicsIGVycm9yKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzQ29kZTogNTAwLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICBlcnJvcjogZXJyb3I/Lm1lc3NhZ2UgfHwgJ0VycmV1ciBpbmNvbm51ZScsXHJcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgfSlcclxuICAgIH07XHJcbiAgfVxyXG59OyJdfQ==