# Money Penny design system

Modern minimal spending workbench. All app routes share one visual system.

- Layout: 248px desktop side rail; mobile navigation uses a modal drawer with focus trapping, Escape dismissal, and close on route selection. A compact top bar holds navigation context and statement upload.
- Palette: cool slate workspace, white surfaces, ink text, cobalt blue actions. Tokens live in `frontend/src/index.css`; shadcn components consume the same semantic variables. Charts use the existing named category palette.
- Typography: local Avenir Next / Segoe UI / system sans, shared by body and headings. No external font service. Roman headings, restrained size, tabular financial amounts.
- Brand: compact Penny monogram and Money Penny wordmark in `components/brand.tsx`.
- Components: shadcn buttons, form controls, badges, tables and Radix dialogs. 10px control radius, 12px card radius, subtle borders and surface shadow.
- Spacing: Tailwind four-point scale; 32px desktop workspace padding and 16px mobile padding.
- Mobile: compact ledger cards; filters can expand; upload remains visible; page actions wrap into deliberate rows. No horizontal page scrolling.
- Motion: short color transitions and navigation drawer entrance. Reduced-motion preference disables spatial animation. No animated totals or decorative reveals.
- Copy: direct action labels, explanatory validation messages, actual imported data only.
