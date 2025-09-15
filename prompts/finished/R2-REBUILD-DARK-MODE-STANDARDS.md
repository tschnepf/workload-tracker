# R2-REBUILD-DARK-MODE-STANDARDS: UI Consistency Requirements

## 🎨 Dark Mode Design System Enforcement

**CRITICAL: Every chunk must pass UI consistency review before proceeding to next chunk**

## 📦 Package Management Standards

### **Version Management Rules**
```json
// ✅ ALWAYS: Pin exact versions (no caret/tilde ranges)
{
  "dependencies": {
    "react": "18.3.1",           // ✅ Exact version
    "react-router-dom": "6.28.0" // ✅ Exact version
  }
}

// ❌ NEVER: Use version ranges that can drift
{
  "dependencies": {
    "react": "^18.2.0",          // ❌ Caret allows 18.x.x updates
    "react-router-dom": "~6.20.1" // ❌ Tilde allows patch updates
  }
}
```

### **Package Selection Criteria**
1. **Use Latest Stable Versions**: Always use the most recent stable release
2. **Security First**: Check for known vulnerabilities before adding packages
3. **Remove Dead Dependencies**: Regularly audit and remove unused packages
4. **Consistent Ecosystems**: Prefer packages that work well together
5. **TypeScript Support**: All packages must have proper TypeScript support

### **Forbidden Practices**
- ❌ Never use `npm install` without specifying exact versions
- ❌ Never commit `package-lock.json` with version ranges
- ❌ Never ignore deprecation warnings - update immediately
- ❌ Never install packages just for "convenience" without justification

### **Version Update Process**
1. **Check Latest**: Use `npm view <package> version` to get latest
2. **Review Changes**: Read changelog for breaking changes
3. **Update Gradually**: Update dependencies in small batches
4. **Test Thoroughly**: Ensure all functionality works after updates
5. **Pin Immediately**: Lock to exact version after testing

### **Example: Correct Package.json**
```json
{
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1", 
    "react-router-dom": "6.28.0"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vite": "5.4.8",
    "tailwindcss": "3.4.13"
  }
}
```

### **Console Warnings Policy**
- ❌ **Zero tolerance** for console warnings in development
- ✅ Address all deprecation warnings immediately
- ✅ Add future flags when available (e.g., React Router v7 flags)
- ✅ Suppress warnings only when using proper future flags

### **React Router Future Flags Example**
```typescript
// ✅ Always include future flags to prevent warnings
<BrowserRouter future={{
  v7_relativeSplatPath: true,
  v7_startTransition: true
}}>
```

## 🚨 Error Prevention Protocol

### **Before Making Any Changes**
1. ✅ **Document current working state** (run test commands)
2. ✅ **Commit working changes** before experiments  
3. ✅ **Test in small increments** - never batch multiple changes
4. ✅ **Have rollback plan** ready

### **After Any Code Changes**  
1. ✅ **Check browser console immediately**
2. ✅ **Test affected functionality** 
3. ✅ **Verify API responses** with curl
4. ✅ **Check Docker container logs**

### **Config Change Protocol**
```bash
# ✅ ALWAYS follow this sequence for config changes
git add . && git commit -m "Working state before config change"
# Make your config change
docker-compose build [service]
docker-compose restart [service]  
# Test immediately - rollback if issues
```

### **Import/Path Issues - Quick Fix**
```bash
# When you see "Failed to resolve import @/..."
docker-compose build frontend
docker-compose restart frontend
curl -s http://localhost:3000/ | grep "<title>"
```

### **API Response Issues - Quick Fix**  
```typescript
// When you see "Unexpected end of JSON input"
// Check if endpoint returns empty response (DELETE, etc.)
const text = await response.text();
if (!text) return undefined;
return JSON.parse(text);
```

## 🌙 Dark Mode Color System

### **Background Hierarchy (Never hardcode)**
```typescript
// Use these exact values - no variations allowed
const backgrounds = {
  primary: '#0f172a',    // slate-900 - Main app background
  secondary: '#1e293b',  // slate-800 - Cards, panels, modals
  tertiary: '#334155',   // slate-700 - Table headers, elevated elements
  elevated: '#475569',   // slate-600 - Hover states, active elements
}

// Usage in components
<div className="bg-slate-900">        {/* App background */}
<div className="bg-slate-800">        {/* Card backgrounds */}
<div className="bg-slate-700">        {/* Table headers */}
<div className="hover:bg-slate-600">  {/* Hover states */}
```

### **Text Hierarchy (Consistent contrast)**
```typescript
const textColors = {
  primary: '#f8fafc',    // slate-50 - Headings, primary content
  secondary: '#cbd5e1',  // slate-300 - Body text, descriptions
  muted: '#94a3b8',      // slate-400 - Placeholders, less important text
  inverse: '#1e293b',    // slate-800 - Text on light backgrounds
}

// Usage
<h1 className="text-slate-50">        {/* Primary headings */}
<p className="text-slate-300">         {/* Body text */}
<span className="text-slate-400">      {/* Muted text */}
```

