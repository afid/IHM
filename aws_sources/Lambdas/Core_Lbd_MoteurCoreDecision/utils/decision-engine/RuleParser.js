"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleParser = exports.TokenType = void 0;
// Token types for rule expression parsing
var TokenType;
(function (TokenType) {
    TokenType["IDENTIFIER"] = "IDENTIFIER";
    TokenType["EQUALS"] = "EQUALS";
    TokenType["NOT_EQUALS"] = "NOT_EQUALS";
    TokenType["AND"] = "AND";
    TokenType["OR"] = "OR";
    TokenType["LEFT_PAREN"] = "LEFT_PAREN";
    TokenType["RIGHT_PAREN"] = "RIGHT_PAREN";
    TokenType["STRING_LITERAL"] = "STRING_LITERAL";
    TokenType["BOOLEAN_LITERAL"] = "BOOLEAN_LITERAL";
    TokenType["NUMBER_LITERAL"] = "NUMBER_LITERAL";
    TokenType["EOF"] = "EOF";
})(TokenType || (exports.TokenType = TokenType = {}));
class RuleParser {
    static validateRuleSyntax(expression) {
        if (!expression || typeof expression !== 'string') {
            return { isValid: false, error: 'Rule expression must be a non-empty string' };
        }
        const trimmed = expression.trim();
        if (trimmed === '') {
            return { isValid: false, error: 'Rule expression cannot be empty' };
        }
        try {
            // Attempt to parse the expression to validate syntax
            const parseResult = this.parseRuleExpression(trimmed);
            return { isValid: parseResult.isValid, error: parseResult.error };
        }
        catch (error) {
            return {
                isValid: false,
                error: `Syntax validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    static parseRuleExpression(expression) {
        try {
            const tokens = this.tokenize(expression.trim());
            const parser = new ExpressionParser(tokens);
            const ast = parser.parse();
            return {
                isValid: true,
                ast,
                tokens
            };
        }
        catch (error) {
            return {
                isValid: false,
                error: `Failed to parse rule expression: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    static evaluateExpression(ast, contactAttributes) {
        switch (ast.type) {
            case 'BinaryExpression':
                return this.evaluateBinaryExpression(ast, contactAttributes);
            case 'ComparisonExpression':
                return this.evaluateComparisonExpression(ast, contactAttributes);
            case 'Identifier':
                // If we encounter a bare identifier, treat it as truthy check
                const identifier = ast;
                const value = contactAttributes[identifier.name];
                return Boolean(value);
            case 'Literal':
                const literal = ast;
                return Boolean(literal.value);
            default:
                throw new Error(`Unknown AST node type: ${ast.type}`);
        }
    }
    static evaluateBinaryExpression(node, contactAttributes) {
        const left = this.evaluateExpression(node.left, contactAttributes);
        const right = this.evaluateExpression(node.right, contactAttributes);
        switch (node.operator) {
            case '&&':
                return left && right;
            case '||':
                return left || right;
            default:
                throw new Error(`Unknown binary operator: ${node.operator}`);
        }
    }
    static evaluateComparisonExpression(node, contactAttributes) {
        const attributeName = node.left.name;
        const expectedValue = node.right.value;
        const actualValue = contactAttributes[attributeName];
        switch (node.operator) {
            case '==':
                return this.compareValues(actualValue, expectedValue);
            case '!=':
                return !this.compareValues(actualValue, expectedValue);
            default:
                throw new Error(`Unknown comparison operator: ${node.operator}`);
        }
    }
    static compareValues(actual, expected) {
        // Handle type coercion for comparison
        if (typeof actual === typeof expected) {
            return actual === expected;
        }
        // Convert strings to appropriate types for comparison
        if (typeof expected === 'boolean' && typeof actual === 'string') {
            return actual.toLowerCase() === expected.toString();
        }
        if (typeof expected === 'number' && typeof actual === 'string') {
            const numActual = parseFloat(actual);
            return !isNaN(numActual) && numActual === expected;
        }
        if (typeof expected === 'string' && typeof actual === 'number') {
            return actual.toString() === expected;
        }
        return actual == expected; // Use loose equality for final comparison
    }
    static tokenize(expression) {
        const tokens = [];
        let position = 0;
        while (position < expression.length) {
            // Skip whitespace
            if (/\s/.test(expression[position])) {
                position++;
                continue;
            }
            // Check for two-character operators first
            if (position < expression.length - 1) {
                const twoChar = expression.substr(position, 2);
                if (twoChar === '==') {
                    tokens.push({ type: TokenType.EQUALS, value: '==', position });
                    position += 2;
                    continue;
                }
                if (twoChar === '!=') {
                    tokens.push({ type: TokenType.NOT_EQUALS, value: '!=', position });
                    position += 2;
                    continue;
                }
                if (twoChar === '&&') {
                    tokens.push({ type: TokenType.AND, value: '&&', position });
                    position += 2;
                    continue;
                }
                if (twoChar === '||') {
                    tokens.push({ type: TokenType.OR, value: '||', position });
                    position += 2;
                    continue;
                }
            }
            // Single character tokens
            const char = expression[position];
            if (char === '(') {
                tokens.push({ type: TokenType.LEFT_PAREN, value: '(', position });
                position++;
                continue;
            }
            if (char === ')') {
                tokens.push({ type: TokenType.RIGHT_PAREN, value: ')', position });
                position++;
                continue;
            }
            // String literals
            if (char === '"' || char === "'") {
                const quote = char;
                let value = '';
                position++; // Skip opening quote
                while (position < expression.length && expression[position] !== quote) {
                    value += expression[position];
                    position++;
                }
                if (position >= expression.length) {
                    throw new Error(`Unterminated string literal starting at position ${position - value.length - 1}`);
                }
                position++; // Skip closing quote
                tokens.push({ type: TokenType.STRING_LITERAL, value, position: position - value.length - 2 });
                continue;
            }
            // Identifiers and literals
            if (/[a-zA-Z_]/.test(char)) {
                let value = '';
                const startPos = position;
                while (position < expression.length && /[a-zA-Z0-9_]/.test(expression[position])) {
                    value += expression[position];
                    position++;
                }
                // Check for boolean literals
                if (value === 'true' || value === 'false') {
                    tokens.push({ type: TokenType.BOOLEAN_LITERAL, value, position: startPos });
                }
                else {
                    tokens.push({ type: TokenType.IDENTIFIER, value, position: startPos });
                }
                continue;
            }
            // Number literals
            if (/[0-9]/.test(char)) {
                let value = '';
                const startPos = position;
                while (position < expression.length && /[0-9.]/.test(expression[position])) {
                    value += expression[position];
                    position++;
                }
                tokens.push({ type: TokenType.NUMBER_LITERAL, value, position: startPos });
                continue;
            }
            throw new Error(`Unexpected character '${char}' at position ${position}`);
        }
        tokens.push({ type: TokenType.EOF, value: '', position });
        return tokens;
    }
}
exports.RuleParser = RuleParser;
class ExpressionParser {
    constructor(tokens) {
        this.current = 0;
        this.tokens = tokens;
    }
    parse() {
        return this.parseOrExpression();
    }
    parseOrExpression() {
        let left = this.parseAndExpression();
        while (this.match(TokenType.OR)) {
            const operator = '||';
            const right = this.parseAndExpression();
            left = {
                type: 'BinaryExpression',
                operator,
                left,
                right
            };
        }
        return left;
    }
    parseAndExpression() {
        let left = this.parseComparisonExpression();
        while (this.match(TokenType.AND)) {
            const operator = '&&';
            const right = this.parseComparisonExpression();
            left = {
                type: 'BinaryExpression',
                operator,
                left,
                right
            };
        }
        return left;
    }
    parseComparisonExpression() {
        let left = this.parsePrimaryExpression();
        if (this.match(TokenType.EQUALS, TokenType.NOT_EQUALS)) {
            const operator = this.previous().value;
            const right = this.parsePrimaryExpression();
            // Ensure left side is an identifier for comparison
            if (left.type !== 'Identifier') {
                throw new Error('Left side of comparison must be an identifier');
            }
            // Ensure right side is a literal for comparison
            if (right.type !== 'Literal') {
                throw new Error('Right side of comparison must be a literal value');
            }
            return {
                type: 'ComparisonExpression',
                operator,
                left: left,
                right: right
            };
        }
        return left;
    }
    parsePrimaryExpression() {
        if (this.match(TokenType.LEFT_PAREN)) {
            const expr = this.parseOrExpression();
            this.consume(TokenType.RIGHT_PAREN, "Expected ')' after expression");
            return expr;
        }
        if (this.match(TokenType.IDENTIFIER)) {
            return {
                type: 'Identifier',
                name: this.previous().value
            };
        }
        if (this.match(TokenType.STRING_LITERAL)) {
            return {
                type: 'Literal',
                value: this.previous().value,
                raw: `"${this.previous().value}"`
            };
        }
        if (this.match(TokenType.BOOLEAN_LITERAL)) {
            const value = this.previous().value === 'true';
            return {
                type: 'Literal',
                value,
                raw: this.previous().value
            };
        }
        if (this.match(TokenType.NUMBER_LITERAL)) {
            const value = parseFloat(this.previous().value);
            return {
                type: 'Literal',
                value,
                raw: this.previous().value
            };
        }
        throw new Error(`Unexpected token: ${this.peek().value} at position ${this.peek().position}`);
    }
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    check(type) {
        if (this.isAtEnd())
            return false;
        return this.peek().type === type;
    }
    advance() {
        if (!this.isAtEnd())
            this.current++;
        return this.previous();
    }
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }
    peek() {
        return this.tokens[this.current];
    }
    previous() {
        return this.tokens[this.current - 1];
    }
    consume(type, message) {
        if (this.check(type))
            return this.advance();
        throw new Error(`${message}. Got ${this.peek().type} at position ${this.peek().position}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUnVsZVBhcnNlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91dGlscy9kZWNpc2lvbi1lbmdpbmUvUnVsZVBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwwQ0FBMEM7QUFDMUMsSUFBWSxTQVlYO0FBWkQsV0FBWSxTQUFTO0lBQ25CLHNDQUF5QixDQUFBO0lBQ3pCLDhCQUFpQixDQUFBO0lBQ2pCLHNDQUF5QixDQUFBO0lBQ3pCLHdCQUFXLENBQUE7SUFDWCxzQkFBUyxDQUFBO0lBQ1Qsc0NBQXlCLENBQUE7SUFDekIsd0NBQTJCLENBQUE7SUFDM0IsOENBQWlDLENBQUE7SUFDakMsZ0RBQW1DLENBQUE7SUFDbkMsOENBQWlDLENBQUE7SUFDakMsd0JBQVcsQ0FBQTtBQUNiLENBQUMsRUFaVyxTQUFTLHlCQUFULFNBQVMsUUFZcEI7QUFzQ0QsTUFBYSxVQUFVO0lBRXJCLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxVQUFrQjtRQUMxQyxJQUFJLENBQUMsVUFBVSxJQUFJLE9BQU8sVUFBVSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2xELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw0Q0FBNEMsRUFBRSxDQUFDO1FBQ2pGLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEMsSUFBSSxPQUFPLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDbkIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlDQUFpQyxFQUFFLENBQUM7UUFDdEUsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILHFEQUFxRDtZQUNyRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDcEUsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLE9BQU8sRUFBRSxLQUFLO2dCQUNkLEtBQUssRUFBRSw2QkFBNkIsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFO2FBQy9GLENBQUM7UUFDSixDQUFDO0lBQ0gsQ0FBQztJQUVELE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxVQUFrQjtRQU0zQyxJQUFJLENBQUM7WUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDNUMsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRTNCLE9BQU87Z0JBQ0wsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsR0FBRztnQkFDSCxNQUFNO2FBQ1AsQ0FBQztRQUNKLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTztnQkFDTCxPQUFPLEVBQUUsS0FBSztnQkFDZCxLQUFLLEVBQUUsb0NBQW9DLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRTthQUN0RyxDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBWSxFQUFFLGlCQUFzQztRQUM1RSxRQUFRLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQixLQUFLLGtCQUFrQjtnQkFDckIsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBdUIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQ25GLEtBQUssc0JBQXNCO2dCQUN6QixPQUFPLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUEyQixFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFDM0YsS0FBSyxZQUFZO2dCQUNmLDhEQUE4RDtnQkFDOUQsTUFBTSxVQUFVLEdBQUcsR0FBaUIsQ0FBQztnQkFDckMsTUFBTSxLQUFLLEdBQUcsaUJBQWlCLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNqRCxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QixLQUFLLFNBQVM7Z0JBQ1osTUFBTSxPQUFPLEdBQUcsR0FBYyxDQUFDO2dCQUMvQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEM7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUQsQ0FBQztJQUNILENBQUM7SUFFTyxNQUFNLENBQUMsd0JBQXdCLENBQUMsSUFBc0IsRUFBRSxpQkFBc0M7UUFDcEcsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUNuRSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRXJFLFFBQVEsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLEtBQUssSUFBSTtnQkFDUCxPQUFPLElBQUksSUFBSSxLQUFLLENBQUM7WUFDdkIsS0FBSyxJQUFJO2dCQUNQLE9BQU8sSUFBSSxJQUFJLEtBQUssQ0FBQztZQUN2QjtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNqRSxDQUFDO0lBQ0gsQ0FBQztJQUVPLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxJQUEwQixFQUFFLGlCQUFzQztRQUM1RyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNyQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUN2QyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVyRCxRQUFRLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN0QixLQUFLLElBQUk7Z0JBQ1AsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUN4RCxLQUFLLElBQUk7Z0JBQ1AsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3pEO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7SUFDSCxDQUFDO0lBRU8sTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFXLEVBQUUsUUFBYTtRQUNyRCxzQ0FBc0M7UUFDdEMsSUFBSSxPQUFPLE1BQU0sS0FBSyxPQUFPLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sTUFBTSxLQUFLLFFBQVEsQ0FBQztRQUM3QixDQUFDO1FBRUQsc0RBQXNEO1FBQ3RELElBQUksT0FBTyxRQUFRLEtBQUssU0FBUyxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2hFLE9BQU8sTUFBTSxDQUFDLFdBQVcsRUFBRSxLQUFLLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN0RCxDQUFDO1FBRUQsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0QsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3JDLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksU0FBUyxLQUFLLFFBQVEsQ0FBQztRQUNyRCxDQUFDO1FBRUQsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0QsT0FBTyxNQUFNLENBQUMsUUFBUSxFQUFFLEtBQUssUUFBUSxDQUFDO1FBQ3hDLENBQUM7UUFFRCxPQUFPLE1BQU0sSUFBSSxRQUFRLENBQUMsQ0FBQywwQ0FBMEM7SUFDdkUsQ0FBQztJQUVPLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBa0I7UUFDeEMsTUFBTSxNQUFNLEdBQVksRUFBRSxDQUFDO1FBQzNCLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztRQUVqQixPQUFPLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEMsa0JBQWtCO1lBQ2xCLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNwQyxRQUFRLEVBQUUsQ0FBQztnQkFDWCxTQUFTO1lBQ1gsQ0FBQztZQUVELDBDQUEwQztZQUMxQyxJQUFJLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDL0MsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBQy9ELFFBQVEsSUFBSSxDQUFDLENBQUM7b0JBQ2QsU0FBUztnQkFDWCxDQUFDO2dCQUNELElBQUksT0FBTyxLQUFLLElBQUksRUFBRSxDQUFDO29CQUNyQixNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO29CQUNuRSxRQUFRLElBQUksQ0FBQyxDQUFDO29CQUNkLFNBQVM7Z0JBQ1gsQ0FBQztnQkFDRCxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDckIsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztvQkFDNUQsUUFBUSxJQUFJLENBQUMsQ0FBQztvQkFDZCxTQUFTO2dCQUNYLENBQUM7Z0JBQ0QsSUFBSSxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBQzNELFFBQVEsSUFBSSxDQUFDLENBQUM7b0JBQ2QsU0FBUztnQkFDWCxDQUFDO1lBQ0gsQ0FBQztZQUVELDBCQUEwQjtZQUMxQixNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEMsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ2xFLFFBQVEsRUFBRSxDQUFDO2dCQUNYLFNBQVM7WUFDWCxDQUFDO1lBQ0QsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ25FLFFBQVEsRUFBRSxDQUFDO2dCQUNYLFNBQVM7WUFDWCxDQUFDO1lBRUQsa0JBQWtCO1lBQ2xCLElBQUksSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDbkIsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUNmLFFBQVEsRUFBRSxDQUFDLENBQUMscUJBQXFCO2dCQUVqQyxPQUFPLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDdEUsS0FBSyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDOUIsUUFBUSxFQUFFLENBQUM7Z0JBQ2IsQ0FBQztnQkFFRCxJQUFJLFFBQVEsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0RBQW9ELFFBQVEsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3JHLENBQUM7Z0JBRUQsUUFBUSxFQUFFLENBQUMsQ0FBQyxxQkFBcUI7Z0JBQ2pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLGNBQWMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlGLFNBQVM7WUFDWCxDQUFDO1lBRUQsMkJBQTJCO1lBQzNCLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUMzQixJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDO2dCQUUxQixPQUFPLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDakYsS0FBSyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDOUIsUUFBUSxFQUFFLENBQUM7Z0JBQ2IsQ0FBQztnQkFFRCw2QkFBNkI7Z0JBQzdCLElBQUksS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7b0JBQzFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLGVBQWUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQzlFLENBQUM7cUJBQU0sQ0FBQztvQkFDTixNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RSxDQUFDO2dCQUNELFNBQVM7WUFDWCxDQUFDO1lBRUQsa0JBQWtCO1lBQ2xCLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN2QixJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDO2dCQUUxQixPQUFPLFFBQVEsR0FBRyxVQUFVLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDM0UsS0FBSyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDOUIsUUFBUSxFQUFFLENBQUM7Z0JBQ2IsQ0FBQztnQkFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxjQUFjLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRSxTQUFTO1lBQ1gsQ0FBQztZQUVELE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLElBQUksaUJBQWlCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDNUUsQ0FBQztRQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDMUQsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztDQUNGO0FBbk9ELGdDQW1PQztBQUVELE1BQU0sZ0JBQWdCO0lBSXBCLFlBQVksTUFBZTtRQUZuQixZQUFPLEdBQVcsQ0FBQyxDQUFDO1FBRzFCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxLQUFLO1FBQ0gsT0FBTyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRU8saUJBQWlCO1FBQ3ZCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBRXJDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFhLENBQUM7WUFDL0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDeEMsSUFBSSxHQUFHO2dCQUNMLElBQUksRUFBRSxrQkFBa0I7Z0JBQ3hCLFFBQVE7Z0JBQ1IsSUFBSTtnQkFDSixLQUFLO2FBQ2MsQ0FBQztRQUN4QixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRU8sa0JBQWtCO1FBQ3hCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBRTVDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxNQUFNLFFBQVEsR0FBRyxJQUFhLENBQUM7WUFDL0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDL0MsSUFBSSxHQUFHO2dCQUNMLElBQUksRUFBRSxrQkFBa0I7Z0JBQ3hCLFFBQVE7Z0JBQ1IsSUFBSTtnQkFDSixLQUFLO2FBQ2MsQ0FBQztRQUN4QixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRU8seUJBQXlCO1FBQy9CLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBRXpDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ3ZELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFvQixDQUFDO1lBQ3RELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBRTVDLG1EQUFtRDtZQUNuRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sSUFBSSxLQUFLLENBQUMsK0NBQStDLENBQUMsQ0FBQztZQUNuRSxDQUFDO1lBRUQsZ0RBQWdEO1lBQ2hELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxrREFBa0QsQ0FBQyxDQUFDO1lBQ3RFLENBQUM7WUFFRCxPQUFPO2dCQUNMLElBQUksRUFBRSxzQkFBc0I7Z0JBQzVCLFFBQVE7Z0JBQ1IsSUFBSSxFQUFFLElBQWtCO2dCQUN4QixLQUFLLEVBQUUsS0FBZ0I7YUFDQSxDQUFDO1FBQzVCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFTyxzQkFBc0I7UUFDNUIsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1lBQ3JFLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNyQyxPQUFPO2dCQUNMLElBQUksRUFBRSxZQUFZO2dCQUNsQixJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUs7YUFDZCxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDekMsT0FBTztnQkFDTCxJQUFJLEVBQUUsU0FBUztnQkFDZixLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUs7Z0JBQzVCLEdBQUcsRUFBRSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLEdBQUc7YUFDdkIsQ0FBQztRQUNmLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDMUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssS0FBSyxNQUFNLENBQUM7WUFDL0MsT0FBTztnQkFDTCxJQUFJLEVBQUUsU0FBUztnQkFDZixLQUFLO2dCQUNMLEdBQUcsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSzthQUNoQixDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUN6QyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2hELE9BQU87Z0JBQ0wsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsS0FBSztnQkFDTCxHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUs7YUFDaEIsQ0FBQztRQUNmLENBQUM7UUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVPLEtBQUssQ0FBQyxHQUFHLEtBQWtCO1FBQ2pDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7WUFDekIsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZixPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRU8sS0FBSyxDQUFDLElBQWU7UUFDM0IsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFDakMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQztJQUNuQyxDQUFDO0lBRU8sT0FBTztRQUNiLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFTyxPQUFPO1FBQ2IsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxHQUFHLENBQUM7SUFDNUMsQ0FBQztJQUVPLElBQUk7UUFDVixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFTyxRQUFRO1FBQ2QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVPLE9BQU8sQ0FBQyxJQUFlLEVBQUUsT0FBZTtRQUM5QyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxHQUFHLE9BQU8sU0FBUyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxnQkFBZ0IsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDN0YsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVG9rZW4gdHlwZXMgZm9yIHJ1bGUgZXhwcmVzc2lvbiBwYXJzaW5nXHJcbmV4cG9ydCBlbnVtIFRva2VuVHlwZSB7XHJcbiAgSURFTlRJRklFUiA9ICdJREVOVElGSUVSJyxcclxuICBFUVVBTFMgPSAnRVFVQUxTJyxcclxuICBOT1RfRVFVQUxTID0gJ05PVF9FUVVBTFMnLFxyXG4gIEFORCA9ICdBTkQnLFxyXG4gIE9SID0gJ09SJyxcclxuICBMRUZUX1BBUkVOID0gJ0xFRlRfUEFSRU4nLFxyXG4gIFJJR0hUX1BBUkVOID0gJ1JJR0hUX1BBUkVOJyxcclxuICBTVFJJTkdfTElURVJBTCA9ICdTVFJJTkdfTElURVJBTCcsXHJcbiAgQk9PTEVBTl9MSVRFUkFMID0gJ0JPT0xFQU5fTElURVJBTCcsXHJcbiAgTlVNQkVSX0xJVEVSQUwgPSAnTlVNQkVSX0xJVEVSQUwnLFxyXG4gIEVPRiA9ICdFT0YnXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW4ge1xyXG4gIHR5cGU6IFRva2VuVHlwZTtcclxuICB2YWx1ZTogc3RyaW5nO1xyXG4gIHBvc2l0aW9uOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIEFTVCBub2RlIHR5cGVzIGZvciBwYXJzZWQgZXhwcmVzc2lvbnNcclxuZXhwb3J0IGludGVyZmFjZSBBU1ROb2RlIHtcclxuICB0eXBlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQmluYXJ5RXhwcmVzc2lvbiBleHRlbmRzIEFTVE5vZGUge1xyXG4gIHR5cGU6ICdCaW5hcnlFeHByZXNzaW9uJztcclxuICBvcGVyYXRvcjogJz09JyB8ICchPScgfCAnJiYnIHwgJ3x8JztcclxuICBsZWZ0OiBBU1ROb2RlO1xyXG4gIHJpZ2h0OiBBU1ROb2RlO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIENvbXBhcmlzb25FeHByZXNzaW9uIGV4dGVuZHMgQVNUTm9kZSB7XHJcbiAgdHlwZTogJ0NvbXBhcmlzb25FeHByZXNzaW9uJztcclxuICBvcGVyYXRvcjogJz09JyB8ICchPSc7XHJcbiAgbGVmdDogSWRlbnRpZmllcjtcclxuICByaWdodDogTGl0ZXJhbDtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJZGVudGlmaWVyIGV4dGVuZHMgQVNUTm9kZSB7XHJcbiAgdHlwZTogJ0lkZW50aWZpZXInO1xyXG4gIG5hbWU6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBMaXRlcmFsIGV4dGVuZHMgQVNUTm9kZSB7XHJcbiAgdHlwZTogJ0xpdGVyYWwnO1xyXG4gIHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuO1xyXG4gIHJhdzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUnVsZVBhcnNlciB7XHJcbiAgXHJcbiAgc3RhdGljIHZhbGlkYXRlUnVsZVN5bnRheChleHByZXNzaW9uOiBzdHJpbmcpOiB7IGlzVmFsaWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0ge1xyXG4gICAgaWYgKCFleHByZXNzaW9uIHx8IHR5cGVvZiBleHByZXNzaW9uICE9PSAnc3RyaW5nJykge1xyXG4gICAgICByZXR1cm4geyBpc1ZhbGlkOiBmYWxzZSwgZXJyb3I6ICdSdWxlIGV4cHJlc3Npb24gbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcnIH07XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdHJpbW1lZCA9IGV4cHJlc3Npb24udHJpbSgpO1xyXG4gICAgaWYgKHRyaW1tZWQgPT09ICcnKSB7XHJcbiAgICAgIHJldHVybiB7IGlzVmFsaWQ6IGZhbHNlLCBlcnJvcjogJ1J1bGUgZXhwcmVzc2lvbiBjYW5ub3QgYmUgZW1wdHknIH07XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQXR0ZW1wdCB0byBwYXJzZSB0aGUgZXhwcmVzc2lvbiB0byB2YWxpZGF0ZSBzeW50YXhcclxuICAgICAgY29uc3QgcGFyc2VSZXN1bHQgPSB0aGlzLnBhcnNlUnVsZUV4cHJlc3Npb24odHJpbW1lZCk7XHJcbiAgICAgIHJldHVybiB7IGlzVmFsaWQ6IHBhcnNlUmVzdWx0LmlzVmFsaWQsIGVycm9yOiBwYXJzZVJlc3VsdC5lcnJvciB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgaXNWYWxpZDogZmFsc2UsIFxyXG4gICAgICAgIGVycm9yOiBgU3ludGF4IHZhbGlkYXRpb24gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWAgXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgcGFyc2VSdWxlRXhwcmVzc2lvbihleHByZXNzaW9uOiBzdHJpbmcpOiB7IFxyXG4gICAgaXNWYWxpZDogYm9vbGVhbjsgXHJcbiAgICBhc3Q/OiBBU1ROb2RlO1xyXG4gICAgdG9rZW5zPzogVG9rZW5bXTtcclxuICAgIGVycm9yPzogc3RyaW5nIFxyXG4gIH0ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdG9rZW5zID0gdGhpcy50b2tlbml6ZShleHByZXNzaW9uLnRyaW0oKSk7XHJcbiAgICAgIGNvbnN0IHBhcnNlciA9IG5ldyBFeHByZXNzaW9uUGFyc2VyKHRva2Vucyk7XHJcbiAgICAgIGNvbnN0IGFzdCA9IHBhcnNlci5wYXJzZSgpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHsgXHJcbiAgICAgICAgaXNWYWxpZDogdHJ1ZSwgXHJcbiAgICAgICAgYXN0LFxyXG4gICAgICAgIHRva2VucyBcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHJldHVybiB7IFxyXG4gICAgICAgIGlzVmFsaWQ6IGZhbHNlLCBcclxuICAgICAgICBlcnJvcjogYEZhaWxlZCB0byBwYXJzZSBydWxlIGV4cHJlc3Npb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCBcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHN0YXRpYyBldmFsdWF0ZUV4cHJlc3Npb24oYXN0OiBBU1ROb2RlLCBjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55Pik6IGJvb2xlYW4ge1xyXG4gICAgc3dpdGNoIChhc3QudHlwZSkge1xyXG4gICAgICBjYXNlICdCaW5hcnlFeHByZXNzaW9uJzpcclxuICAgICAgICByZXR1cm4gdGhpcy5ldmFsdWF0ZUJpbmFyeUV4cHJlc3Npb24oYXN0IGFzIEJpbmFyeUV4cHJlc3Npb24sIGNvbnRhY3RBdHRyaWJ1dGVzKTtcclxuICAgICAgY2FzZSAnQ29tcGFyaXNvbkV4cHJlc3Npb24nOlxyXG4gICAgICAgIHJldHVybiB0aGlzLmV2YWx1YXRlQ29tcGFyaXNvbkV4cHJlc3Npb24oYXN0IGFzIENvbXBhcmlzb25FeHByZXNzaW9uLCBjb250YWN0QXR0cmlidXRlcyk7XHJcbiAgICAgIGNhc2UgJ0lkZW50aWZpZXInOlxyXG4gICAgICAgIC8vIElmIHdlIGVuY291bnRlciBhIGJhcmUgaWRlbnRpZmllciwgdHJlYXQgaXQgYXMgdHJ1dGh5IGNoZWNrXHJcbiAgICAgICAgY29uc3QgaWRlbnRpZmllciA9IGFzdCBhcyBJZGVudGlmaWVyO1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udGFjdEF0dHJpYnV0ZXNbaWRlbnRpZmllci5uYW1lXTtcclxuICAgICAgICByZXR1cm4gQm9vbGVhbih2YWx1ZSk7XHJcbiAgICAgIGNhc2UgJ0xpdGVyYWwnOlxyXG4gICAgICAgIGNvbnN0IGxpdGVyYWwgPSBhc3QgYXMgTGl0ZXJhbDtcclxuICAgICAgICByZXR1cm4gQm9vbGVhbihsaXRlcmFsLnZhbHVlKTtcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gQVNUIG5vZGUgdHlwZTogJHthc3QudHlwZX1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgc3RhdGljIGV2YWx1YXRlQmluYXJ5RXhwcmVzc2lvbihub2RlOiBCaW5hcnlFeHByZXNzaW9uLCBjb250YWN0QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgYW55Pik6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgbGVmdCA9IHRoaXMuZXZhbHVhdGVFeHByZXNzaW9uKG5vZGUubGVmdCwgY29udGFjdEF0dHJpYnV0ZXMpO1xyXG4gICAgY29uc3QgcmlnaHQgPSB0aGlzLmV2YWx1YXRlRXhwcmVzc2lvbihub2RlLnJpZ2h0LCBjb250YWN0QXR0cmlidXRlcyk7XHJcblxyXG4gICAgc3dpdGNoIChub2RlLm9wZXJhdG9yKSB7XHJcbiAgICAgIGNhc2UgJyYmJzpcclxuICAgICAgICByZXR1cm4gbGVmdCAmJiByaWdodDtcclxuICAgICAgY2FzZSAnfHwnOlxyXG4gICAgICAgIHJldHVybiBsZWZ0IHx8IHJpZ2h0O1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBiaW5hcnkgb3BlcmF0b3I6ICR7bm9kZS5vcGVyYXRvcn1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgc3RhdGljIGV2YWx1YXRlQ29tcGFyaXNvbkV4cHJlc3Npb24obm9kZTogQ29tcGFyaXNvbkV4cHJlc3Npb24sIGNvbnRhY3RBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBhdHRyaWJ1dGVOYW1lID0gbm9kZS5sZWZ0Lm5hbWU7XHJcbiAgICBjb25zdCBleHBlY3RlZFZhbHVlID0gbm9kZS5yaWdodC52YWx1ZTtcclxuICAgIGNvbnN0IGFjdHVhbFZhbHVlID0gY29udGFjdEF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XHJcblxyXG4gICAgc3dpdGNoIChub2RlLm9wZXJhdG9yKSB7XHJcbiAgICAgIGNhc2UgJz09JzpcclxuICAgICAgICByZXR1cm4gdGhpcy5jb21wYXJlVmFsdWVzKGFjdHVhbFZhbHVlLCBleHBlY3RlZFZhbHVlKTtcclxuICAgICAgY2FzZSAnIT0nOlxyXG4gICAgICAgIHJldHVybiAhdGhpcy5jb21wYXJlVmFsdWVzKGFjdHVhbFZhbHVlLCBleHBlY3RlZFZhbHVlKTtcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY29tcGFyaXNvbiBvcGVyYXRvcjogJHtub2RlLm9wZXJhdG9yfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzdGF0aWMgY29tcGFyZVZhbHVlcyhhY3R1YWw6IGFueSwgZXhwZWN0ZWQ6IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgLy8gSGFuZGxlIHR5cGUgY29lcmNpb24gZm9yIGNvbXBhcmlzb25cclxuICAgIGlmICh0eXBlb2YgYWN0dWFsID09PSB0eXBlb2YgZXhwZWN0ZWQpIHtcclxuICAgICAgcmV0dXJuIGFjdHVhbCA9PT0gZXhwZWN0ZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ29udmVydCBzdHJpbmdzIHRvIGFwcHJvcHJpYXRlIHR5cGVzIGZvciBjb21wYXJpc29uXHJcbiAgICBpZiAodHlwZW9mIGV4cGVjdGVkID09PSAnYm9vbGVhbicgJiYgdHlwZW9mIGFjdHVhbCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgcmV0dXJuIGFjdHVhbC50b0xvd2VyQ2FzZSgpID09PSBleHBlY3RlZC50b1N0cmluZygpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgZXhwZWN0ZWQgPT09ICdudW1iZXInICYmIHR5cGVvZiBhY3R1YWwgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgIGNvbnN0IG51bUFjdHVhbCA9IHBhcnNlRmxvYXQoYWN0dWFsKTtcclxuICAgICAgcmV0dXJuICFpc05hTihudW1BY3R1YWwpICYmIG51bUFjdHVhbCA9PT0gZXhwZWN0ZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBleHBlY3RlZCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGFjdHVhbCA9PT0gJ251bWJlcicpIHtcclxuICAgICAgcmV0dXJuIGFjdHVhbC50b1N0cmluZygpID09PSBleHBlY3RlZDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gYWN0dWFsID09IGV4cGVjdGVkOyAvLyBVc2UgbG9vc2UgZXF1YWxpdHkgZm9yIGZpbmFsIGNvbXBhcmlzb25cclxuICB9XHJcblxyXG4gIHByaXZhdGUgc3RhdGljIHRva2VuaXplKGV4cHJlc3Npb246IHN0cmluZyk6IFRva2VuW10ge1xyXG4gICAgY29uc3QgdG9rZW5zOiBUb2tlbltdID0gW107XHJcbiAgICBsZXQgcG9zaXRpb24gPSAwO1xyXG5cclxuICAgIHdoaWxlIChwb3NpdGlvbiA8IGV4cHJlc3Npb24ubGVuZ3RoKSB7XHJcbiAgICAgIC8vIFNraXAgd2hpdGVzcGFjZVxyXG4gICAgICBpZiAoL1xccy8udGVzdChleHByZXNzaW9uW3Bvc2l0aW9uXSkpIHtcclxuICAgICAgICBwb3NpdGlvbisrO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDaGVjayBmb3IgdHdvLWNoYXJhY3RlciBvcGVyYXRvcnMgZmlyc3RcclxuICAgICAgaWYgKHBvc2l0aW9uIDwgZXhwcmVzc2lvbi5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgY29uc3QgdHdvQ2hhciA9IGV4cHJlc3Npb24uc3Vic3RyKHBvc2l0aW9uLCAyKTtcclxuICAgICAgICBpZiAodHdvQ2hhciA9PT0gJz09Jykge1xyXG4gICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuRVFVQUxTLCB2YWx1ZTogJz09JywgcG9zaXRpb24gfSk7XHJcbiAgICAgICAgICBwb3NpdGlvbiArPSAyO1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0d29DaGFyID09PSAnIT0nKSB7XHJcbiAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5OT1RfRVFVQUxTLCB2YWx1ZTogJyE9JywgcG9zaXRpb24gfSk7XHJcbiAgICAgICAgICBwb3NpdGlvbiArPSAyO1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0d29DaGFyID09PSAnJiYnKSB7XHJcbiAgICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5BTkQsIHZhbHVlOiAnJiYnLCBwb3NpdGlvbiB9KTtcclxuICAgICAgICAgIHBvc2l0aW9uICs9IDI7XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHR3b0NoYXIgPT09ICd8fCcpIHtcclxuICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogVG9rZW5UeXBlLk9SLCB2YWx1ZTogJ3x8JywgcG9zaXRpb24gfSk7XHJcbiAgICAgICAgICBwb3NpdGlvbiArPSAyO1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTaW5nbGUgY2hhcmFjdGVyIHRva2Vuc1xyXG4gICAgICBjb25zdCBjaGFyID0gZXhwcmVzc2lvbltwb3NpdGlvbl07XHJcbiAgICAgIGlmIChjaGFyID09PSAnKCcpIHtcclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5MRUZUX1BBUkVOLCB2YWx1ZTogJygnLCBwb3NpdGlvbiB9KTtcclxuICAgICAgICBwb3NpdGlvbisrO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChjaGFyID09PSAnKScpIHtcclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5SSUdIVF9QQVJFTiwgdmFsdWU6ICcpJywgcG9zaXRpb24gfSk7XHJcbiAgICAgICAgcG9zaXRpb24rKztcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gU3RyaW5nIGxpdGVyYWxzXHJcbiAgICAgIGlmIChjaGFyID09PSAnXCInIHx8IGNoYXIgPT09IFwiJ1wiKSB7XHJcbiAgICAgICAgY29uc3QgcXVvdGUgPSBjaGFyO1xyXG4gICAgICAgIGxldCB2YWx1ZSA9ICcnO1xyXG4gICAgICAgIHBvc2l0aW9uKys7IC8vIFNraXAgb3BlbmluZyBxdW90ZVxyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChwb3NpdGlvbiA8IGV4cHJlc3Npb24ubGVuZ3RoICYmIGV4cHJlc3Npb25bcG9zaXRpb25dICE9PSBxdW90ZSkge1xyXG4gICAgICAgICAgdmFsdWUgKz0gZXhwcmVzc2lvbltwb3NpdGlvbl07XHJcbiAgICAgICAgICBwb3NpdGlvbisrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAocG9zaXRpb24gPj0gZXhwcmVzc2lvbi5sZW5ndGgpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW50ZXJtaW5hdGVkIHN0cmluZyBsaXRlcmFsIHN0YXJ0aW5nIGF0IHBvc2l0aW9uICR7cG9zaXRpb24gLSB2YWx1ZS5sZW5ndGggLSAxfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwb3NpdGlvbisrOyAvLyBTa2lwIGNsb3NpbmcgcXVvdGVcclxuICAgICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5TVFJJTkdfTElURVJBTCwgdmFsdWUsIHBvc2l0aW9uOiBwb3NpdGlvbiAtIHZhbHVlLmxlbmd0aCAtIDIgfSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIElkZW50aWZpZXJzIGFuZCBsaXRlcmFsc1xyXG4gICAgICBpZiAoL1thLXpBLVpfXS8udGVzdChjaGFyKSkge1xyXG4gICAgICAgIGxldCB2YWx1ZSA9ICcnO1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0UG9zID0gcG9zaXRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKHBvc2l0aW9uIDwgZXhwcmVzc2lvbi5sZW5ndGggJiYgL1thLXpBLVowLTlfXS8udGVzdChleHByZXNzaW9uW3Bvc2l0aW9uXSkpIHtcclxuICAgICAgICAgIHZhbHVlICs9IGV4cHJlc3Npb25bcG9zaXRpb25dO1xyXG4gICAgICAgICAgcG9zaXRpb24rKztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBib29sZWFuIGxpdGVyYWxzXHJcbiAgICAgICAgaWYgKHZhbHVlID09PSAndHJ1ZScgfHwgdmFsdWUgPT09ICdmYWxzZScpIHtcclxuICAgICAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogVG9rZW5UeXBlLkJPT0xFQU5fTElURVJBTCwgdmFsdWUsIHBvc2l0aW9uOiBzdGFydFBvcyB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuSURFTlRJRklFUiwgdmFsdWUsIHBvc2l0aW9uOiBzdGFydFBvcyB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIE51bWJlciBsaXRlcmFsc1xyXG4gICAgICBpZiAoL1swLTldLy50ZXN0KGNoYXIpKSB7XHJcbiAgICAgICAgbGV0IHZhbHVlID0gJyc7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRQb3MgPSBwb3NpdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAocG9zaXRpb24gPCBleHByZXNzaW9uLmxlbmd0aCAmJiAvWzAtOS5dLy50ZXN0KGV4cHJlc3Npb25bcG9zaXRpb25dKSkge1xyXG4gICAgICAgICAgdmFsdWUgKz0gZXhwcmVzc2lvbltwb3NpdGlvbl07XHJcbiAgICAgICAgICBwb3NpdGlvbisrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuTlVNQkVSX0xJVEVSQUwsIHZhbHVlLCBwb3NpdGlvbjogc3RhcnRQb3MgfSk7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCBjaGFyYWN0ZXIgJyR7Y2hhcn0nIGF0IHBvc2l0aW9uICR7cG9zaXRpb259YCk7XHJcbiAgICB9XHJcblxyXG4gICAgdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuRU9GLCB2YWx1ZTogJycsIHBvc2l0aW9uIH0pO1xyXG4gICAgcmV0dXJuIHRva2VucztcclxuICB9XHJcbn1cclxuXHJcbmNsYXNzIEV4cHJlc3Npb25QYXJzZXIge1xyXG4gIHByaXZhdGUgdG9rZW5zOiBUb2tlbltdO1xyXG4gIHByaXZhdGUgY3VycmVudDogbnVtYmVyID0gMDtcclxuXHJcbiAgY29uc3RydWN0b3IodG9rZW5zOiBUb2tlbltdKSB7XHJcbiAgICB0aGlzLnRva2VucyA9IHRva2VucztcclxuICB9XHJcblxyXG4gIHBhcnNlKCk6IEFTVE5vZGUge1xyXG4gICAgcmV0dXJuIHRoaXMucGFyc2VPckV4cHJlc3Npb24oKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcGFyc2VPckV4cHJlc3Npb24oKTogQVNUTm9kZSB7XHJcbiAgICBsZXQgbGVmdCA9IHRoaXMucGFyc2VBbmRFeHByZXNzaW9uKCk7XHJcblxyXG4gICAgd2hpbGUgKHRoaXMubWF0Y2goVG9rZW5UeXBlLk9SKSkge1xyXG4gICAgICBjb25zdCBvcGVyYXRvciA9ICd8fCcgYXMgY29uc3Q7XHJcbiAgICAgIGNvbnN0IHJpZ2h0ID0gdGhpcy5wYXJzZUFuZEV4cHJlc3Npb24oKTtcclxuICAgICAgbGVmdCA9IHtcclxuICAgICAgICB0eXBlOiAnQmluYXJ5RXhwcmVzc2lvbicsXHJcbiAgICAgICAgb3BlcmF0b3IsXHJcbiAgICAgICAgbGVmdCxcclxuICAgICAgICByaWdodFxyXG4gICAgICB9IGFzIEJpbmFyeUV4cHJlc3Npb247XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGxlZnQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHBhcnNlQW5kRXhwcmVzc2lvbigpOiBBU1ROb2RlIHtcclxuICAgIGxldCBsZWZ0ID0gdGhpcy5wYXJzZUNvbXBhcmlzb25FeHByZXNzaW9uKCk7XHJcblxyXG4gICAgd2hpbGUgKHRoaXMubWF0Y2goVG9rZW5UeXBlLkFORCkpIHtcclxuICAgICAgY29uc3Qgb3BlcmF0b3IgPSAnJiYnIGFzIGNvbnN0O1xyXG4gICAgICBjb25zdCByaWdodCA9IHRoaXMucGFyc2VDb21wYXJpc29uRXhwcmVzc2lvbigpO1xyXG4gICAgICBsZWZ0ID0ge1xyXG4gICAgICAgIHR5cGU6ICdCaW5hcnlFeHByZXNzaW9uJyxcclxuICAgICAgICBvcGVyYXRvcixcclxuICAgICAgICBsZWZ0LFxyXG4gICAgICAgIHJpZ2h0XHJcbiAgICAgIH0gYXMgQmluYXJ5RXhwcmVzc2lvbjtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGVmdDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcGFyc2VDb21wYXJpc29uRXhwcmVzc2lvbigpOiBBU1ROb2RlIHtcclxuICAgIGxldCBsZWZ0ID0gdGhpcy5wYXJzZVByaW1hcnlFeHByZXNzaW9uKCk7XHJcblxyXG4gICAgaWYgKHRoaXMubWF0Y2goVG9rZW5UeXBlLkVRVUFMUywgVG9rZW5UeXBlLk5PVF9FUVVBTFMpKSB7XHJcbiAgICAgIGNvbnN0IG9wZXJhdG9yID0gdGhpcy5wcmV2aW91cygpLnZhbHVlIGFzICc9PScgfCAnIT0nO1xyXG4gICAgICBjb25zdCByaWdodCA9IHRoaXMucGFyc2VQcmltYXJ5RXhwcmVzc2lvbigpO1xyXG4gICAgICBcclxuICAgICAgLy8gRW5zdXJlIGxlZnQgc2lkZSBpcyBhbiBpZGVudGlmaWVyIGZvciBjb21wYXJpc29uXHJcbiAgICAgIGlmIChsZWZ0LnR5cGUgIT09ICdJZGVudGlmaWVyJykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTGVmdCBzaWRlIG9mIGNvbXBhcmlzb24gbXVzdCBiZSBhbiBpZGVudGlmaWVyJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIEVuc3VyZSByaWdodCBzaWRlIGlzIGEgbGl0ZXJhbCBmb3IgY29tcGFyaXNvblxyXG4gICAgICBpZiAocmlnaHQudHlwZSAhPT0gJ0xpdGVyYWwnKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSaWdodCBzaWRlIG9mIGNvbXBhcmlzb24gbXVzdCBiZSBhIGxpdGVyYWwgdmFsdWUnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiAnQ29tcGFyaXNvbkV4cHJlc3Npb24nLFxyXG4gICAgICAgIG9wZXJhdG9yLFxyXG4gICAgICAgIGxlZnQ6IGxlZnQgYXMgSWRlbnRpZmllcixcclxuICAgICAgICByaWdodDogcmlnaHQgYXMgTGl0ZXJhbFxyXG4gICAgICB9IGFzIENvbXBhcmlzb25FeHByZXNzaW9uO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBsZWZ0O1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwYXJzZVByaW1hcnlFeHByZXNzaW9uKCk6IEFTVE5vZGUge1xyXG4gICAgaWYgKHRoaXMubWF0Y2goVG9rZW5UeXBlLkxFRlRfUEFSRU4pKSB7XHJcbiAgICAgIGNvbnN0IGV4cHIgPSB0aGlzLnBhcnNlT3JFeHByZXNzaW9uKCk7XHJcbiAgICAgIHRoaXMuY29uc3VtZShUb2tlblR5cGUuUklHSFRfUEFSRU4sIFwiRXhwZWN0ZWQgJyknIGFmdGVyIGV4cHJlc3Npb25cIik7XHJcbiAgICAgIHJldHVybiBleHByO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLm1hdGNoKFRva2VuVHlwZS5JREVOVElGSUVSKSkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6ICdJZGVudGlmaWVyJyxcclxuICAgICAgICBuYW1lOiB0aGlzLnByZXZpb3VzKCkudmFsdWVcclxuICAgICAgfSBhcyBJZGVudGlmaWVyO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLm1hdGNoKFRva2VuVHlwZS5TVFJJTkdfTElURVJBTCkpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiAnTGl0ZXJhbCcsXHJcbiAgICAgICAgdmFsdWU6IHRoaXMucHJldmlvdXMoKS52YWx1ZSxcclxuICAgICAgICByYXc6IGBcIiR7dGhpcy5wcmV2aW91cygpLnZhbHVlfVwiYFxyXG4gICAgICB9IGFzIExpdGVyYWw7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMubWF0Y2goVG9rZW5UeXBlLkJPT0xFQU5fTElURVJBTCkpIHtcclxuICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLnByZXZpb3VzKCkudmFsdWUgPT09ICd0cnVlJztcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiAnTGl0ZXJhbCcsXHJcbiAgICAgICAgdmFsdWUsXHJcbiAgICAgICAgcmF3OiB0aGlzLnByZXZpb3VzKCkudmFsdWVcclxuICAgICAgfSBhcyBMaXRlcmFsO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLm1hdGNoKFRva2VuVHlwZS5OVU1CRVJfTElURVJBTCkpIHtcclxuICAgICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KHRoaXMucHJldmlvdXMoKS52YWx1ZSk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogJ0xpdGVyYWwnLFxyXG4gICAgICAgIHZhbHVlLFxyXG4gICAgICAgIHJhdzogdGhpcy5wcmV2aW91cygpLnZhbHVlXHJcbiAgICAgIH0gYXMgTGl0ZXJhbDtcclxuICAgIH1cclxuXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgdG9rZW46ICR7dGhpcy5wZWVrKCkudmFsdWV9IGF0IHBvc2l0aW9uICR7dGhpcy5wZWVrKCkucG9zaXRpb259YCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG1hdGNoKC4uLnR5cGVzOiBUb2tlblR5cGVbXSk6IGJvb2xlYW4ge1xyXG4gICAgZm9yIChjb25zdCB0eXBlIG9mIHR5cGVzKSB7XHJcbiAgICAgIGlmICh0aGlzLmNoZWNrKHR5cGUpKSB7XHJcbiAgICAgICAgdGhpcy5hZHZhbmNlKCk7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2hlY2sodHlwZTogVG9rZW5UeXBlKTogYm9vbGVhbiB7XHJcbiAgICBpZiAodGhpcy5pc0F0RW5kKCkpIHJldHVybiBmYWxzZTtcclxuICAgIHJldHVybiB0aGlzLnBlZWsoKS50eXBlID09PSB0eXBlO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZHZhbmNlKCk6IFRva2VuIHtcclxuICAgIGlmICghdGhpcy5pc0F0RW5kKCkpIHRoaXMuY3VycmVudCsrO1xyXG4gICAgcmV0dXJuIHRoaXMucHJldmlvdXMoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaXNBdEVuZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnBlZWsoKS50eXBlID09PSBUb2tlblR5cGUuRU9GO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwZWVrKCk6IFRva2VuIHtcclxuICAgIHJldHVybiB0aGlzLnRva2Vuc1t0aGlzLmN1cnJlbnRdO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwcmV2aW91cygpOiBUb2tlbiB7XHJcbiAgICByZXR1cm4gdGhpcy50b2tlbnNbdGhpcy5jdXJyZW50IC0gMV07XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNvbnN1bWUodHlwZTogVG9rZW5UeXBlLCBtZXNzYWdlOiBzdHJpbmcpOiBUb2tlbiB7XHJcbiAgICBpZiAodGhpcy5jaGVjayh0eXBlKSkgcmV0dXJuIHRoaXMuYWR2YW5jZSgpO1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGAke21lc3NhZ2V9LiBHb3QgJHt0aGlzLnBlZWsoKS50eXBlfSBhdCBwb3NpdGlvbiAke3RoaXMucGVlaygpLnBvc2l0aW9ufWApO1xyXG4gIH1cclxufSJdfQ==