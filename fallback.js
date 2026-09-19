/* EtymoTree — fallback.js
 * ============================================================
 *  HARDCODED DEMONSTRATION DATA. NOT PART OF THE PARSER.
 * ============================================================
 * This exists for one reason: if the live page for "father" ever uses
 * syntax the parser cannot yet read, the UI can still be demonstrated.
 * It is NEVER used automatically. app.js offers it behind an explicit
 * button, and every graph produced here is flagged `fallback: true`
 * so it can never be mistaken for parsed output.
 */
(function (global) {
  'use strict';

  var CHAIN = [
    ['ine-pro', 'Proto-Indo-European', '*ph₂tḗr'],
    ['gem-pro', 'Proto-Germanic', '*fadēr'],
    ['gmw-pro', 'Proto-West Germanic', '*fader'],
    ['ang', 'Old English', 'fæder'],
    ['enm', 'Middle English', 'fader'],
    ['en', 'English', 'father']
  ];

  function fatherFallbackGraph() {
    var nodes = CHAIN.map(function (c, i) {
      return {
        id: c[0] + ':' + c[2],
        term: c[2],
        displayTerm: c[2],
        language: c[0],
        languageName: c[1],
        languageKnown: true,
        reconstructed: c[2].charAt(0) === '*',
        uncertain: false,
        role: i === CHAIN.length - 1 ? 'entry' : 'ancestor',
        gloss: null,
        sources: [{ template: null, raw: null, note: 'HARDCODED FALLBACK' }]
      };
    });
    var edges = [];
    for (var i = 0; i < CHAIN.length - 1; i++) {
      edges.push({
        from: nodes[i].id, to: nodes[i + 1].id, relationship: 'inherited',
        subtype: null, uncertain: false, inferredFrom: 'HARDCODED FALLBACK',
        note: null, sources: [{ template: null, raw: null, note: 'HARDCODED FALLBACK' }]
      });
    }
    ['*peh₂-', '*-tḗr'].forEach(function (t, i) {
      nodes.push({
        id: 'ine-pro:' + t, term: t, displayTerm: t,
        language: 'ine-pro', languageName: 'Proto-Indo-European',
        languageKnown: true, reconstructed: true, uncertain: true,
        role: 'component', gloss: i === 0 ? 'protect' : 'agent noun',
        sources: [{ template: null, raw: null, note: 'HARDCODED FALLBACK' }]
      });
      edges.push({
        from: 'ine-pro:' + t, to: 'ine-pro:*ph₂tḗr', relationship: 'component',
        subtype: 'affix', uncertain: true, inferredFrom: 'HARDCODED FALLBACK',
        note: null, sources: [{ template: null, raw: null, note: 'HARDCODED FALLBACK' }]
      });
    });

    return {
      fallback: true,
      entry: { term: 'father', language: 'en', languageName: 'English', nodeId: 'en:father', etymologyId: 'fallback' },
      etymologyId: 'fallback',
      etymologyTitle: 'Hardcoded fallback (not parsed)',
      nodes: nodes,
      edges: edges,
      wikitext: '',
      unparsed: [],
      diagnostics: [{
        level: 'warning',
        message: 'This tree is hardcoded demonstration data, not parser output. ' +
          'Nothing here came from the API response.'
      }]
    };
  }

  global.ET.Fallback = { available: { father: fatherFallbackGraph }, fatherFallbackGraph: fatherFallbackGraph };
})(typeof window !== 'undefined' ? window : globalThis);
