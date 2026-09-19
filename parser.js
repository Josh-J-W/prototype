/* EtymoTree — parser.js
 * Layer 2: turn Wiktionary wikitext into a normalized etymological graph.
 * Nothing in here touches the network or the DOM.
 *
 * Guiding rule: if a piece of syntax is not understood, it goes into
 * `diagnostics` and `unparsed`. It never becomes a silently invented edge.
 */
(function (global) {
  'use strict';

  var W = global.ET.Wikitext;
  var L = global.ET.Languages;

  /* ------------------------------------------------------------------ *
   * Template classification
   * ------------------------------------------------------------------ */

  // {{inh|en|enm|fader}} style: positional 1 = entry lang, 2 = source lang, 3 = term
  var DERIVATION_TEMPLATES = {
    inh: ['inherited', null], 'inh+': ['inherited', null], inherited: ['inherited', null],
    bor: ['borrowed', null], 'bor+': ['borrowed', null], borrowed: ['borrowed', null],
    lbor: ['borrowed', 'learned'], 'learned borrowing': ['borrowed', 'learned'],
    slbor: ['borrowed', 'semi-learned'],
    'semantic loan': ['borrowed', 'semantic-loan'], sl: ['borrowed', 'semantic-loan'],
    der: ['derived', null], 'der+': ['derived', null], derived: ['derived', null],
    uder: ['derived', 'ultimately'],
    cal: ['derived', 'calque'], calq: ['derived', 'calque'],
    calque: ['derived', 'calque'], clq: ['derived', 'calque'],
    'partial calque': ['derived', 'partial-calque'],
    'phono-semantic matching': ['derived', 'phono-semantic-matching'],
    psm: ['derived', 'phono-semantic-matching'],
    onomatopoeic: ['derived', 'onomatopoeic']
  };

  // {{af|ine-pro|*peh₂-|*-tḗr}} style: positional 1 = lang, rest = components
  var AFFIX_TEMPLATES = {
    af: 'affix', affix: 'affix', com: 'compound', compound: 'compound',
    suf: 'suffix', suffix: 'suffix', pre: 'prefix', prefix: 'prefix',
    con: 'confix', confix: 'confix', circumfix: 'circumfix', infix: 'infix',
    blend: 'blend', univ: 'univerbation', univerbation: 'univerbation'
  };

  // Equivalent / surface analyses: NOT real historical components.
  var SURFACE_TEMPLATES = { surf: 'surface-analysis', 'surface analysis': 'surface-analysis' };

  // {{doublet|en|ayr|faeder}} / {{cog|is|faðir}} — never part of the lineage.
  var RELATED_TEMPLATES = {
    doublet: 'doublet', dbt: 'doublet',
    cog: 'cognate', cognate: 'cognate', cogn: 'cognate',
    noncog: 'non-cognate', ncog: 'non-cognate',
    'false cognate': 'false-cognate'
  };

  // Bare mentions. Only joined to the chain when the prose connective says so.
  var MENTION_TEMPLATES = { m: 1, 'm+': 1, l: 1, mention: 1, link: 1, 'm-self': 1 };

  // Recognized but deliberately not turned into graph structure.
  var IGNORED_TEMPLATES = {
    root: 'categorization template, not an immediate etymon',
    etydate: 'dating template',
    etystub: 'stub marker',
    rfe: 'request for etymology',
    unk: 'explicitly unknown origin',
    unc: 'explicitly uncertain origin',
    attn: 'editorial marker', senseid: 'anchor', anchor: 'anchor',
    ipachar: 'formatting', w: 'wikipedia link', wikipedia: 'sister link',
    'nowrap': 'formatting', q: 'qualifier', qualifier: 'qualifier',
    gloss: 'gloss', sense: 'sense label', ref: 'reference', 'R:': 'reference'
  };

  /* {{etymon}} keywords (both the ":kw" and bare "kw" spellings are accepted). */
  var ETYMON_DERIVATION_KEYWORDS = {
    from: ['derived', 'unspecified'],
    der: ['derived', null],
    bor: ['borrowed', null],
    lbor: ['borrowed', 'learned'],
    slbor: ['borrowed', 'semi-learned'],
    inh: ['inherited', null],
    calque: ['derived', 'calque'],
    cal: ['derived', 'calque'],
    influence: ['related', 'influence'],
    af: ['component', null],
    afeq: ['related', 'equivalent-affix']
  };
  var ETYMON_CONFIDENCE_KEYWORDS = { conf: false, unc: true };

  /* ------------------------------------------------------------------ *
   * Node helpers
   * ------------------------------------------------------------------ */

  function makeNodeId(lang, term) {
    return (lang || '??') + ':' + (term || '?');
  }

  function isReconstructedTerm(term, lang) {
    if (!term) return false;
    if (term.charAt(0) === '*') return true;
    return L.isReconstructedLanguage(lang);
  }

  function makeNode(lang, term, opts) {
    opts = opts || {};
    var cleanTerm = String(term || '').trim();
    var uncertain = !!opts.uncertain;
    if (/\?$/.test(cleanTerm)) {            // "*peh₂-?" — trailing question mark
      cleanTerm = cleanTerm.replace(/\?+$/, '');
      uncertain = true;
    }
    var resolved = L.resolve(lang);
    var reconstructed = isReconstructedTerm(cleanTerm, lang);
    return {
      id: makeNodeId(lang, cleanTerm),
      term: cleanTerm,
      displayTerm: reconstructed && cleanTerm.charAt(0) !== '*' ? '*' + cleanTerm : cleanTerm,
      language: lang || null,
      languageName: resolved.name,
      languageKnown: resolved.known,
      reconstructed: reconstructed,
      uncertain: uncertain,
      role: opts.role || 'unknown',
      gloss: opts.gloss || null,
      etymologyId: opts.etymologyId || null,
      sources: opts.source ? [opts.source] : []
    };
  }

  function makeEdge(from, to, relationship, opts) {
    opts = opts || {};
    return {
      from: from,
      to: to,
      relationship: relationship,
      subtype: opts.subtype || null,
      uncertain: !!opts.uncertain,
      inferredFrom: opts.inferredFrom || null,
      note: opts.note || null,
      sources: opts.source ? [opts.source] : []
    };
  }

  function sourceOf(tpl, extra) {
    var s = { template: tpl.name, raw: tpl.raw, offset: tpl.start };
    if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
    return s;
  }

  /* ------------------------------------------------------------------ *
   * Prose connectives
   * ------------------------------------------------------------------ */

  var FROM_WORDS = /\b(from|via|through|borrowed from|inherited from|derived from|descend(?:s|ed)? from)\b/i;
  var BREAK_WORDS = /\b(compare|cognate|cognates?\s+with|akin to|unrelated|see also|not to be confused|displaced|doublet of|whence|equivalent to)\b/i;
  var HEDGE_WORDS = /\b(possibly|perhaps|probably|apparently|maybe|might|may be|uncertain|disputed|of unclear|likely)\b/i;
  var ULTIMATELY = /\bultimately\b/i;

  /** Decide what a run of prose between two templates means. */
  function analyzeConnective(raw) {
    var text = W.stripMarkup(raw || '');
    // Only the clause after the last sentence break governs the next template.
    var lastBreak = Math.max(text.lastIndexOf('.'), text.lastIndexOf(';'));
    var clause = lastBreak >= 0 ? text.slice(lastBreak + 1) : text;
    return {
      text: text,
      clause: clause.trim(),
      continues: FROM_WORDS.test(clause) && !BREAK_WORDS.test(clause),
      hedged: HEDGE_WORDS.test(clause),
      ultimately: ULTIMATELY.test(clause),
      broken: BREAK_WORDS.test(clause)
    };
  }

  /* ------------------------------------------------------------------ *
   * Individual template parsers
   * ------------------------------------------------------------------ */

  function termFromDerivationTemplate(tpl) {
    var t = tpl.positional[2];
    if (!t || t === '-') t = tpl.positional[3] || '';
    if (!t || t === '-') t = tpl.named.alt || '';
    return t.trim();
  }

  function glossFromTemplate(tpl, idx) {
    return tpl.named.t || tpl.named.gloss ||
      (idx != null ? (tpl.named['t' + idx] || tpl.named['gloss' + idx]) : null) ||
      tpl.positional[4] || null;
  }

  /** {{inh|en|enm|fader}} → { language, term, relationship, subtype } */
  function parseDerivationTemplate(tpl) {
    var spec = DERIVATION_TEMPLATES[tpl.name];
    return {
      entryLanguage: tpl.positional[0] || null,
      language: tpl.positional[1] || null,
      term: termFromDerivationTemplate(tpl),
      gloss: glossFromTemplate(tpl),
      relationship: spec[0],
      subtype: spec[1]
    };
  }

  /** "la:pater" or "pater" inside an affix template. */
  function splitLangPrefixed(token, defaultLang) {
    var m = /^([a-z][a-z0-9]{1,3}(?:-[a-z]{2,4})*):(.+)$/.exec(token);
    if (m && L.looksLikeCode(m[1])) return { language: m[1], term: m[2] };
    return { language: defaultLang, term: token };
  }

  /** {{af|ine-pro|*peh₂-|*-tḗr}} → list of component parts */
  function parseAffixTemplate(tpl) {
    var lang = tpl.positional[0] || null;
    var parts = [];
    for (var i = 1; i < tpl.positional.length; i++) {
      var tok = (tpl.positional[i] || '').trim();
      if (!tok || tok === '-') continue;
      var s = splitLangPrefixed(tok, lang);
      parts.push({
        language: s.language,
        term: s.term,
        gloss: tpl.named['t' + i] || tpl.named['gloss' + i] || null
      });
    }
    return { language: lang, parts: parts, kind: AFFIX_TEMPLATES[tpl.name] || 'affix' };
  }

  /**
   * {{etymon}} — supports BOTH documented syntaxes:
   *   new: {{etymon|en|:inh|enm:fader<id:father>|id=male parent}}
   *   old: {{etymon|en|id=male parent|inh|enm>fader>father}}
   * Returns { language, id, title, tree, etymons: [...], warnings: [] }
   */
  function parseEtymon(tpl) {
    var warnings = [];
    var lang = tpl.positional[0] || null;
    var state = { relationship: 'derived', subtype: 'unspecified', keyword: 'from', uncertain: false };
    var etymons = [];

    for (var i = 1; i < tpl.positional.length; i++) {
      var tok = (tpl.positional[i] || '').trim();
      if (!tok) continue;
      var kw = tok.replace(/^:/, '').trim().toLowerCase();

      if (ETYMON_DERIVATION_KEYWORDS.hasOwnProperty(kw)) {
        var d = ETYMON_DERIVATION_KEYWORDS[kw];
        state.relationship = d[0];
        state.subtype = d[1];
        state.keyword = kw;
        state.uncertain = false;       // a derivation keyword resets confidence
        continue;
      }
      if (ETYMON_CONFIDENCE_KEYWORDS.hasOwnProperty(kw)) {
        state.uncertain = ETYMON_CONFIDENCE_KEYWORDS[kw];
        continue;
      }
      if (/^[a-z]+$/.test(kw) && tok.charAt(0) === ':') {
        warnings.push('Unknown {{etymon}} keyword ":' + kw + '" — ignored.');
        continue;
      }

      var parsed = parseEtymonSpec(tok, lang, warnings);
      if (!parsed) continue;
      etymons.push({
        language: parsed.language,
        term: parsed.term,
        id: parsed.id,
        gloss: parsed.gloss,
        languageAssumed: parsed.languageAssumed,
        uncertain: state.uncertain || parsed.uncertain,
        relationship: state.relationship,
        subtype: state.subtype,
        keyword: state.keyword,
        order: etymons.length
      });
    }

    return {
      language: lang,
      id: tpl.named.id || null,
      title: tpl.named.title || null,
      tree: tpl.named.tree || null,
      etymons: etymons,
      warnings: warnings
    };
  }

  /** One etymon token: "enm:fader<id:father>" or "enm>fader>father" or "*-tḗr<unc>". */
  function parseEtymonSpec(token, defaultLang, warnings) {
    var am = W.parseAngleModifiers(token);
    var base = am.base;
    var mods = {};
    am.modifiers.forEach(function (m) { mods[m.key.toLowerCase()] = m.value; });

    var language = null, term = null, id = mods.id || null, assumed = false;

    if (W.indexOfTopLevel(base, '>') > -1) {
      // Old ">" syntax: lang>term>id, lang>term, or term>id
      var parts = W.splitTopLevel(base, '>').map(function (p) { return p.trim(); });
      if (parts.length >= 3) {
        language = parts[0]; term = parts[1]; id = id || parts[2];
      } else if (parts.length === 2) {
        if (L.looksLikeCode(parts[0])) { language = parts[0]; term = parts[1]; }
        else { language = defaultLang; term = parts[0]; id = id || parts[1]; assumed = true; }
      } else {
        language = defaultLang; term = parts[0]; assumed = true;
      }
    } else {
      var m = /^([a-z][a-z0-9]{1,3}(?:-[a-z]{2,4})*):(.+)$/.exec(base);
      if (m && L.looksLikeCode(m[1])) { language = m[1]; term = m[2]; }
      else { language = defaultLang; term = base; assumed = true; }
    }

    term = (term || '').trim();
    if (!term) {
      warnings.push('Could not read a term from {{etymon}} argument "' + token + '".');
      return null;
    }
    if (!language) warnings.push('No language code for {{etymon}} argument "' + token + '".');

    return {
      language: language,
      term: term,
      id: id,
      gloss: mods.t || mods.gloss || null,
      uncertain: mods.hasOwnProperty('unc'),
      languageAssumed: assumed
    };
  }

  /* ------------------------------------------------------------------ *
   * Etymology section → graph
   * ------------------------------------------------------------------ */

  /**
   * Build one graph for one etymology section.
   * @param {object} ctx { term, language, etymologyId, text }
   */
  function buildGraphFromEtymology(ctx) {
    var nodes = {};
    var edges = [];
    var diagnostics = [];
    var unparsed = [];

    function note(level, message, extra) {
      var d = { level: level, message: message };
      if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
      diagnostics.push(d);
    }

    function addNode(node) {
      var existing = nodes[node.id];
      if (!existing) { nodes[node.id] = node; return node; }
      // merge: flags are OR-ed, conflicts are reported rather than hidden
      if (node.uncertain !== existing.uncertain) {
        note('info', 'Sources disagree about the certainty of ' + node.id + '; keeping "uncertain".');
        existing.uncertain = true;
      }
      if (!existing.gloss && node.gloss) existing.gloss = node.gloss;
      existing.sources = existing.sources.concat(node.sources);
      return existing;
    }

    function addEdge(edge) {
      var dup = edges.filter(function (e) {
        return e.from === edge.from && e.to === edge.to && e.relationship === edge.relationship;
      })[0];
      if (dup) { dup.sources = dup.sources.concat(edge.sources); return dup; }
      edges.push(edge);
      return edge;
    }

    // The searched word itself.
    var entryNode = addNode(makeNode(ctx.language, ctx.term, {
      role: 'entry',
      etymologyId: ctx.etymologyId,
      source: { template: null, raw: null, offset: null, note: 'page title' }
    }));

    var templates = W.findTemplates(ctx.text);
    if (!templates.length) {
      note('warning', 'No templates found in this etymology section; only prose is present.');
    }

    var chainTail = entryNode;          // newest node still awaiting an ancestor
    var chainNodes = [entryNode];       // lineage nodes in newest→oldest order
    var prevEnd = 0;

    templates.forEach(function (tpl) {
      var connectiveRaw = ctx.text.slice(prevEnd, tpl.start);
      var conn = analyzeConnective(connectiveRaw);
      prevEnd = tpl.end;

      if (!tpl.balanced) {
        note('error', 'Unbalanced template braces; stopped scanning here.', { raw: tpl.raw.slice(0, 120) });
        unparsed.push({ reason: 'unbalanced-template', raw: tpl.raw.slice(0, 200) });
        return;
      }

      var name = tpl.name.toLowerCase();

      /* --- {{etymon}} ------------------------------------------------ */
      if (name === 'etymon') {
        var ety = parseEtymon(tpl);
        ety.warnings.forEach(function (w) { note('warning', w, { raw: tpl.raw }); });
        if (!ety.etymons.length) {
          note('info', '{{etymon}} present but lists no etymons (it may only set an anchor/ID).',
            { raw: tpl.raw });
        }
        // {{etymon|1=}} names the language of the term the etymons belong to.
        // Usually that is the entry itself, but an etymon block for another
        // language (e.g. on a reconstruction page) anchors elsewhere.
        var anchor = null;
        if (ety.language === entryNode.language) {
          anchor = entryNode;
        } else {
          if (ety.title && nodes[makeNodeId(ety.language, ety.title)]) {
            anchor = nodes[makeNodeId(ety.language, ety.title)];
          } else {
            for (var ai = 0; ai < chainNodes.length; ai++) {
              if (chainNodes[ai].language === ety.language) { anchor = chainNodes[ai]; break; }
            }
          }
        }
        if (!anchor) {
          note('warning', '{{etymon}} is written for ' + (ety.language || 'an unstated language') +
            ', but no term of that language appears in this etymology. Its etymons were recorded ' +
            'as nodes but left unattached rather than guessing where they belong.', { raw: tpl.raw });
          unparsed.push({ reason: 'etymon-anchor-not-found', language: ety.language, raw: tpl.raw });
        }
        ety.etymons.forEach(function (e) {
          if (e.languageAssumed) {
            note('info', 'No language code on {{etymon}} term "' + e.term +
              '"; assumed ' + (e.language || 'unknown') + ' as documented.');
          }
          var n = addNode(makeNode(e.language, e.term, {
            uncertain: e.uncertain,
            gloss: e.gloss || e.id,
            source: sourceOf(tpl, { keyword: e.keyword })
          }));
          if (!anchor) return;
          addEdge(makeEdge(n.id, anchor.id, e.relationship, {
            subtype: e.subtype,
            uncertain: e.uncertain,
            source: sourceOf(tpl, { keyword: e.keyword })
          }));
        });
        return;
      }

      /* --- {{inh}} / {{bor}} / {{der}} … ----------------------------- */
      if (DERIVATION_TEMPLATES[name]) {
        var d = parseDerivationTemplate(tpl);
        if (!d.language) {
          note('error', 'Derivation template {{' + name + '}} has no source language code.', { raw: tpl.raw });
          unparsed.push({ reason: 'missing-language', raw: tpl.raw });
          return;
        }
        if (!d.term) {
          note('warning', '{{' + name + '}} names a language but no term; node skipped.', { raw: tpl.raw });
          unparsed.push({ reason: 'missing-term', raw: tpl.raw });
          return;
        }
        var node = addNode(makeNode(d.language, d.term, {
          uncertain: conn.hedged,
          gloss: d.gloss,
          source: sourceOf(tpl, { connective: conn.clause })
        }));
        if (!node.languageKnown) {
          note('info', 'Unrecognized language code "' + d.language + '"; showing the code itself.');
        }
        if (conn.continues || chainTail === entryNode && conn.text === '') {
          addEdge(makeEdge(node.id, chainTail.id, d.relationship, {
            subtype: d.subtype || (conn.ultimately ? 'ultimately' : null),
            uncertain: conn.hedged,
            note: conn.ultimately ? 'prose says "ultimately" — intermediate steps may be omitted' : null,
            inferredFrom: conn.clause ? 'prose connective: "' + conn.clause + '"' : 'template order',
            source: sourceOf(tpl)
          }));
          chainTail = node;
          chainNodes.unshift(node);
        } else {
          note('warning', 'Could not tell how ' + node.id +
            ' attaches to the lineage (connective: "' + (conn.clause || '∅') +
            '"); left out of the main chain.', { raw: tpl.raw });
          node.role = 'related';
          addEdge(makeEdge(entryNode.id, node.id, 'related', {
            subtype: 'unattached-' + d.relationship,
            inferredFrom: 'template present but no linking prose',
            source: sourceOf(tpl)
          }));
        }
        return;
      }

      /* --- {{af}} / {{compound}} … ----------------------------------- */
      if (AFFIX_TEMPLATES[name]) {
        var af = parseAffixTemplate(tpl);
        if (!af.parts.length) {
          note('warning', '{{' + name + '}} has no readable components.', { raw: tpl.raw });
          unparsed.push({ reason: 'empty-affix', raw: tpl.raw });
          return;
        }
        // Components belong to the most recent lineage node of the same language.
        var target = null;
        for (var i = 0; i < chainNodes.length; i++) {
          if (chainNodes[i].language === af.language) { target = chainNodes[i]; break; }
        }
        if (!target) {
          target = chainTail;
          note('warning', '{{' + name + '}} is in ' + (af.language || 'an unstated language') +
            ' but no lineage node of that language was found; attached its components to ' +
            target.id + '. Verify this.', { raw: tpl.raw });
        }
        af.parts.forEach(function (p) {
          var cn = addNode(makeNode(p.language, p.term, {
            uncertain: conn.hedged,
            gloss: p.gloss,
            source: sourceOf(tpl, { componentOf: target.id })
          }));
          addEdge(makeEdge(cn.id, target.id, 'component', {
            subtype: af.kind,
            uncertain: conn.hedged,
            inferredFrom: conn.clause ? 'prose connective: "' + conn.clause + '"' : null,
            source: sourceOf(tpl)
          }));
        });
        return;
      }

      /* --- {{surf}}: equivalent analysis, not real components -------- */
      if (SURFACE_TEMPLATES[name]) {
        var surf = parseAffixTemplate(tpl);
        surf.parts.forEach(function (p) {
          var sn = addNode(makeNode(p.language, p.term, {
            role: 'related', gloss: p.gloss, source: sourceOf(tpl)
          }));
          addEdge(makeEdge(entryNode.id, sn.id, 'related', {
            subtype: 'surface-analysis',
            note: 'synchronic analysis, not a historical component',
            source: sourceOf(tpl)
          }));
        });
        return;
      }

      /* --- {{doublet}} / {{cog}} ------------------------------------- */
      if (RELATED_TEMPLATES[name]) {
        var kind = RELATED_TEMPLATES[name];
        var relLang = tpl.positional[0] || null;
        var terms = [];
        if (kind === 'doublet') {
          for (var k = 1; k < tpl.positional.length; k++) {
            if (tpl.positional[k]) terms.push({ language: relLang, term: tpl.positional[k] });
          }
        } else {
          if (tpl.positional[1]) terms.push({ language: relLang, term: tpl.positional[1] });
        }
        if (!terms.length) {
          note('info', '{{' + name + '}} had no readable terms.', { raw: tpl.raw });
          return;
        }
        terms.forEach(function (t) {
          var rn = addNode(makeNode(t.language, t.term, {
            role: 'related', source: sourceOf(tpl)
          }));
          addEdge(makeEdge(entryNode.id, rn.id, 'related', {
            subtype: kind,
            note: 'not an ancestor — kept out of the vertical lineage',
            source: sourceOf(tpl)
          }));
        });
        return;
      }

      /* --- bare mentions --------------------------------------------- */
      if (MENTION_TEMPLATES[name]) {
        if (!conn.continues) {
          note('info', 'Mention {{' + name + '}} with no derivational prose; not added to the graph.',
            { raw: tpl.raw });
          return;
        }
        var ml = tpl.positional[0] || null;
        var mt = (tpl.positional[1] || tpl.positional[2] || '').trim();
        if (!ml || !mt) {
          note('warning', 'Mention template could not be read.', { raw: tpl.raw });
          unparsed.push({ reason: 'unreadable-mention', raw: tpl.raw });
          return;
        }
        var mn = addNode(makeNode(ml, mt, {
          uncertain: conn.hedged, source: sourceOf(tpl)
        }));
        addEdge(makeEdge(mn.id, chainTail.id, 'derived', {
          subtype: 'unspecified',
          uncertain: conn.hedged,
          inferredFrom: 'prose connective only ("' + conn.clause + '") — {{' + name +
            '}} states no relationship type',
          source: sourceOf(tpl)
        }));
        chainTail = mn;
        chainNodes.unshift(mn);
        return;
      }

      /* --- known-but-ignored ----------------------------------------- */
      if (IGNORED_TEMPLATES[name] || /^r:/i.test(tpl.name)) {
        note('info', 'Skipped {{' + tpl.name + '}} (' +
          (IGNORED_TEMPLATES[name] || 'reference template') + ').');
        return;
      }

      /* --- genuinely unknown ------------------------------------------ */
      note('warning', 'Unsupported template {{' + tpl.name + '}} — not represented in the graph.',
        { raw: tpl.raw });
      unparsed.push({ reason: 'unsupported-template', template: tpl.name, raw: tpl.raw });
    });

    var graph = normalizeGraph(entryNode, nodes, edges);
    graph.diagnostics = diagnostics;
    graph.unparsed = unparsed;
    graph.prose = W.stripMarkup(ctx.text);
    return graph;
  }

  /* ------------------------------------------------------------------ *
   * Normalization
   * ------------------------------------------------------------------ */

  var LINEAGE_RELATIONSHIPS = { inherited: 1, borrowed: 1, derived: 1, component: 1 };

  function normalizeGraph(entryNode, nodeMap, edges) {
    var nodes = Object.keys(nodeMap).map(function (k) { return nodeMap[k]; });

    nodes.forEach(function (n) {
      if (n.id === entryNode.id) { n.role = 'entry'; return; }
      var outgoing = edges.filter(function (e) { return e.from === n.id; });
      var lineage = outgoing.filter(function (e) { return LINEAGE_RELATIONSHIPS[e.relationship]; });
      if (!lineage.length) { n.role = n.role === 'unknown' ? 'related' : n.role; return; }
      var onlyComponent = lineage.every(function (e) { return e.relationship === 'component'; });
      n.role = onlyComponent ? 'component' : 'ancestor';
    });

    return {
      entry: {
        term: entryNode.term,
        language: entryNode.language,
        languageName: entryNode.languageName,
        nodeId: entryNode.id,
        etymologyId: entryNode.etymologyId
      },
      nodes: nodes,
      edges: edges
    };
  }

  /* ------------------------------------------------------------------ *
   * Public entry point
   * ------------------------------------------------------------------ */

  /**
   * @param {string} wikitext  raw page wikitext
   * @param {object} opts      { term, languageSection: 'English', languageCode: 'en' }
   * @returns {object} { ok, entry, etymologies: [graph], diagnostics }
   */
  function parsePage(wikitext, opts) {
    opts = opts || {};
    var S = global.ET.Sections;
    var languageSection = opts.languageSection || 'English';
    var languageCode = opts.languageCode || 'en';
    var diagnostics = [];

    if (!wikitext || !wikitext.trim()) {
      return {
        ok: false,
        etymologies: [],
        diagnostics: [{ level: 'error', message: 'The API returned no wikitext for this page.' }]
      };
    }

    var section = S.extractLanguageSection(wikitext, languageSection);
    if (!section.found) {
      return {
        ok: false,
        etymologies: [],
        availableLanguages: section.availableLanguages,
        diagnostics: [{
          level: 'error',
          message: 'No ==' + languageSection + '== section on this page.',
          detail: section.availableLanguages.length
            ? 'Sections present: ' + section.availableLanguages.join(', ')
            : 'No level-2 language headings were found at all.'
        }]
      };
    }

    var sections = S.extractEtymologySections(section.text);
    if (!sections.length) {
      return {
        ok: false,
        etymologies: [],
        availableLanguages: section.availableLanguages,
        diagnostics: [{
          level: 'error',
          message: 'The ' + languageSection + ' section has no ===Etymology=== subsection.'
        }]
      };
    }
    if (sections.length > 1) {
      diagnostics.push({
        level: 'info',
        message: sections.length + ' separate etymologies found; each is parsed on its own and none are merged.'
      });
    }

    var graphs = sections.map(function (s) {
      var g = buildGraphFromEtymology({
        term: opts.term,
        language: languageCode,
        etymologyId: s.id,
        text: s.text
      });
      g.etymologyId = s.id;
      g.etymologyTitle = s.title;
      g.wikitext = s.text;
      return g;
    });

    return {
      ok: true,
      languageSection: languageSection,
      availableLanguages: section.availableLanguages,
      etymologies: graphs,
      diagnostics: diagnostics
    };
  }

  global.ET.Parser = {
    parsePage: parsePage,
    buildGraphFromEtymology: buildGraphFromEtymology,
    parseEtymon: parseEtymon,
    parseEtymonSpec: parseEtymonSpec,
    parseDerivationTemplate: parseDerivationTemplate,
    parseAffixTemplate: parseAffixTemplate,
    analyzeConnective: analyzeConnective,
    normalizeGraph: normalizeGraph,
    makeNode: makeNode,
    LINEAGE_RELATIONSHIPS: LINEAGE_RELATIONSHIPS
  };
})(typeof window !== 'undefined' ? window : globalThis);
