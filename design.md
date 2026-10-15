# Money Penny design system

Modern minimal spending workbench. All app routes share one visual system.

- Layout: 248px desktop side rail; mobile navigation uses a modal drawer with focus trapping, Escape dismissal, and close on route selection. A compact top bar holds navigation context and statement upload.
- Palette: cool slate workspace, white surfaces, ink text, cobalt blue actions. Tokens live in `frontend/src/index.css`; shadcn components consume the same semantic variables. Charts use the existing named category palette.
- Typography: self-hosted Inter variable / system sans, shared by body and headings. No external font service. Roman headings, restrained size, tabular financial amounts.
- Brand: compact Penny monogram and Money Penny wordmark in `components/brand.tsx`.
- Components: shadcn buttons, form controls, badges, tables and Radix dialogs. 10px control radius, 12px card radius, subtle borders and surface shadow.
- Spacing: Tailwind four-point scale; 32px desktop workspace padding and 16px mobile padding.
- Mobile: compact ledger cards; filters can expand; upload remains visible; page actions wrap into deliberate rows. No horizontal page scrolling.
- Motion: short color transitions and navigation drawer entrance. Reduced-motion preference disables spatial animation. No animated totals or decorative reveals.
- Copy: direct action labels, explanatory validation messages, actual imported data only.

- Overview: compact period/account filters, optional inline comparison, one summary/history card, and a category comparison table with TanStack horizontal bars. Secondary details and donut sit in an expandable section. Monthly history covers twelve calendar months.

- Imports: three-stage workflow indicator, keyboard-accessible file picker and drag-and-drop area, account-type segments, optional CSV mapping accordion, and grouped archive rows with actual upload dates and status badges.

- Expanded spending details: net spending strip with purchase/refund/fee/interest breakdown; category donut with matching legend and signed amounts; merchant shares, top-six/all-twelve disclosure and aggregate footer. On mobile, cards stack and merchant bars sit below each merchant.

- AI & rules: selectable provider cards including rules-only mode, local model settings and read-only server status, privacy callout, merchant rule rows and live job status/progress cards. Configuration and lower cards stack on mobile; reset stays separate below.

- Transactions: unified AI prompt and manual filter card; count and review controls in a muted footer; compact ledger header/actions, split calendar dates, category pills, review badges and signed credit colors. Mobile retains collapsible filters and transaction cards. Manual and AI filter changes are explicitly approved before application.

- Data workbench: Transactions, Vendor Analysis, subscriptions, and category targets share white table rows, compact cells, numeric alignment, and accessible sortable headers. Reports use the shared `DataTable`; the ledger composes the same table primitives and `SortHeader` while retaining selection and mobile cards. Transaction sorting happens on the server before pagination; reports sort their complete result sets locally. Null values sort last.
- Shared filtering: `FilterPanel`, `FilterFields`, and `FilterFooter` own disclosure, field order, spacing, Apply/Reset actions, and result counts. Reports keep draft filters separate from applied filters, matching Transactions. The AI prompt remains on Transactions. Report tables scroll horizontally within their cards on small screens.
