/* EtymoTree — sections.js
 * Slicing a Wiktionary page's wikitext into language sections and
 * etymology subsections. No template knowledge here.
 */
(function (global) {
  'use strict';

  var HEADING_RE = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;

  /** All headings with their level and character span. */
  function findHeadings(wikitext) {
    var out = [];
    var m;
    HEADING_RE.lastIndex = 0;
    while ((m = HEADING_RE.exec(wikitext)) !== null) {
      out.push({
        level: m[1].length,
        title: m[2].trim(),
        start: m.index,
        bodyStart: m.index + m[0].length
      });
    }
    return out;
  }

  /**
   * Extract a level-2 language section, e.g. "English".
   * Returns { found, title, text, start, end, availableLanguages }
   */
  function extractLanguageSection(wikitext, languageName) {
    var headings = findHeadings(wikitext);
    var languages = headings.filter(function (h) { return h.level === 2; })
      .map(function (h) { return h.title; });
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      if (h.level !== 2) continue;
      if (h.title.toLowerCase() !== String(languageName).toLowerCase()) continue;
      var end = wikitext.length;
      for (var j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= 2) { end = headings[j].start; break; }
      }
      return {
        found: true,
        title: h.title,
        text: wikitext.slice(h.bodyStart, end),
        start: h.bodyStart,
        end: end,
        availableLanguages: languages
      };
    }
    return { found: false, title: languageName, text: '', availableLanguages: languages };
  }

  /**
   * Extract every "Etymology" / "Etymology 1" subsection of a language section.
   * Multiple etymologies are kept as separate structures, never merged.
   * Returns [{ id, title, index, text }]
   */
  function extractEtymologySections(languageText) {
    var headings = findHeadings(languageText);
    var out = [];
    headings.forEach(function (h, i) {
      var m = /^Etymology(?:\s+(\d+))?$/i.exec(h.title);
      if (!m) return;
      var end = languageText.length;
      for (var j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= h.level) { end = headings[j].start; break; }
      }
      var body = languageText.slice(h.bodyStart, end);
      // If this is an "Etymology N" container heading, its body may include
      // deeper headings (Noun, Verb...). Cut the body at the first deeper
      // heading so we only parse etymological prose.
      var inner = findHeadings(body);
      if (inner.length) body = body.slice(0, inner[0].start);
      out.push({
        id: m[1] ? 'etymology-' + m[1] : 'etymology-' + (out.length + 1),
        title: h.title,
        index: out.length,
        text: body.trim()
      });
    });
    return out;
  }

  global.ET = global.ET || {};
  global.ET.Sections = {
    findHeadings: findHeadings,
    extractLanguageSection: extractLanguageSection,
    extractEtymologySections: extractEtymologySections
  };
})(typeof window !== 'undefined' ? window : globalThis);
