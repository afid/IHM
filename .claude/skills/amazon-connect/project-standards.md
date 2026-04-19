# Amazon Connect Project Standards

## Project-Specific Standards for IHM Integration

This document outlines standards specific to this IHM application's integration with Amazon Connect.

---

## 1. Contact Flow JSON Structure

### Metadata Standards
All contact flows in `aws_sources/Flows/` must include:
- **Version**: `2019-10-30` or later (always use latest stable version)
- **Name**: Descriptive name following pattern `[Module]_[Purpose]` (e.g., `Vocal_TimeBasedRouting`)
- **Description**: Clear explanation of the flow's purpose and routing logic
- **Type**: `CONTACT_FLOW` or `CONTACT_FLOW_MODULE` as appropriate
- **Status**: `PUBLISHED` for production flows, `SAVED` for draft versions

### Action Block Standards
Each action block must have:
- **Identifier**: UUID v4 for block tracking
- **Type**: Standard Connect block type (e.g., `PlayPrompt`, `SetContactAttribute`, `TransferContactToQueue`)
- **Parameters**: Fully configured with no placeholder values
- **Transitions**: All possible exit paths defined (success, failure, timeout)

### Variable Naming
Use consistent naming for contact attributes:
- Calendar-based attributes: `module_calendar_status` (e.g., `vocal_calendar_status`)
- Routing decisions: `routing_queue_name`, `routing_priority`
- Customer data: `customer_tier`, `customer_segment`
- System: `contact_id`, `contact_start_time`, `contact_end_time`

---

## 2. Integration with IHM Data

### Calendar Integration
Contact flows must respect calendar data from `Core_Ddb_Calendriers`:

**Implementation Pattern**:
```javascript
// Lambda function to check calendar status
const params = {
    TableName: 'Core_Ddb_Calendriers',
    Key: { 'id_Calendar': 'Cal_Vocal_Main' }
};
const calendar = await dynamodb.get(params).promise();

// Determine if center is open based on current time
const isOpen = checkTimeInCalendar(calendar, new Date());
return { 'status': isOpen ? 'OPEN' : 'CLOSED' };
```

### DNIS Configuration
Contact flows must implement DNIS routing from `Core_Ddb_CollecteParametrage`:

**Implementation Pattern**:
- Capture incoming DNIS using `!GetSystemVariables(CallAttributes.ConnectedNumberId)`
- Query DynamoDB for DNIS configuration
- Apply routing rules (queue, skill, priority) based on DNIS settings
- Fall back to default queue if DNIS not found

### Customer Attributes
Store and retrieve customer routing decisions from `Core_Ddb_CiblageParametrageParcours` and `Core_Ddb_CiblageParametrageSegments`:

**Implementation Pattern**:
- Query customer data at flow start
- Set contact attributes for downstream routing decisions
- Reference attributes in flow conditions
- Update attributes after agent interactions (optional)

---

## 3. Lambda Function Standards

### Location and Naming
All Amazon Connect Lambda functions stored in `aws_sources/Lambdas/Connect/`:
- **Naming Pattern**: `[Module]_[Purpose].js` (e.g., `Vocal_CheckSchedule.js`)
- **Comments**: Brief header explaining the function's purpose
- **Error Handling**: All errors logged and handled gracefully

### Input/Output Format
Lambda functions must follow contract for Connect invocation:

**Input**:
```javascript
{
    "Details": {
        "ContactData": {
            "Attributes": { /* contact attributes */ },
            "Channel": "VOICE",
            "ContactId": "contact-id",
            "CustomerEndpoint": { "Address": "+1234567890" },
            "InitialContactId": "initial-contact-id",
            "InitiationMethod": "INBOUND",
            "PreviousContactId": "previous-contact-id",
            "Queue": null,
            "SystemEndpoint": { "Address": "+1987654321" }
        },
        "Parameters": { /* flow parameters */ }
    },
    "UseCaseId": "use-case-id"
}
```

**Output**:
```javascript
{
    "statusCode": 200,
    "returnValue": {
        "routing_queue": "queue-name",
        "routing_priority": 5,
        "contact_attribute": "value"
    }
}
```

### Security Standards
- **No credentials in code** - Use IAM roles and environment variables
- **Input validation** - Validate all contact attributes and parameters
- **Error logging** - Log errors for debugging without exposing sensitive data
- **Timeout handling** - Return fast (< 5 seconds) to avoid flow delays
- **Access control** - Use least-privilege IAM policies

---

## 4. Flow Design Patterns

### Time-Based Routing
```
[Receive Call]
    → [Lambda: Check Calendar Status]
    → [Is Open?]
        → YES → [Route to Main Queue]
        → NO → [Play Closed Message] → [Transfer to Voicemail]
```