### **Semantic Colors (Status indication)**
```typescript
const semanticColors = {
  success: '#10b981',    // emerald-500 - Success states, available capacity
  warning: '#f59e0b',    // amber-500 - Warning states, high utilization
  error: '#ef4444',      // red-500 - Error states, overallocation
  info: '#06b6d4',       // cyan-500 - Info states, neutral information
  primary: '#3b82f6',    // blue-500 - Primary actions, optimal utilization
}

// Usage in utilization badges
<span className="text-emerald-400 bg-emerald-500/20">  {/* Available */}
<span className="text-blue-400 bg-blue-500/20">       {/* Optimal */}
<span className="text-amber-400 bg-amber-500/20">     {/* High */}
<span className="text-red-400 bg-red-500/20">         {/* Overallocated */}
```

### **Border System (Subtle depth)**
```typescript
const borders = {
  primary: '#475569',    // slate-600 - Main borders, form inputs
  secondary: '#64748b',  // slate-500 - Subtle dividers
  focus: '#3b82f6',      // blue-500 - Focus rings, active states
}

// Usage
<div className="border-slate-600">         {/* Standard borders */}
<div className="divide-y divide-slate-600"> {/* List dividers */}
<input className="focus:border-blue-500">   {/* Focus states */}
```

## 📐 Component Standards

### **Button Consistency**
```typescript
// REQUIRED button variants - no custom buttons allowed
const buttonVariants = {
  primary: 'bg-blue-500 hover:bg-blue-400 text-white shadow-sm',
  secondary: 'bg-slate-600 hover:bg-slate-500 text-slate-50 shadow-sm',
  danger: 'bg-red-500 hover:bg-red-400 text-white shadow-sm',
  ghost: 'bg-transparent hover:bg-slate-700 text-slate-300 border border-slate-600'
}

// REQUIRED sizes
const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
}

// Usage - ALWAYS use these combinations
<Button variant="primary" size="md">Save</Button>
<Button variant="danger" size="sm">Delete</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

### **Form Input Consistency**
```typescript
// REQUIRED input styling - all forms must use this
const inputStyles = `
  bg-slate-700 border-slate-600 text-slate-50 
  placeholder-slate-400 focus:border-blue-500 
  focus:ring-blue-500/20 rounded-md
`

// Usage
<Input 
  className={inputStyles}
  label="Name" 
  name="name" 
  required 
/>

// Error states
<Input 
  className="bg-slate-700 border-red-500 text-slate-50 focus:border-red-500"
  error="Name is required"
/>
```

### **Card Consistency**
```typescript
// REQUIRED card styling - all cards must match
const cardStyles = `
  bg-slate-800 border border-slate-700 
  rounded-lg shadow-lg shadow-black/5
  p-6
`

// Usage
<Card className={cardStyles}>
  <h3 className="text-lg font-semibold text-slate-50 mb-4">Title</h3>
  <div className="text-slate-300">Content</div>
</Card>
```

### **Table Consistency**
```typescript
// REQUIRED table styling - all tables must match
const tableStyles = {
  container: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden',
  header: 'bg-slate-700 border-b border-slate-600',
  headerCell: 'px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider',
  row: 'hover:bg-slate-700/50 transition-colors',
  cell: 'px-6 py-4 whitespace-nowrap text-slate-50',
  cellSecondary: 'px-6 py-4 whitespace-nowrap text-slate-300'
}

// Usage
<div className={tableStyles.container}>
  <table className="w-full">
    <thead className={tableStyles.header}>
      <tr>
        <th className={tableStyles.headerCell}>Name</th>
        <th className={tableStyles.headerCell}>Capacity</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-600">
      <tr className={tableStyles.row}>
        <td className={tableStyles.cell}>John Doe</td>
        <td className={tableStyles.cellSecondary}>40h</td>
      </tr>
    </tbody>
  </table>
</div>
```

### **Navigation Consistency**
```typescript
// REQUIRED navigation styling
const navStyles = {
  container: 'bg-slate-900 border-b border-slate-700 shadow-sm',
  inner: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  logo: 'text-xl font-bold text-slate-50',
  links: 'flex space-x-8',
  link: 'text-slate-300 hover:text-slate-50 px-3 py-2 text-sm font-medium transition-colors',
  activeLink: 'text-blue-400 hover:text-blue-300 px-3 py-2 text-sm font-medium'
}

// Usage - maintain this exact structure
<nav className={navStyles.container}>
  <div className={navStyles.inner}>
    <div className="flex justify-between items-center h-16">
      <div className={navStyles.logo}>Workload Tracker</div>
      <div className={navStyles.links}>
        <Link to="/dashboard" className={navStyles.activeLink}>Dashboard</Link>
        <Link to="/people" className={navStyles.link}>People</Link>
        <Link to="/projects" className={navStyles.link}>Projects</Link>
      </div>
    </div>
  </div>
