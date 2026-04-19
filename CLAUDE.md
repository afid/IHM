# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based IHM (Interface Homme-Machine) for managing Amazon Connect configurations. It allows business users to manage calendars (schedules, holidays, business hours) and DNIS (phone numbers) that control call routing and voice prompts in Amazon Connect flows. The application is built with vanilla HTML, CSS, and JavaScript, with no build system or framework dependencies.

**Target Users**: Non-technical business coordinators, contact center managers, and operational planners who need to manage Amazon Connect configurations without programming knowledge.

## Architecture

### Core Design Pattern: Layout Injection

The application uses a shared layout pattern where `layout.js` dynamically injects common UI elements (header, sidebar, help modal) into placeholder `<div>` elements on each page:

```html
<div id="layout-header"></div>  <!-- Injected by layout.js -->
<div id="layout-sidebar"></div> <!-- Injected by layout.js -->
```

This centralizes the navigation structure and ensures consistency across all pages without requiring a build step or framework.

### Authentication & Security

- **Authentication Flow**: Users authenticate via AWS credentials (Access Key, Secret Key, optional Session Token) on `login.html`
- **Session Management**: Credentials stored in `sessionStorage`, validated on each page load via `auth-guard.js`
- **AWS Integration**: Uses AWS SDK for JavaScript (browser version) loaded via CDN
- **Session Validation**: `auth-guard.js` uses AWS STS `getCallerIdentity()` to verify credential validity
- **Error Handling**: Centralized in `aws-config.js` via `handleAWSError()` function that redirects to login on auth failures

### Module System

The application is organized into modules identified by `data-module` attribute on the `<body>` tag:

- **vocal**: `Cal_Vocal_*` calendars (default)
- **distribution**: `Cal_Distrib_*` calendars
- **cible**: `Cal_Cible_*` calendars

Each module filters DynamoDB data by prefix and operates independently.

### DynamoDB Tables

