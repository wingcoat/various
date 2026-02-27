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

	// ----- CSS FRAGMENTS ----------------------------------------------------
	const CSS_ALLOWED_TYPES = ['default', 'blueTable'];

	const CSS_ASSEMBLED = {};

	class TabHandlerComponent extends HTMLElement {
		static get observedAttributes() {
			return ['data'];  // react when the attribute changes
		}

		// --------------------------------------------------------------
		// Private fields (stage‑2 proposal – works in modern browsers)
		// --------------------------------------------------------------
		#siblingsClass;

		constructor() {
			super();

			// Shadow DOM keeps styles/content isolated
			this.attachShadow({ mode: 'open' });

			// A container where TabHandler will inject its markup
			this.container = document.createElement('div');
			this.shadowRoot.append(this.container);

			// Inside the constructor, after attaching shadow DOM:
			const style = document.createElement('style');
			style.textContent = `
			/* Style the div which contains tab buttons */
			.tab {
				overflow: hidden;
				border: 1px solid #ccc;
				background-color: #f1f1f1; /* color for region after tab buttons */
			}
			/* Style the buttons that are used to open the tab content */
			.tab button {
				background-color: inherit;
				float: left;
				border: none;
				outline: none;
				cursor: pointer;
				padding: 8px 14px;
				transition: 0.3s;
			}
			/* Change background color of buttons on hover */
			.tab button:hover {
				background-color: #ddd;
			}
			/* Create an active/current tablink class */
			.tab button.active {
				background-color: #ccc;
				font-weight: bold;
			}
			.tab .active:after {
				content: '';
			}

			/* Style the tab content */
			.tabcontent {
				display: none;
				padding: 6px 8px;
				border: 1px solid #ccc;
				border-top: none;
			}
		`;
			this.shadowRoot.append(style);
		}

		// Called when the element is first added to the page
		connectedCallback() {
			// If the user set `data` via property before connection,
			// make sure we render it now.
			if (this._tabData) this._renderTabs();
		}

		// Attribute change handler – keep the property in sync
		attributeChangedCallback(name, oldVal, newVal) {
			if (name === 'data' && oldVal !== newVal) {
				try {
					this.tabData = JSON.parse(newVal);
				} catch (e) {
					console.error('Invalid JSON for <tab-handler data>', e);
				}
			}
		}

		/** Public getter / setter so callers can do:
   		*    element.tabData = [{title:'A',content:'…'}];
   		*/
		get tabData() {
			return this._tabData;
		}
		set tabData(value) {
			if (!Array.isArray(value)) {
				console.warn('tabData should be an array of tab specs');
				return;
			}
			this._tabData = value;
			this._renderTabs();
		}

		/**
		 * Convert an arbitrary string (title, id, etc.) into a safe CSS identifier.
		 * - Replaces any character that is NOT a‑z, A‑Z, 0‑9, or '_' with '_' .
		 * - Collapses consecutive '_' to a single '_' (optional, just for tidiness).
		 * - Guarantees the result never starts with a digit (prefix with '_' if needed).
		 *
		 * @param {string} raw
		 * @returns {string}
		 */
		static _cssSafe(raw) {
			// Turn undefined/null into empty string first
			let s = String(raw);
			// Replace illegal chars with _
			s = s.replace(/[^a-zA-Z0-9_-]/g, '_');
			// Collapse multiple underscores
			s = s.replace(/_+/g, '_');
			// If it starts with a digit, prefix an underscore (CSS identifiers can't start with a number)
			if (/^[0-9]/.test(s)) s = '_' + s;
			return s;
		}

		/**
		 * Walk the internal `_tabData` tree and return the spec that matches `path`.
		 * Returns { spec, parentId, leafId } where:
		 *   - `spec`   : the tab spec object found at the end of the path
		 *   - `parentId`: the id of the custom‑element that owns this spec
		 *   - `leafId` : the identifier used to build the button/content IDs
		 *
		 * @param {string[]} path  ordered list of titles (or ids) from root → leaf
		 * @returns {{spec:Object,parentId:string,leafId:string}|null}
		 */
		_tabSpecFromPath(path) {
			if (!Array.isArray(path) || path.length === 0) return null;

			// Start at the root of this component
			let currentSpecArray = this._tabData;
			let parentId = this.id;               // the element that owns the current level
			let entry = null;
			let leafId = null;

			for (let i = 0; i < path.length; i++) {
				const title = path[i];

				// Find the entry whose title (or explicit id) matches the segment
				entry = currentSpecArray.find(
					t => (t.title ?? t.id) === title
				);

				if (!entry) return null;   // path broken – not found

				// Compute the identifier that the component uses for DOM IDs
				leafId = ('id' in entry) ? entry.id : TabHandlerComponent._cssSafe(entry.title);

				// If we are not yet at the leaf, descend into its children
				if (i < path.length - 1) {
					if (!Array.isArray(entry.tabs)) return null; // expected deeper level but none
					currentSpecArray = entry.tabs;
					parentId = `${this.id}_nested_${leafId}`;   // ID of the nested <tab‑handler>
				}
			}

			return { spec: entry, parentId, leafId };
		}

		/**
		 * Resolve a path expressed as an array of tab *titles*.
		 *
		 * @param {string[]} titlePath – ordered list of tab titles, e.g.
		 *                               ["Settings","Security","2FA"]
		 * @returns {{path:string[], tabID:string, tabSpec:Object}|null}
		 *          path   – array of the custom‑element ids that form the hierarchy
		 *                   (root handler id, then each nested handler id)
		 *          tabID  – the id of the leaf tab (the one whose content will be shown)
		 *          tabSpec– the specification object for that leaf tab
		 */
		resolveTitlePath(titlePath) {
			// sanity check
			if (!Array.isArray(titlePath) || titlePath.length === 0) return null;

			// `ownerId` tracks the id of the handler we are currently walking through.
			// It starts with the id of *this* component (the root of the walk).
			let ownerId = this.id;
			const path = [ownerId];           // collect every handler id we traverse

			// The spec array we are searching in – starts with the root data.
			let currentSpecArray = this._tabData;

			// Walk each title in the supplied path.
			for (let i = 0; i < titlePath.length; i++) {
				const title = titlePath[i];

				// Find the entry whose title matches the current title.
				const entry = currentSpecArray.find(
					t => t.title === title
				);

				// If we cannot find a matching tab, the whole path is invalid.
				if (!entry) return null;

				// The identifier the component uses for DOM ids.
				const leafId = ('id' in entry) ? entry.id
				: TabHandlerComponent._cssSafe(entry.title);

				// If this is the *last* title, we have reached the leaf tab.
				if (i === titlePath.length - 1) {
					return {
						path,               // array of handler ids up to (and including) this one
						tabID: leafId,      // the id of the leaf tab button/content
						tabSpec: entry      // the full spec object for the leaf tab
					};
				}

				// Otherwise we need to descend into a nested <tab‑handler>.
				// Build the deterministic id that the nested handler will receive
				const nestedHandlerId = `${ownerId}_nested_${leafId}`;

				// Push the nested handler id onto the path and continue the walk.
				path.push(nestedHandlerId);
				ownerId = nestedHandlerId;

				// Prepare for the next iteration: the child spec array.
				if (!Array.isArray(entry.tabs)) return null; // expected deeper level but none
				currentSpecArray = entry.tabs;
			}

			// Should never reach here because the loop returns on the leaf.
			return null;
		}

		/**
		 * Programmatically navigate to a leaf tab.
		 *
		 * @param {string[]} path  ordered list of titles/ids from root → leaf
		 */
		selectPath(path) {
			if (!Array.isArray(path) || path.length === 0) return;

			// Walk the path, opening each intermediate tab.
			// We keep a reference to the element that currently owns the level.
			let owner = this;                 // starts with the root element

			for (let i = 0; i < path.length; i++) {
				const segment = path[i];
				// Resolve the spec for the *current* segment within the current owner
				const info = owner._tabSpecFromPath([segment]); // note: single‑item path
				if (!info) {
					console.warn('selectPath: segment not found', segment);
					return;
				}

				// Open the tab on the owning element
				owner.openTab(info.leafId);

				// If this isn’t the last segment, we need to dive into the nested handler
				if (i < path.length - 1) {
					// The nested handler was created lazily when the parent tab opened.
					// Its id follows the convention we used when rendering nested tabs.
					const nestedId = `${owner.id}_nested_${info.leafId}`;
					const nestedEl = owner.shadowRoot.getElementById(nestedId);
					if (!nestedEl) {
						console.warn('selectPath: nested handler missing for', info.leafId);
						return;
					}
					owner = nestedEl; // continue the loop with the child component
				}
			}
		}

		/**
		 * Set the content of a leaf tab.
		 *
		 * @param {string[]|string} target   – either a raw tab id or an array path
		 * @param {string|Node|Node[]} content – HTML string, a single Node, or an array of Nodes
		 */
		setTabContent(path, tabID, content) {
			if (!Array.isArray(path) || path.length === 0) return null;

			// first entry in path should match this.id
			if (path[0] !== this.id) return null;

			// if path contains more than 1 entry, it means we have to set content
			// of handler whose id is in path[1]. Call setTabContent of the child handler,
			// pass it path with path[0] removed, so that it can handle logic in the same manner.
			if (path.length > 1) {
				const nested = this.shadowRoot.getElementById(path[1]);
				nested.setTabContent(path.slice(1), tabID, content);
				return null;
			}

			const contentDivId = `tabcontent_${this.id}_${tabID}`;
			const contentDiv   = this.shadowRoot.getElementById(contentDivId);

			// -----------------------------------------------------------------
			// Insert the new content
			// -----------------------------------------------------------------
			if (typeof content === 'string') {
				contentDiv.innerHTML = content;
			} else if (Array.isArray(content)) {
				contentDiv.replaceChildren(...content);
			} else {
				// single Node (or something that can be coerced to a Node)
				contentDiv.replaceChildren(content);
			}

			// Mark the pane as rendered so subsequent clicks skip the lazy‑render guard
			delete contentDiv.dataset.unrendered;
		}

		// define a function that converts a string to hex
		stringToHex(str) {
			let hex = '';
			for (let i = 0; i < str.length; i++) {
				const charCode = str.charCodeAt(i);
				const hexValue = charCode.toString(16);

				// Pad with zeros to ensure two-digit representation
				hex += hexValue.padStart(2, '0');
			}
			return hex;
		}

		// Core rendering routine
		_renderTabs() {
			const frag = document.createDocumentFragment();

			// Build the tab‑buttons bar
			const tabBar = document.createElement('div');
			tabBar.className = 'tab';
			frag.append(tabBar);

			this.#siblingsClass = `${this.id}_all_children`;

			// Keep track of the first tab’s identifier
			let firstTabId = null;

			this._tabData.forEach((t, index) => {
				const entry_id = ('id' in t) ? t.id : t.title;
				const safeEntryId = TabHandlerComponent._cssSafe(entry_id);

				// Remember the very first entry
				if (index === 0) firstTabId = safeEntryId;

				const btn = document.createElement('button');
				const tab_id = `tab_${this.id}_${safeEntryId}`;
				btn.id = tab_id;
				btn.className = `tablinks ${this.#siblingsClass}`;
				btn.textContent = t.title;
				btn.onclick = e => this.openTab(safeEntryId);
				tabBar.append(btn);

				// Placeholder content div – hidden until opened
				const contentDiv = document.createElement('div');
				const tabcontent_id = `tabcontent_${this.id}_${safeEntryId}`;
				contentDiv.id = tabcontent_id;
				contentDiv.className = `tabcontent notforprint ${this.#siblingsClass}`;
				contentDiv.dataset.unrendered = 'true';
				contentDiv.dataset.tabSpec = JSON.stringify(t);
				contentDiv.style.display = 'none';
				frag.append(contentDiv);
			});

			// Clear any previous UI
			this.container.replaceChildren(frag);

			/* -------------------------------------------------------------
			   EAGERLY create nested handlers for every spec that has children.
			   We do this *after* the root UI is in place so that each nested
			   handler can find its own shadowRoot and render its own button bar.
			------------------------------------------------------------- */
			this._tabData.forEach((spec, idx) => {
				// The corresponding content DIV we just created earlier in the loop:
				const entry_id = ('id' in spec) ? spec.id : spec.title;
				const safeEntryId = TabHandlerComponent._cssSafe(entry_id);
				const tabcontent_id = `tabcontent_${this.id}_${safeEntryId}`;
				const contentDiv = this.shadowRoot.getElementById(tabcontent_id);

				// If this spec defines child tabs, create the nested handler now.
				if (Array.isArray(spec.tabs) && spec.tabs.length) {
					// The path that leads to this root handler (just its own id)
					const accumulatedPath = JSON.parse(this.dataset.path);
					this._createNestedHandlers(contentDiv, spec, this.id, accumulatedPath);
				}
			});

			// Open the first tab
			if (firstTabId !== null) {
				this.openTab(firstTabId);
			}
		}

		/**
		 * Create nested <tab-handler> elements for a given spec.
		 *
		 * @param {HTMLElement} parentContentDiv – the content <div> that will host the nested handler
		 * @param {Object[]} spec               – the tab spec for this level
		 * @param {string}   parentId           – id of the current (owner) handler
		 * @param {string[]} accumulatedPath    – path of handler ids that leads to the current level
		 */
		_createNestedHandlers(parentContentDiv, spec, parentId, accumulatedPath) {
			// If this spec has child tabs we need a nested handler for them.
			if (Array.isArray(spec.tabs) && spec.tabs.length) {
				const leafId = ('id' in spec) ? spec.id
				: TabHandlerComponent._cssSafe(spec.title);
				const nestedId = `${parentId}_nested_${leafId}`;

				// Create the nested handler (only once)
				const nested = document.createElement('tab-handler');
				nested.id = nestedId;

				// Path that reaches this nested handler
				nested.dataset.path = JSON.stringify([...accumulatedPath, nestedId]);

				// Feed it its own spec array – this will immediately render its
				// button bar and empty content panes (still lazy for their inner content)
				nested.tabData = spec.tabs;

				// Append the nested handler to the *parent* pane.
				// The parent pane already exists (it is `parentContentDiv`).
				parentContentDiv.appendChild(nested);
			}
		}

		openTab(id) {
			// Hide all sibling tabcontents
			this.shadowRoot.querySelectorAll(`.tabcontent.${this.#siblingsClass}`).forEach(el => {
				el.style.display = 'none';
			});

			// Remove active class from all sibling buttons
			this.shadowRoot.querySelectorAll(`.tablinks.${this.#siblingsClass}`).forEach(el => {
				el.classList.remove('active');
			});

			// Show the selected tab and mark its button active
			const tabcontent_id = `tabcontent_${this.id}_${id}`;
			const contentDiv = this.shadowRoot.getElementById(tabcontent_id);
			contentDiv.style.display = 'block';

			const tab_id = `tab_${this.id}_${id}`;
			this.shadowRoot.getElementById(tab_id).classList.add('active');

			// ---------------------------------------------------------
			// **Recursive eager‑render of nested tabs**
			// If the pane we just opened contains a nested <tab‑handler>,
			// we immediately open its *first* tab, then repeat the check.
			// ---------------------------------------------------------
			const nestedHandler = contentDiv.querySelector('tab-handler');
			if (nestedHandler) {
				const firstSpec = nestedHandler.tabData?.[0];
				if (!firstSpec) return;        // safety – empty spec array

				// Prefer an explicit `id`; otherwise fall back to the CSS‑safe title.
				const leafId = ('id' in firstSpec) ? firstSpec.id : TabHandlerComponent._cssSafe(firstSpec.title);

				// Recursively open the first tab of the nested handler
				nestedHandler.openTab(leafId);
			} else {
				this._populateTabWithoutOpening(id);
			}
		}

		_populateTabWithoutOpening(id) {
			const tabcontent_id = `tabcontent_${this.id}_${id}`;
			const contentDiv = this.shadowRoot.getElementById(tabcontent_id);

			// already rendered
			if (contentDiv.dataset.unrendered !== 'true') return;

			// Extract the stored path for this leaf
			const path = JSON.parse(this.dataset.path); // e.g. [ids of the components]

			// Build the payload you want the listener to receive
			const spec = JSON.parse(contentDiv.dataset.tabSpec);
			const payload = {
				path: path,
				tabID: id,
				tabSpec: spec
			};

			// Dispatch the event on clicking the btn – `detail` holds the custom data
			this.dispatchEvent(
				new CustomEvent('renderTab', {
					detail: payload,
					bubbles: true,    // optional – lets the event bubble up the DOM
					composed: true    // optional – lets it cross shadow‑DOM boundaries
				})
			);

			// Mark this pane as rendered so we don’t repeat the work
			delete contentDiv.dataset.unrendered;
		}
	}

	/* ------------------------------------------------------------- */
	customElements.define('tab-handler', TabHandlerComponent);

// Public API – Consumers can set the data either declaratively (<tab-handler id='...' data='[...]'></tab-handler>) or imperatively (element.id = ... and element.tabData = [...]). Both paths end up calling _renderTabs().
// id is important
// Styling (optional)
// Because the component lives in a shadow root, you can ship default styles right inside the component:
})();