</nav>
```

## 🚦 UI Consistency Checklist (Every Chunk)

### **Pre-Development Checklist:**
```bash
Before starting any chunk:
✅ Review existing components from previous chunks
✅ Identify which components can be reused
✅ Plan new components to extend (not replace) existing ones
✅ Verify color usage follows semantic scheme
```

### **During Development Checklist:**
```bash
While building features:
✅ All colors use theme tokens (no hardcoded hex values)
✅ All spacing uses Tailwind spacing scale (no arbitrary values)
✅ New components extend existing component patterns
✅ Forms follow established input/button/validation patterns
✅ Loading states use consistent spinner styling
✅ Error states use semantic error colors and messaging
```

### **Post-Development Checklist:**
```bash
Before marking chunk complete:
✅ All components render consistently across different screen sizes
✅ Interactive elements have proper hover/focus states
✅ Color contrast meets WCAG AA standards for dark themes
✅ No visual inconsistencies when navigating between pages
✅ All text follows typography hierarchy (slate-50 > slate-300 > slate-400)
✅ All backgrounds follow depth hierarchy (slate-900 > slate-800 > slate-700)
```

## 🎯 Utilization Color Standards

### **Utilization Badge System (Use everywhere)**
```typescript
// REQUIRED: Use this exact color scheme for all utilization displays
const getUtilizationColor = (percentage: number) => {
  if (percentage < 70) return {
    text: 'text-emerald-400',
    background: 'bg-emerald-500/20',
    border: 'border-emerald-500/30',
    label: 'Available'
  }
  
  if (percentage <= 85) return {
    text: 'text-blue-400', 
    background: 'bg-blue-500/20',
    border: 'border-blue-500/30',
    label: 'Optimal'
  }
  
  if (percentage <= 100) return {
    text: 'text-amber-400',
    background: 'bg-amber-500/20', 
    border: 'border-amber-500/30',
    label: 'High'
  }
  
  return {
    text: 'text-red-400',
    background: 'bg-red-500/20',
    border: 'border-red-500/30', 
    label: 'Overallocated'
  }
}

// Usage - consistent across all chunks
const UtilizationBadge = ({ percentage }: { percentage: number }) => {
  const colors = getUtilizationColor(percentage)
  
  return (
    <span className={`
      inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
      ${colors.text} ${colors.background} ${colors.border} border
    `}>
      {percentage}% {colors.label}
    </span>
  )
}
```

## ⚠️ Forbidden Patterns

### **Never Do This:**
```typescript
// ❌ Hardcoded colors
<div className="bg-gray-800">              // Use bg-slate-800
<span className="text-green-400">          // Use text-emerald-400  
<div style={{backgroundColor: '#1e293b'}}> // Use className

// ❌ Inconsistent spacing
<div className="p-3">                      // Use p-4 (theme.spacing.md)
<div className="mt-5">                     // Use mt-6 (theme.spacing.lg)

// ❌ Custom component variants
<Button className="bg-purple-500">         // Use variant="primary|secondary|danger|ghost"
<input className="border-green-400">       // Use established input styles

// ❌ Mixing light/dark styles  
<div className="bg-white text-black">      // Always use dark mode colors

// ❌ Different table styles
<table className="border-gray-200">        // Use established table styles

// ❌ Custom navigation
<nav className="bg-blue-900">              // Use established nav styles
```

### **Always Do This:**
```typescript
// ✅ Use theme tokens
<div className="bg-slate-800">
<span className="text-emerald-400">
<div className={theme.backgrounds.secondary}>

// ✅ Consistent spacing
<div className="p-4">                      // theme.spacing.md
<div className="mt-6">                     // theme.spacing.lg

// ✅ Established component variants
<Button variant="primary">
<Input className={inputStyles}>

// ✅ Consistent dark mode
<div className="bg-slate-800 text-slate-50">

// ✅ Reuse table styles
<table className={tableStyles.container}>

// ✅ Extend existing navigation
<nav className={navStyles.container}>
```

## 🔍 Visual Regression Prevention

### **Screenshot Testing (Recommended)**
```bash
# Take screenshots after each chunk
npm run screenshot-test

# Compare with baseline
npm run visual-diff

# Update baseline if changes are intentional
npm run update-screenshots
```

### **Manual Review Points**
```bash
After each chunk, verify:
1. Navigation looks identical to previous chunk (except new links)
2. Forms have consistent styling and validation display
3. Tables use same header/row/cell styling
4. Color usage follows semantic meaning
5. Spacing is consistent within and between components
6. Interactive states (hover/focus) work consistently
```

## 🎨 Component Evolution Strategy

### **Chunk 1**: Foundation components
- Layout, Navigation, Button, Input, Card
- Dark mode theme tokens
- Base styling established

### **Chunk 2**: Form patterns
- Extend Input/Button components for forms
- Establish validation error display patterns
- Add table styling for lists

### **Chunk 3**: Data display patterns  
- Add UtilizationBadge component
- Extend table styling for data-heavy displays
- Form patterns for complex inputs (select, slider)

### **Chunk 4**: Layout complexity
- Extend Card for grid layouts
- Dashboard-specific responsive patterns
- No new components - compose existing ones

### **Chunk 5+**: Feature enhancement
- Enhance existing components with new props/variants
- Maintain visual consistency while adding functionality
- No visual changes - same components, richer data

This standards document ensures that every chunk builds on the previous one without visual inconsistencies or the need for major UI overhauls later.