### Skill-Based Routing
```
[Receive Call]
    → [Lambda: Determine Required Skill]
    → [Check Queue Stats]
    → [Is Capacity Available?]
        → YES → [Route to Skill Queue]
        → NO → [Route to Overflow Queue] → [Callback]
```

### DNIS-Based Distribution
```
[Receive Call]
    → [Get DNIS: !GetSystemVariables(CallAttributes.ConnectedNumberId)]
    → [Lambda: Lookup DNIS Config]
    → [Apply Routing Rules]
    → [Route to Queue]
```

---

## 5. Error Handling & Fallbacks

### Required Error Paths
All blocks must handle:
1. **Success path** - Primary outcome
2. **Error path** - Block-level errors (e.g., Lambda timeout)
3. **Timeout path** - If applicable (e.g., queue timeout)

### Error Messages
- User-facing: Keep brief and non-technical
- Logging: Include full context (contact ID, timestamp, error code)
- Escalation: Route to appropriate queue on system errors

### Fallback Queues
Define fallback routing for:
- System errors: Route to general queue
- No agents available: Use callback or voicemail
- Invalid configuration: Log and escalate to admin queue

---

## 6. Testing Requirements

### Unit Testing
- Lambda functions must be testable independently
- Provide sample inputs covering success and error cases
- Mock DynamoDB calls in tests

### Integration Testing
- Test flows with sample contact data
- Verify calendar logic with different time zones
- Test DNIS routing with multiple phone numbers
- Validate Lambda timeout handling

### Production Deployment
- Flows must be published with version number in description
- Maintain backup of previous versions
- Document changes in commit messages
- Run smoke tests on new deployments

---

## 7. Monitoring & Logging

### CloudWatch Logging
Log the following events:
- Flow start and completion
- Routing decisions and queue assignments
- Lambda invocation and execution time
- Errors and exceptions with context

### Metrics
Track:
- Calls routed per queue per hour
- Average flow execution time
- Error rates by block type
- Lambda execution time and failures

### Alarms
Set up alerts for:
- High error rates (> 5%)
- Lambda failures
- Queue overflow conditions
- Flow execution timeout

---

## 8. Documentation Standards

### Flow Documentation
Each flow must include:
- **Purpose**: Clear explanation of what the flow does
- **Inputs**: Expected contact attributes at flow start
- **Outputs**: Contact attributes set by the flow
- **Dependencies**: DynamoDB tables, Lambda functions, queues
- **Error Cases**: Documented error paths and fallback behavior

### Lambda Documentation
Each Lambda function must include:
- **Purpose**: What problem does it solve?
- **Input contract**: Expected input format
- **Output contract**: Guaranteed output format
- **Error handling**: What errors can occur and how they're handled
- **Timeout**: Maximum execution time
- **IAM Permissions**: Required AWS permissions

### Configuration Documentation
Document:
- DNIS to queue mappings
- Queue skill requirements
- Calendar module names and purposes
- Integration endpoints

---

## 9. Versioning & Deployment

### Version Format
- **Flows**: Include semantic version in description (e.g., "Vocal Routing v2.1.0")
- **Lambda**: Use git tags or version in function name (e.g., `CheckSchedule_v2`)

### Deployment Checklist
- [ ] Code reviewed and tested
- [ ] Documentation updated
- [ ] Changelog entry created
- [ ] Backup of previous version made
- [ ] All integration points verified
- [ ] Monitoring and alarms configured

### Rollback Plan
- Keep previous version published
- Document quick rollback procedure
- Monitor error rates for 1 hour post-deployment
- Have manual override capability

---

## 10. Security & Compliance

### Data Protection
- Encrypt customer data at rest in DynamoDB
- Use TLS 1.2+ for all API calls
- Don't log sensitive customer data (phone, account numbers)

### Access Control
- Use IAM roles for Lambda execution
- Limit DynamoDB access to specific tables/items
- Enforce MFA for administrative access

### Compliance Logging
- Enable CloudTrail for API calls
- Store logs for required retention period
- Generate audit reports regularly
- Document all access and changes

### PII Handling
- Minimize PII in logs
- Mask sensitive attributes in error messages
- Document PII handling in flow documentation
- Review retention policies regularly

---

## 11. Performance Optimization

### Lambda Optimization
- Keep execution time under 3 seconds
- Use connection pooling for DynamoDB
- Cache static configuration data
- Minimize JSON parsing

### DynamoDB Optimization
- Use partition keys efficiently
- Avoid table scans in flows
- Use on-demand billing for variable loads
- Monitor consumed capacity

### Flow Optimization
- Minimize Lambda invocations per call
- Use contact attributes to avoid repeated lookups
- Keep branching logic simple and readable
- Test performance with realistic call volume

---

**Last Updated**: 2026-02-16
**Standards Version**: 1.0
**Effective Date**: 2026-02-16
