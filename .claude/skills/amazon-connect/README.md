# Amazon Connect Expert Skill

This skill provides expert guidance on Amazon Connect configuration, implementation, and integration for the IHM (Interface Homme-Machine) application.

## Overview

The Amazon Connect Expert skill assists with:
- **Call routing logic** - Designing and implementing contact flows that route calls based on schedules, skills, and business rules
- **IHM integration** - Understanding how calendar and DNIS configurations affect Amazon Connect behavior
- **Flow development** - Creating, modifying, and debugging contact flow JSON files
- **API integration** - Using Amazon Connect APIs (e.g., `listPrompts`) to fetch voice guides dynamically, replacing static DynamoDB lists.
- **Agent experience** - Building custom agent workspace extensions
- **Security** - Implementing least-privilege access and secure credential management

## When to Use This Skill

Use the Amazon Connect Expert skill when you need help with:
- Designing contact flows for complex routing scenarios
- Understanding how the IHM application integrates with Amazon Connect
- Developing Lambda functions for Connect integration
- Configuring agent workspaces
- Troubleshooting routing or contact flow issues
- Implementing security best practices
- Scaling contact center operations

## Project Context

This IHM application parameterizes Amazon Connect for enterprise contact centers:

### Key Components
- **Calendars** (`Core_Ddb_Calendriers`): Define business hours, holidays, and schedule-based routing
- **DNIS** (`Core_Ddb_CollecteParametrage`): Configure phone numbers and inbound routing rules
- **Contact Flows**: Stored as JSON in `aws_sources/Flows/` for managing call routing logic
- **Lambda Functions**: Custom business logic in `aws_sources/Lambdas/Connect/`

### Target Users
Business coordinators, contact center managers, and operational planners who need to manage routing logic without programming knowledge.

## Available Roles

### 1. Administrator
For contact center setup, resource management, routing policies, and operational configuration.

**Focus Areas**:
- Queue configuration and staffing
- Routing rules and skill-based routing
- Holiday calendars and business hours
- Security and access control
- Contact flow publishing and management

**Reference**: [Amazon Connect Administrator Guide](https://docs.aws.amazon.com/connect/latest/adminguide/what-is-amazon-connect.html)

### 2. API Connect
For programmatic integration, custom automation, and system-to-system connectivity.

**Focus Areas**:
- Creating/updating contact flows via API
- Lambda function integration
- Real-time contact search and reporting
- Custom application integration
- Webhook and notification setup

**Reference**: [Amazon Connect API Reference](https://docs.aws.amazon.com/connect/latest/APIReference/Welcome.html)

### 3. Agent Workspace Developer
For custom agent interface extensions and enhanced agent experience.

**Focus Areas**:
- Custom extensions for agent workspace
- Widget development
- Workspace integrations
- Agent productivity features

**Reference**: [Agent Workspace Developer Guide](https://docs.aws.amazon.com/agentworkspace/latest/devguide/what-is-service.html)

## Contact Flow JSON Structure

Amazon Connect contact flows are JSON files with this general structure:

```json
{
  "Version": "2019-10-30",
  "StartAction": "XXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXXX",
  "Metadata": {
    "entryPointPosition": { "x": 40, "y": 40 },
    "snapToGrid": false,
    "canvas": { "zoom": 1 }
  },
  "Actions": [
    {
      "Identifier": "XXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXXX",
      "Parameters": { ... },
      "Transitions": { ... },
      "Type": "..."
    }
  ],
  "Name": "Flow Name",
  "Description": "Flow description",
  "Type": "CONTACT_FLOW",
  "Status": "PUBLISHED"
}
```

## Common Integration Patterns

### Schedule-Based Routing
Use calendar data from DynamoDB to route contacts:
- Check if contact center is open using `Cal_Vocal_*` calendars
- Route to overflow queues if closed
- Apply skill-based routing during business hours

### DNIS-Based Distribution
Use DNIS configuration to control inbound routing:
- Map phone numbers to specific queues
- Apply brand or line-of-business specific handling
- Implement priority routing

### Dynamic Attributes
Store customer data in DynamoDB for flow decisions:
- Customer tier (VIP, standard)
- Previous contact history
- Segment or targeting information
- Skill requirements

## Asking for Help

When requesting Amazon Connect assistance, provide:

1. **Business goal**: What outcome are you trying to achieve?
2. **Current state**: What's the existing setup?
3. **Constraints**: Security, compliance, or technical constraints?
4. **Scale**: Contact volume, agent count, queue complexity?
5. **Relevant files**: Link to flows in `aws_sources/Flows/` or modules in `aws_sources/Lambdas/Connect/`

## Security Principles

All Amazon Connect implementations must follow:

1. **No hardcoded credentials** - Use AWS IAM roles and temporary credentials
2. **Least privilege access** - Grant minimum required permissions
3. **Encryption in transit** - Use TLS for all API calls
4. **Data protection** - Encrypt customer data at rest and in transit
5. **Audit logging** - Enable CloudTrail and Contact Lens for compliance
6. **Secure Lambda functions** - Validate inputs, handle errors gracefully

## Resources

- [AWS Amazon Connect Documentation](https://docs.aws.amazon.com/connect/)
- [Contact Flow Language Reference](https://docs.aws.amazon.com/connect/latest/adminguide/contact-flows.html)
- [Amazon Connect Security Best Practices](https://docs.aws.amazon.com/connect/latest/adminguide/security-best-practices.html)
- [AWS Well-Architected Framework - Contact Center](https://docs.aws.amazon.com/wellarchitected/latest/userguide/workload-review.html)

## Examples

### Example: Time-Based Routing
Route contacts to a backup queue if outside business hours:
1. Check current time against `Cal_Vocal_*` calendar
2. If open, route to main queue
3. If closed, route to voicemail or overflow queue

### Example: Skill-Based Routing
Route contacts to agents with specific skills:
1. Extract skill requirement from customer input or attributes
2. Check queue statistics for agent availability
3. Route to queue configured for that skill
4. Use fallback queue if skill unavailable

### Example: Lambda-Enhanced Flow
Use Lambda for complex logic:
1. Call Lambda function with customer data
2. Lambda queries DynamoDB for routing rules
3. Return routing decision to flow
4. Apply decision in subsequent flow blocks

---

**Last Updated**: 2026-02-16
**AWS Documentation**: Always consult official AWS documentation for current features and best practices.
