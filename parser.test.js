/* EtymoTree — parser tests (node, no network)
 * Run with: node tests/parser.test.js
 * Fixtures mirror the shapes actually seen on en.wiktionary.org.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

['languages', 'wikitext', 'sections', 'parser', 'layout'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f });
});

const FATHER = `==English==
{{wikipedia}}

===Etymology===
{{etymon|en|id=male parent|inh|enm>fader>father}}
Inherited from {{inh|en|enm|fader}}, from {{inh|en|ang|fæder}}, from {{inh|en|gmw-pro|*fader}}, from {{inh|en|gem-pro|*fadēr}}, from {{inh|en|ine-pro|*ph₂tḗr}}, possibly from {{af|ine-pro|*peh₂-|*-tḗr|t1=to protect|t2=agent noun}}. {{doublet|en|ayr|faeder|athair|padre|pater|père}}

The development of the {{IPAchar|/ɑː/}} vowel is irregular. Compare {{cog|nl|vader}}.

===Pronunciation===
* {{IPA|en|/ˈfɑːðə(ɹ)/}}

==Middle English==

===Etymology===
From {{inh|enm|ang|fæder}}.
`;

const NEW_ETYMON_SYNTAX = `==English==

===Etymology===
{{etymon|en|:inh|enm:fader<id:father>|id=male parent}}
Inherited from {{inh|en|enm|fader}}, from {{inh|en|ine-pro|*ph₂tḗr}}.
{{etymon|ine-pro|:af|*peh₂-<id:protect><unc>|*-tḗr<id:agent noun><unc>|id=father|title=*ph₂tḗr}}
`;

const ORPHAN_ETYMON = `==English==

===Etymology===
{{etymon|ine-pro|:af|*peh₂-|*-tḗr|id=father}}
`;

const MULTI = `==English==

===Etymology 1===
Borrowed from {{bor|en|fr|bat}}.

====Noun====
{{en-noun}}

===Etymology 2===
From {{inh|en|ang|bat}}, of unknown origin.

====Noun====
{{en-noun}}
`;

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail ? '  →  ' + detail : '')); }
}

function ids(nodes) { return nodes.map(n => n.id); }
function edgeStr(g) {
  return g.edges.map(e => `${e.from} -[${e.relationship}${e.subtype ? ':' + e.subtype : ''}${e.uncertain ? '?' : ''}]-> ${e.to}`);
}

/* ---------------------------------------------------------------- */
console.log('\nfather — prose chain + affix components + doublet');
let r = ET.Parser.parsePage(FATHER, { term: 'father', languageSection: 'English', languageCode: 'en' });
check('parses', r.ok);
check('one etymology', r.etymologies.length === 1, String(r.etymologies.length));
let g = r.etymologies[0];
console.log('  nodes: ' + ids(g.nodes).join(', '));
console.log('  edges:\n    ' + edgeStr(g).join('\n    '));

const want = ['en:father', 'enm:fader', 'ang:fæder', 'gmw-pro:*fader', 'gem-pro:*fadēr',
  'ine-pro:*ph₂tḗr', 'ine-pro:*peh₂-', 'ine-pro:*-tḗr'];
want.forEach(id => check('node ' + id, ids(g.nodes).includes(id)));

function edge(from, to, rel) {
  return g.edges.some(e => e.from === from && e.to === to && e.relationship === rel);
}
check('enm→en inherited', edge('enm:fader', 'en:father', 'inherited'));
check('ang→enm inherited', edge('ang:fæder', 'enm:fader', 'inherited'));
check('gmw-pro→ang inherited', edge('gmw-pro:*fader', 'ang:fæder', 'inherited'));
check('gem-pro→gmw-pro inherited', edge('gem-pro:*fadēr', 'gmw-pro:*fader', 'inherited'));
check('ine-pro→gem-pro inherited', edge('ine-pro:*ph₂tḗr', 'gem-pro:*fadēr', 'inherited'));
check('*peh₂- is a COMPONENT of *ph₂tḗr', edge('ine-pro:*peh₂-', 'ine-pro:*ph₂tḗr', 'component'));
check('*-tḗr is a COMPONENT of *ph₂tḗr', edge('ine-pro:*-tḗr', 'ine-pro:*ph₂tḗr', 'component'));
check('components are uncertain ("possibly from")',
  g.nodes.find(n => n.id === 'ine-pro:*peh₂-').uncertain);
check('*fadēr reconstructed', g.nodes.find(n => n.id === 'gem-pro:*fadēr').reconstructed);
check('fæder not reconstructed', !g.nodes.find(n => n.id === 'ang:fæder').reconstructed);
check('language names resolved',
  g.nodes.find(n => n.id === 'gmw-pro:*fader').languageName === 'Proto-West Germanic');
check('doublets are role=related',
  g.nodes.filter(n => n.role === 'related').length >= 6);
check('doublet not in lineage',
  !g.edges.some(e => e.to === 'en:father' && e.relationship !== 'inherited'));
check('cognate vader is related',
  g.edges.some(e => e.from === 'en:father' && e.subtype === 'cognate'));
check('{{etymon}} old syntax merged, no duplicate enm edge',
  g.edges.filter(e => e.from === 'enm:fader' && e.to === 'en:father').length === 1);
check('etymon source recorded on that edge',
  g.edges.find(e => e.from === 'enm:fader').sources.some(s => s.template === 'etymon'));

