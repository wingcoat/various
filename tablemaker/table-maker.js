/*
Immediately‑Invoked Function Expression (IIFE)
The entire .js source is wrapped in an IIFE ((() => { … })();).
This creates a private lexical scope so that all constants, helper functions, and internal classes stay hidden from the global window object. Only the custom element registration (customElements.define('table‑maker', TableMakerComponent)) is exposed, preventing accidental name clashes and keeping the module self‑contained while still working without the <script type="module"> requirement.
*/

(() => {
	// ──► All constants, helpers, and classes live inside this closure.
	// ──► At the very end we register the element:

	// -------------------------------------------------
	// Private constants – visible only inside the IIFE
	// -------------------------------------------------

	// COL TYPE HELPERS
	const COL_TYPES = {
		MONEY:   'money',
		MONEY2:  'money_2',
		FLOAT:   'float',
		FLOAT5: 'float_5',
		PERCENT: '%',
		PERCENT1: 'percent',
		DATE:    'date',
		TEXT:    'text',
		// add new types here – the rest of the code just reads COL_TYPES.X
	};

	// DEFAULT VALUES
	const DEFAULTS = {
		PRECISION: 0,
		CURRENCY:  'INR',
		CSS_TYPE:  'default',
		STYLE: {
			table_style: '',
			caption: ''
		}
	};

	// ----- CSS FRAGMENTS ----------------------------------------------------
	const CSS_ALLOWED_TYPES = ['default', 'blueTable'];

	const CSS_ASSEMBLED = {};

	// Formatter – utility class
	class Formatter {
		// Formats a single monetary amount.
		// Tries the narrow‑symbol (`$`) first; falls back to a locale that already
		// uses the narrow symbol for USD on older browsers.
		static #formatCurrency(amount, precision, currency, useNarrow = true) {
			const cur = currency.toUpperCase();
			const opts = {
				style: 'currency',
				currency: cur,
				minimumFractionDigits: precision,
				maximumFractionDigits: precision,
				...(useNarrow && {currencyDisplay: 'narrowSymbol'})
			};
			try {
				return new Intl.NumberFormat(undefined, opts).format(amount);
			} catch (_) {
				const locale = cur === 'USD' ? 'en-US' : undefined;
				return new Intl.NumberFormat(locale, {...opts, currencyDisplay: undefined}).format(amount);
			}
		}

		static formatMoney(amount, precision = DEFAULTS.PRECISION, currency = DEFAULTS.CURRENCY) {
			return Formatter.#formatCurrency(amount, precision, currency, true);
		}

		static formatMoney2(amounts, precisions = [DEFAULTS.PRECISION], currencies = [DEFAULTS.CURRENCY]) {
			return amounts.map((amt, idx) => {
				const cur = currencies[Math.min(idx, currencies.length - 1)];
				const prec = precisions[Math.min(idx, precisions.length - 1)];
				return Formatter.formatMoney(amt, prec, cur);
			}).join('<br>');
		}

		// ---- Number / Percent / Date ---------------------------------------
		static formatNumber(val, precision = DEFAULTS.PRECISION) {
			return Number(val).toLocaleString('en-US', {
				minimumFractionDigits: precision,
				maximumFractionDigits: precision
			});
		}

		static formatPercent(val, precision = DEFAULTS.PRECISION) {
			return `${(val * 100).toFixed(precision)}%`;
		}

		static formatDate(val) {
			const d = new Date(val);
			return isNaN(d) ? '' : d.toISOString().split('T')[0];
		}
	}

	// TableMaker – utility class
	class TableMaker {
		// ---- Cell‑display preparation (pure function)
		static createCellDisplayValues(df) {
			const rows = df.rows.map(row => {
				for (const [col, raw] of Object.entries(row)) {
					if (['_DETAILS_TABLE_', '_DETAILS_OTHER_'].includes(col)) continue;

					const colInfo = df.cols[col] ?? {};
					const type = colInfo.type ?? COL_TYPES.TEXT;
					const precision = colInfo.precision ?? DEFAULTS.PRECISION;

					const cell = {type, value: raw, disp: raw};

					switch (type) {
						case COL_TYPES.MONEY2:
							const currencies = Array.isArray(colInfo.currency) ? colInfo.currency : [DEFAULTS.CURRENCY];
							const precisions = Array.isArray(colInfo.precision) ? colInfo.precision : [precision];
							const amounts = Array.isArray(raw) ? raw : [];
							cell.disp = Formatter.formatMoney2(amounts, precisions, currencies);
							break;
						case COL_TYPES.MONEY:
							cell.disp = Formatter.formatMoney(raw, precision);
							break;
						case COL_TYPES.FLOAT:
							cell.disp = Formatter.formatNumber(raw, precision);
							break;
						case COL_TYPES.FLOAT5:
							cell.disp = Formatter.formatNumber(raw/1e5, precision);
							break;
						case COL_TYPES.PERCENT:
						case COL_TYPES.PERCENT1:
							cell.disp = Formatter.formatPercent(raw, precision);
							break;
						case COL_TYPES.DATE:
							cell.disp = Formatter.formatDate(raw);
							break;
						default:
							cell.disp = raw;
					}
					row[col] = cell;
				}
				return row;
			});
			return {...df, rows};
		}
	}

	// Web Component – <table-maker>
	class TableMakerComponent extends HTMLElement {
		//--------------------------------------------------------------
		// Observed attributes – only the JSON payload.
		//--------------------------------------------------------------
		static get observedAttributes() {
			return ['data', 'style-config', 'transpose'];
		}

		//--------------------------------------------------------------
		// Private fields (stage‑2 proposal – works in modern browsers)
		//--------------------------------------------------------------
		#tableData = { style: { cssType: DEFAULTS.CSS_TYPE } }; // parsed JSON object
		#style = { cssType: DEFAULTS.CSS_TYPE }; // other possible values of cssType: 'blueTable'

		#aggregateColumns = [];

		#transpose = false;

		// When true we suppress automatic renders until refresh() is called.
		#batchMode = false;

		// for sorting the table by column
		#sortedColumn = {
			colName: null,		// column key we are currently sorted by
			sortAsc: true		// sort direction (true = ascending)
		};

		//--------------------------------------------------------------
		// Constructor – attach shadow DOM and initialise fields
		//--------------------------------------------------------------
		constructor() {
			super();
			this.attachShadow({ mode: 'open' });
		}

		/* ----- attribute ⇆ property helpers ----- */
		get data() { return this.#tableData; }
		set data(v) {
			// If we already have a good object, keep it as a fallback
			const previous = this.#tableData;

			// --------------------------------------------------------
			// Handle string: JSON parsing
			// -----------------------------------------------------------------
			if (typeof v === 'string') {
				try {
					this.#tableData = JSON.parse(v);
				} catch (e) {
					// Parsing failed – keep the old good value
					this.#tableData = previous;
					console.error('Invalid JSON supplied to <table-maker> “data” attribute:\n', v);
					console.error('Parse error:', e);
					// Do NOT re‑render the table with broken data
					return;
				}
			} else {
				// Not a string – assume it’s already an object (or null)
				this.#tableData = v;
				this.#style = this.#tableData.style ?? {};
				this.#style.cssType ??= DEFAULTS.CSS_TYPE;
			}

			// -----------------------------------------------------------------
			// Finally render the component (only when we have a usable object)
			// Only render immediately if we are NOT in batch mode
			// -----------------------------------------------------------------
			if (!this.#batchMode)
				this.#render();
		}

		get styleConfig() { return this.#style; }
		set styleConfig(v) {
			const previous = this.#style;

			if (typeof v === 'string') {
				try {
					this.#style = JSON.parse(v);
				} catch (e) {
					this.#style = previous;
					console.error('Invalid JSON supplied to <table-maker> “style-config” attribute:\n', v);
					console.error('Parse error:', e);
					return;
				}
			} else {
				this.#style = v;
			}

			this.#style.cssType ??= DEFAULTS.CSS_TYPE;

			// -----------------------------------------------------------------
			// Finally render the component (only when we have a usable object)
			// Only render immediately if we are NOT in batch mode
			// -----------------------------------------------------------------
			if (!this.#batchMode)
				this.#render();
		}

		get transpose() { return this.#transpose; }
		set transpose(v) {
			this.#transpose = Boolean(v);
			// -----------------------------------------------------------------
			// Only render immediately if we are NOT in batch mode
			// -----------------------------------------------------------------
			if (!this.#batchMode)
				this.#render();
		}

		/**
		 * Enable batch mode, assign any combination of data / styleConfig /
		 * transpose, then call `refresh()` once to render.
		 *
		 * Example usage:
		 *
		 *   const tbl = document.querySelector('#my-table');
		 *   tbl.beginBatch();                 // ← suppress auto‑renders
		 *   tbl.data = newDataObject;         // no render yet
		 *   tbl.styleConfig = newStyleObject; // still no render
		 *   tbl.transpose = true;             // still no render
		 *   tbl.refresh();                    // ← single render now
		 *
		 * The method returns `this` so you can chain calls if you wish.
		 */
		beginBatch() {
			this.#batchMode = true;
			return this;
		}

		/**
		 * Force a render using the current internal state.
		 * Automatically exits batch mode so subsequent property sets behave
		 * normally (i.e., they will trigger immediate renders again).
		 */
		refresh() {
			// Exit batch mode first – we want future sets to render automatically.
			this.#batchMode = false;
			this.#render();
			return this;
		}

		attributeChangedCallback(name, oldV, newV) {
			if (oldV === newV) return;

			if (name === 'data') this.data = newV;
			else if (name === 'style-config') this.styleConfig = newV;
			else if (name === 'transpose') this.transpose = this.hasAttribute('transpose');
		}

		connectedCallback() {
			if (this.hasAttribute('data'))
				this.data = this.getAttribute('data');

			if (this.hasAttribute('style-config'))
				this.styleConfig = this.getAttribute('style-config');

			if (this.hasAttribute('transpose'))
				this.transpose = true;

			this.#render();
		}

		static styles(cssType) {
			if ( !CSS_ALLOWED_TYPES.includes(cssType) )
				cssType = DEFAULTS.CSS_TYPE;

			if (CSS_ASSEMBLED[cssType])
				return CSS_ASSEMBLED[cssType];

			// cssType === default for pandas style table
			// You could also import a CSS file and return its text here.
			const cssHost = {
				default: `:host { display: block; overflow-x: auto; font-family: system-ui; }`,
				blueTable: `:host { display: block; overflow-x: auto; font-family: Arial, Helvetica, sans-serif;
				max-width: 100%;}`
			};
			const cssTable = `
			table {
				margin: 8px auto;
				font-size: 14px;
				border-collapse: collapse;
				${{default: 'border: none;', blueTable: 'box-shadow: 0 2px 5px rgba(0,0,0,.05);'}[cssType]} 
			}`;
			const caption = {
				color: {default: 'black', blueTable: '#004080'},
				bg_color: {default: 'hsl(218, 77%, 88%)', blueTable: '#fff'},
				font_size: {default: '1.14em', blueTable: '1.2em'}
			};
			const cssCaption = `
			table caption {
				caption-side: top;
				color: ${caption.color[cssType]};
				background-color: ${caption.bg_color[cssType]};
				padding: 7px;
				border: none;
				text-align:center;
				font-size: ${caption.font_size[cssType]};
				font-weight: bold;
			}`;
			const css_nth_tr = `
			tr:nth-child(even) { background:#f9f9f9; }
			tr:nth-child(odd) { background:#fff; }
		`;
			const cssColsAlign = `
			/* Right‑align numeric columns */
			th[data-type='${COL_TYPES.FLOAT}'], td[data-type='${COL_TYPES.FLOAT}'],
			th[data-type='${COL_TYPES.FLOAT5}'], td[data-type='${COL_TYPES.FLOAT5}'],
			th[data-type='${COL_TYPES.PERCENT}'], td[data-type='${COL_TYPES.PERCENT}'],
			th[data-type='${COL_TYPES.PERCENT1}'], td[data-type='${COL_TYPES.PERCENT1}'],
			th[data-type='integer'], td[data-type='integer'],
			th[data-type='number'], td[data-type='number'],
			th[data-type='${COL_TYPES.MONEY}'], td[data-type='${COL_TYPES.MONEY}'],
			th[data-type='${COL_TYPES.MONEY2}'], td[data-type='${COL_TYPES.MONEY2}']
			{ text-align:right; }
			td[data-type='text'] { text-align: left; }
			td[data-type='date'] { text-align: center; }
		`;
			const cssGroup = `
			tr.group-header, td.group-header {
				font-weight: bold;
				background: #e8f4ff;   /* light blue – change to whatever you like */
				text-align: left;      /* left‑align the label for readability */
			}
			tr.group-footer {
				font-weight: bold;
				background: hsl(60, 100%, 94%);   /* light yellow */
			}
			/* cursor for the group toggle */
			th .group-toggle, td .group-toggle {
				cursor: pointer;
			}

			/* optional animation */
			.group-member {
				transition: opacity .15s ease-in-out;
			}
			`
			;
			// ------------------------------------------------------------
			// Toggle‑button styling – pure CSS, no inline overrides
			// ------------------------------------------------------------
			const cssToggle = `
				button.detail-toggle {
					border: none;
					background: transparent;
					cursor: pointer;
					padding: 0;
					margin-right: 4px;
					font-size: 0.7rem;  /* inherit font size from surrounding cell */
					line-height: 1;      /* keep the arrow vertically centred */
				}

				/* Optional hover/focus feedback */
				button.detail-toggle:hover,
				button.detail-toggle:focus {
					opacity: 0.8;
				}

				/* When the row is expanded we add the class “expanded” to the button.
				   This lets us rotate the arrow or swap symbols if you prefer a CSS‑only
				   approach (instead of swapping the text in JS). */
				button.detail-toggle.expanded {
					/* Example: rotate a right‑pointing triangle */
					transform: rotate(90deg);
				}
				`;
			const tfoot_bg = {
				default: 'hsl(104, 35%, 87%) !important',
				blueTable: '#e6f0ff !important'
			};
			const cssTfoot = `
			tfoot.footer tr {
				font-family: system-ui;
				text-align: center;
				font-size: 14px;
				font-weight: bold;
				background: ${tfoot_bg[cssType] ?? 'hsl(104, 35%, 87%) !important'};
			}
		`;
			const cssSorting = `
			/* ----------- SORTABLE HEADER STYLES ------------ */
			thead tr th {
				position: relative;      /* needed for the absolute‑positioned arrow */
				cursor: pointer;         /* mouse hint */
				user-select: none;       /* avoid accidental text selection */
			}

			/* Arrow container – we’ll fill it with ▲ or ▼ */
			thead tr th.sort-icon {
				position: absolute;
				right: 6px;                /* distance from the right edge */
				top: 50%;
				transform: translateY(-50%);
				font-size: 0.75em;         /* slightly smaller than the header text */
				opacity: 0.6;              /* faded when not the active column */
			}

			/* Highlight the column that is currently sorted */
			thead tr th.sorted {
				background: ${{default: '#fcfcfc', blueTable: 'hsl(208, 60%, 98%); /* light blue tint */'}[cssType]};
			}
		`;

			/// DEFAULT STYLE HERE
			const css_tr_our_styles = `
			tr.our_bold > td { font-weight: bold; }
			tr.our_gold { background-color: hsl(41, 100%, 89%); }
			tr.our_blue { background-color: hsl(208, 60%, 94%); }
			tr.our_orange { background-color: hsl(31, 89%, 92%); }
			tr.our_yellow { background-color: hsl(60, 100%, 92%); }
			tr.our_yellow_lighter { background-color: hsl(60, 100%, 94%); }
			tr.our_green { background-color: hsl(104, 35%, 89%); }
			tr.our_green_lighter { background-color: hsl(104, 35%, 92%); }
		`;
			const assembledStyle = [
				cssHost[cssType], cssTable, cssCaption, css_nth_tr,
				// styles for group-header & group-footer should be after tr:nth-child(even) to ensure
				// that their styles override nth row style for normal data */
				cssTfoot, cssGroup, cssToggle,
				css_tr_our_styles
			];

			if (cssType === 'blueTable')
				assembledStyle.push(
					`th, td {
						border:1px solid #ddd;
						padding:8px;
					}
					th {
						background:#e6f0ff;
						text-align:center;
					}`
				);
			else
				assembledStyle.push(
					`th, td {
						padding: 6px 6px;
						text-align: center;
						margin: 0;
					}
					th {
						border-bottom: 1px dotted hsl(0, 0%, 73%);
						font-weight: bold;
					}`
				);

			assembledStyle.push(cssColsAlign);
			assembledStyle.push(cssSorting);

			assembledStyle.push(
				`span.smaller { font-size: 0.9em; }
				.highlight { background:#fffae6; }`
			);

			CSS_ASSEMBLED[cssType] = assembledStyle.join('\n');
			return CSS_ASSEMBLED[cssType];
		}

		#clear() {
			// Clear the shadow root
			this.shadowRoot.replaceChildren();
		}

		// --------------------------------------------------------------
		// Core render entry point – now a thin orchestrator
		// --------------------------------------------------------------
		#render() {
			this.#clear();

			// Guard – nothing to render yet
			if (!this.#tableData) return;

			// Normalise style defaults
			this.#style.row_buttons ??= [];
			this.#style.row_styles ??= [];
			this.#style.expandableRows = this.#hasDetailRows(this.#tableData.rows);

			// Build the table element (delegated)
			const tableEl = this.#transpose
			//? this.#buildTransposedTable()
			? this.#transposeTable()
			: this.#buildStandardTable();

			// Append style + table
			const styleTag = document.createElement('style');
			styleTag.textContent = TableMakerComponent.styles(this.#style.cssType);
			this.shadowRoot.append(styleTag, tableEl);
		}

		// --------------------------------------------------------------
		// Small, single‑purpose private helpers
		// --------------------------------------------------------------

		// true if any row contains a _DETAILS_* key
		#hasDetailRows(rows) {
			return rows.some(r => r._DETAILS_TABLE_ || r._DETAILS_OTHER_);
		}

		// Build a normal (non‑transposed) table
		#buildStandardTable() {
			this.#createAggregateColumnArray();

			// Prepare data (clone + display values)
			const prepared = TableMaker.createCellDisplayValues({
				rows: JSON.parse(JSON.stringify(this.#tableData.rows)),
				cols: this.#filterVisibleColumns(this.#tableData.cols)
			});

			// Header
			const thead = this.#buildHeader(prepared.cols);
			this.#attachHeaderClickHandler(thead);

			// Body (flat or grouped – grouping will be a separate step later)
			const tbody = this.#buildBody(prepared);

			// Assemble
			const table = document.createElement('table');
			table.style = this.#style.table_style ?? '';
			if (this.#tableData.caption)
				table.append(this.#caption());
			table.append(thead, tbody);

			// Aggregate/footer (if any)
			if (this.#aggregateColumns.length > 0) {
				const groupLabel = '';
				const trFoot = this.#subtotalRow(prepared.cols, prepared.rows, groupLabel);
				trFoot.classList.add('footer');

				const tfoot = document.createElement('tfoot');
				tfoot.setAttribute('class', 'footer');
				tfoot.append(trFoot);
				table.append(tfoot);
			}
			return table;
		}

		#transposeTable() {
			// Prepare data (clone + display values)
			const prepared = TableMaker.createCellDisplayValues({
				rows: JSON.parse(JSON.stringify(this.#tableData.rows)),
				cols: this.#filterVisibleColumns(this.#tableData.cols)
			});

			// Header
			//const thead = this.#buildHeader(prepared.cols);

			// ---- columns to show -------------------------------------------------
			let columnsToShow = {};
			Object.entries(this.#tableData.cols).forEach(([col, info]) => {
				const show = info.show ?? true;
				if (show) columnsToShow[col] = info;
			});

			// ---- clone data -------------------------------------------------------
			//let data = { rows: JSON.parse(JSON.stringify(this.#tableData.rows)), cols: columnsToShow };
			//let data = prepared; //TableMaker.createCellDisplayValues(prepared);

			const colClasses = this.#style.col_classes ?? {};
			const showCols = Object.keys(prepared.cols);
			const colTitlesFrom = this.#style.heading_col ?? showCols[0];

			// ---- top‑left header cell --------------------------------------------
			const th0 = document.createElement('th');
			th0.setAttribute('data-type', COL_TYPES.TEXT);
			th0.textContent = prepared.cols[colTitlesFrom].disp ?? colTitlesFrom;

			const trHead = document.createElement('tr');
			const headCls = colClasses[colTitlesFrom] ?? [];
			trHead.setAttribute('class', headCls.join(' '));
			trHead.append(th0);

			// ---- remaining header cells (column titles) ---------------------------
			const theadThArr = prepared.rows.map(row => {
				const th = document.createElement('th');
				th.setAttribute('data-type', row[colTitlesFrom].type);
				th.textContent = row[colTitlesFrom].disp;
				return th;
			});
			trHead.append(...theadThArr);
			const thead = document.createElement('thead');
			thead.appendChild(trHead);

			// ---- body – each original column becomes a row -----------------------
			const bodyCols = Object.fromEntries(
				Object.entries(prepared.cols).filter(([c]) => c !== colTitlesFrom)
			);
			const tbodyTrArr = Object.entries(bodyCols).map(([col, colInfo]) => {
				const th = document.createElement('th');
				th.setAttribute('data-type', COL_TYPES.TEXT);
				th.textContent = colInfo.disp ?? col;

				const tdArr = prepared.rows.map(row => {
					const td = document.createElement('td');
					td.setAttribute('data-type', row[col].type);
					td.textContent = row[col].disp;
					return td;
				});

				const trCls = colClasses[col] ?? [];
				const tr = document.createElement('tr');
				tr.setAttribute('class', trCls.join(' '));
				tr.append(th, ...tdArr);
				return tr;
			});

			// ---- ASSEMBLE THE TABLE
			const table = document.createElement('table');
			table.style = this.#style.table_style ?? '';

			if (this.#tableData.caption)
				table.append(this.#caption());

			const tbody = document.createElement('tbody');
			tbody.append(...tbodyTrArr);

			table.append(thead, tbody);
			return table;
		}

		// Filter out hidden/group‑by columns
		#filterVisibleColumns(allCols) {
			// If a group_by array is supplied, those columns are hidden from the main grid.
			const groupCols = Array.isArray(this.#style.group_by)
			? this.#style.group_by.map(g => Array.isArray(g) ? g[0] : g)
			: [];

			const visible = {};
			for (const [col, info] of Object.entries(allCols)) {
				const show = info.show ?? true;
				if (!groupCols.includes(col) && show) visible[col] = info;
			}

			return visible;
		}

		//--------------------------------------------------------------
		// TABLE HEAD – respects column order, display names, sortable
		// Build <thead> – pure DOM creation, no business logic
		//--------------------------------------------------------------
		#buildHeader(cols) {
			const thArr = Object.entries(cols).map(([col, info]) => {
				const th = document.createElement('th');
				th.dataset.key = col;	// <-- column identifier
				th.dataset.type = info.type ?? COL_TYPES.TEXT;
				th.textContent = info.disp ?? info.displayName ?? col;

				// Sorting UI (arrow placeholder)
				const placeholder = document.createElement('span');
				placeholder.className = 'sort-icon';

				// Mark the currently sorted column (if any)
				if (this.#sortedColumn.colName === col) {
					th.classList.add('sorted');
					placeholder.textContent = (this.#sortedColumn.sortAsc ?? true) ? '↑' : '↓';
				}

				th.appendChild(placeholder);
				return th;
			});

			if (this.#style.expandableRows)
				thArr.unshift(document.createElement('th'));

			const tr = document.createElement('tr');
			tr.classList.add('header');
			tr.append(...thArr);
			if (this.#style.row_buttons.length > 0)
				tr.append(document.createElement('th'));

			const thead = document.createElement('thead');
			thead.append(tr);
			return thead;
		}

		// -----------------------------------------------------------------
		// #buildBody – decides whether to render flat rows or grouped rows
		// -----------------------------------------------------------------
		#buildBody(prepared) {
			const { rows, cols } = prepared;

			// If no grouping requested → simple flat tbody
			if (!Array.isArray(this.#style.group_by) || this.#style.group_by.length === 0) {
				const tbody = document.createElement('tbody');
				rows.forEach(row => {
					tbody.append(this.#buildDataRow(row, cols));
					if (row._DETAILS_TABLE_ || row._DETAILS_OTHER_) {
						tbody.append(this.#buildDetailRow(row));
					}
				});
				return tbody;
			}

			// ---------------------------------------------------------------
			// Grouping requested – sort → chunk → render
			// ---------------------------------------------------------------
			// ---- a) Normalise group‑by column names & directions ------------
			const groupColNames = [];
			const sortDirections = []; // 'asc' | 'desc'

			this.#style.group_by.forEach(entry => {
				if (Array.isArray(entry)) {
					const [col, dir] = entry;
					groupColNames.push(col);
					sortDirections.push(dir && dir.toLowerCase() === 'desc' ? 'desc' : 'asc');
				} else {
					groupColNames.push(entry);
					sortDirections.push('asc');
				}
			});

			// ---- b) Sort rows according to the group spec ------------------
			const sortedRows = rows.slice().sort((a, b) => {
				for (let i = 0; i < groupColNames.length; i++) {
					const col = groupColNames[i];
					const dir = sortDirections[i];
					const av = a[col]?.value ?? '';
					const bv = b[col]?.value ?? '';

					// numeric vs. string fallback
					const cmp = typeof av === 'number' && typeof bv === 'number'
					? av - bv
					: String(av).localeCompare(String(bv));

					if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
				}
				return 0;
			});

			// ---- c) Chunk rows into groups ---------------------------------
			const groups = Object.groupBy(sortedRows, row => {
				// Build a deterministic key like "US|Electronics"
				return groupColNames.map(col => row[col]?.value).join('|');
			});

			// ---- d) Render each group as its own <tbody> --------------------
			const tbodyContainer = document.createDocumentFragment();

			Object.entries(groups).forEach(([groupKey, groupRows]) => {
				const groupTbody = this.#groupTbody(
					groupRows,
					groupColNames,
					sortDirections,
					cols,
					'group-footer'   // CSS class for the subtotal/footer row
				);
				tbodyContainer.append(groupTbody);
			});

			return tbodyContainer; // will be appended directly to <table>
		}

		// Build a normal data row (no grouping)
		#buildDataRow(row, cols) {
			const tdArr = Object.keys(cols).map(col => {
				const cell = row[col] ?? {type: COL_TYPES.TEXT, value: '', disp: ''};
				const td = document.createElement('td');
				td.dataset.type = cell.type;
				td.dataset.value = cell.value;
				td.innerHTML = cell.disp;
				return td;
			});

			// Row‑style classes (criteria based)
			const classes = this.#computeRowClasses(row);
			const tr = document.createElement('tr');
			tr.className = classes.join(' ');
			tr.append(...tdArr);

			// Expand/collapse toggle (if needed)
			if (row._DETAILS_TABLE_ || row._DETAILS_OTHER_) {
				const toggle = TableMakerComponent._makeToggleCell(false);
				toggle.addEventListener('click', this.#makeToggleHandler(toggle));
				const tdToggle = document.createElement('td');
				tdToggle.append(toggle);
				tr.prepend(tdToggle);
			}

			// Row‑level buttons (unchanged)
			if (this.#style.row_buttons.length > 0) {
				const tdBtn = document.createElement('td');
				tdBtn.append(...this.#buildRowButtons(row));
				tr.append(tdBtn);
			}

			return tr;
		}

		// Build the hidden detail row that appears under a data row
		#buildDetailRow(row) {
			const detailTr = document.createElement('tr');
			detailTr.className = 'detail-row';
			detailTr.style.display = 'none';

			const td = document.createElement('td');
			const colspan = Object.keys(row).length + (this.#style.row_buttons.length ? 1 : 0) + 1;
			td.setAttribute('colspan', colspan);
			td.style.padding = '0';

			if (row._DETAILS_TABLE_) {
				const nested = document.createElement('table-maker');
				nested.data = row._DETAILS_TABLE_;
				td.appendChild(nested);
			}
			if (row._DETAILS_OTHER_) {
				const pre = document.createElement('pre');
				pre.textContent = JSON.stringify(row._DETAILS_OTHER_, null, '\t');
				td.appendChild(pre);
			}
			detailTr.appendChild(td);
			return detailTr;
		}

		// Compute row‑style classes based on `style.row_styles`
		#computeRowClasses(row) {
			const classes = [];
			this.#style.row_styles.forEach(rule => {
				const {col, val} = rule.criteria;
				if (row[col] && val.includes(row[col].value)) {
					classes.push(...rule.classes);
				}
			});
			return classes;
		}

		// Build row‑level buttons (unchanged)
		#buildRowButtons(row) {
			return this.#style.row_buttons.map(btnDef => {
				const btn = document.createElement('button');
				btn.textContent = btnDef.text;
				const param = btnDef.param ?? '';
				const args = param in row ? row[param].value : '';
				btn.dataset.args = args;
				Object.keys(btnDef).forEach(k => (btn.dataset[k] = btnDef[k]));
				btn.setAttribute('onclick', `${btnDef.onclick}('${args}', '${JSON.stringify(btnDef)}')`);
				return btn;
			});
		}

		// Toggle‑handler generator – keeps the click logic out of the DOM builder
		#makeToggleHandler(toggleBtn) {
			return () => {
				const tr = toggleBtn.closest('tr');		// parent row
				const detailTr = tr.nextElementSibling;	// the hidden detail row
				const expanded = detailTr.style.display === '';
				// toggle visibility
				detailTr.style.display = expanded ? 'none' : '';
				// update caret
				toggleBtn.textContent = expanded ? '▶︎' : '▼';
			};
		}

		//--------------------------------------------------------------
		// PRIVATE – attach click listener to the <thead>
		//--------------------------------------------------------------
		#attachHeaderClickHandler(thead) {
			if (!thead) return; // safety

			// Use event delegation – one listener for all <th> elements
			thead.addEventListener('click', ev => {
				const th = ev.target.closest('th');
				if (!th) return;                     // click outside a header cell
				const col = th.dataset.key;
				if (!col) return;                    // should never happen

				// Determine the new direction:
				//   – if we’re already sorted by this column, flip the direction
				//   – otherwise default to ascending
				const newAsc = (this.#sortedColumn.colName === col) ? !this.#sortedColumn.sortAsc : true;

				// Trigger the sort (this will also call #render())
				this.#sortBy(col, newAsc);
			});
		}

		#createAggregateColumnArray() {
			// ---- columns to aggregate----------------------------------------------
			if( !this.#style.aggregateCols ) { // construct aggregateCols from df.cols
				this.#style.aggregateCols = {};
				Object.entries(this.#tableData.cols).forEach(([col, colInfo]) => {
					if ('aggregate' in colInfo)
						this.#style.aggregateCols[col] = colInfo.aggregate;
				});
			}

			this.#aggregateColumns = Object.entries(this.#style.aggregateCols).filter(([col, dtl]) => {
				return (col in this.#tableData.cols);
			}).map(([col, dtl]) => {
				return {
					col: col,
					type: this.#tableData.cols[col].type ?? COL_TYPES.TEXT,
					precision: this.#tableData.cols[col].precision ?? DEFAULTS.PRECISION,
					aggregate: dtl
				};
			});
		}

		#caption() {
			// assumes that #tableData.caption exists
			const caption = document.createElement('caption');
			caption.innerHTML = this.#tableData.caption;
			return caption;
		}

		/** -------------------------------------------------------------
		 *  Compute per‑column aggregates (currently only 'sum').
		 *  Returns an object: { colName: { value, disp } }
		 * ------------------------------------------------------------- */
		static calcGroupAggregates(aggregateCols, rows) {
			const result = {};

			// Walk through every column
			aggregateCols.forEach(colInfo => {
				const col = colInfo.col;
				const colType = colInfo.type ?? COL_TYPES.TEXT;
				const precision = colInfo.precision ?? DEFAULTS.PRECISION;

				let aggVal = 0;

				// Currently we only support 'sum'. Extend here for avg/min/max etc.
				switch (colInfo.aggregate) {
					case 'sum':
						if (colType === COL_TYPES.MONEY2) {
							// element‑wise sum of inner arrays
							aggVal = rows.reduce((acc, arr) => {
								arr[col].value.forEach((num, i) => {
									acc[i] = (acc[i] ?? 0) + Number(num);
								});
								return acc;
							}, []);
						} else {
							aggVal = rows.reduce((acc, r) => {
								// each row[col] is an object {type,value,disp}
								return acc + (r[col] ? r[col].value : 0);
							}, 0);
						}
						break;
					default:
						// If a literal value is supplied (e.g., aggregate: 'N/A')
						aggVal = colInfo.aggregate;
				}

				// Format the aggregate for display – reuse the same helpers
				let aggDisp = aggVal;
				switch (colType) {
					case COL_TYPES.MONEY:
						aggDisp = Formatter.formatMoney(aggVal, precision);
						break;
					case COL_TYPES.MONEY2:
						// Both `colInfo.currency` and `aggVal` are expected to be arrays.
						const currencies = Array.isArray(colInfo.currency) ? colInfo.currency : [DEFAULTS.CURRENCY];
						const precisions = Array.isArray(colInfo.precision) ? colInfo.precision : [precision];
						aggVal = Array.isArray(aggVal) ? aggVal : [];
						aggDisp = Formatter.formatMoney2(aggVal, precisions, currencies);
						break;
					case COL_TYPES.FLOAT:
						aggDisp = Formatter.formatNumber(aggVal, precision);
						break;
					case COL_TYPES.FLOAT5:
						aggDisp = Formatter.formatNumber(aggVal/1e5, precision);
						break;
					case COL_TYPES.PERCENT:
					case COL_TYPES.PERCENT1:
						aggDisp = Formatter.formatPercent(aggVal, precision);
						break;
					default:
						aggDisp = aggVal;
				}

				result[col] = { value: aggVal, disp: aggDisp };
			});

			return result;
		}

		// --------------------------------------------------------------
		// Helper: create the expand/collapse toggle for a row that has
		// a `details` object.
		// --------------------------------------------------------------
		static _makeToggleCell(expanded = false) {
			const btn = document.createElement('button');
			btn.type = 'button';
			// Semantic class – we’ll style everything through CSS
			btn.className = 'detail-toggle';
			// Arrow direction – the class “expanded” will be toggled by the click‑handler
			btn.textContent = expanded ? '▼' : '▶︎';
			return btn;
		}

		// --------------------------------------------------------------
		// PRIVATE: Sort the table by a column.
		// columnKey – the key from the column definition
		// asc       – boolean, true for ascending, false for descending
		// --------------------------------------------------------------
		#sortBy(columnKey, asc = true) {
			// Guard – nothing to sort
			if (!this.#tableData?.rows) return;

			const colDef = this.#tableData.cols?.[columnKey] ?? {};
			const type   = (colDef.type ?? '').toString().toLowerCase();

			// Normalise a raw cell value so that the comparator can work with a
			// homogeneous type (number, string, or date‑timestamp).
			const normalize = (v) => {
				// ---- COL_TYPES.MONEY2 (array) – compare ONLY the first entry ----------
				if (type === COL_TYPES.MONEY2 && Array.isArray(v)) {
					const first = v.length ? Number(v[0]) : 0;
					return Number.isFinite(first) ? first : 0;
				}

				// ---- dates ----------------------------------------------------
				if (type === COL_TYPES.DATE) {
					const d = new Date(v);
					// Invalid dates become the smallest possible value so they sort first
					return isNaN(d) ? -Infinity : d.getTime();
				}

				// ---- numbers (including numeric strings) ----------------------
				const num = Number(v);
				if (!Number.isNaN(num)) return num;

				// ---- everything else – treat as string ------------------------
				// null / undefined become empty string so they sort before real text
				return (v == null ? '' : String(v));
			};

			// Comparator used by Array.prototype.sort().
			// Returns -1, 0, or 1 depending on the ordering of a and b.
			const comparator = (a, b) => {
				const na = normalize(a[columnKey]);
				const nb = normalize(b[columnKey]);

				// If both are strings, use localeCompare (numeric aware, case‑insensitive)
				if (typeof na === 'string' && typeof nb === 'string') {
					return na.localeCompare(nb, undefined, {
						numeric: true,
						sensitivity: 'base',
					});
				}

				// Otherwise fall back to numeric comparison (covers numbers & dates)
				return na < nb ? -1 : na > nb ? 1 : 0;
			};

			// Apply the sort (reverse order if asc === false)
			this.#tableData.rows.sort((a, b) => (asc ? comparator(a, b) : -comparator(a, b)));

			// Remember the current sort state – the header renderer uses these.
			this.#sortedColumn = {colName: columnKey, sortAsc: asc};

			// Re‑render the table so the UI (arrow, highlighted column) updates.
			this.#render();
		}

		#groupTbody(groupRows, groupColNames=[], sortDirections=[], colsToShow, aggTrClass) {
			const withToggle = true;

			// Separate tbody for member rows of the group (excluding header)
			// We do this to easily select group members to expand/collapse
			// using the toggle button in the group header
			const tbodyMembers = document.createElement('tbody');
			tbodyMembers.classList.add('group-member');
			tbodyMembers.style.display = 'none'; // initially, hidden

			const groupLabel = groupColNames.map(c => {
				const disp = groupRows[0][c]?.disp ?? groupRows[0][c]?.value ?? '';
				return `${c}: ${disp}`;
			}).join(' | ');

			const trArr = [];
			groupRows.forEach((rowObj, idx) => {
				// idx to be used if we want autoincremented 'Sl No' column for the group
				// ---- NORMAL DATA ROW (group columns omitted in colsToShow) ----
				const tr = this.#buildDataRow(rowObj, colsToShow);
				if (withToggle) {
					// extra td to align with td in header, which has toggle button
					//const placeholder = document.createElement('td');
					//tr.prepend(placeholder);
				}
				trArr.push(tr);

				// If this row carries a `details` object, create a hidden sibling row:
				if (rowObj._DETAILS_TABLE_ || rowObj._DETAILS_OTHER_) {
					const detailTr = document.createElement('tr');
					detailTr.className = 'detail-row';
					// start hidden – the toggle will switch to '' to display
					detailTr.style.display = 'none';

					const td = document.createElement('td');
					// span across all visible columns (+ possible button column) + toggle column
					const colspan = Object.keys(colsToShow).length +
						  (this.#style.row_buttons.length > 0 ? 1 : 0) + 1;
					td.setAttribute('colspan', colspan);
					td.style.padding = '0';          // remove extra padding around nested table

					if (rowObj._DETAILS_TABLE_) {
						// Create the nested <table-maker> element
						const nested = document.createElement('table-maker');
						nested.data = rowObj._DETAILS_TABLE_;
						td.appendChild(nested);
					}
					if (rowObj._DETAILS_OTHER_) {
						// Create the nested <pre> element
						const pre = document.createElement('pre');
						pre.innerHTML = JSON.stringify(rowObj._DETAILS_OTHER_, null, '\t');
						td.appendChild(pre);
					}

					detailTr.appendChild(td);
					trArr.push(detailTr);
				}
			});

			let aggTr = '';
			if (this.#aggregateColumns.length > 0) {
				aggTr = this.#subtotalRow(colsToShow, groupRows, groupLabel);
				aggTr.classList.add(aggTrClass);
			}

			// If this.#aggregateColumns is not an empty array
			//	and it has an entry with 'aggregate': 'Total',
			//	then header row can be replaced with aggregate row
			//	at the beginning of the tbody
			const hasTotalSpecifier = this.#aggregateColumns.some(col => col.aggregate === 'Total');

			const fragment = document.createDocumentFragment();
			if (hasTotalSpecifier) {
				// aggTr acts as the group header too
				if (withToggle) {
					// Toggle cell (collapsed by default)
					const toggleBtn = TableMakerComponent._makeToggleCell(false);
					toggleBtn.classList.add('group-toggle');   // optional hook for CSS
					toggleBtn.addEventListener('click', this.#makeToggleHandler(toggleBtn));
					const toggleTd = document.createElement('td');
					toggleTd.append(toggleBtn);
					//aggTr.prepend(toggleTd);
					// Query‑selector shortcut – picks the first matching cell
					const firstCell = aggTr.querySelector('td, th') ?? null;
					if (firstCell) 
						firstCell.prepend(toggleBtn);
				}

				tbodyMembers.append(...trArr);
				fragment.append(aggTr, tbodyMembers);
			} else {
				// ---- GROUP HEADER ----
				const headerTr = document.createElement('tr');
				headerTr.classList.add('group-header');
				const colspan = Object.keys(colsToShow).length +
					  (this.#style.row_buttons.length > 0 ? 1 : 0);
				const headerTd = document.createElement('td');
				headerTd.setAttribute('colspan', colspan);
				headerTd.textContent = groupLabel;
				headerTr.append(headerTd);

				if (withToggle) {
					// Toggle cell (collapsed by default)
					const toggleBtn = TableMakerComponent._makeToggleCell(false);
					toggleBtn.classList.add('group-toggle');   // optional hook for CSS
					toggleBtn.addEventListener('click', this.#makeToggleHandler(toggleBtn));
					//const toggleTd = document.createElement('td');
					//toggleTd.append(toggleBtn);
					//headerTr.prepend(toggleTd);
					// Query‑selector shortcut – picks the first matching cell
					const firstCell = headerTr.querySelector('td, th') ?? null;
					if (firstCell) 
						firstCell.prepend(toggleBtn);
				}

				tbodyMembers.append(...trArr, aggTr);
				fragment.append(headerTr, tbodyMembers);
			}

			return fragment;
		}

		#subtotalRow(colsToShow, groupRows, groupLabel='') {
			// Create a copy of this.#aggregateColumns and assign group label to the
			//  col having value 'Total' so that it is shown in sub-total row too.
			let newAggCols = JSON.parse(JSON.stringify(this.#aggregateColumns));
			if (groupLabel !== '') {
				newAggCols = newAggCols.map(aggCol => {
					if (aggCol.aggregate === 'Total')
						aggCol.aggregate = groupLabel;
					return aggCol;
				});
			}
			const aggInfo = TableMakerComponent.calcGroupAggregates(newAggCols, groupRows);

			const thArr = Object.entries(colsToShow).map(([col, colInfo]) => {
				const th = document.createElement('th');
				if (aggInfo[col]) {
					th.setAttribute('data-type', colInfo.type ?? COL_TYPES.TEXT);
					th.setAttribute('data-value', aggInfo[col].value);
					th.innerHTML = aggInfo[col].disp;
				} else {
					th.innerHTML = ''; // empty cell for non‑aggregated cols
				}
				return th;
			});

			// If you have row‑level buttons, keep the extra empty cell
			if (this.#style.row_buttons.length > 0)
				thArr.push(document.createElement('th'));

			if (this.#style.expandableRows)
				thArr.unshift(document.createElement('th'));

			// Now render the aggregate values as a separate row
			const tr_agg = document.createElement('tr');
			tr_agg.append(...thArr);
			return tr_agg;
		}
	}

	customElements.define('table-maker', TableMakerComponent);
})();