# UI Design Rules

Established patterns for consistent UI across the application. Follow these when building new pages or components.

## Layout Patterns

### Auth Pages
- Split-panel: dark branded left panel (`bg-primary`) + clean right form area (`bg-muted/30`)
- Left panel hidden on mobile (`hidden lg:flex`), mobile gets inline branding header instead
- Left panel content: logo (top), product info + feature grid (middle), footer text (bottom)
- Form area: `max-w-[420px]`, no Card wrapper — layout provides structure

### Authenticated Pages
- Sidebar + main content area
- `PageHeader` at top with title/description/optional actions
- Content in `<div className="p-8">`

## Form Patterns

### Input Fields with Icons
- Wrap `<Input>` in `<div className="relative">`
- Icon: `absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60`
- Input: `className="pl-9"` (or `pl-9 pr-10` if right-side button too)

### Password Fields
- Always include visibility toggle (Eye/EyeOff icons)
- Toggle button: `absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors`
- `tabIndex={-1}` on toggle to keep tab flow on form fields
- Use `autoComplete="current-password"` (login) or `autoComplete="new-password"` (signup)

### Labels
- Use `<Label>` with `space-y-1.5` gap to input
- Descriptive: "Email address" not just "Email", "Full name" not just "Name"

### Submit Buttons
- `w-full h-10` for auth forms
- Loading text: "Signing in..." / "Creating account..." (present participle)
- `disabled={loading}` during submission

## Error States

### Inline Error Banners
```
flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive
```
- Always include `<AlertCircle className="h-4 w-4 shrink-0" />` icon

## Typography

### Page Headings
- Main: `text-2xl font-semibold tracking-tight`
- Subtitle: `text-sm text-muted-foreground`
- Spacing: `space-y-2` between heading and subtitle

### Footer Links (auth pages)
- `text-center text-sm text-muted-foreground`
- Link: `font-medium text-primary hover:underline underline-offset-4`

## Spacing

- Form field groups: `space-y-5`
- Page sections: `space-y-8`
- Label to input: `space-y-1.5`

## Role-Based Visibility

### Sidebar Navigation
- Nav items can have optional `roles` array to restrict visibility
- Items without `roles` are visible to all authenticated users
- Filter: `.filter((item) => !item.roles || (role && item.roles.includes(role)))`

### Route Protection
- Middleware handles redirects for unauthorized role access
- API routes use `requireRole(...)` from `@/lib/auth-utils`
