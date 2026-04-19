# CSS Expert Skill

**Expert CSS specialist with 15+ years of experience**

## Overview

This skill adds a dedicated CSS expert agent to your Claude Code workflow. Every CSS request is reviewed and controlled by this expert who ensures:

✅ Latest MDN standards and best practices
✅ Proper SLDS 2 utilization before custom CSS
✅ No inline styles or CSS violations
✅ Browser compatibility and accessibility
✅ Project-specific conventions and quality standards

## How to Use

### 1. For CSS Requests
When you need CSS work, simply ask:
```
/css-expert Add styling for the new calendar module
```

Or ask normally and Claude will invoke the expert automatically:
```
I need to style this form input
```

### 2. For CSS Reviews
Ask the expert to review existing CSS:
```
/css-expert Review the calendar grid styling in css/style.css
```

### 3. For CSS Guidance
Get advice on CSS approaches:
```
/css-expert What's the best modern CSS way to implement sticky headers?
```

## How It Works

When you invoke the CSS expert:

1. **Request Validation** - Expert verifies the request is clear and complete
2. **Technical Analysis** - Reviews current SLDS 2 classes and existing CSS
3. **Decision** - Approves ✅, requests changes ⚠️, or needs clarification 🤔
4. **Implementation** - Generates CSS following strict standards if approved

## What the Expert Checks

- ✓ Is the request clear and specific?
- ✓ Can SLDS 2 handle this without custom CSS?
- ✓ Does it follow project naming conventions?
- ✓ Is mobile-first responsive design applied?
- ✓ Are color contrasts WCAG AA compliant?
- ✓ Does it use modern CSS (no deprecated properties)?
- ✓ Is the approach maintainable and performant?

## Key Rules

🚫 **No inline styles** - Always use classes in `css/style.css`
🚫 **No !important** - Restructure selectors instead
🚫 **SLDS 2 first** - Check classes before adding custom CSS
🚫 **No deprecated CSS** - Use modern techniques from MDN

✅ **Kebab-case** for class names
✅ **Mobile-first** responsive design
✅ **CSS variables** for colors and spacing
✅ **Accessibility** by default (WCAG AA)

## Project-Specific Standards

See `project-standards.md` for:
- Exact CSS organization in `style.css`
- Color scheme and naming conventions
- Font usage (Khand, HP Simplified, Rajdhani)
- SLDS 2 integration
- Responsive design breakpoints
- Quality checklist

## MDN Reference

The expert references:
- [MDN CSS Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference)
- [MDN CSS Best Practices](https://developer.mozilla.org/en-US/docs/Web/CSS)
- Latest CSS specifications and browser support

## Benefits

### For You
- 🛡️ All CSS is reviewed by an expert
- 📚 Automatic application of best practices
- ✨ Consistent code quality
- 🔍 No CSS violations slip through
- 🚀 Modern techniques always used

### For the Project
- 🎯 Unified CSS standards
- 📦 Single maintainable `css/style.css`
- 🌐 Proper SLDS 2 integration
- ♿ Accessibility guaranteed
- 🔧 Performance optimized

## Example Interaction

```
You: I need to add styling for a modal dialog

CSS Expert:
## CSS Expert Review

**Status**: 🤔 Needs Clarification

**Questions**:
1. Should this use the SLDS 2 modal component (`.slds-modal`)?
2. Any special animations or positioning needed?
3. Mobile behavior - full screen or centered?
4. Are we adding to existing modal styles or new variant?

**Next Steps**:
Please answer these questions so I can provide the best implementation.
```

Then after clarification:

```
You: Use SLDS 2 modal base, add custom accent color border, center on desktop, full-screen mobile

CSS Expert:
## CSS Expert Review

**Status**: ✅ Approved

**Solution**:
Add to `css/style.css`:

[CSS code here]

**Rationale**:
- Builds on SLDS 2 base for consistency
- Uses CSS custom properties for the accent color
- Mobile-first breakpoint approach
- Maintains accessibility from SLDS 2 foundation

**Notes**:
- Supports all modern browsers (Chrome, Firefox, Safari, Edge)
- Touch-friendly on mobile (44px+ buttons)
- WCAG AA contrast compliant
```

## When the Expert Refuses

The expert may decline if:

- 🔴 Request lacks clarity
- 🔴 Proposes inline styles or !important
- 🔴 Uses deprecated CSS techniques
- 🔴 Won't follow project standards

But always with **suggestions** for a better approach!

---

**Remember**: This expert ensures your CSS is bulletproof. Trust the review process. When in doubt, ask!