/* layout */
const lay = ET.Layout.layoutGraph(g);
console.log('  rows (top→bottom):');
lay.rows.forEach((row, i) => console.log('    ' + i + ': ' + row.map(n => n.displayTerm).join('  |  ')));
check('components share the TOP row',
  lay.rows[0].length === 2 && lay.rows[0].every(n => n.role === 'component'));
check('*ph₂tḗr is directly below them', lay.rows[1][0].id === 'ine-pro:*ph₂tḗr');
check('father is on the bottom row',
  lay.rows[lay.rows.length - 1][0].id === 'en:father');
check('7 rows', lay.rows.length === 7, String(lay.rows.length));
check('related terms kept out of the tree', lay.aside.length >= 6);

/* ---------------------------------------------------------------- */
console.log('\nnew {{etymon}} syntax (colon/angle-bracket form)');
r = ET.Parser.parsePage(NEW_ETYMON_SYNTAX, { term: 'father', languageSection: 'English', languageCode: 'en' });
g = r.etymologies[0];
console.log('  nodes: ' + ids(g.nodes).join(', '));
console.log('  edges:\n    ' + edgeStr(g).join('\n    '));
check('enm:fader parsed from "enm:fader<id:father>"', ids(g.nodes).includes('enm:fader'));
check('inherited edge to entry',
  g.edges.some(e => e.from === 'enm:fader' && e.to === 'en:father' && e.relationship === 'inherited'));
check('<unc> honoured', g.nodes.filter(n => n.uncertain).length === 2);
check('<id:protect> kept as gloss',
  g.nodes.find(n => n.id === 'ine-pro:*peh₂-').gloss === 'protect');
check('lang assumed from |1= for bare *-tḗr', ids(g.nodes).includes('ine-pro:*-tḗr'));
check('etymon for another language anchors on that language\'s node, not the entry',
  g.edges.some(e => e.from === 'ine-pro:*peh₂-' && e.to === 'ine-pro:*ph₂tḗr' && e.relationship === 'component'));

console.log('\nunanchorable {{etymon}}');
r = ET.Parser.parsePage(ORPHAN_ETYMON, { term: 'father', languageSection: 'English', languageCode: 'en' });
g = r.etymologies[0];
check('no invented edge to the entry', g.edges.length === 0, JSON.stringify(edgeStr(g)));
check('reported in unparsed', g.unparsed.some(u => u.reason === 'etymon-anchor-not-found'));

/* ---------------------------------------------------------------- */
console.log('\nmultiple etymologies');
r = ET.Parser.parsePage(MULTI, { term: 'bat', languageSection: 'English', languageCode: 'en' });
check('two etymologies kept separate', r.etymologies.length === 2);
check('first is a borrowing',
  r.etymologies[0].edges.some(e => e.relationship === 'borrowed' && e.from === 'fr:bat'));
check('second is inherited',
  r.etymologies[1].edges.some(e => e.relationship === 'inherited' && e.from === 'ang:bat'));
check('inflection templates not in graph', !ids(r.etymologies[0].nodes).includes('en-noun'));

/* ---------------------------------------------------------------- */
console.log('\ncompound at the entry itself (components above the searched word)');
r = ET.Parser.parsePage('==English==\n\n===Etymology===\n{{af|en|tooth|brush}}\n', { term: 'toothbrush', languageSection: 'English', languageCode: 'en' });
g = r.etymologies[0];
const lay2 = ET.Layout.layoutGraph(g);
check('two components on the top row', lay2.rows[0].length === 2);
check('toothbrush on the bottom row', lay2.rows[1][0].id === 'en:toothbrush');
check('component relationship used', g.edges.every(e => e.relationship === 'component'));

/* ---------------------------------------------------------------- */
console.log('\nerror handling');
r = ET.Parser.parsePage('==Latin==\n\n===Etymology===\nFrom nowhere.', { term: 'x' });
check('missing English section reported', !r.ok && /No ==English==/.test(r.diagnostics[0].message));
r = ET.Parser.parsePage('==English==\n\n===Noun===\nx', { term: 'x' });
check('missing Etymology section reported', !r.ok && /no ===Etymology===/.test(r.diagnostics[0].message));
r = ET.Parser.parsePage('', { term: 'x' });
check('empty wikitext reported', !r.ok);

r = ET.Parser.parsePage('==English==\n\n===Etymology===\nFrom {{inh|en|qqq-xyz|blah}}, and {{wat|en|thing}}.', { term: 'x' });
g = r.etymologies[0];
check('unknown language code surfaced, code preserved',
  g.nodes.find(n => n.id === 'qqq-xyz:blah') && !g.nodes.find(n => n.id === 'qqq-xyz:blah').languageKnown);
check('unsupported template listed in unparsed',
  g.unparsed.some(u => u.template === 'wat'));
check('unsupported template invented no edge',
  !g.edges.some(e => /wat/.test(e.from + e.to)));

/* nested templates must not break argument splitting */
const nested = ET.Wikitext.parseTemplate('{{af|en|{{l|en|a|b}}|c<id:x>|t1={{q|y}}}}');
check('top-level split survives nesting',
  nested.positional.length === 3 && nested.positional[1] === '{{l|en|a|b}}',
  JSON.stringify(nested.positional));

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed'));
process.exit(failures ? 1 : 0);
