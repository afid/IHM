"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleRepository = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
class RuleRepository {
    constructor(tableName) {
        this.cachedRules = null;
        this.lastCacheRefresh = null;
        this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
        this.tableName = tableName || process.env.QUALIFICATION_RULES_TABLE || 'QualificationRulesTable';
        const client = new client_dynamodb_1.DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        this.dynamoClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
    }
    async loadAllRules() {
        // Check if cache is valid
        if (this.isCacheValid()) {
            return this.cachedRules;
        }
        // Load rules from DynamoDB
        const rules = await this.loadRulesFromDatabase();
        // Update cache
        this.cachedRules = rules;
        this.lastCacheRefresh = new Date();
        return rules;
    }
    async refreshCache() {
        this.cachedRules = null;
        this.lastCacheRefresh = null;
        await this.loadAllRules();
    }
    isCacheValid() {
        if (!this.cachedRules || !this.lastCacheRefresh) {
            return false;
        }
        const now = new Date();
        const cacheAge = now.getTime() - this.lastCacheRefresh.getTime();
        return cacheAge < this.CACHE_TTL_MS;
    }
    async loadRulesFromDatabase() {
        try {
            const command = new lib_dynamodb_1.ScanCommand({
                TableName: this.tableName,
                // Only load active rules if we have an active field
                FilterExpression: 'attribute_not_exists(active) OR active = :active',
                ExpressionAttributeValues: {
                    ':active': 'true'
                }
            });
            const response = await this.dynamoClient.send(command);
            if (!response.Items) {
                return [];
            }
            // Convert DynamoDB items to QualificationRule objects with validation
            const rules = response.Items.map(item => {
                // Validate required fields
                if (!item.id || !item.name || !item.expression || typeof item.weight !== 'number') {
                    throw new Error(`Invalid rule data: missing required fields in rule ${item.id || 'unknown'}`);
                }
                return {
                    id: item.id,
                    name: item.name,
                    expression: item.expression,
                    weight: item.weight,
                    distributionSegment: item.distributionSegment,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt
                };
            });
            // Sort by weight descending for optimization
            rules.sort((a, b) => b.weight - a.weight);
            console.log(`Successfully loaded ${rules.length} rules from DynamoDB table ${this.tableName}`);
            return rules;
        }
        catch (error) {
            console.error('Error loading rules from DynamoDB:', error);
            // Enhanced error handling with more specific error types
            if (error instanceof Error) {
                if (error.name === 'ResourceNotFoundException') {
                    throw new Error(`DynamoDB table '${this.tableName}' not found. Please check table configuration.`);
                }
                else if (error.name === 'AccessDeniedException') {
                    throw new Error(`Access denied to DynamoDB table '${this.tableName}'. Please check IAM permissions.`);
                }
                else if (error.name === 'ThrottlingException') {
                    throw new Error(`DynamoDB throttling error. Please retry the operation.`);
                }
                else if (error.message.includes('timeout')) {
                    throw new Error(`DynamoDB operation timed out. Please retry the operation.`);
                }
            }
            throw new Error(`Failed to load qualification rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Method to add a new rule (for testing and administration)
    async addRule(rule) {
        try {
            // Validate rule before adding
            if (!rule.id || !rule.name || !rule.expression || typeof rule.weight !== 'number') {
                throw new Error('Invalid rule: missing required fields (id, name, expression, weight)');
            }
            if (!rule.distributionSegment || rule.distributionSegment.trim() === '') {
                throw new Error('Invalid rule: distributionSegment is required and cannot be empty');
            }
            const now = new Date().toISOString();
            const ruleWithTimestamps = {
                ...rule,
                createdAt: now,
                updatedAt: now
            };
            const command = {
                TableName: this.tableName,
                Item: ruleWithTimestamps
            };
            await this.dynamoClient.send(new lib_dynamodb_1.PutCommand(command));
            console.log(`Successfully added rule ${rule.id} to DynamoDB table ${this.tableName}`);
            // Invalidate cache after adding a rule
            await this.refreshCache();
        }
        catch (error) {
            console.error('Error adding rule to DynamoDB:', error);
            // Enhanced error handling for add operations
            if (error instanceof Error) {
                if (error.name === 'ConditionalCheckFailedException') {
                    throw new Error(`Rule with ID '${rule.id}' already exists. Use update operation instead.`);
                }
                else if (error.name === 'ValidationException') {
                    throw new Error(`Invalid rule data format: ${error.message}`);
                }
            }
            throw new Error(`Failed to add qualification rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Method to get cache statistics (for monitoring)
    getCacheStats() {
        const cacheAge = this.lastCacheRefresh
            ? new Date().getTime() - this.lastCacheRefresh.getTime()
            : null;
        return {
            isCached: this.cachedRules !== null,
            lastRefresh: this.lastCacheRefresh,
            cacheAge
        };
    }
}
exports.RuleRepository = RuleRepository;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUnVsZVJlcG9zaXRvcnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmljZXMvZGVjaXNpb24tZW5naW5lL1J1bGVSZXBvc2l0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBd0Y7QUFHeEYsTUFBYSxjQUFjO0lBT3pCLFlBQVksU0FBa0I7UUFOdEIsZ0JBQVcsR0FBK0IsSUFBSSxDQUFDO1FBQy9DLHFCQUFnQixHQUFnQixJQUFJLENBQUM7UUFDNUIsaUJBQVksR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLFlBQVk7UUFLekQsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsSUFBSSx5QkFBeUIsQ0FBQztRQUVqRyxNQUFNLE1BQU0sR0FBRyxJQUFJLGdDQUFjLENBQUM7WUFDaEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVc7U0FDOUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLFlBQVksR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZO1FBQ2hCLDBCQUEwQjtRQUMxQixJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sSUFBSSxDQUFDLFdBQVksQ0FBQztRQUMzQixDQUFDO1FBRUQsMkJBQTJCO1FBQzNCLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFFakQsZUFBZTtRQUNmLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBRW5DLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZO1FBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDN0IsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUVPLFlBQVk7UUFDbEIsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUNoRCxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakUsT0FBTyxRQUFRLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztJQUN0QyxDQUFDO0lBRU8sS0FBSyxDQUFDLHFCQUFxQjtRQUNqQyxJQUFJLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLDBCQUFXLENBQUM7Z0JBQzlCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztnQkFDekIsb0RBQW9EO2dCQUNwRCxnQkFBZ0IsRUFBRSxrREFBa0Q7Z0JBQ3BFLHlCQUF5QixFQUFFO29CQUN6QixTQUFTLEVBQUUsTUFBTTtpQkFDbEI7YUFDRixDQUFDLENBQUM7WUFFSCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRXZELElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sRUFBRSxDQUFDO1lBQ1osQ0FBQztZQUVELHNFQUFzRTtZQUN0RSxNQUFNLEtBQUssR0FBd0IsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzNELDJCQUEyQjtnQkFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQ2xGLE1BQU0sSUFBSSxLQUFLLENBQUMsc0RBQXNELElBQUksQ0FBQyxFQUFFLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztnQkFDaEcsQ0FBQztnQkFFRCxPQUFPO29CQUNMLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBWTtvQkFDckIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFjO29CQUN6QixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQW9CO29CQUNyQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQWdCO29CQUM3QixtQkFBbUIsRUFBRSxJQUFJLENBQUMsbUJBQTZCO29CQUN2RCxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQW1CO29CQUNuQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQW1CO2lCQUNwQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCw2Q0FBNkM7WUFDN0MsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRTFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEtBQUssQ0FBQyxNQUFNLDhCQUE4QixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUMvRixPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUUzRCx5REFBeUQ7WUFDekQsSUFBSSxLQUFLLFlBQVksS0FBSyxFQUFFLENBQUM7Z0JBQzNCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSywyQkFBMkIsRUFBRSxDQUFDO29CQUMvQyxNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixJQUFJLENBQUMsU0FBUyxnREFBZ0QsQ0FBQyxDQUFDO2dCQUNyRyxDQUFDO3FCQUFNLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyx1QkFBdUIsRUFBRSxDQUFDO29CQUNsRCxNQUFNLElBQUksS0FBSyxDQUFDLG9DQUFvQyxJQUFJLENBQUMsU0FBUyxrQ0FBa0MsQ0FBQyxDQUFDO2dCQUN4RyxDQUFDO3FCQUFNLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxxQkFBcUIsRUFBRSxDQUFDO29CQUNoRCxNQUFNLElBQUksS0FBSyxDQUFDLHdEQUF3RCxDQUFDLENBQUM7Z0JBQzVFLENBQUM7cUJBQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO29CQUM3QyxNQUFNLElBQUksS0FBSyxDQUFDLDJEQUEyRCxDQUFDLENBQUM7Z0JBQy9FLENBQUM7WUFDSCxDQUFDO1lBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyx1Q0FBdUMsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUNySCxDQUFDO0lBQ0gsQ0FBQztJQUVELDREQUE0RDtJQUM1RCxLQUFLLENBQUMsT0FBTyxDQUFDLElBQXdEO1FBQ3BFLElBQUksQ0FBQztZQUNILDhCQUE4QjtZQUM5QixJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbEYsTUFBTSxJQUFJLEtBQUssQ0FBQyxzRUFBc0UsQ0FBQyxDQUFDO1lBQzFGLENBQUM7WUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztnQkFDeEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxtRUFBbUUsQ0FBQyxDQUFDO1lBQ3ZGLENBQUM7WUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sa0JBQWtCLEdBQXNCO2dCQUM1QyxHQUFHLElBQUk7Z0JBQ1AsU0FBUyxFQUFFLEdBQUc7Z0JBQ2QsU0FBUyxFQUFFLEdBQUc7YUFDZixDQUFDO1lBRUYsTUFBTSxPQUFPLEdBQUc7Z0JBQ2QsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO2dCQUN6QixJQUFJLEVBQUUsa0JBQWtCO2FBQ3pCLENBQUM7WUFFRixNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUkseUJBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLElBQUksQ0FBQyxFQUFFLHNCQUFzQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV0Rix1Q0FBdUM7WUFDdkMsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRXZELDZDQUE2QztZQUM3QyxJQUFJLEtBQUssWUFBWSxLQUFLLEVBQUUsQ0FBQztnQkFDM0IsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLGlDQUFpQyxFQUFFLENBQUM7b0JBQ3JELE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLElBQUksQ0FBQyxFQUFFLGlEQUFpRCxDQUFDLENBQUM7Z0JBQzdGLENBQUM7cUJBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLHFCQUFxQixFQUFFLENBQUM7b0JBQ2hELE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO1lBQ0gsQ0FBQztZQUVELE1BQU0sSUFBSSxLQUFLLENBQUMscUNBQXFDLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDbkgsQ0FBQztJQUNILENBQUM7SUFFRCxrREFBa0Q7SUFDbEQsYUFBYTtRQUNYLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxnQkFBZ0I7WUFDcEMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRTtZQUN4RCxDQUFDLENBQUMsSUFBSSxDQUFDO1FBRVQsT0FBTztZQUNMLFFBQVEsRUFBRSxJQUFJLENBQUMsV0FBVyxLQUFLLElBQUk7WUFDbkMsV0FBVyxFQUFFLElBQUksQ0FBQyxnQkFBZ0I7WUFDbEMsUUFBUTtTQUNULENBQUM7SUFDSixDQUFDO0NBQ0Y7QUFyS0Qsd0NBcUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBTY2FuQ29tbWFuZCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IFF1YWxpZmljYXRpb25SdWxlIH0gZnJvbSAnLi4vLi4vdHlwZXMvZGVjaXNpb24tZW5naW5lJztcclxuXHJcbmV4cG9ydCBjbGFzcyBSdWxlUmVwb3NpdG9yeSB7XHJcbiAgcHJpdmF0ZSBjYWNoZWRSdWxlczogUXVhbGlmaWNhdGlvblJ1bGVbXSB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgbGFzdENhY2hlUmVmcmVzaDogRGF0ZSB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgQ0FDSEVfVFRMX01TID0gNSAqIDYwICogMTAwMDsgLy8gNSBtaW51dGVzXHJcbiAgcHJvdGVjdGVkIHJlYWRvbmx5IGR5bmFtb0NsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudDtcclxuICBwcm90ZWN0ZWQgcmVhZG9ubHkgdGFibGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHRhYmxlTmFtZT86IHN0cmluZykge1xyXG4gICAgdGhpcy50YWJsZU5hbWUgPSB0YWJsZU5hbWUgfHwgcHJvY2Vzcy5lbnYuUVVBTElGSUNBVElPTl9SVUxFU19UQUJMRSB8fCAnUXVhbGlmaWNhdGlvblJ1bGVzVGFibGUnO1xyXG4gICAgXHJcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe1xyXG4gICAgICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMSdcclxuICAgIH0pO1xyXG4gICAgdGhpcy5keW5hbW9DbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGxvYWRBbGxSdWxlcygpOiBQcm9taXNlPFF1YWxpZmljYXRpb25SdWxlW10+IHtcclxuICAgIC8vIENoZWNrIGlmIGNhY2hlIGlzIHZhbGlkXHJcbiAgICBpZiAodGhpcy5pc0NhY2hlVmFsaWQoKSkge1xyXG4gICAgICByZXR1cm4gdGhpcy5jYWNoZWRSdWxlcyE7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTG9hZCBydWxlcyBmcm9tIER5bmFtb0RCXHJcbiAgICBjb25zdCBydWxlcyA9IGF3YWl0IHRoaXMubG9hZFJ1bGVzRnJvbURhdGFiYXNlKCk7XHJcbiAgICBcclxuICAgIC8vIFVwZGF0ZSBjYWNoZVxyXG4gICAgdGhpcy5jYWNoZWRSdWxlcyA9IHJ1bGVzO1xyXG4gICAgdGhpcy5sYXN0Q2FjaGVSZWZyZXNoID0gbmV3IERhdGUoKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHJ1bGVzO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgcmVmcmVzaENhY2hlKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5jYWNoZWRSdWxlcyA9IG51bGw7XHJcbiAgICB0aGlzLmxhc3RDYWNoZVJlZnJlc2ggPSBudWxsO1xyXG4gICAgYXdhaXQgdGhpcy5sb2FkQWxsUnVsZXMoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaXNDYWNoZVZhbGlkKCk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKCF0aGlzLmNhY2hlZFJ1bGVzIHx8ICF0aGlzLmxhc3RDYWNoZVJlZnJlc2gpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgY29uc3QgY2FjaGVBZ2UgPSBub3cuZ2V0VGltZSgpIC0gdGhpcy5sYXN0Q2FjaGVSZWZyZXNoLmdldFRpbWUoKTtcclxuICAgIHJldHVybiBjYWNoZUFnZSA8IHRoaXMuQ0FDSEVfVFRMX01TO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBsb2FkUnVsZXNGcm9tRGF0YWJhc2UoKTogUHJvbWlzZTxRdWFsaWZpY2F0aW9uUnVsZVtdPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFNjYW5Db21tYW5kKHtcclxuICAgICAgICBUYWJsZU5hbWU6IHRoaXMudGFibGVOYW1lLFxyXG4gICAgICAgIC8vIE9ubHkgbG9hZCBhY3RpdmUgcnVsZXMgaWYgd2UgaGF2ZSBhbiBhY3RpdmUgZmllbGRcclxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHMoYWN0aXZlKSBPUiBhY3RpdmUgPSA6YWN0aXZlJyxcclxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XHJcbiAgICAgICAgICAnOmFjdGl2ZSc6ICd0cnVlJ1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZHluYW1vQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIXJlc3BvbnNlLkl0ZW1zKSB7XHJcbiAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDb252ZXJ0IER5bmFtb0RCIGl0ZW1zIHRvIFF1YWxpZmljYXRpb25SdWxlIG9iamVjdHMgd2l0aCB2YWxpZGF0aW9uXHJcbiAgICAgIGNvbnN0IHJ1bGVzOiBRdWFsaWZpY2F0aW9uUnVsZVtdID0gcmVzcG9uc2UuSXRlbXMubWFwKGl0ZW0gPT4ge1xyXG4gICAgICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGZpZWxkc1xyXG4gICAgICAgIGlmICghaXRlbS5pZCB8fCAhaXRlbS5uYW1lIHx8ICFpdGVtLmV4cHJlc3Npb24gfHwgdHlwZW9mIGl0ZW0ud2VpZ2h0ICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHJ1bGUgZGF0YTogbWlzc2luZyByZXF1aXJlZCBmaWVsZHMgaW4gcnVsZSAke2l0ZW0uaWQgfHwgJ3Vua25vd24nfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGlkOiBpdGVtLmlkIGFzIHN0cmluZyxcclxuICAgICAgICAgIG5hbWU6IGl0ZW0ubmFtZSBhcyBzdHJpbmcsXHJcbiAgICAgICAgICBleHByZXNzaW9uOiBpdGVtLmV4cHJlc3Npb24gYXMgc3RyaW5nLFxyXG4gICAgICAgICAgd2VpZ2h0OiBpdGVtLndlaWdodCBhcyBudW1iZXIsXHJcbiAgICAgICAgICBkaXN0cmlidXRpb25TZWdtZW50OiBpdGVtLmRpc3RyaWJ1dGlvblNlZ21lbnQgYXMgc3RyaW5nLFxyXG4gICAgICAgICAgY3JlYXRlZEF0OiBpdGVtLmNyZWF0ZWRBdCBhcyBzdHJpbmcsXHJcbiAgICAgICAgICB1cGRhdGVkQXQ6IGl0ZW0udXBkYXRlZEF0IGFzIHN0cmluZ1xyXG4gICAgICAgIH07XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gU29ydCBieSB3ZWlnaHQgZGVzY2VuZGluZyBmb3Igb3B0aW1pemF0aW9uXHJcbiAgICAgIHJ1bGVzLnNvcnQoKGEsIGIpID0+IGIud2VpZ2h0IC0gYS53ZWlnaHQpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYFN1Y2Nlc3NmdWxseSBsb2FkZWQgJHtydWxlcy5sZW5ndGh9IHJ1bGVzIGZyb20gRHluYW1vREIgdGFibGUgJHt0aGlzLnRhYmxlTmFtZX1gKTtcclxuICAgICAgcmV0dXJuIHJ1bGVzO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBydWxlcyBmcm9tIER5bmFtb0RCOicsIGVycm9yKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEVuaGFuY2VkIGVycm9yIGhhbmRsaW5nIHdpdGggbW9yZSBzcGVjaWZpYyBlcnJvciB0eXBlc1xyXG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xyXG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnUmVzb3VyY2VOb3RGb3VuZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRHluYW1vREIgdGFibGUgJyR7dGhpcy50YWJsZU5hbWV9JyBub3QgZm91bmQuIFBsZWFzZSBjaGVjayB0YWJsZSBjb25maWd1cmF0aW9uLmApO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubmFtZSA9PT0gJ0FjY2Vzc0RlbmllZEV4Y2VwdGlvbicpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQWNjZXNzIGRlbmllZCB0byBEeW5hbW9EQiB0YWJsZSAnJHt0aGlzLnRhYmxlTmFtZX0nLiBQbGVhc2UgY2hlY2sgSUFNIHBlcm1pc3Npb25zLmApO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubmFtZSA9PT0gJ1Rocm90dGxpbmdFeGNlcHRpb24nKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYER5bmFtb0RCIHRocm90dGxpbmcgZXJyb3IuIFBsZWFzZSByZXRyeSB0aGUgb3BlcmF0aW9uLmApO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygndGltZW91dCcpKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYER5bmFtb0RCIG9wZXJhdGlvbiB0aW1lZCBvdXQuIFBsZWFzZSByZXRyeSB0aGUgb3BlcmF0aW9uLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBxdWFsaWZpY2F0aW9uIHJ1bGVzOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gTWV0aG9kIHRvIGFkZCBhIG5ldyBydWxlIChmb3IgdGVzdGluZyBhbmQgYWRtaW5pc3RyYXRpb24pXHJcbiAgYXN5bmMgYWRkUnVsZShydWxlOiBPbWl0PFF1YWxpZmljYXRpb25SdWxlLCAnY3JlYXRlZEF0JyB8ICd1cGRhdGVkQXQnPik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVmFsaWRhdGUgcnVsZSBiZWZvcmUgYWRkaW5nXHJcbiAgICAgIGlmICghcnVsZS5pZCB8fCAhcnVsZS5uYW1lIHx8ICFydWxlLmV4cHJlc3Npb24gfHwgdHlwZW9mIHJ1bGUud2VpZ2h0ICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBydWxlOiBtaXNzaW5nIHJlcXVpcmVkIGZpZWxkcyAoaWQsIG5hbWUsIGV4cHJlc3Npb24sIHdlaWdodCknKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCFydWxlLmRpc3RyaWJ1dGlvblNlZ21lbnQgfHwgcnVsZS5kaXN0cmlidXRpb25TZWdtZW50LnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcnVsZTogZGlzdHJpYnV0aW9uU2VnbWVudCBpcyByZXF1aXJlZCBhbmQgY2Fubm90IGJlIGVtcHR5Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgICAgY29uc3QgcnVsZVdpdGhUaW1lc3RhbXBzOiBRdWFsaWZpY2F0aW9uUnVsZSA9IHtcclxuICAgICAgICAuLi5ydWxlLFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbm93LFxyXG4gICAgICAgIHVwZGF0ZWRBdDogbm93XHJcbiAgICAgIH07XHJcblxyXG4gICAgICBjb25zdCBjb21tYW5kID0ge1xyXG4gICAgICAgIFRhYmxlTmFtZTogdGhpcy50YWJsZU5hbWUsXHJcbiAgICAgICAgSXRlbTogcnVsZVdpdGhUaW1lc3RhbXBzXHJcbiAgICAgIH07XHJcblxyXG4gICAgICBhd2FpdCB0aGlzLmR5bmFtb0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKGNvbW1hbmQpKTtcclxuICAgICAgY29uc29sZS5sb2coYFN1Y2Nlc3NmdWxseSBhZGRlZCBydWxlICR7cnVsZS5pZH0gdG8gRHluYW1vREIgdGFibGUgJHt0aGlzLnRhYmxlTmFtZX1gKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEludmFsaWRhdGUgY2FjaGUgYWZ0ZXIgYWRkaW5nIGEgcnVsZVxyXG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hDYWNoZSgpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYWRkaW5nIHJ1bGUgdG8gRHluYW1vREI6JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgLy8gRW5oYW5jZWQgZXJyb3IgaGFuZGxpbmcgZm9yIGFkZCBvcGVyYXRpb25zXHJcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XHJcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdDb25kaXRpb25hbENoZWNrRmFpbGVkRXhjZXB0aW9uJykge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSdWxlIHdpdGggSUQgJyR7cnVsZS5pZH0nIGFscmVhZHkgZXhpc3RzLiBVc2UgdXBkYXRlIG9wZXJhdGlvbiBpbnN0ZWFkLmApO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FeGNlcHRpb24nKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgcnVsZSBkYXRhIGZvcm1hdDogJHtlcnJvci5tZXNzYWdlfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gYWRkIHF1YWxpZmljYXRpb24gcnVsZTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIE1ldGhvZCB0byBnZXQgY2FjaGUgc3RhdGlzdGljcyAoZm9yIG1vbml0b3JpbmcpXHJcbiAgZ2V0Q2FjaGVTdGF0cygpOiB7IGlzQ2FjaGVkOiBib29sZWFuOyBsYXN0UmVmcmVzaDogRGF0ZSB8IG51bGw7IGNhY2hlQWdlOiBudW1iZXIgfCBudWxsIH0ge1xyXG4gICAgY29uc3QgY2FjaGVBZ2UgPSB0aGlzLmxhc3RDYWNoZVJlZnJlc2ggXHJcbiAgICAgID8gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0aGlzLmxhc3RDYWNoZVJlZnJlc2guZ2V0VGltZSgpXHJcbiAgICAgIDogbnVsbDtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaXNDYWNoZWQ6IHRoaXMuY2FjaGVkUnVsZXMgIT09IG51bGwsXHJcbiAgICAgIGxhc3RSZWZyZXNoOiB0aGlzLmxhc3RDYWNoZVJlZnJlc2gsXHJcbiAgICAgIGNhY2hlQWdlXHJcbiAgICB9O1xyXG4gIH1cclxufSJdfQ==