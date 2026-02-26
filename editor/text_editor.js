// text_editor.js (v7 tabs + find + folding + themes + status)

///////////////////////
// Basic editor setup
///////////////////////
const editor = CodeMirror(document.getElementById("editor"), {
	lineNumbers: true,
	lineWrapping: true,
	styleActiveLine: true,
	matchBrackets: true,
	autoCloseBrackets: true,
	foldGutter: true,
	gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
	indentUnit: 4,
	tabSize: 4,
	indentWithTabs: true,
	viewportMargin: Infinity
});

// Data structures for tabs
let tabs = []; // {id, name, doc, mode}
let activeTabId = null;
let tabCounter = 0;

// helpers
const $ = id => document.getElementById(id);

// Initialize UI elements
const tabsEl = $('tabs');
const fileInput = $('fileInput');
const btnNewTab = $('btnNewTab');
const btnOpen = $('btnOpen');
const btnSave = $('btnSave');
const modeSelect = $('modeSelect');
const fontSizeInput = $('fontSize');
const themeBtn = $('themeBtn');
const findBtn = $('findBtn');
const findBar = $('findBar');
const findInput = $('findInput');
const prevFind = $('prevFind');
const nextFind = $('nextFind');
const findCount = $('findCount');
const caseBtn = $('caseBtn');
const wordBtn = $('wordBtn');
const regexBtn = $('regexBtn');
const closeFind = $('closeFind');
const statusBar = $('statusBar');

const replaceInput   = $('replaceInput');
const replaceBtn     = $('replaceBtn');
const replaceAllBtn  = $('replaceAllBtn');

// Add initial tab
createTab('untitled.txt', null);

// ---------- tabs management ----------
function createTab(name, mode) {
	const id = 'tab-' + (++tabCounter);
	const doc = new CodeMirror.Doc('', mode || null);
	tabs.push({ id, name, doc, mode: mode || null, dirty: false });
	renderTabs();
	switchToTab(id);
	return id;
}

function renderTabs() {
	tabsEl.innerHTML = '';
	tabs.forEach(t => {
		const tab = document.createElement('div');
		tab.className = 'tab' + (t.id === activeTabId ? ' active' : '');
		tab.dataset.id = t.id;
		tab.title = t.name;
		tab.textContent = t.name;
		const close = document.createElement('span');
		close.className = 'close';
		close.textContent = '×';
		close.onclick = (ev) => { ev.stopPropagation(); closeTab(t.id); };
		tab.appendChild(close);
		tab.onclick = () => switchToTab(t.id);
		tabsEl.appendChild(tab);
	});
}

function findTabIndex(id) { return tabs.findIndex(x => x.id === id); }

function switchToTab(id) {
	if (activeTabId === id) return;
	// save current doc back into its tab object
	if (activeTabId) {
		const cur = tabs.find(x => x.id === activeTabId);
		if (cur) cur.doc = editor.getDoc();
	}
	const tab = tabs.find(x => x.id === id);
	if (!tab) return;
	activeTabId = id;
	// If tab.doc is CodeMirror.Doc, swap to it; otherwise create
	editor.swapDoc(tab.doc);
	editor.setOption('mode', tab.mode || null);
	modeSelect.value = tab.mode || 'null';
	renderTabs();
	updateStatus();
	editor.focus();
}

function closeTab(id) {
	const idx = findTabIndex(id);
	if (idx === -1) return;
	// If closing active tab, switch to neighbor
	if (activeTabId === id) {
		const nextIdx = (idx > 0) ? idx - 1 : (tabs.length > 1 ? 1 : null);
		if (nextIdx !== null) switchToTab(tabs[nextIdx].id);
	}
	tabs.splice(idx, 1);
	if (tabs.length === 0) createTab('untitled.txt', null);
	renderTabs();
}

// ---------- File open/save ----------
btnNewTab.addEventListener('click', () => createTab('untitled' + (tabCounter+1) + '.txt', null));

