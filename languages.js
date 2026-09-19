/* EtymoTree — languages.js
 * Display-only mapping from Wiktionary language codes to readable names.
 * The code itself is always preserved on the node; this file only supplies a label.
 * If a code is unknown, the code is returned unchanged and a diagnostic is raised
 * by the caller — we never guess a language for a missing code.
 */
(function (global) {
  'use strict';

  var NAMES = {
    // Modern English and its ancestors
    en: 'English', enm: 'Middle English', ang: 'Old English',
    'gmw-pro': 'Proto-West Germanic', 'gem-pro': 'Proto-Germanic',
    'ine-pro': 'Proto-Indo-European',
    // Germanic
    de: 'German', goh: 'Old High German', gmh: 'Middle High German',
    nl: 'Dutch', dum: 'Middle Dutch', odt: 'Old Dutch',
    nds: 'Low German', gml: 'Middle Low German', osx: 'Old Saxon',
    fy: 'West Frisian', ofs: 'Old Frisian', frk: 'Frankish',
    da: 'Danish', sv: 'Swedish', no: 'Norwegian', nb: 'Norwegian Bokmål',
    nn: 'Norwegian Nynorsk', is: 'Icelandic', fo: 'Faroese',
    non: 'Old Norse', got: 'Gothic',
    // Italic / Romance
    la: 'Latin', 'itc-pro': 'Proto-Italic', 'la-lat': 'Late Latin',
    'VL.': 'Vulgar Latin', fr: 'French', fro: 'Old French', frm: 'Middle French',
    it: 'Italian', es: 'Spanish', osp: 'Old Spanish', pt: 'Portuguese',
    ca: 'Catalan', ro: 'Romanian', oc: 'Occitan', an: 'Aragonese',
    // Hellenic
    grc: 'Ancient Greek', el: 'Greek', gkm: 'Byzantine Greek',
    'grk-pro': 'Proto-Hellenic',
    // Celtic
    ga: 'Irish', sga: 'Old Irish', mga: 'Middle Irish', gd: 'Scottish Gaelic',
    cy: 'Welsh', br: 'Breton', 'cel-pro': 'Proto-Celtic',
    // Balto-Slavic
    ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', cs: 'Czech', sk: 'Slovak',
    bg: 'Bulgarian', sh: 'Serbo-Croatian', sl: 'Slovene',
    cu: 'Old Church Slavonic', 'sla-pro': 'Proto-Slavic',
    lt: 'Lithuanian', lv: 'Latvian', 'bat-pro': 'Proto-Baltic',
    'bsl-pro': 'Proto-Balto-Slavic',
    // Indo-Iranian
    sa: 'Sanskrit', pi: 'Pali', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali',
    fa: 'Persian', pal: 'Middle Persian', peo: 'Old Persian', ae: 'Avestan',
    'iir-pro': 'Proto-Indo-Iranian', 'ira-pro': 'Proto-Iranian',
    'inc-pro': 'Proto-Indo-Aryan',
    // Other Indo-European
    hy: 'Armenian', xcl: 'Old Armenian', sq: 'Albanian',
    xto: 'Tocharian A', txb: 'Tocharian B', hit: 'Hittite',
    // Non-Indo-European frequently cited in English etymologies
    ar: 'Arabic', he: 'Hebrew', arc: 'Aramaic', akk: 'Akkadian',
    'sem-pro': 'Proto-Semitic', tr: 'Turkish', ota: 'Ottoman Turkish',
    fi: 'Finnish', et: 'Estonian', hu: 'Hungarian', eu: 'Basque',
    ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ms: 'Malay',
    sw: 'Swahili', nv: 'Navajo', haw: 'Hawaiian', mi: 'Maori',
    'alg-pro': 'Proto-Algonquian'
  };

  // Family prefixes used to expand unknown "xxx-pro" reconstructed codes.
  var FAMILIES = {
    ine: 'Indo-European', gem: 'Germanic', gmw: 'West Germanic',
    gmq: 'North Germanic', gme: 'East Germanic', itc: 'Italic',
    cel: 'Celtic', sla: 'Slavic', bat: 'Baltic', bsl: 'Balto-Slavic',
    grk: 'Hellenic', iir: 'Indo-Iranian', ira: 'Iranian', inc: 'Indo-Aryan',
    sem: 'Semitic', afa: 'Afro-Asiatic', urj: 'Uralic', trk: 'Turkic',
    map: 'Austronesian', poz: 'Malayo-Polynesian', alg: 'Algonquian',
    ath: 'Athabaskan', nic: 'Niger-Congo', bnt: 'Bantu', dra: 'Dravidian'
  };

  /* Codes that always denote reconstructed proto-languages. */
  function isReconstructedLanguage(code) {
    if (!code) return false;
    return /-pro$/.test(code);
  }

  /* Returns { name, known } — never invents a name for a code we can't expand. */
  function resolve(code) {
    if (!code) return { name: null, known: false };
    if (NAMES[code]) return { name: NAMES[code], known: true };
    var m = /^([a-z]{2,3})-pro$/.exec(code);
    if (m && FAMILIES[m[1]]) return { name: 'Proto-' + FAMILIES[m[1]], known: true };
    return { name: code, known: false };
  }

  function languageName(code) { return resolve(code).name; }

  /* Loose shape check for "is this token a language code?" used when the
   * etymon syntax leaves the language implicit. */
  function looksLikeCode(token) {
    if (!token) return false;
    if (!/^[a-z][a-z0-9]{1,3}(-[a-z]{2,4})*$/.test(token)) return false;
    return !!NAMES[token] || /-pro$/.test(token);
  }

  global.ET = global.ET || {};
  global.ET.Languages = {
    resolve: resolve,
    languageName: languageName,
    isReconstructedLanguage: isReconstructedLanguage,
    looksLikeCode: looksLikeCode,
    NAMES: NAMES
  };
})(typeof window !== 'undefined' ? window : globalThis);
