"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleEvaluator = void 0;
const RuleParser_1 = require("../../utils/decision-engine/RuleParser");
class RuleEvaluator {
    evaluateRules(contactAttributes, rules) {
        const eliminatedRules = [];
        const eliminationTrace = [];
        let eligibleRules = [...rules];
        console.log(`Starting evaluation with ${rules.length} rules and contact attributes:`, contactAttributes);
        // Apply elimination logic using the rule parser and evaluator
        for (const rule of rules) {
            const beforeCount = eligibleRules.length;
            try {
                const shouldKeep = this.evaluateRuleAgainstContactAttributes(rule, contactAttributes);
                if (!shouldKeep) {
                    // Remove rule from eligible list
                    eligibleRules = eligibleRules.filter(r => r.id !== rule.id);
                    eliminatedRules.push({
                        rule,
                        reason: `Rule expression "${rule.expression}" does not match contact attributes`,
                        contactAttributeKey: 'all',
                        contactAttributeValue: contactAttributes
                    });
                }
            }
            catch (error) {
                // If rule evaluation fails, eliminate the rule
                eligibleRules = eligibleRules.filter(r => r.id !== rule.id);
                eliminatedRules.push({
                    rule,
                    reason: `Rule evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    contactAttributeKey: 'evaluation_error',
                    contactAttributeValue: error
                });
                console.warn(`Rule ${rule.id} eliminated due to evaluation error:`, error);
            }
            const afterCount = eligibleRules.length;
            if (beforeCount !== afterCount) {
                eliminationTrace.push({
                    contactAttributeKey: rule.id,
                    contactAttributeValue: rule.expression,
                    remainingRules: afterCount,
                    eliminatedCount: beforeCount - afterCount
                });
                console.log(`After evaluating rule ${rule.id}: ${afterCount} rules remaining (eliminated ${beforeCount - afterCount})`);
            }
        }
        // Select final rule based on weights
        const result = this.selectFinalRule(eligibleRules);
        return {
            eligibleRules,
            eliminatedRules,
            selectedRule: result.selectedRule,
            distributionSegment: result.distributionSegment,
            error: result.error,
            eliminationTrace
        };
    }
    evaluateRuleAgainstContactAttributes(rule, contactAttributes) {
        // Parse the rule expression
        const parseResult = RuleParser_1.RuleParser.parseRuleExpression(rule.expression);
        if (!parseResult.isValid || !parseResult.ast) {
            throw new Error(`Failed to parse rule expression: ${parseResult.error}`);
        }
        // Evaluate the parsed AST against contact attributes
        try {
            return RuleParser_1.RuleParser.evaluateExpression(parseResult.ast, contactAttributes);
        }
        catch (error) {
            throw new Error(`Failed to evaluate rule expression: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Checks if a rule mentions a specific contact attribute key
     * This is used for optimization and missing criteria handling
     */
    ruleReferencesAttribute(rule, attributeKey) {
        // Simple check to see if the attribute key appears in the rule expression
        // This could be enhanced to use the AST for more precise detection
        return rule.expression.includes(attributeKey);
    }
    /**
     * Handles missing criteria according to requirements:
     * - If a criterion is absent from a rule, retain that rule in the eligible set
     * - If a criterion value conflicts with a rule condition, eliminate that rule
     * - If a criterion value matches a rule condition, retain that rule
     */
    handleMissingCriteria(rule, contactAttributes) {
        try {
            // Parse the rule to understand what attributes it requires
            const parseResult = RuleParser_1.RuleParser.parseRuleExpression(rule.expression);
            if (!parseResult.isValid || !parseResult.ast) {
                // If we can't parse the rule, eliminate it
                return false;
            }
            // Extract all identifiers (attribute names) from the AST
            const requiredAttributes = this.extractIdentifiersFromAST(parseResult.ast);
            // Check if all required attributes are present in contact attributes
            for (const requiredAttr of requiredAttributes) {
                if (!(requiredAttr in contactAttributes)) {
                    // Missing attribute - according to requirements, we should retain the rule
                    // But we need to handle this carefully in evaluation
                    console.log(`Rule ${rule.id} references missing attribute ${requiredAttr}, treating as undefined`);
                }
            }
            // Evaluate with potentially missing attributes (undefined values)
            return RuleParser_1.RuleParser.evaluateExpression(parseResult.ast, contactAttributes);
        }
        catch (error) {
            console.warn(`Error handling missing criteria for rule ${rule.id}:`, error);
            return false; // Eliminate rule on error
        }
    }
    /**
     * Recursively extracts all identifier names from an AST
     */
    extractIdentifiersFromAST(node) {
        const identifiers = [];
        if (node.type === 'Identifier') {
            identifiers.push(node.name);
        }
        else if (node.type === 'BinaryExpression' || node.type === 'ComparisonExpression') {
            if (node.left) {
                identifiers.push(...this.extractIdentifiersFromAST(node.left));
            }
            if (node.right) {
                identifiers.push(...this.extractIdentifiersFromAST(node.right));
            }
        }
        return identifiers;
    }
    selectFinalRule(eligibleRules) {
        if (eligibleRules.length === 0) {
            return {
                error: "Aucune règle ne correspond, vérifier le paramétrage"
            };
        }
        if (eligibleRules.length === 1) {
            const rule = eligibleRules[0];
            console.log(`Selected single eligible rule: ${rule.id} with weight ${rule.weight}`);
            // Validate distribution segment existence
            const segmentValidation = this.validateDistributionSegment(rule);
            if (!segmentValidation.isValid) {
                return {
                    error: segmentValidation.error
                };
            }
            return {
                selectedRule: rule,
                distributionSegment: rule.distributionSegment
            };
        }
        // Find highest weight
        const maxWeight = Math.max(...eligibleRules.map(r => r.weight));
        const highestWeightRules = eligibleRules.filter(r => r.weight === maxWeight);
        console.log(`Found ${highestWeightRules.length} rules with max weight ${maxWeight}`);
        if (highestWeightRules.length > 1) {
            const ruleIds = highestWeightRules.map(r => r.id).join(' et ');
            return {
                error: `Les règles ${ruleIds} ont des poids identiques, vérifier le paramétrage`
            };
        }
        const selectedRule = highestWeightRules[0];
        console.log(`Selected rule: ${selectedRule.id} with weight ${selectedRule.weight}, distribution segment: ${selectedRule.distributionSegment}`);
        // Validate distribution segment existence
        const segmentValidation = this.validateDistributionSegment(selectedRule);
        if (!segmentValidation.isValid) {
            return {
                error: segmentValidation.error
            };
        }
        return {
            selectedRule,
            distributionSegment: selectedRule.distributionSegment
        };
    }
    /**
     * Validates that a rule has a valid distribution segment
     * Handles missing segment mapping errors as required by task 6.4
     */
    validateDistributionSegment(rule) {
        // Check if distribution segment exists and is not empty
        if (!rule.distributionSegment || rule.distributionSegment.trim() === '') {
            return {
                isValid: false,
                error: `Segment de distribution manquant pour la règle ${rule.id}, vérifier le paramétrage`
            };
        }
        // Check if distribution segment is a valid string (not null, undefined, or whitespace only)
        if (typeof rule.distributionSegment !== 'string') {
            return {
                isValid: false,
                error: `Segment de distribution invalide pour la règle ${rule.id}, vérifier le paramétrage`
            };
        }
        // Additional validation: ensure segment doesn't contain only whitespace
        if (rule.distributionSegment.trim().length === 0) {
            return {
                isValid: false,
                error: `Segment de distribution vide pour la règle ${rule.id}, vérifier le paramétrage`
            };
        }
        console.log(`Distribution segment validation passed for rule ${rule.id}: ${rule.distributionSegment}`);
        return {
            isValid: true
        };
    }
}
exports.RuleEvaluator = RuleEvaluator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUnVsZUV2YWx1YXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2aWNlcy9kZWNpc2lvbi1lbmdpbmUvUnVsZUV2YWx1YXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSx1RUFBb0U7QUFFcEUsTUFBYSxhQUFhO0lBRXhCLGFBQWEsQ0FBQyxpQkFBb0MsRUFBRSxLQUEwQjtRQUM1RSxNQUFNLGVBQWUsR0FBcUIsRUFBRSxDQUFDO1FBQzdDLE1BQU0sZ0JBQWdCLEdBQXNCLEVBQUUsQ0FBQztRQUMvQyxJQUFJLGFBQWEsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFFL0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsS0FBSyxDQUFDLE1BQU0sZ0NBQWdDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUV6Ryw4REFBOEQ7UUFDOUQsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN6QixNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1lBRXpDLElBQUksQ0FBQztnQkFDSCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsb0NBQW9DLENBQUMsSUFBSSxFQUFFLGlCQUFpQixDQUFDLENBQUM7Z0JBRXRGLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDaEIsaUNBQWlDO29CQUNqQyxhQUFhLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUU1RCxlQUFlLENBQUMsSUFBSSxDQUFDO3dCQUNuQixJQUFJO3dCQUNKLE1BQU0sRUFBRSxvQkFBb0IsSUFBSSxDQUFDLFVBQVUscUNBQXFDO3dCQUNoRixtQkFBbUIsRUFBRSxLQUFLO3dCQUMxQixxQkFBcUIsRUFBRSxpQkFBaUI7cUJBQ3pDLENBQUMsQ0FBQztnQkFDTCxDQUFDO1lBQ0gsQ0FB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WTtZQUNaLG1CQUFtQixFQUFFLFlBQVksQ0FBQyxtQkFBbUI7U0FDdEQsQ0FBQztJQUNKLENBQUM7SUFFRDs7O09BR0c7SUFDSywyQkFBMkIsQ0FBQyxJQUF1QjtRQUl6RCx3REFBd0Q7UUFDeEQsSUFBSSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDeEUsT0FBTztnQkFDTCxPQUFPLEVBQUUsS0FBSztnQkFDZCxLQUFLLEVBQUUsa0RBQWtELElBQUksQ0FBQyxFQUFFLDJCQUEyQjthQUM1RixDQUFDO1FBQ0osQ0FBQztRQUVELDRGQUE0RjtRQUM1RixJQUFJLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2pELE9BQU87Z0JBQ0wsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLGtEQUFrRCxJQUFJLENBQUMsRUFBRSwyQkFBMkI7YUFDNUYsQ0FBQztRQUNKLENBQUM7UUFFRCx3RUFBd0U7UUFDeEUsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pELE9BQU87Z0JBQ0wsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLDhDQUE4QyxJQUFJLENBQUMsRUFBRSwyQkFBMkI7YUFDeEYsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUM7UUFDdkcsT0FBTztZQUNMLE9BQU8sRUFBRSxJQUFJO1NBQ2QsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQXRQRCxzQ0FzUEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb250YWN0QXR0cmlidXRlcywgUXVhbGlmaWNhdGlvblJ1bGUsIEV2YWx1YXRpb25SZXN1bHQsIEVsaW1pbmF0ZWRSdWxlLCBFbGltaW5hdGlvblN0ZXAgfSBmcm9tICcuLi8uLi90eXBlcy9kZWNpc2lvbi1lbmdpbmUnO1xyXG5pbXBvcnQgeyBSdWxlUGFyc2VyIH0gZnJvbSAnLi4vLi4vdXRpbHMvZGVjaXNpb24tZW5naW5lL1J1bGVQYXJzZXInO1xyXG5cclxuZXhwb3J0IGNsYXNzIFJ1bGVFdmFsdWF0b3Ige1xyXG4gIFxyXG4gIGV2YWx1YXRlUnVsZXMoY29udGFjdEF0dHJpYnV0ZXM6IENvbnRhY3RBdHRyaWJ1dGVzLCBydWxlczogUXVhbGlmaWNhdGlvblJ1bGVbXSk6IEV2YWx1YXRpb25SZXN1bHQge1xyXG4gICAgY29uc3QgZWxpbWluYXRlZFJ1bGVzOiBFbGltaW5hdGVkUnVsZVtdID0gW107XHJcbiAgICBjb25zdCBlbGltaW5hdGlvblRyYWNlOiBFbGltaW5hdGlvblN0ZXBbXSA9IFtdO1xyXG4gICAgbGV0IGVsaWdpYmxlUnVsZXMgPSBbLi4ucnVsZXNdO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGBTdGFydGluZyBldmFsdWF0aW9uIHdpdGggJHtydWxlcy5sZW5ndGh9IHJ1bGVzIGFuZCBjb250YWN0IGF0dHJpYnV0ZXM6YCwgY29udGFjdEF0dHJpYnV0ZXMpO1xyXG5cclxuICAgIC8vIEFwcGx5IGVsaW1pbmF0aW9uIGxvZ2ljIHVzaW5nIHRoZSBydWxlIHBhcnNlciBhbmQgZXZhbHVhdG9yXHJcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcclxuICAgICAgY29uc3QgYmVmb3JlQ291bnQgPSBlbGlnaWJsZVJ1bGVzLmxlbmd0aDtcclxuICAgICAgXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3Qgc2hvdWxkS2VlcCA9IHRoaXMuZXZhbHVhdGVSdWxlQWdhaW5zdENvbnRhY3RBdHRyaWJ1dGVzKHJ1bGUsIGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIXNob3VsZEtlZXApIHtcclxuICAgICAgICAgIC8vIFJlbW92ZSBydWxlIGZyb20gZWxpZ2libGUgbGlzdFxyXG4gICAgICAgICAgZWxpZ2libGVSdWxlcyA9IGVsaWdpYmxlUnVsZXMuZmlsdGVyKHIgPT4gci5pZCAhPT0gcnVsZS5pZCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGVsaW1pbmF0ZWRSdWxlcy5wdXNoKHtcclxuICAgICAgICAgICAgcnVsZSxcclxuICAgICAgICAgICAgcmVhc29uOiBgUnVsZSBleHByZXNzaW9uIFwiJHtydWxlLmV4cHJlc3Npb259XCIgZG9lcyBub3QgbWF0Y2ggY29udGFjdCBhdHRyaWJ1dGVzYCxcclxuICAgICAgICAgICAgY29udGFjdEF0dHJpYnV0ZUtleTogJ2FsbCcsXHJcbiAgICAgICAgICAgIGNvbnRhY3RBdHRyaWJ1dGVWYWx1ZTogY29udGFjdEF0dHJpYnV0ZXNcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAvLyBJZiBydWxlIGV2YWx1YXRpb24gZmFpbHMsIGVsaW1pbmF0ZSB0aGUgcnVsZVxyXG4gICAgICAgIGVsaWdpYmxlUnVsZXMgPSBlbGlnaWJsZVJ1bGVzLmZpbHRlcihyID0+IHIuaWQgIT09IHJ1bGUuaWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGVsaW1pbmF0ZWRSdWxlcy5wdXNoKHtcclxuICAgICAgICAgIHJ1bGUsXHJcbiAgICAgICAgICByZWFzb246IGBSdWxlIGV2YWx1YXRpb24gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWAsXHJcbiAgICAgICAgICBjb250YWN0QXR0cmlidXRlS2V5OiAnZXZhbHVhdGlvbl9lcnJvcicsXHJcbiAgICAgICAgICBjb250YWN0QXR0cmlidXRlVmFsdWU6IGVycm9yXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc29sZS53YXJuKGBSdWxlICR7cnVsZS5pZH0gZWxpbWluYXRlZCBkdWUgdG8gZXZhbHVhdGlvbiBlcnJvcjpgLCBlcnJvcik7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGFmdGVyQ291bnQgPSBlbGlnaWJsZVJ1bGVzLmxlbmd0aDtcclxuICAgICAgaWYgKGJlZm9yZUNvdW50ICE9PSBhZnRlckNvdW50KSB7XHJcbiAgICAgICAgZWxpbWluYXRpb25UcmFjZS5wdXNoKHtcclxuICAgICAgICAgIGNvbnRhY3RBdHRyaWJ1dGVLZXk6IHJ1bGUuaWQsXHJcbiAgICAgICAgICBjb250YWN0QXR0cmlidXRlVmFsdWU6IHJ1bGUuZXhwcmVzc2lvbixcclxuICAgICAgICAgIHJlbWFpbmluZ1J1bGVzOiBhZnRlckNvdW50LFxyXG4gICAgICAgICAgZWxpbWluYXRlZENvdW50OiBiZWZvcmVDb3VudCAtIGFmdGVyQ291bnRcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zb2xlLmxvZyhgQWZ0ZXIgZXZhbHVhdGluZyBydWxlICR7cnVsZS5pZH06ICR7YWZ0ZXJDb3VudH0gcnVsZXMgcmVtYWluaW5nIChlbGltaW5hdGVkICR7YmVmb3JlQ291bnQgLSBhZnRlckNvdW50fSlgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlbGVjdCBmaW5hbCBydWxlIGJhc2VkIG9uIHdlaWdodHNcclxuICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuc2VsZWN0RmluYWxSdWxlKGVsaWdpYmxlUnVsZXMpO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBlbGlnaWJsZVJ1bGVzLFxyXG4gICAgICBlbGltaW5hdGVkUnVsZXMsXHJcbiAgICAgIHNlbGVjdGVkUnVsZTogcmVzdWx0LnNlbGVjdGVkUnVsZSxcclxuICAgICAgZGlzdHJpYnV0aW9uU2VnbWVudDogcmVzdWx0LmRpc3RyaWJ1dGlvblNlZ21lbnQsXHJcbiAgICAgIGVycm9yOiByZXN1bHQuZXJyb3IsXHJcbiAgICAgIGVsaW1pbmF0aW9uVHJhY2VcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGV2YWx1YXRlUnVsZUFnYWluc3RDb250YWN0QXR0cmlidXRlcyhydWxlOiBRdWFsaWZpY2F0aW9uUnVsZSwgY29udGFjdEF0dHJpYnV0ZXM6IENvbnRhY3RBdHRyaWJ1dGVzKTogYm9vbGVhbiB7XHJcbiAgICAvLyBQYXJzZSB0aGUgcnVsZSBleHByZXNzaW9uXHJcbiAgICBjb25zdCBwYXJzZVJlc3VsdCA9IFJ1bGVQYXJzZXIucGFyc2VSdWxlRXhwcmVzc2lvbihydWxlLmV4cHJlc3Npb24pO1xyXG4gICAgXHJcbiAgICBpZiAoIXBhcnNlUmVzdWx0LmlzVmFsaWQgfHwgIXBhcnNlUmVzdWx0LmFzdCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBydWxlIGV4cHJlc3Npb246ICR7cGFyc2VSZXN1bHQuZXJyb3J9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXZhbHVhdGUgdGhlIHBhcnNlZCBBU1QgYWdhaW5zdCBjb250YWN0IGF0dHJpYnV0ZXNcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBSdWxlUGFyc2VyLmV2YWx1YXRlRXhwcmVzc2lvbihwYXJzZVJlc3VsdC5hc3QsIGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGV2YWx1YXRlIHJ1bGUgZXhwcmVzc2lvbjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrcyBpZiBhIHJ1bGUgbWVudGlvbnMgYSBzcGVjaWZpYyBjb250YWN0IGF0dHJpYnV0ZSBrZXlcclxuICAgKiBUaGlzIGlzIHVzZWQgZm9yIG9wdGltaXphdGlvbiBhbmQgbWlzc2luZyBjcml0ZXJpYSBoYW5kbGluZ1xyXG4gICAqL1xyXG4gIHByaXZhdGUgcnVsZVJlZmVyZW5jZXNBdHRyaWJ1dGUocnVsZTogUXVhbGlmaWNhdGlvblJ1bGUsIGF0dHJpYnV0ZUtleTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAvLyBTaW1wbGUgY2hlY2sgdG8gc2VlIGlmIHRoZSBhdHRyaWJ1dGUga2V5IGFwcGVhcnMgaW4gdGhlIHJ1bGUgZXhwcmVzc2lvblxyXG4gICAgLy8gVGhpcyBjb3VsZCBiZSBlbmhhbmNlZCB0byB1c2UgdGhlIEFTVCBmb3IgbW9yZSBwcmVjaXNlIGRldGVjdGlvblxyXG4gICAgcmV0dXJuIHJ1bGUuZXhwcmVzc2lvbi5pbmNsdWRlcyhhdHRyaWJ1dGVLZXkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlcyBtaXNzaW5nIGNyaXRlcmlhIGFjY29yZGluZyB0byByZXF1aXJlbWVudHM6XHJcbiAgICogLSBJZiBhIGNyaXRlcmlvbiBpcyBhYnNlbnQgZnJvbSBhIHJ1bGUsIHJldGFpbiB0aGF0IHJ1bGUgaW4gdGhlIGVsaWdpYmxlIHNldFxyXG4gICAqIC0gSWYgYSBjcml0ZXJpb24gdmFsdWUgY29uZmxpY3RzIHdpdGggYSBydWxlIGNvbmRpdGlvbiwgZWxpbWluYXRlIHRoYXQgcnVsZVxyXG4gICAqIC0gSWYgYSBjcml0ZXJpb24gdmFsdWUgbWF0Y2hlcyBhIHJ1bGUgY29uZGl0aW9uLCByZXRhaW4gdGhhdCBydWxlXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBoYW5kbGVNaXNzaW5nQ3JpdGVyaWEocnVsZTogUXVhbGlmaWNhdGlvblJ1bGUsIGNvbnRhY3RBdHRyaWJ1dGVzOiBDb250YWN0QXR0cmlidXRlcyk6IGJvb2xlYW4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gUGFyc2UgdGhlIHJ1bGUgdG8gdW5kZXJzdGFuZCB3aGF0IGF0dHJpYnV0ZXMgaXQgcmVxdWlyZXNcclxuICAgICAgY29uc3QgcGFyc2VSZXN1bHQgPSBSdWxlUGFyc2VyLnBhcnNlUnVsZUV4cHJlc3Npb24ocnVsZS5leHByZXNzaW9uKTtcclxuICAgICAgXHJcbiAgICAgIGlmICghcGFyc2VSZXN1bHQuaXNWYWxpZCB8fCAhcGFyc2VSZXN1bHQuYXN0KSB7XHJcbiAgICAgICAgLy8gSWYgd2UgY2FuJ3QgcGFyc2UgdGhlIHJ1bGUsIGVsaW1pbmF0ZSBpdFxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXh0cmFjdCBhbGwgaWRlbnRpZmllcnMgKGF0dHJpYnV0ZSBuYW1lcykgZnJvbSB0aGUgQVNUXHJcbiAgICAgIGNvbnN0IHJlcXVpcmVkQXR0cmlidXRlcyA9IHRoaXMuZXh0cmFjdElkZW50aWZpZXJzRnJvbUFTVChwYXJzZVJlc3VsdC5hc3QpO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2hlY2sgaWYgYWxsIHJlcXVpcmVkIGF0dHJpYnV0ZXMgYXJlIHByZXNlbnQgaW4gY29udGFjdCBhdHRyaWJ1dGVzXHJcbiAgICAgIGZvciAoY29uc3QgcmVxdWlyZWRBdHRyIG9mIHJlcXVpcmVkQXR0cmlidXRlcykge1xyXG4gICAgICAgIGlmICghKHJlcXVpcmVkQXR0ciBpbiBjb250YWN0QXR0cmlidXRlcykpIHtcclxuICAgICAgICAgIC8vIE1pc3NpbmcgYXR0cmlidXRlIC0gYWNjb3JkaW5nIHRvIHJlcXVpcmVtZW50cywgd2Ugc2hvdWxkIHJldGFpbiB0aGUgcnVsZVxyXG4gICAgICAgICAgLy8gQnV0IHdlIG5lZWQgdG8gaGFuZGxlIHRoaXMgY2FyZWZ1bGx5IGluIGV2YWx1YXRpb25cclxuICAgICAgICAgIGNvbnNvbGUubG9nKGBSdWxlICR7cnVsZS5pZH0gcmVmZXJlbmNlcyBtaXNzaW5nIGF0dHJpYnV0ZSAke3JlcXVpcmVkQXR0cn0sIHRyZWF0aW5nIGFzIHVuZGVmaW5lZGApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXZhbHVhdGUgd2l0aCBwb3RlbnRpYWxseSBtaXNzaW5nIGF0dHJpYnV0ZXMgKHVuZGVmaW5lZCB2YWx1ZXMpXHJcbiAgICAgIHJldHVybiBSdWxlUGFyc2VyLmV2YWx1YXRlRXhwcmVzc2lvbihwYXJzZVJlc3VsdC5hc3QsIGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgICAgXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLndhcm4oYEVycm9yIGhhbmRsaW5nIG1pc3NpbmcgY3JpdGVyaWEgZm9yIHJ1bGUgJHtydWxlLmlkfTpgLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBmYWxzZTsgLy8gRWxpbWluYXRlIHJ1bGUgb24gZXJyb3JcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlY3Vyc2l2ZWx5IGV4dHJhY3RzIGFsbCBpZGVudGlmaWVyIG5hbWVzIGZyb20gYW4gQVNUXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBleHRyYWN0SWRlbnRpZmllcnNGcm9tQVNUKG5vZGU6IGFueSk6IHN0cmluZ1tdIHtcclxuICAgIGNvbnN0IGlkZW50aWZpZXJzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgXHJcbiAgICBpZiAobm9kZS50eXBlID09PSAnSWRlbnRpZmllcicpIHtcclxuICAgICAgaWRlbnRpZmllcnMucHVzaChub2RlLm5hbWUpO1xyXG4gICAgfSBlbHNlIGlmIChub2RlLnR5cGUgPT09ICdCaW5hcnlFeHByZXNzaW9uJyB8fCBub2RlLnR5cGUgPT09ICdDb21wYXJpc29uRXhwcmVzc2lvbicpIHtcclxuICAgICAgaWYgKG5vZGUubGVmdCkge1xyXG4gICAgICAgIGlkZW50aWZpZXJzLnB1c2goLi4udGhpcy5leHRyYWN0SWRlbnRpZmllcnNGcm9tQVNUKG5vZGUubGVmdCkpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChub2RlLnJpZ2h0KSB7XHJcbiAgICAgICAgaWRlbnRpZmllcnMucHVzaCguLi50aGlzLmV4dHJhY3RJZGVudGlmaWVyc0Zyb21BU1Qobm9kZS5yaWdodCkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBpZGVudGlmaWVycztcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2VsZWN0RmluYWxSdWxlKGVsaWdpYmxlUnVsZXM6IFF1YWxpZmljYXRpb25SdWxlW10pOiB7XHJcbiAgICBzZWxlY3RlZFJ1bGU/OiBRdWFsaWZpY2F0aW9uUnVsZTtcclxuICAgIGRpc3RyaWJ1dGlvblNlZ21lbnQ/OiBzdHJpbmc7XHJcbiAgICBlcnJvcj86IHN0cmluZztcclxuICB9IHtcclxuICAgIGlmIChlbGlnaWJsZVJ1bGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGVycm9yOiBcIkF1Y3VuZSByw6hnbGUgbmUgY29ycmVzcG9uZCwgdsOpcmlmaWVyIGxlIHBhcmFtw6l0cmFnZVwiXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGVsaWdpYmxlUnVsZXMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgIGNvbnN0IHJ1bGUgPSBlbGlnaWJsZVJ1bGVzWzBdO1xyXG4gICAgICBjb25zb2xlLmxvZyhgU2VsZWN0ZWQgc2luZ2xlIGVsaWdpYmxlIHJ1bGU6ICR7cnVsZS5pZH0gd2l0aCB3ZWlnaHQgJHtydWxlLndlaWdodH1gKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFZhbGlkYXRlIGRpc3RyaWJ1dGlvbiBzZWdtZW50IGV4aXN0ZW5jZVxyXG4gICAgICBjb25zdCBzZWdtZW50VmFsaWRhdGlvbiA9IHRoaXMudmFsaWRhdGVEaXN0cmlidXRpb25TZWdtZW50KHJ1bGUpO1xyXG4gICAgICBpZiAoIXNlZ21lbnRWYWxpZGF0aW9uLmlzVmFsaWQpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgZXJyb3I6IHNlZ21lbnRWYWxpZGF0aW9uLmVycm9yXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzZWxlY3RlZFJ1bGU6IHJ1bGUsXHJcbiAgICAgICAgZGlzdHJpYnV0aW9uU2VnbWVudDogcnVsZS5kaXN0cmlidXRpb25TZWdtZW50XHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBoaWdoZXN0IHdlaWdodFxyXG4gICAgY29uc3QgbWF4V2VpZ2h0ID0gTWF0aC5tYXgoLi4uZWxpZ2libGVSdWxlcy5tYXAociA9PiByLndlaWdodCkpO1xyXG4gICAgY29uc3QgaGlnaGVzdFdlaWdodFJ1bGVzID0gZWxpZ2libGVSdWxlcy5maWx0ZXIociA9PiByLndlaWdodCA9PT0gbWF4V2VpZ2h0KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtoaWdoZXN0V2VpZ2h0UnVsZXMubGVuZ3RofSBydWxlcyB3aXRoIG1heCB3ZWlnaHQgJHttYXhXZWlnaHR9YCk7XHJcblxyXG4gICAgaWYgKGhpZ2hlc3RXZWlnaHRSdWxlcy5sZW5ndGggPiAxKSB7XHJcbiAgICAgIGNvbnN0IHJ1bGVJZHMgPSBoaWdoZXN0V2VpZ2h0UnVsZXMubWFwKHIgPT4gci5pZCkuam9pbignIGV0ICcpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGVycm9yOiBgTGVzIHLDqGdsZXMgJHtydWxlSWRzfSBvbnQgZGVzIHBvaWRzIGlkZW50aXF1ZXMsIHbDqXJpZmllciBsZSBwYXJhbcOpdHJhZ2VgXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VsZWN0ZWRSdWxlID0gaGlnaGVzdFdlaWdodFJ1bGVzWzBdO1xyXG4gICAgY29uc29sZS5sb2coYFNlbGVjdGVkIHJ1bGU6ICR7c2VsZWN0ZWRSdWxlLmlkfSB3aXRoIHdlaWdodCAke3NlbGVjdGVkUnVsZS53ZWlnaHR9LCBkaXN0cmlidXRpb24gc2VnbWVudDogJHtzZWxlY3RlZFJ1bGUuZGlzdHJpYnV0aW9uU2VnbWVudH1gKTtcclxuICAgIFxyXG4gICAgLy8gVmFsaWRhdGUgZGlzdHJpYnV0aW9uIHNlZ21lbnQgZXhpc3RlbmNlXHJcbiAgICBjb25zdCBzZWdtZW50VmFsaWRhdGlvbiA9IHRoaXMudmFsaWRhdGVEaXN0cmlidXRpb25TZWdtZW50KHNlbGVjdGVkUnVsZSk7XHJcbiAgICBpZiAoIXNlZ21lbnRWYWxpZGF0aW9uLmlzVmFsaWQpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBlcnJvcjogc2VnbWVudFZhbGlkYXRpb24uZXJyb3JcclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc2VsZWN0ZWRSdWxlLFxyXG4gICAgICBkaXN0cmlidXRpb25TZWdtZW50OiBzZWxlY3RlZFJ1bGUuZGlzdHJpYnV0aW9uU2VnbWVudFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlcyB0aGF0IGEgcnVsZSBoYXMgYSB2YWxpZCBkaXN0cmlidXRpb24gc2VnbWVudFxyXG4gICAqIEhhbmRsZXMgbWlzc2luZyBzZWdtZW50IG1hcHBpbmcgZXJyb3JzIGFzIHJlcXVpcmVkIGJ5IHRhc2sgNi40XHJcbiAgICovXHJcbiAgcHJpdmF0ZSB2YWxpZGF0ZURpc3RyaWJ1dGlvblNlZ21lbnQocnVsZTogUXVhbGlmaWNhdGlvblJ1bGUpOiB7XHJcbiAgICBpc1ZhbGlkOiBib29sZWFuO1xyXG4gICAgZXJyb3I/OiBzdHJpbmc7XHJcbiAgfSB7XHJcbiAgICAvLyBDaGVjayBpZiBkaXN0cmlidXRpb24gc2VnbWVudCBleGlzdHMgYW5kIGlzIG5vdCBlbXB0eVxyXG4gICAgaWYgKCFydWxlLmRpc3RyaWJ1dGlvblNlZ21lbnQgfHwgcnVsZS5kaXN0cmlidXRpb25TZWdtZW50LnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpc1ZhbGlkOiBmYWxzZSxcclxuICAgICAgICBlcnJvcjogYFNlZ21lbnQgZGUgZGlzdHJpYnV0aW9uIG1hbnF1YW50IHBvdXIgbGEgcsOoZ2xlICR7cnVsZS5pZH0sIHbDqXJpZmllciBsZSBwYXJhbcOpdHJhZ2VgXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgZGlzdHJpYnV0aW9uIHNlZ21lbnQgaXMgYSB2YWxpZCBzdHJpbmcgKG5vdCBudWxsLCB1bmRlZmluZWQsIG9yIHdoaXRlc3BhY2Ugb25seSlcclxuICAgIGlmICh0eXBlb2YgcnVsZS5kaXN0cmlidXRpb25TZWdtZW50ICE9PSAnc3RyaW5nJykge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGlzVmFsaWQ6IGZhbHNlLFxyXG4gICAgICAgIGVycm9yOiBgU2VnbWVudCBkZSBkaXN0cmlidXRpb24gaW52YWxpZGUgcG91ciBsYSByw6hnbGUgJHtydWxlLmlkfSwgdsOpcmlmaWVyIGxlIHBhcmFtw6l0cmFnZWBcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBZGRpdGlvbmFsIHZhbGlkYXRpb246IGVuc3VyZSBzZWdtZW50IGRvZXNuJ3QgY29udGFpbiBvbmx5IHdoaXRlc3BhY2VcclxuICAgIGlmIChydWxlLmRpc3RyaWJ1dGlvblNlZ21lbnQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGlzVmFsaWQ6IGZhbHNlLFxyXG4gICAgICAgIGVycm9yOiBgU2VnbWVudCBkZSBkaXN0cmlidXRpb24gdmlkZSBwb3VyIGxhIHLDqGdsZSAke3J1bGUuaWR9LCB2w6lyaWZpZXIgbGUgcGFyYW3DqXRyYWdlYFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGBEaXN0cmlidXRpb24gc2VnbWVudCB2YWxpZGF0aW9uIHBhc3NlZCBmb3IgcnVsZSAke3J1bGUuaWR9OiAke3J1bGUuZGlzdHJpYnV0aW9uU2VnbWVudH1gKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGlzVmFsaWQ6IHRydWVcclxuICAgIH07XHJcbiAgfVxyXG59Il19