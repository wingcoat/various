# \<table-maker\> – Smart, Flexible HTML Table Web Component

A lightweight, framework-agnostic **Custom Element** (`<table-maker>`) that renders beautiful, sortable, groupable, subtotal-capable, and nestable data tables from simple JSON-like data structures.

Perfect for dashboards, financial reports, admin panels, Pandas-style outputs in web apps, and more — no build tools or frameworks required.

## Features

- Pure Web Component (Shadow DOM encapsulation)
- Automatic formatting: money (with currency), multi-currency cells (`money_2`), percent, date, float, integer, text
- Click-to-sort column headers with visual ▲/▼ indicators
- Multi-level row **grouping** with subtotals (via `group_by`)
- **Expandable rows** supporting nested `<table-maker>` tables or arbitrary content
- Conditional row styling based on cell values
- **Transpose** mode (swap rows ↔ columns)
- Aggregate footer rows (`sum`, custom labels like "Total")
- Batch updates (`beginBatch()` + `refresh()`)
- Row-level action buttons
- Two built-in visual themes (`default` + `blueTable`)
- Small footprint (~9–11 kB gzipped)
- Works everywhere Custom Elements v1 + Shadow DOM are supported (2025+ browsers)

## Installation

### Via CDN (quickest – no build step)

```html
<script src="https://cdn.jsdelivr.net/gh/wingcoat/various/tablemaker/table-maker.js" defer></script>
```

## Quick Start Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Table Maker Demo</title>
  <script src="table-maker.js" defer></script>
</head>
<body>

  <h2>Monthly Performance</h2>

  <table-maker
    data='{
      "caption": "2025 Sales Summary",
      "cols": {
        "month":     { "type": "text",     "displayName": "Month" },
        "revenue":   { "type": "money",    "precision": 0,  "currency": "INR" },
        "growth":    { "type": "%",        "precision": 1 },
        "orders":    { "type": "integer" }
      },
      "rows": [
        { "month": "Jan", "revenue": 120000, "growth": 0.042, "orders": 340 },
        { "month": "Feb", "revenue": 145000, "growth": 0.208, "orders": 412 },
        { "month": "Mar", "revenue": 98000,  "growth": -0.324, "orders": 289 },
        { "month": "Apr", "revenue": 168000, "growth": 0.714, "orders": 503 }
      ]
    }'
    style-config='{
      "cssType": "blueTable",
      "table_style": "width: 100%; max-width: 780px; margin: 1.5rem auto;"
    }'>
  </table-maker>

</body>
</html>
```

## Data Format Reference
```TypeScript
{
  caption?: string;

  cols: {
    [columnKey: string]: {
      type?:        "money" | "money_2" | "float" | "%" | "date" | "text" | "integer";
      precision?:   number | number[];               // single or per-currency for money_2
      currency?:    string | string[];               // ISO code(s) e.g. "INR", "USD"
      displayName?: string;
      show?:        boolean;                         // default: true
      aggregate?:   "sum" | "Total" | "N/A" | string;
    }
  };

  rows: Array<Record<string, any>>;
}
```
## money_2 example (multiple currencies/precisions in one cell):
```JSON
{
  "cols": {
    "payments": {
      "type": "money_2",
      "precision": [0, 2],
      "currency": ["INR", "USD"]
    }
  },
  "rows": [
    { "payments": [12000, 145.50] },
    { "payments": [8500, 102.75] }
  ]
}
```
→ renders: ₹12,000<br>$145.50
## Most Useful style-config Properties
```TypeScript
{
  cssType?:            "default" | "blueTable";
  table_style?:        string;                    // CSS string for <table>
  group_by?:           string | [string, "asc"|"desc"][];
  aggregateCols?:      Record<string, "sum" | "Total" | string>;
  row_styles?:         Array<{ criteria: {col: string, val: any[]}, classes: string[] }>;
  row_buttons?:        Array<{ text: string, onclick: string, param?: string, ... }>;
  col_classes?:        Record<string, string[]>;  // transpose mode
  heading_col?:        string;                    // transpose header column
}
```
## JavaScript Control
```JavaScript
const tbl = document.querySelector('table-maker');

// Batch update (single render at the end)
tbl.beginBatch()
   .data = newDataObject
   .styleConfig = newStyleObject
   .transpose = true
   .refresh();

// Force re-render
tbl.refresh();

// Read current parsed data
console.log(tbl.data);
```
## Browser Support
- Modern browsers with Custom Elements v1 + Shadow DOM
(Chrome/Edge ≥79, Firefox ≥63, Safari ≥10.1, mobile browsers 2025+)
- No polyfills needed.
