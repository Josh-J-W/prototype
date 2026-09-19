/* EtymoTree — wikitext.js
 * Generic, Wiktionary-agnostic wikitext utilities.
 * Knows about {{...}}, [[...]], <...> nesting. Knows nothing about etymology.
 */
(function (global) {
  'use strict';

  /**
   * Split a template argument string on a delimiter, but only at the TOP level.
   * Nesting respected: {{ }}, [[ ]], < > and HTML comments.
   * splitTopLevel("en|enm|{{l|en|a|b}}|x", "|") -> ["en","enm","{{l|en|a|b}}","x"]
   */
  function splitTopLevel(str, delim) {
    var out = [];
    var buf = '';
    var curly = 0, square = 0, angle = 0;
    var i = 0;
    delim = delim || '|';
    while (i < str.length) {
      var two = str.substr(i, 2);
      var four = str.substr(i, 4);
      if (four === '<!--') {                       // comment: skip wholesale
        var end = str.indexOf('-->', i);
        if (end === -1) { i = str.length; break; }
        i = end + 3;
        continue;
      }
      if (two === '{{') { curly++; buf += two; i += 2; continue; }
      if (two === '}}' && curly > 0) { curly--; buf += two; i += 2; continue; }
      if (two === '[[') { square++; buf += two; i += 2; continue; }
      if (two === ']]' && square > 0) { square--; buf += two; i += 2; continue; }
      var ch = str[i];
      if (ch === '<') { angle++; buf += ch; i++; continue; }
      if (ch === '>' && angle > 0) { angle--; buf += ch; i++; continue; }
      if (curly === 0 && square === 0 && angle === 0 &&
          str.substr(i, delim.length) === delim) {
        out.push(buf);
        buf = '';
        i += delim.length;
        continue;
      }
      buf += ch;
      i++;
    }
    out.push(buf);
    return out;
  }

  /**
   * Find all top-level templates in `text`, in document order.
   * Returns [{ name, args, positional, named, raw, start, end, balanced }]
   * Unbalanced "{{" is reported (balanced:false) rather than silently dropped.
   */
  function findTemplates(text) {
    var results = [];
    var i = 0;
    while (i < text.length) {
      if (text.substr(i, 2) !== '{{') { i++; continue; }
      var depth = 0;
      var start = i;
      var j = i;
      var closed = false;
      while (j < text.length) {
        if (text.substr(j, 2) === '{{') { depth++; j += 2; continue; }
        if (text.substr(j, 2) === '}}') {
          depth--;
          j += 2;
          if (depth === 0) { closed = true; break; }
          continue;
        }
        j++;
      }
      if (!closed) {
        results.push({
          name: null, args: [], positional: [], named: {},
          raw: text.slice(start), start: start, end: text.length, balanced: false
        });
        break;
      }
      var raw = text.slice(start, j);
      results.push(parseTemplate(raw, start, j));
      i = j;
    }
    return results;
  }

  /** Parse one raw "{{name|a|b|k=v}}" string into a structured template. */
  function parseTemplate(raw, start, end) {
    var inner = raw.replace(/^\{\{/, '').replace(/\}\}$/, '');
    var parts = splitTopLevel(inner, '|');
    var name = (parts.shift() || '').trim();
    var positional = [];
    var named = {};
    parts.forEach(function (p) {
      var eq = indexOfTopLevel(p, '=');
      if (eq > -1) {
        var key = p.slice(0, eq).trim();
        var val = p.slice(eq + 1);
        // Numeric named params ("2=foo") are really positional.
        if (/^\d+$/.test(key)) {
          positional[parseInt(key, 10) - 1] = val.trim();
        } else {
          named[key] = val.trim();
        }
      } else {
        positional.push(p.trim());
      }
    });
    return {
      name: name,
      args: parts,
      positional: positional,
      named: named,
      raw: raw,
      start: start,
      end: end,
      balanced: true
    };
  }

  function indexOfTopLevel(str, ch) {
    var curly = 0, square = 0, angle = 0;
    for (var i = 0; i < str.length; i++) {
      var two = str.substr(i, 2);
      if (two === '{{') { curly++; i++; continue; }
      if (two === '}}') { curly--; i++; continue; }
      if (two === '[[') { square++; i++; continue; }
      if (two === ']]') { square--; i++; continue; }
      if (str[i] === '<') { angle++; continue; }
      if (str[i] === '>' && angle > 0) { angle--; continue; }
      if (str[i] === ch && curly <= 0 && square <= 0 && angle <= 0) return i;
    }
    return -1;
  }

  /**
   * Parse the angle-bracket modifiers used by {{etymon}}: <id:x>, <unc>, <t:x>...
   * Returns { base, modifiers: [{key, value}] }
   */
  function parseAngleModifiers(token) {
    var mods = [];
    var base = token.replace(/<([^<>]*)>/g, function (_, body) {
      var idx = body.indexOf(':');
      if (idx === -1) mods.push({ key: body.trim(), value: true });
      else mods.push({ key: body.slice(0, idx).trim(), value: body.slice(idx + 1).trim() });
      return '';
    });
    return { base: base.trim(), modifiers: mods };
  }

  /** Strip links/formatting from a run of prose so connectives can be inspected. */
  function stripMarkup(text) {
    return String(text)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      .replace(/'{2,}/g, '')
      .replace(/<[^<>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  global.ET = global.ET || {};
  global.ET.Wikitext = {
    splitTopLevel: splitTopLevel,
    findTemplates: findTemplates,
    parseTemplate: parseTemplate,
    parseAngleModifiers: parseAngleModifiers,
    stripMarkup: stripMarkup,
    indexOfTopLevel: indexOfTopLevel
  };
})(typeof window !== 'undefined' ? window : globalThis);
