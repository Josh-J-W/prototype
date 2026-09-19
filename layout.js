/* EtymoTree — layout.js
 * Graph → rows, oldest at the top, the searched word at the bottom.
 * Purely structural: no Wiktionary knowledge, no DOM.
 */
(function (global) {
  'use strict';

  var LINEAGE = global.ET.Parser.LINEAGE_RELATIONSHIPS;

  function layoutGraph(graph) {
    var byId = {};
    graph.nodes.forEach(function (n) { byId[n.id] = n; });

    var lineageEdges = graph.edges.filter(function (e) {
      return LINEAGE[e.relationship] && byId[e.from] && byId[e.to];
    });

    var parents = {};   // node → nodes above it
    var children = {};  // node → nodes below it
    lineageEdges.forEach(function (e) {
      (parents[e.to] = parents[e.to] || []).push(e.from);
      (children[e.from] = children[e.from] || []).push(e.to);
    });

    // Which nodes are connected downward to the entry?
    var entryId = graph.entry.nodeId;
    var inTree = {};
    inTree[entryId] = true;
    (function mark(id, seen) {
      (parents[id] || []).forEach(function (p) {
        if (seen[p]) return;
        seen[p] = true;
        inTree[p] = true;
        mark(p, seen);
      });
    })(entryId, {});

    // Longest path from a root — guarantees components sit above their result.
    var levels = {};
    var cycles = [];
    function level(id, stack) {
      if (levels[id] != null) return levels[id];
      if (stack[id]) { cycles.push(id); return 0; }
      stack[id] = true;
      var ps = (parents[id] || []).filter(function (p) { return inTree[p]; });
      var lv = 0;
      ps.forEach(function (p) { lv = Math.max(lv, level(p, stack) + 1); });
      delete stack[id];
      levels[id] = lv;
      return lv;
    }
    Object.keys(inTree).forEach(function (id) { level(id, {}); });

    // The searched word always sits on the bottom row.
    var maxLevel = 0;
    Object.keys(levels).forEach(function (id) { maxLevel = Math.max(maxLevel, levels[id]); });
    levels[entryId] = Math.max(levels[entryId] || 0, maxLevel);
    maxLevel = levels[entryId];

    var rows = [];
    for (var i = 0; i <= maxLevel; i++) rows.push([]);
    graph.nodes.forEach(function (n) {
      if (!inTree[n.id]) return;
      rows[levels[n.id]].push(n);
    });

    var aside = graph.nodes.filter(function (n) { return !inTree[n.id]; });
    var asideEdges = graph.edges.filter(function (e) {
      return !LINEAGE[e.relationship] || !inTree[e.from] || !inTree[e.to];
    });

    return {
      rows: rows.filter(function (r) { return r.length; }),
      levels: levels,
      edges: lineageEdges,
      aside: aside,
      asideEdges: asideEdges,
      cycles: cycles
    };
  }

  global.ET.Layout = { layoutGraph: layoutGraph };
})(typeof window !== 'undefined' ? window : globalThis);
