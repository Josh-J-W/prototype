/* EtymoTree — app.js
 * Wiring between the three layers. Holds no parsing rules and no markup rules.
 */
(function (global) {
  'use strict';

  var R = global.ET.Render;
  var state = {
    result: null,       // last API result
    parsed: null,       // last parse result
    graphs: [],         // graphs on offer (parsed, or an explicitly labeled fallback)
    active: 0,
    tab: 'tree'
  };

  var dom = {};

  function ready() {
    dom.form = document.getElementById('search-form');
    dom.input = document.getElementById('word');
    dom.button = document.getElementById('search-button');
    dom.messages = document.getElementById('messages');
    dom.results = document.getElementById('results');
    dom.picker = document.getElementById('etymology-picker');
    dom.tabs = document.getElementById('tabs');
    dom.panels = {
      tree: document.getElementById('panel-tree'),
      data: document.getElementById('panel-data'),
      raw: document.getElementById('panel-raw'),
      notes: document.getElementById('panel-notes')
    };

    dom.form.addEventListener('submit', function (e) {
      e.preventDefault();
      search(dom.input.value.trim());
    });

    dom.tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      selectTab(btn.dataset.tab);
    });

    document.querySelectorAll('[data-example]').forEach(function (b) {
      b.addEventListener('click', function () {
        dom.input.value = b.dataset.example;
        search(b.dataset.example);
      });
    });
  }

  /* ---------------------------------------------------------------- */

  function message(level, title, body, actionLabel, action) {
    var box = R.el('div', { 'class': 'message ' + level });
    box.appendChild(R.el('h3', null, title));
    if (body) box.appendChild(R.el('p', null, body));
    if (actionLabel) {
      var wrap = R.el('div', { 'class': 'actions' });
      var btn = R.el('button', { type: 'button' }, actionLabel);
      btn.addEventListener('click', action);
      wrap.appendChild(btn);
      dom.messages.appendChild(box);
      box.appendChild(wrap);
      return;
    }
    dom.messages.appendChild(box);
  }

  function search(word) {
    if (!word) return;
    dom.messages.innerHTML = '';
    dom.button.disabled = true;
    dom.button.textContent = 'Fetching…';
    dom.results.hidden = true;

    // Exactly one API call per search. No ancestor lookups.
    global.ET.Api.fetchWiktionaryPage(word).then(function (result) {
      dom.button.disabled = false;
      dom.button.textContent = 'Look up';
      state.result = result;

      if (!result.ok) {
        message('error', 'Could not read that page', result.error.message);
        return;
      }

      var parsed = global.ET.Parser.parsePage(result.wikitext, {
        term: result.title,
        languageSection: 'English',
        languageCode: 'en'
      });
      state.parsed = parsed;

      if (!parsed.ok) {
        parsed.diagnostics.forEach(function (d) {
          message(d.level === 'error' ? 'error' : 'warning', d.message, d.detail || '');
        });
        offerFallback(result.title);
        // The raw response stays inspectable even when parsing fails.
        state.graphs = [];
        showResults(true);
        return;
      }

      state.graphs = parsed.etymologies;
      state.active = 0;
      parsed.diagnostics.forEach(function (d) {
        message('warning', d.message, d.detail || '');
      });

      var lineage = state.graphs[0].edges.filter(function (e) {
        return global.ET.Parser.LINEAGE_RELATIONSHIPS[e.relationship];
      });
      if (!lineage.length) offerFallback(result.title);

      showResults(false);
    });
  }

  function offerFallback(title) {
    var key = String(title).toLowerCase();
    if (!global.ET.Fallback.available[key]) return;
    message('warning',
      'The parser found no relationships in the live wikitext',
      'You can load the hardcoded demonstration tree for “' + key + '” to check the display layer. ' +
      'It is clearly marked as fallback data and is not parser output.',
      'Load the labeled fallback tree',
      function () {
        state.graphs = [global.ET.Fallback.available[key]()];
        state.active = 0;
        showResults(false);
      });
  }

  /* ---------------------------------------------------------------- */

  function showResults(parsingFailed) {
    dom.results.hidden = false;
    renderPicker();
    if (parsingFailed) state.tab = 'raw';
    selectTab(state.tab);
  }

  function renderPicker() {
    dom.picker.innerHTML = '';
    if (state.graphs.length < 2) return;
    dom.picker.appendChild(R.el('span', { 'class': 'label' },
      state.graphs.length + ' separate etymologies on this page:'));
    state.graphs.forEach(function (g, i) {
      var btn = R.el('button', { type: 'button' }, g.etymologyTitle || g.etymologyId);
      if (i === state.active) btn.style.borderColor = 'var(--ink)';
      btn.addEventListener('click', function () {
        state.active = i;
        renderPicker();
        selectTab(state.tab);
      });
      dom.picker.appendChild(btn);
    });
  }

  function currentGraph() { return state.graphs[state.active] || null; }

  function selectTab(tab) {
    state.tab = tab;
    var graph = currentGraph();

    dom.tabs.querySelectorAll('.tab').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    Object.keys(dom.panels).forEach(function (k) { dom.panels[k].hidden = k !== tab; });

    var noteCount = R.countNotes(graph);
    var badge = dom.tabs.querySelector('[data-tab="notes"] .count');
    badge.textContent = noteCount;
    badge.hidden = noteCount === 0;

    if (tab === 'tree' && graph) R.renderTree(dom.panels.tree, graph);
    if (tab === 'data' && graph) R.renderParsedData(dom.panels.data, graph, state.result.source);
    if (tab === 'raw' && state.result && state.result.ok) {
      R.renderRawResponse(dom.panels.raw, state.result, graph);
    }
    if (tab === 'notes') R.renderNotes(dom.panels.notes, graph, state.parsed ? state.parsed.diagnostics : []);
    if (!graph && (tab === 'tree' || tab === 'data')) {
      dom.panels[tab].innerHTML = '';
      dom.panels[tab].appendChild(R.el('p', { 'class': 'empty' },
        'Nothing was parsed for this page. The raw wikitext is on the next tab.'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})(typeof window !== 'undefined' ? window : globalThis);
