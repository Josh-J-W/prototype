/* EtymoTree — render.js
 * Layer 3: display only. This file knows about nodes, edges and rows.
 * It contains no Wiktionary template knowledge of any kind.
 */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  /* ------------------------------------------------------------------ *
   * Tree
   * ------------------------------------------------------------------ */

  function nodeElement(node) {
    var box = el('div', {
      'class': 'node',
      'data-node-id': node.id,
      'data-role': node.role,
      'data-reconstructed': String(!!node.reconstructed),
      'data-uncertain': String(!!node.uncertain),
      'data-language-known': String(!!node.languageKnown)
    });
    box.appendChild(el('span', { 'class': 'node-lang' },
      node.languageName || node.language || 'language unknown'));
    var term = el('span', { 'class': 'node-term' });
    term.appendChild(document.createTextNode(node.displayTerm || node.term));
    if (node.uncertain) {
      var q = el('span', { 'class': 'qmark' }, ' ?');
      q.setAttribute('title', 'Wiktionary marks this form as uncertain');
      term.appendChild(q);
    }
    box.appendChild(term);
    if (node.gloss) box.appendChild(el('span', { 'class': 'node-gloss' }, '“' + node.gloss + '”'));
    return box;
  }

  function edgeLabel(edge) {
    var base = edge.relationship;
    if (edge.subtype && edge.subtype !== 'affix' && edge.subtype !== 'unspecified') {
      base += ' · ' + edge.subtype;
    }
    return edge.uncertain ? 'possibly ' + base : base;
  }

  function renderTree(container, graph) {
    container.innerHTML = '';
    var layout = global.ET.Layout.layoutGraph(graph);

    if (!layout.rows.length || (layout.rows.length === 1 && layout.rows[0].length === 1)) {
      container.appendChild(el('p', { 'class': 'empty' },
        'No ancestor or component relationships could be read from this etymology. ' +
        'The Notes tab lists what the parser saw.'));
    }

    var tree = el('div', { 'class': 'tree' });
    var svg = svgEl('svg', { 'class': 'tree-wires' });
    var rowsWrap = el('div', { 'class': 'tree-rows' });

    layout.rows.forEach(function (row, i) {
      var rowEl = el('div', { 'class': 'tree-row', 'data-level': i });
      row.forEach(function (n) { rowEl.appendChild(nodeElement(n)); });
      rowsWrap.appendChild(rowEl);
    });

    tree.appendChild(svg);
    tree.appendChild(rowsWrap);
    container.appendChild(tree);

    if (layout.rows.length) {
      var legend = el('div', { 'class': 'tree-legend' });
      [['l-recon', 'dashed = reconstructed'],
       ['l-uncertain', 'hatched = uncertain'],
       ['l-component', 'rounded = component of the form below'],
       ['l-entry', 'heavy = the word you searched']].forEach(function (p) {
        legend.appendChild(el('span', { 'class': p[0] }, p[1]));
      });
      container.appendChild(legend);
    }

    if (layout.aside.length) container.appendChild(renderRelated(layout, graph));

    var draw = function () { drawWires(tree, svg, layout); };
    requestAnimationFrame(draw);
    if (container._etResize) window.removeEventListener('resize', container._etResize);
    container._etResize = debounce(draw, 120);
    window.addEventListener('resize', container._etResize);
    container._etRedraw = draw;
    return layout;
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function drawWires(tree, svg, layout) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var base = tree.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + tree.scrollWidth + ' ' + tree.scrollHeight);
    svg.setAttribute('width', tree.scrollWidth);
    svg.setAttribute('height', tree.scrollHeight);

    function rectOf(id) {
      var node = tree.querySelector('[data-node-id="' + cssEscape(id) + '"]');
      if (!node) return null;
      var r = node.getBoundingClientRect();
      return {
        left: r.left - base.left + tree.scrollLeft,
        top: r.top - base.top,
        width: r.width,
        height: r.height
      };
    }

    layout.edges.forEach(function (edge) {
      var a = rectOf(edge.from), b = rectOf(edge.to);
      if (!a || !b) return;
      var x1 = a.left + a.width / 2, y1 = a.top + a.height;
      var x2 = b.left + b.width / 2, y2 = b.top - 7;
      var mid = (y1 + y2) / 2;
      var d = 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + mid + ' ' + x2 + ',' + mid + ' ' + x2 + ',' + y2;
      svg.appendChild(svgEl('path', {
        'class': 'wire', d: d, 'data-uncertain': String(!!edge.uncertain)
      }));
      svg.appendChild(svgEl('path', {
        'class': 'wire',
        d: 'M' + (x2 - 4) + ',' + y2 + ' L' + x2 + ',' + (y2 + 6) + ' L' + (x2 + 4) + ',' + y2,
        fill: 'none'
      }));
      var label = svgEl('text', {
        'class': 'wire-label',
        x: (x1 + x2) / 2 + (x1 === x2 ? 8 : 0),
        y: mid + 3,
        'text-anchor': x1 === x2 ? 'start' : 'middle',
        'paint-order': 'stroke',
        stroke: '#ffffff',
        'stroke-width': '3'
      });
      label.textContent = edgeLabel(edge);
      svg.appendChild(label);
    });
  }

  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function renderRelated(layout, graph) {
    var block = el('div', { 'class': 'related-block' });
    block.appendChild(el('h3', null, 'Related, but not ancestors'));
    block.appendChild(el('p', null,
      'Doublets, cognates and terms the parser could not attach to the lineage. ' +
      'They are kept out of the vertical tree on purpose.'));
    var list = el('div', { 'class': 'related-list' });
    layout.aside.forEach(function (n) {
      var rel = graph.edges.filter(function (e) { return e.to === n.id || e.from === n.id; })[0];
      var item = el('span', { 'class': 'related-item' });
      item.appendChild(el('small', null, (rel && rel.subtype) || n.role || 'related'));
      item.appendChild(document.createTextNode(n.displayTerm || n.term));
      if (n.languageName) item.setAttribute('title', n.languageName);
      list.appendChild(item);
    });
    block.appendChild(list);
    return block;
  }

  /* ------------------------------------------------------------------ *
   * Parsed data
   * ------------------------------------------------------------------ */

  function table(headers, rows) {
    var t = el('table', { 'class': 'data' });
    var thead = el('thead');
    var tr = el('tr');
    headers.forEach(function (h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (cells) {
      var r = el('tr');
      cells.forEach(function (c) {
        var td = el('td', c && c.cls ? { 'class': c.cls } : null);
        td.textContent = c && c.text != null ? c.text : (c == null ? '' : c);
        r.appendChild(td);
      });
      tbody.appendChild(r);
    });
    t.appendChild(tbody);
    return t;
  }

  function section(title, child) {
    var s = el('div', { 'class': 'data-section' });
    s.appendChild(el('h3', null, title));
    s.appendChild(child);
    return s;
  }

  function renderParsedData(container, graph, source) {
    container.innerHTML = '';

    container.appendChild(section('Entry',
      table(['Term', 'Language', 'Etymology'], [[
        { text: graph.entry.term, cls: 'term' },
        (graph.entry.languageName || '') + ' (' + graph.entry.language + ')',
        graph.etymologyTitle || graph.entry.etymologyId || ''
      ]])));

    container.appendChild(section('Nodes (' + graph.nodes.length + ')',
      table(['Term', 'Language', 'Code', 'Reconstructed', 'Uncertain', 'Role', 'Gloss'],
        graph.nodes.map(function (n) {
          return [
            { text: n.displayTerm || n.term, cls: 'term' },
            n.languageName || '—',
            n.language || '—',
            n.reconstructed ? 'yes' : 'no',
            n.uncertain ? 'yes' : 'no',
            n.role,
            n.gloss || ''
          ];
        }))));

    container.appendChild(section('Edges (' + graph.edges.length + ')',
      table(['From (older)', 'To (newer)', 'Relationship', 'Uncertain', 'Evidence'],
        graph.edges.map(function (e) {
          return [
            e.from, e.to,
            e.relationship + (e.subtype ? ' · ' + e.subtype : ''),
            e.uncertain ? 'yes' : 'no',
            (e.sources.map(function (s) { return s.template ? '{{' + s.template + '}}' : 'page title'; })
              .join(', ')) + (e.inferredFrom ? ' — ' + e.inferredFrom : '')
          ];
        }))));

    var json = { entry: graph.entry, nodes: graph.nodes, edges: graph.edges, sources: source };
    var pre = el('pre', { 'class': 'raw' }, JSON.stringify(json, null, 2));
    container.appendChild(section('Normalized graph (JSON)', pre));
  }

  /* ------------------------------------------------------------------ *
   * Raw response
   * ------------------------------------------------------------------ */

  function renderRawResponse(container, result, graph) {
    container.innerHTML = '';
    var meta = el('p', { 'class': 'meta-line' });
    meta.appendChild(document.createTextNode('One request · ' + result.source.retrieved + ' · '));
    var code = el('code', null, result.source.api);
    meta.appendChild(code);
    container.appendChild(meta);

    if (graph && graph.wikitext) {
      container.appendChild(section('Etymology section as returned by the API',
        el('pre', { 'class': 'raw' }, graph.wikitext)));
    }
    container.appendChild(section('Full page wikitext (' +
      result.wikitext.length.toLocaleString() + ' characters)',
      el('pre', { 'class': 'raw' }, result.wikitext)));
  }

  /* ------------------------------------------------------------------ *
   * Notes / diagnostics
   * ------------------------------------------------------------------ */

  function renderNotes(container, graph, extra) {
    container.innerHTML = '';
    var all = (extra || []).concat(graph ? graph.diagnostics : []);
    if (!all.length) {
      container.appendChild(el('p', { 'class': 'empty' },
        'The parser understood everything it found in this section.'));
    } else {
      var ul = el('ul', { 'class': 'notes' });
      all.forEach(function (d) {
        var li = el('li', { 'data-level': d.level }, d.message + (d.detail ? ' ' + d.detail : ''));
        if (d.raw) li.appendChild(el('code', null, d.raw));
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }

    if (graph && graph.unparsed && graph.unparsed.length) {
      container.appendChild(section('Wikitext the parser could not turn into graph data',
        table(['Reason', 'Wikitext'], graph.unparsed.map(function (u) {
          return [u.reason, u.raw || ''];
        }))));
    }
  }

  function countNotes(graph) {
    if (!graph) return 0;
    return (graph.diagnostics || []).filter(function (d) { return d.level !== 'info'; }).length +
      (graph.unparsed || []).length;
  }

  global.ET.Render = {
    renderTree: renderTree,
    renderParsedData: renderParsedData,
    renderRawResponse: renderRawResponse,
    renderNotes: renderNotes,
    countNotes: countNotes,
    el: el
  };
})(typeof window !== 'undefined' ? window : globalThis);