btnOpen.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (ev) => {
	const f = ev.target.files[0];
	if (!f) return;
	const reader = new FileReader();
	reader.onload = () => {
		// create a tab with file contents and appropriate mode
		const mode = detectModeFromName(f.name);
		const id = createTab(f.name, mode);
		const tab = tabs.find(x => x.id === id);
		tab.doc.setValue(reader.result || '');
		tab.mode = mode;
		switchToTab(id);
	};
	reader.readAsText(f);
	// clear value so same file can be re-selected
	fileInput.value = '';
});

btnSave.addEventListener('click', () => {
	const tab = tabs.find(t => t.id === activeTabId);
	if (!tab) return;
	const filename = tab.name || 'untitled.txt';
	const blob = new Blob([editor.getValue()], { type: 'text/plain' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	URL.revokeObjectURL(a.href);
	updateStatus('Saved: ' + filename);
});

// ---------- mode & font ----------
modeSelect.addEventListener('change', () => {
	const val = modeSelect.value;
	const mode = val === 'null' ? null : val;
	const tab = tabs.find(t => t.id === activeTabId);
	if (tab) tab.mode = mode;
	editor.setOption('mode', mode);
});

fontSizeInput.addEventListener('input', () => {
	const size = fontSizeInput.value + 'px';
	editor.getWrapperElement().style.fontSize = size;
	editor.refresh();
});

// ---------- theme toggle (body class cm-light/cm-dark) ----------
themeBtn.addEventListener('click', () => {
	const body = document.body;
	if (body.classList.contains('cm-light')) {
		body.classList.remove('cm-light');
		body.classList.add('cm-dark');
	} else {
		body.classList.remove('cm-dark');
		body.classList.add('cm-light');
	}
	// refresh editor to apply gutter colors
	editor.refresh();
});

// ---------- status updates ----------
function updateStatus(msg) {
	const pos = editor.getCursor();
	const tab = tabs.find(t => t.id === activeTabId);
	const name = (tab && tab.name) ? tab.name : 'Untitled';
	const extra = msg ? (' — ' + msg) : '';
	statusBar.textContent = `${name}${extra} — Line ${pos.line + 1}, Col ${pos.ch + 1}`;
}
editor.on('cursorActivity', () => updateStatus());

// ---------- detect mode from filename ----------
function detectModeFromName(name) {
	if (!name) return null;
	const n = name.toLowerCase();
	if (n.endsWith('.html') || n.endsWith('.htm')) return 'htmlmixed';
	if (n.endsWith('.js') || n.endsWith('.mjs')) return 'javascript';
	if (n.endsWith('.json')) return 'application/json';
	if (n.endsWith('.css')) return 'css';
	return null;
}

// ---------- FIND (VS Code style, with toggles & count) ----------
let searchOptions = { case: false, regex: false, word: false };
let searchMatches = []; // array of {from,to}
let currentMatchIndex = -1;

function openFindBar() {
	findBar.classList.remove('hidden');
	findInput.focus();
	replaceInput.value = '';  // <-- clear previous replace text
	runSearch();
}
function closeFindBarHandler() {
	findBar.classList.add('hidden');
	clearSearchMarks();
	replaceInput.value = '';
	editor.focus();
}
function runSearch() {
	clearSearchMarks();
	const q = findInput.value;
	if (!q) { updateFindCount(); return; }

	let regex;
	try {
		if (searchOptions.regex) {
			regex = new RegExp(q, searchOptions.case ? 'g' : 'gi');
		} else {
			let escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			if (searchOptions.word) escaped = '\\b' + escaped + '\\b';
			regex = new RegExp(escaped, searchOptions.case ? 'g' : 'gi');
		}
	} catch (err) {
		findCount.textContent = 'Invalid regex';
		return;
	}

	const docText = editor.getValue();
	searchMatches = [];
	let m;
	while ((m = regex.exec(docText)) !== null) {
		const from = editor.posFromIndex(m.index);
		const to = editor.posFromIndex(m.index + m[0].length);
		searchMatches.push({ from, to });
		// prevent infinite loops for zero-length matches
		if (m.index === regex.lastIndex) regex.lastIndex++;
	}

	// highlight all
	for (let i = 0; i < searchMatches.length; i++) {
		const mk = editor.markText(searchMatches[i].from, searchMatches[i].to, { className: 'cm-searching' });
		// store mark on match object (optional) - not stored here to keep simple
	}

	currentMatchIndex = searchMatches.length ? 0 : -1;
	if (currentMatchIndex >= 0) focusMatch(currentMatchIndex);
	updateFindCount();
}

function focusMatch(idx) {
	if (idx < 0 || idx >= searchMatches.length) return;
	const m = searchMatches[idx];
	editor.setSelection(m.from, m.to);
	editor.scrollIntoView(m.from, 100);
	updateFindCount();
}

function replaceCurrent() {
	if (currentMatchIndex < 0 || currentMatchIndex >= searchMatches.length) return;

	const repl = replaceInput.value;
	const match = searchMatches[currentMatchIndex];

	// Perform the replacement
	editor.replaceRange(repl, match.from, match.to);

	// After replacement the document changed – re‑run the search to update indices
	runSearch();
}

function replaceAll() {
	const repl = replaceInput.value;
	if (!searchMatches.length) return;   // nothing to replace

	// Work backwards so earlier replacements don’t shift later indices
	for (let i = searchMatches.length - 1; i >= 0; i--) {
		const m = searchMatches[i];
		editor.replaceRange(repl, m.from, m.to);
	}

	// Refresh the search state
	runSearch();
}

function findNextHandler() {
	if (!searchMatches.length) { runSearch(); return; }
	currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
	focusMatch(currentMatchIndex);
}
function findPrevHandler() {
	if (!searchMatches.length) { runSearch(); return; }
	currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
	focusMatch(currentMatchIndex);
}

function clearSearchMarks() {
	editor.getAllMarks().forEach(m => m.clear());
	searchMatches = [];
	currentMatchIndex = -1;
	updateFindCount();
}

function updateFindCount() {
	if (!searchMatches.length) findCount.textContent = '0 of 0';
	else findCount.textContent = (currentMatchIndex + 1) + ' of ' + searchMatches.length;
}

// find bar buttons/events
findBtn.addEventListener('click', openFindBar);
closeFind.addEventListener('click', closeFindBarHandler);
findInput.addEventListener('input', runSearch);
replaceBtn.addEventListener('click', replaceCurrent);
replaceAllBtn.addEventListener('click', replaceAll);

// Optional: hit Enter in the replace field to trigger “Replace”
replaceInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();
		replaceCurrent();
	}
});

