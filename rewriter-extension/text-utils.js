/*
  Signature trimming.

  Select the body of a compose box and your own signature comes with it. The model then
  faithfully reproduces it, and you have to hand-delete it out of the result — which
  defeats the point, since the compose window appends the real one anyway.

  So it is cut on the way IN, before it costs tokens or reaches the prompt. The prompt
  also forbids emitting one, but that is the backstop; this is the fix.

  Deliberately conservative: it would rather leave a signature in than eat real content.
  Every rule below has to clear the guard in `safe()`.
*/

var TextUtils = (function () {
  'use strict';

  // "Best," / "Thanks!" / "Kind regards" — the closing line itself.
  var SIGNOFF = new RegExp(
    '^(?:' +
    'best|best regards|best wishes|regards|kind regards|kindest regards|warm regards|' +
    'warmest regards|thanks|thanks again|thanks so much|thank you|many thanks|cheers|' +
    'sincerely|yours|yours truly|yours sincerely|respectfully|talk soon|speak soon|' +
    'all the best|take care|appreciate it' +
    ')[,.!\\s]*$', 'i');

  // An email address, a URL, or a phone number (including en/em-dash separators).
  var CONTACT = new RegExp(
    '@[\\w.-]+\\.\\w{2,}' +
    '|https?://' +
    '|\\bwww\\.' +
    '|\\b\\d{3}[\\s.\\u2013\\u2014-]{1,3}\\d{3}[\\s.\\u2013\\u2014-]{1,3}\\d{4}\\b',
    'i');

  function nonEmpty(arr) {
    return arr.filter(function (l) { return l.trim() !== ''; });
  }

  /**
   * Guards a proposed cut. Refuses anything that would eat most of the text or leave
   * almost nothing — the cost of a missed signature is far lower than a swallowed draft.
   */
  function safe(keptLines, original) {
    var kept = keptLines.join('\n').trim();
    if (kept.length < 25) return null;
    if (kept.length < original.trim().length * 0.4) return null;
    return kept;
  }

  function stripSignature(text) {
    var original = String(text == null ? '' : text);
    if (!original.trim()) return { text: '', trimmed: false };

    var lines = original.replace(/\r\n/g, '\n').split('\n');
    var kept;

    // 1. The conventional "-- " separator. Unambiguous when present.
    for (var i = 1; i < lines.length; i++) {
      if (/^\s*--\s*$/.test(lines[i])) {
        kept = safe(lines.slice(0, i), original);
        if (kept) return { text: kept, trimmed: true };
        break;
      }
    }

    // 2. A sign-off line near the end, with at most a short block after it.
    var from = Math.max(0, lines.length - 14);
    for (var j = lines.length - 1; j >= from; j--) {
      if (!SIGNOFF.test(lines[j].trim())) continue;
      var after = nonEmpty(lines.slice(j + 1));
      // More than six lines after a "Best," is a continued message, not a signature.
      if (after.length > 6) continue;
      // Several lines with no contact details at all is more likely prose.
      if (after.length > 2 && !CONTACT.test(after.join('\n'))) continue;
      kept = safe(lines.slice(0, j), original);
      if (kept) return { text: kept, trimmed: true };
    }

    // 3. No sign-off word, but the text ends in a short contact block
    //    ("Poll David / Web Support Manager / poll@… / 888-383-2848").
    var tail = [];
    for (var k = lines.length - 1; k >= 0 && tail.length < 6; k--) {
      if (lines[k].trim() === '') { if (tail.length) break; else continue; }
      tail.unshift({ line: lines[k], index: k });
    }
    if (tail.length >= 2) {
      var tailText = tail.map(function (t) { return t.line; }).join('\n');
      var longest = tail.reduce(function (m, t) { return Math.max(m, t.line.trim().length); }, 0);
      // Signature lines are short, and at least one carries contact details.
      if (CONTACT.test(tailText) && longest <= 60) {
        kept = safe(lines.slice(0, tail[0].index), original);
        if (kept) return { text: kept, trimmed: true };
      }
    }

    return { text: original.trim(), trimmed: false };
  }

  return { stripSignature: stripSignature };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TextUtils;