- **Core_Ddb_Calendriers**: Main calendar data (schedules, holidays, periods) => Partition key: id_Calendar (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_Calendriers"
- **Core_Ddb_CiblageParametrageParcours**: Parametrage des Parcours => Partition key: Parcours (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_CiblageParametrageParcours"
- **Core_Ddb_CiblageParametrageSegments** Paramétrage des Segments => Partition key: Segment (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_CiblageParametrageSegments"
- **Core_Ddb_CollecteParametrage**: DNIS configuration and parameters => Partition key: Dnis (String), Sort key: Marque (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_CollecteParametrage"
- **Core_Ddb_IHM**: Module metadata, configuration options, and guide groupings (Type='GroupeGuides') => Partition key: id (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_IHM"
- **Core_Ddb_ParametrageCentralise**: Centralized configuration of the application => Partition key: Structure (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_ParametrageCentralise"
- **Core_Ddb_ReglesMoteur01**: Régles de distribution des appels => Partition key: id (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_ReglesMoteur01"
- **Core_Ddb_EnchainementParametrageActions**: Actions disponibles pour les parcours => Partition key: Action (String), les données de la table sont sous "aws_sources\DynamoDB\Core_Ddb_EnchainementParametrageActions"

## Les Lambda AWS pour Amazon Connect
Toute les Lambdas utilisés dans Amazon Connect se trouves dans le dossier "aws_sources\Lambdas\Connect".

## Key JavaScript Files

- **auth-guard.js**: Must load first on every page; redirects unauthenticated users to login
- **aws-config.js**: Configures AWS SDK from sessionStorage; provides `handleAWSError()` for centralized error handling
- **layout.js**: Injects common header, sidebar, and help modal; manages active nav state
- **utils.js**: Shared utility functions (toasts via `window.showToast`, helpers)
- **dynamodb-service.js**: Centralized wrapper for DynamoDB operations (scan, get, put, delete) with error handling and logging; exposed as `window.dynamoDBService`
- **connect-service.js**: Service dedicated to Amazon Connect API calls (e.g., listing prompts); exposed as `window.connectService`
- **calendars-data.js**: Fetches calendar lists and details from DynamoDB; exposes `populateCalendarSelect()`
- **calendar-editor.js**: Complex calendar editing UI with validation for time ranges and exceptions (Periods removed)
- **dnis-manager.js**: CRUD operations for DNIS parameters with dropdown-based interface and drag-and-drop module ordering
- **parcours-manager.js**: Management of call paths (parcours) including multi-step sequences, guide groupings, and multi-select Guides MER (guides fetched via Amazon Connect API)
- **segments-manager.js**: Management of distribution segments including Pre/Post Ciblage modules
- **structure-manager.js**: Centralized configuration of structures with cascaded filtering (Marque > Domaine > Sous-Domaine)
- **guides-manager.js**: CRUD operations for guide groupings (Dissuasion, Attente, MER) with multi-select MER support (individual guides fetched via Amazon Connect API)
- **ihm-manager.js**: Management of IHM module configuration and parameters
- **script.js**: General UI interactions (mobile menu toggle, logout, help modal, news ticker)
- **login.js**: AWS credential validation and session initialization

## HTML Page Structure

All functional pages follow this pattern:

```html
<!doctype html>
<html lang="en">
<head>
    <link rel="stylesheet" href="css/salesforce-lightning-design-system.min.css">
    <link rel="stylesheet" href="css/style.css">
    <script src="js/auth-guard.js"></script> <!-- Must load first -->
</head>
<body class="slds-scope" data-module="vocal"> <!-- data-module defines calendar prefix -->
    <div id="layout-header"></div>
    <div class="app-container">
        <div id="layout-sidebar"></div>
        <main class="main-content">
            <!-- Page-specific content - NO inline styles allowed -->
        </main>
    </div>

    <!-- AWS SDK -->
    <script src="https://sdk.amazonaws.com/js/aws-sdk-2.1690.0.min.js"></script>
    <script src="js/aws-config.js"></script>
    <script src="news/news.js"></script>
    <script src="js/layout.js"></script>
    <!-- Page-specific scripts -->
</body>
</html>
```

### Components Directory

Reusable HTML components are stored in `components/`:
- **header.html**: Application header bar
- **sidebar.html**: Navigation sidebar menu
- **help-modal.html**: Contextual help modal

These are loaded by `layout.js` and injected into the `#layout-header` and `#layout-sidebar` placeholders.

### HTML Pages

| Page | JavaScript | DynamoDB Table |
|------|-----------|----------------|
| `calendrier_vocal.html` | `calendar-editor.js` | `Core_Ddb_Calendriers` |
| `calendrier_distribution.html` | `calendar-editor.js` | `Core_Ddb_Calendriers` |
| `calendrier_cible.html` | `calendar-editor.js` | `Core_Ddb_Calendriers` |
| `parametrage_dnis.html` | `dnis-manager.js` | `Core_Ddb_CollecteParametrage` |
| `parametrage_parcours.html` | `parcours-manager.js`, `connect-service.js` | `Core_Ddb_CiblageParametrageParcours` |
| `parametrage_segments.html` | `segments-manager.js` | `Core_Ddb_CiblageParametrageSegments` |
| `parametrage_structures.html` | `structure-manager.js` | `Core_Ddb_ParametrageCentralise` |
| `parametrage_ihm.html` | `ihm-manager.js` | `Core_Ddb_IHM` |
| `gestion_guides.html` | `guides-manager.js`, `connect-service.js` | `Core_Ddb_IHM` (Type='GroupeGuides') |

**IMPORTANT**:
- NO inline `style="..."` attributes allowed in HTML files
- NO `<style>` tags in HTML files
- ALL CSS must be in `css/style.css`
- This ensures clean separation of concerns and easy maintenance

## Development Workflow

### Running the Application

This is a static web application with no build process. To run:

```bash
# Option 1: Python HTTP server (Python 3)
python -m http.server 8000

# Option 2: PHP built-in server
php -S localhost:8000

# Option 3: Node.js http-server (if installed globally)
npx http-server -p 8000
```

Then navigate to `http://localhost:8000/login.html`

### Testing AWS Integration

You need valid AWS credentials with permissions for:
- `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem`, `dynamodb:Scan`, `dynamodb:Query`
- `sts:GetCallerIdentity` (for session validation)

Test credentials on login page with region `eu-central-1` (Europe Paris).

### Modifying Navigation

To add/remove menu items, edit the `COMMON_SIDEBAR` constant in `layout.js`:

```javascript
const COMMON_SIDEBAR = `
    <aside class="sidebar" id="sidebar">
        <nav class="slds-nav-vertical">
            <li class="slds-nav-vertical__item" data-page="yourpage.html">
                <a href="yourpage.html" class="slds-nav-vertical__action font-hp">Your Page</a>
            </li>
        </nav>
    </aside>
`;
```

### Adding a New Calendar Type

1. Create new HTML page (e.g., `calendrier_newtype.html`) based on existing calendar pages (use `calendrier_vocal.html` as template)
2. Set `data-module="newtype"` on `<body>` tag
3. Add prefix mapping in `calendars-data.js` `getModuleConfig()` function
4. Add menu link in `layout.js` `COMMON_SIDEBAR`
5. Ensure DynamoDB table contains items with new prefix (e.g., `Cal_NewType_*`)
6. NO inline CSS - use classes from `css/style.css`

### Adding a New DNIS Parameter Field

Edit `parametrage_dnis.html` and `dnis-manager.js`:
1. Add form field in modal HTML structure (NO inline CSS)
2. If styling is needed, add a CSS class to `css/style.css` first
3. Add field to save/load logic in `saveDNIS()` and `loadDNISDetails()` functions
4. Update DynamoDB attribute structure if needed

### File Naming Conventions
- HTML files: `kebab-case.html` (e.g., `calendrier_vocal.html`, `parametrage_dnis.html`)
- JavaScript files: `kebab-case.js` (e.g., `calendar-editor.js`, `auth-guard.js`)
- CSS file: `style.css` (single centralized file)
- Don't use spaces or camelCase in filenames

### Key Recent Improvements
- **Multi-Select MER**: Guides Mise en Relation now support multiple selections via dynamic add/remove rows, stored as JSON arrays in DynamoDB. Implemented in both `parcours-manager.js` and `guides-manager.js`.
- **Guide Groupings**: New `gestion_guides.html` page for managing reusable guide sets (Dissuasion, Attente, MER).
- **Parcours Management**: New `parametrage_parcours.html` page for managing call paths with multi-step sequences, actions, and guide assignments.
- **Cascaded Filters**: Implemented in `structure-manager.js` for Marque, Domaine, and Sous-Domaine.
- **Segment Modules**: Added Pre/Post Ciblage module management in `segments-manager.js`.
- **IHM Configuration**: New `parametrage_ihm.html` page for managing IHM modules and parameters.
- **Components Directory**: Reusable HTML components (`header.html`, `sidebar.html`, `help-modal.html`) in `components/`.
- **Calendar Types**: Added `Type` field (Vocal/Distribution) to calendar configuration.
- **Consolidated Toasts**: Transitioned from `showNotification` to a centralized `window.showToast` in `utils.js`.
- **DynamoDB Service**: Centralized DynamoDB operations via `dynamodb-service.js` (`window.dynamoDBService`).
- **Inline CSS Cleanup**: All inline `<style>` blocks moved to `css/style.css` for clean separation of concerns.
- **Log Cleanup**: Removed all non-essential `console.log` statements for production readiness.

## Important Rules from .continue/rules/ihm.md

The following guidelines from the existing rules should be followed:

### Code Generation Principles
- **SLDS 2 FIRST**: Utilise toujours Lightning Design System 2 pour les themes et le CSS
  - Reference: https://www.lightningdesignsystem.com/2e1ef8501/p/76969d-get-started
  - Don't add CSS if it's already in SLDS 2 - use SLDS classes first
  - Only add to `css/style.css` when SLDS 2 doesn't cover the need
- **NO Inline Styles**: NEVER use `style="..."` attributes in HTML
  - All CSS goes in `css/style.css`
  - Use CSS classes instead of inline styles
  - This keeps HTML clean and CSS maintainable
- Always generate clear, modular, and maintainable code with consistent indentation
- Comment key sections (AWS connection logic, DynamoDB mapping, complex UI interactions)
- Prefer pure, reusable functions for data manipulation (formatting, validation)
- Avoid unnecessary dependencies and complex solutions when simple approaches suffice

### Security Requirements
- NEVER put AWS credentials directly in client-side code (use sessionStorage or secure backend)
- Always suggest secure architectures (backend API, CORS, Cognito) when discussing credential management
- Validate and sanitize all user inputs before sending to DynamoDB
- Use placeholder values for credentials in code examples

### AWS & DynamoDB Interaction
- Always use AWS SDK for JavaScript (browser version) for DynamoDB operations
- Implement proper error handling with clear, non-technical messages for users
- Handle timeouts, insufficient permissions, and network issues gracefully
- Use centralized error handling via `handleAWSError()` function

### UI/UX Standards
- Use Salesforce Lightning Design System (SLDS) components consistently
- Organize interfaces into logical pages/tabs (calendars, DNIS, configuration)
- Provide clear success/error notifications for all user actions
- Ensure responsive design works on mobile and desktop
- Test accordion menus, modals, and dynamic content on different screen sizes

### Code Organization
- **Separation of Concerns**: Keep HTML structure, CSS styles, and JavaScript logic separated
  - HTML files contain NO `<style>` tags
  - HTML files contain NO `style="..."` attributes
  - All CSS is in `css/style.css` - organized by section with clear comments
- Use consistent naming: `kebab-case` for files/IDs, `camelCase` for JavaScript variables
- Place reusable functions in appropriate shared JS files
- Follow existing file naming patterns (e.g., `calendar-editor.js`, `dnis-manager.js`)
- CSS Classes Naming: Use descriptive names related to their purpose
  - `.page-title` - Main page titles
  - `.page-subtitle` - Page subtitles
  - `.form-label` - Form field labels
  - `.btn-full-width` - Full-width buttons
  - `.color-*` - Color variants (`.color-light-purple`, `.color-orange`, etc.)

### When Making Changes
- Always clarify requirements if DynamoDB table structures or data schemas are unclear
- Ask for table names, item schemas, primary keys, and secondary indexes when needed
- Propose UI structure before generating complete code implementations
- Suggest refactoring opportunities when new features could benefit from reusable components
- Consider backwards compatibility with existing DynamoDB data structures

## Common Patterns

### Loading Data from DynamoDB

```javascript
const dynamodb = new AWS.DynamoDB.DocumentClient();
const params = {
    TableName: 'Core_Ddb_Calendriers',
    Key: { 'id_Calendar': calendarId }
};

try {
    const data = await dynamodb.get(params).promise();
    // Process data.Item
} catch (err) {
    console.error("Error:", err);
    if (typeof handleAWSError === 'function') {
        handleAWSError(err);
    }
}
```

### Saving Data to DynamoDB

```javascript
const params = {
    TableName: 'Core_Ddb_Calendriers',
    Item: {
        id_Calendar: calendarId,
        Nom: calendarName,
        // ... other attributes
    }
};

try {
    await dynamodb.put(params).promise();
    showNotification("Sauvegarde réussie", 'success');
} catch (err) {
    const handled = handleAWSError(err);
    if (!handled) {
        showNotification("Erreur lors de la sauvegarde", 'error');
    }
}
```

### Showing Notifications

```javascript
// From utils.js - use window.showToast for notifications
window.showToast("Message text", 'success'); // or 'error', 'info'
```

## Fonts & Styling

### Custom Fonts
The application uses custom fonts for brand consistency:
- **Khand**: Headings and titles (bold, medium, regular weights)
- **HP Simplified**: Body text and UI elements (use `.font-hp` class)
- **Rajdhani**: News ticker and special emphasis (use `.font-rajdhani` class)

### CSS Architecture
- **Base**: Salesforce Lightning Design System 2 (SLDS) - loaded from CDN
- **Custom Styles**: `css/style.css` contains all project-specific CSS
  - Font face declarations for custom fonts
  - Layout styles (header, sidebar, main content)
  - Calendar cell colors (blue=open, orange=closed, light blue=exception, grey=period)
  - Custom button styles and hover states
  - Mobile responsive breakpoints (320px, 768px)
  - Guide-specific styles (guide-calendrier.html, guide-dnis.html)
  - Module card styles and drag-drop effects
  - Color legend and priority level styles
  - Toast notification styles
  - Error state highlighting
  - Guide badge styles (Dissuasion, Attente, MER)
  - Multi-select MER row styles
  - Parcours-specific styles

### CSS Organization in style.css
```
1. Font declarations (@font-face)
2. Header and global layout
3. Sidebar and navigation
4. Main content area
5. Modal and dialog styles
6. Calendar grid and cells
7. Color and state indicators
8. Tooltips and help elements
9. Toast notifications
10. Form elements
11. Module cards (DNIS)
12. Guide styles (calendrier, DNIS, segments, structures)
13. Guide badge styles (Dissuasion, Attente, MER)
14. Multi-select MER rows
15. Parcours editor styles
16. Utility classes (fonts, colors, spacing)
17. Media queries (responsive design)
```

## Git Workflow

This repository is tracked with git. Recent commits show work on:
- Calendar management features (periods, exceptions, status/actions)
- DNIS configuration module
- Documentation and code comments
- News ticker system updates

When committing, include descriptive messages about functional changes (e.g., "Ajout du module de gestion des DNIS" rather than "Updated files").