nextFind.addEventListener('click', findNextHandler);
prevFind.addEventListener('click', findPrevHandler);
caseBtn.addEventListener('click', () => { searchOptions.case = !searchOptions.case; caseBtn.classList.toggle('active', searchOptions.case); runSearch(); });
wordBtn.addEventListener('click', () => { searchOptions.word = !searchOptions.word; wordBtn.classList.toggle('active', searchOptions.word); runSearch(); });
regexBtn.addEventListener('click', () => { searchOptions.regex = !searchOptions.regex; regexBtn.classList.toggle('active', searchOptions.regex); runSearch(); });

// keyboard shortcuts: Ctrl+F to open find, Esc to close
editor.addKeyMap({
	'Ctrl-F': function(cm) { openFindBar(); },
	'Cmd-F': function(cm) { openFindBar(); },
	'Esc': function(cm) {
		if (!findBar.classList.contains('hidden')) closeFindBarHandler();
	}
});

// update status on cursor activity
editor.on('cursorActivity', () => updateStatus());

// initialize UI state
(function init() {
	// ensure wrapper has theme class so gutter styles pick up
	document.body.classList.add('cm-light'); // default
	// set initial font size
	editor.getWrapperElement().style.fontSize = fontSizeInput.value + 'px';
	editor.refresh();
})();

