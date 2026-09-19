/* EtymoTree — api.js
 * Layer 1: fetching only. One request per search, no follow-up calls for
 * ancestor pages. This file must never contain parsing logic.
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://en.wiktionary.org/w/api.php';

  function buildUrl(page) {
    return ENDPOINT +
      '?action=parse' +
      '&page=' + encodeURIComponent(page) +
      '&prop=wikitext' +
      '&format=json' +
      '&formatversion=2' +
      '&redirects=1' +
      '&origin=*';
  }

  /**
   * @returns {Promise<{ok, page, title, pageid, wikitext, source}>}
   * Rejected states are returned as objects, not thrown, so the UI can show them.
   */
  function fetchWiktionaryPage(page) {
    var url = buildUrl(page);
    var retrieved = new Date().toISOString();
    var source = {
      provider: 'Wiktionary',
      wiki: 'en.wiktionary.org',
      page: page,
      api: url,
      retrieved: retrieved,
      requestCount: 1
    };

    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) {
          return { ok: false, source: source, error: { code: 'http-' + res.status,
            message: 'Wiktionary returned HTTP ' + res.status + ' ' + res.statusText } };
        }
        return res.json().then(function (json) {
          if (json.error) {
            var code = json.error.code;
            return { ok: false, source: source, error: {
              code: code,
              message: code === 'missingtitle'
                ? 'Wiktionary has no page called "' + page + '".'
                : (json.error.info || 'The API reported an error.')
            } };
          }
          var parse = json.parse || {};
          // formatversion=2 returns wikitext as a string; version 1 as {"*": "..."}
          var wikitext = typeof parse.wikitext === 'string'
            ? parse.wikitext
            : (parse.wikitext && parse.wikitext['*']) || '';
          if (!wikitext) {
            return { ok: false, source: source, raw: json, error: {
              code: 'empty-wikitext',
              message: 'The response contained no wikitext.' } };
          }
          return {
            ok: true,
            page: page,
            title: parse.title || page,
            pageid: parse.pageid || null,
            wikitext: wikitext,
            raw: json,
            source: source
          };
        });
      })
      .catch(function (err) {
        return { ok: false, source: source, error: {
          code: 'network',
          message: 'The request could not be completed: ' + err.message +
            '. If you opened this file directly from disk, serve it over http instead.'
        } };
      });
  }

  global.ET = global.ET || {};
  global.ET.Api = { fetchWiktionaryPage: fetchWiktionaryPage, buildUrl: buildUrl };
})(typeof window !== 'undefined' ? window : globalThis);
