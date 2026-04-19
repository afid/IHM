# CSS Standards for IHM Project

## Project Context

**Framework**: Salesforce Lightning Design System 2 (SLDS 2)
**CSS File**: `css/style.css` (single centralized file)
**HTML**: NO inline `style="..."` attributes allowed
**Architecture**: Vanilla HTML/CSS/JavaScript, no build system

## CSS Organization in style.css

The style.css file is organized in this order:

1. **Font declarations** (@font-face)
   - Khand (headings: bold, medium, regular)
   - HP Simplified (body text, use `.font-hp` class)
   - Rajdhani (special emphasis, use `.font-rajdhani` class)

2. **Header and global layout**
   - Navigation bar styling
   - General typography rules
   - Base element styles

3. **Sidebar and navigation**
   - Vertical nav styling
   - Active state indicators
   - Mobile menu styling

4. **Main content area**
   - Container styles
   - Page layout
   - Content sections

5. **Modal and dialog styles**
   - Modal overlays
   - Dialog boxes
   - Form containers

6. **Calendar grid and cells**
   - Grid layout
   - Cell colors and states
   - Time slot styling

7. **Color and state indicators**
   - Status colors
   - Priority levels
   - State-specific styling

8. **Tooltips and help elements**
   - Tooltip positioning
   - Help text styling
   - Info badges

9. **Toast notifications**
   - Success/error/warning styles
   - Animation effects
   - Positioning

10. **Form elements**
    - Input styling
    - Button styling
    - Field validation states

11. **Module cards (DNIS)**
    - Card layout
    - Drag-drop effects
    - Module ordering

12. **Guide styles**
    - Guide page specific styling
    - Tutorial components

13. **Utility classes**
    - Font utilities
    - Color utilities
    - Spacing utilities

14. **Media queries**
    - Mobile breakpoints: 320px, 768px
    - Responsive adjustments

## Naming Conventions

### CSS Classes
- Use **kebab-case** (lowercase with hyphens)
- Descriptive names related to purpose:
  - `.page-title` - Main page titles
  - `.page-subtitle` - Page subtitles
  - `.form-label` - Form field labels
  - `.btn-full-width` - Full-width buttons
  - `.color-light-purple`, `.color-orange` - Color variants

### JavaScript Variables & Selectors
- Use **camelCase** for JavaScript variables
- IDs use kebab-case (e.g., `id="layout-header"`)

## Color Scheme

### Calendar States
- **Blue**: Open/available time slots
- **Orange**: Closed/blocked time slots
- **Light Blue**: Exception periods
- **Grey**: Period/multi-day events

### Standard Colors
Reference these for consistency:
```
Primary: #0070D2 (SLDS blue)
Success: #04844B
Warning: #FF9500
Error: #C23030
Text: #1F2937
Background: #F3F4F6
```

## SLDS 2 Integration

**Always check SLDS 2 first**: https://www.lightningdesignsystem.com/

Before adding custom CSS:
1. Search SLDS 2 classes for the needed styles
2. Combine existing SLDS classes if possible
3. Only add custom CSS when SLDS 2 doesn't cover the need

Common SLDS classes:
- `.slds-scope` - Container for all SLDS components
- `.slds-nav-vertical` - Vertical navigation
- `.slds-modal` - Modal dialogs
- `.slds-button` - Button styling
- `.slds-form-element` - Form containers
- `.slds-grid` - Grid layouts
- `.slds-text-heading_*` - Text hierarchy

## Responsive Design

### Breakpoints
- **320px**: Small mobile
- **768px**: Tablet and above
- **1024px**: Desktop (implicit minimum)

### Mobile-First Approach
1. Write base styles for mobile
2. Use `@media (min-width: 768px)` for larger screens
3. Test on actual devices when possible

### Example Pattern
```css
.element {
  /* Mobile defaults */
  display: block;
  width: 100%;
  margin: 1rem 0;
}

@media (min-width: 768px) {
  .element {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 2rem 0;
  }
}
```

## Custom Fonts

### Font Declarations
All font-faces are defined in `css/style.css` with fallback stacks.

### Usage
- **Khand**: Use for headings and titles
  - Classes: (apply directly to headings, no specific class)
  - Available weights: bold (700), medium (500), regular (400)

- **HP Simplified**: Use for body text and UI elements
  - Apply class: `.font-hp`
  - Best for main content

- **Rajdhani**: Use for news ticker and special emphasis
  - Apply class: `.font-rajdhani`
  - Good for highlights and badges

## CSS Variables (Custom Properties)

When adding CSS, define reusable variables:

```css
:root {
  --color-primary: #0070D2;
  --color-success: #04844B;
  --color-warning: #FF9500;
  --spacing-unit: 1rem;
  --border-radius: 4px;
  --font-family-heading: 'Khand', sans-serif;
  --font-family-body: 'HP Simplified', sans-serif;
}
```

Use variables instead of hard-coded values where possible.

## Performance Best Practices

1. **Avoid redundant rules** - Don't repeat the same property in multiple selectors
2. **Use efficient selectors** - Prefer classes over complex descendant selectors
3. **Group related properties** - Keep related rules together
4. **Minimize specificity** - Use single class selectors when possible
5. **No !important** - Restructure selectors instead of using !important

## Accessibility Considerations

1. **Color contrast** - Text must pass WCAG AA standards (4.5:1 for normal text)
2. **Focus states** - Always include `:focus` and `:focus-visible` for keyboard navigation
3. **Avoid color-only indicators** - Use patterns, icons, or text alongside color
4. **Readable font sizes** - Minimum 14px for body text
5. **Sufficient spacing** - Touch targets at least 44x44px

## When to Refuse CSS Work

❌ **Inline styles** - Request HTML revision to use classes instead
❌ **!important hacks** - Request code restructuring for proper specificity
❌ **Deprecated properties** - Suggest modern CSS alternatives
❌ **Browser hacks** - Recommend feature detection or graceful degradation
❌ **Overly complex selectors** - Suggest simpler structure or new classes
❌ **Mixing concerns** - CSS-in-JS or style in markup should be refactored

## Common MDN References for This Project

- [CSS Flexible Box Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout)
- [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [CSS Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Text Overflow & Truncation](https://developer.mozilla.org/en-US/docs/Web/CSS/text-overflow)
- [Transform & Transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)
- [Color & Background](https://developer.mozilla.org/en-US/docs/Web/CSS/background-color)

## Quality Checklist

Before approving any CSS changes:

- [ ] No inline styles in HTML
- [ ] All CSS in `css/style.css`
- [ ] SLDS 2 classes used first
- [ ] Follows naming conventions (kebab-case)
- [ ] Mobile-first responsive design
- [ ] Sufficient color contrast (WCAG AA)
- [ ] Focus states included
- [ ] No !important used
- [ ] No deprecated CSS properties
- [ ] Browser support verified
- [ ] Performance optimized
- [ ] Comments added for complex sections
