/* Rewriter — side panel logic. */
(function () {
  'use strict';

  var API_URL = 'https://api.anthropic.com/v1/messages';
  var MODEL = 'claude-opus-5';

  var DEFAULT_STYLE = [
    'Plain, direct, friendly-professional. Write like a competent colleague, not a marketing macro.',
    'Banned filler: "I hope this finds you well", "I wanted to reach out", "Please do not hesitate", "Kindly", "delve", "leverage" as a verb.',
    'Lead with the point. Context after, and only if it is needed.',
    'Prefer short sentences and concrete nouns over hedging.'
  ].join('\n');

  // One dimension each. Deliberately no "make it better".
  var ACTIONS = [
    { id: 'grammar',  label: 'Grammar only', instr: 'Fix spelling, grammar, punctuation and clearly awkward phrasing ONLY. Keep the wording, structure, voice and length as close to the original as you can. Do not restyle, do not add, do not remove.' },
    { id: 'shorten',  label: 'Shorten',      instr: 'Cut it down hard while keeping every point that carries meaning. Remove hedging, filler and throat-clearing.' },
    { id: 'expand',   label: 'Expand',       instr: 'Add the detail a reader would need to act on this. Do not invent facts, numbers or promises — expand only on what is already there.' },
    { id: 'formal',   label: 'Formalize',    instr: 'Raise the register. Same content, more professional wording. Full sentences, no contractions.' },
    { id: 'casual',   label: 'Casual',       instr: 'Lower the register. Same content, how you would say it to a colleague. Contractions are fine.' },
    { id: 'clear',    label: 'Clearer',      instr: 'Restructure for clarity. Front-load the point, split run-on sentences, put one idea per sentence. Same content.' },
    { id: 'friendly', label: 'Friendlier',   instr: 'Warmer and more human. Same content and roughly the same length. Do not become gushing or add exclamation marks.' },
    { id: 'plain',    label: 'Plain English',instr: 'Strip jargon, acronyms and industry shorthand. Say the same thing so that someone outside the field understands it on first read. Keep any term that has no plain equivalent, but explain it in a few words.' },
    { id: 'bullets',  label: 'To bullets',   instr: 'Convert to a tight bulleted list. One idea per bullet, no sub-bullets, no bullet longer than two lines. Keep any lead-in sentence that is needed.' },
    { id: 'prose',    label: 'To prose',     instr: 'Convert the list into flowing prose. Keep every item, join them into readable sentences and paragraphs, do not pad.' }
  ];

  /*
    Reply mode treats the selection as a message to answer, not text to transform.
    No sign-off in any of them: the compose window already carries the signature.
  */
  var REPLY_ACTIONS = [
    { id: 'r_default', label: 'Straight reply', instr: 'Write the reply this message naturally calls for.' },
    { id: 'r_short',   label: 'Very short',     instr: 'Two or three sentences at most. Answer and stop.' },
    { id: 'r_ack',     label: 'Acknowledge',    instr: 'Confirm you have got it and say what happens next. Do not pad it out.' },
    { id: 'r_done',    label: "It's done",      instr: 'Report the work as complete. State what was done, in their terms, and invite them to check it. Claim only what the notes support.' },
    { id: 'r_warm',    label: 'Warmer',         instr: 'A touch warmer and more personal, without gushing.' },
    { id: 'r_formal',  label: 'More formal',    instr: 'More formal register. Full sentences, no contractions.' },
    { id: 'r_no',      label: 'Say no',         instr: 'Decline or push back clearly and kindly. Leave no false hope, give the reason plainly, and offer the nearest alternative if there is one.' },
    { id: 'r_ask',     label: 'Ask back',       instr: 'Ask for what is missing before the work can proceed. One clear question, or a short list if there are genuinely several.' },
    { id: 'r_chase',   label: 'Follow up',      instr: 'A follow-up on something not yet answered. Light, no guilt-tripping, easy to reply to.' }
  ];

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    key: '', style: DEFAULT_STYLE, theme: 'dark',
    mode: 'rewrite',
    autoReply: true,
    action: 'grammar',
    replyAction: 'r_default',
    source: null,      // { editable, kind } from the last capture
    input: '',         // the text the current result was generated from
    output: '',
    showingDiff: false,
    controller: null
  };

  /* ----------------------------------------------------------- storage */

  function load() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(
        ['apiKey', 'houseStyle', 'theme', 'action', 'replyAction', 'mode', 'autoReply'],
        function (v) {
          state.key = v.apiKey || '';
          state.style = v.houseStyle || DEFAULT_STYLE;
          state.theme = v.theme || 'dark';
          state.action = v.action || 'grammar';
          state.replyAction = v.replyAction || 'r_default';
          state.mode = v.mode || 'rewrite';
          state.autoReply = v.autoReply !== false;
          resolve();
        }
      );
    });
  }
  function save(o) { chrome.storage.local.set(o); }

  function setStatus(msg, cls) {
    var el = $('status');
    el.textContent = msg;
    el.className = 'counts' + (cls ? ' ' + cls : '');
  }

  /* ------------------------------------------------------------- theme */

  function applyTheme(t) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    Array.prototype.forEach.call($('themeToggle').querySelectorAll('.theme-opt'), function (b) {
      b.classList.toggle('active', b.dataset.theme === t);
    });
    save({ theme: t });
  }
  $('themeToggle').addEventListener('click', function (e) {
    var b = e.target.closest('.theme-opt');
    if (b) applyTheme(b.dataset.theme);
  });

  /* ---------------------------------------------------------- settings */

  $('settingsBtn').addEventListener('click', function () {
    var s = $('settings');
    s.hidden = !s.hidden;
    this.classList.toggle('on', !s.hidden);
  });

  $('saveKeyBtn').addEventListener('click', function () {
    var v = $('apiKey').value.trim();
    if (!v) { setStatus('Paste a key first.', 'bad'); return; }
    state.key = v; save({ apiKey: v }); $('apiKey').value = '';
    setStatus('Key saved.', 'ok');
  });
  $('clearKeyBtn').addEventListener('click', function () {
    state.key = ''; save({ apiKey: '' });
    setStatus('Key cleared.', 'warn');
  });
  $('testKeyBtn').addEventListener('click', function () {
    var key = $('apiKey').value.trim() || state.key;
    if (!key) { setStatus('No key to test.', 'bad'); return; }
    setStatus('Testing key…');
    fetch(API_URL, {
      method: 'POST', headers: headers(key),
      body: JSON.stringify({ model: MODEL, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] })
    }).then(function (r) {
      if (r.ok) { setStatus('Key works.', 'ok'); return null; }
      return r.text().then(function (t) { setStatus('HTTP ' + r.status + ' — ' + shortErr(t), 'bad'); });
    }).catch(function (e) { setStatus('Network error: ' + e.message, 'bad'); });
  });

  $('saveStyleBtn').addEventListener('click', function () {
    state.style = $('houseStyle').value.trim() || DEFAULT_STYLE;
    save({ houseStyle: state.style });
    setStatus('House style saved.', 'ok');
  });
  $('resetStyleBtn').addEventListener('click', function () {
    $('houseStyle').value = DEFAULT_STYLE;
    setStatus('Reset — Save style to keep it.', 'warn');
  });

  function headers(key) {
    return {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }
  function shortErr(t) {
    try {
      var j = JSON.parse(t);
      return (j.error && j.error.message) ? j.error.message : String(t).slice(0, 160);
    } catch (e) { return String(t).slice(0, 160); }
  }

  /* ----------------------------------------------------------- actions */

  function actionList() { return state.mode === 'reply' ? REPLY_ACTIONS : ACTIONS; }
  function currentActionId() { return state.mode === 'reply' ? state.replyAction : state.action; }

  function renderActions() {
    var row = $('actionRow');
    row.innerHTML = '';
    actionList().forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.title = a.instr;
      b.setAttribute('aria-pressed', String(a.id === currentActionId()));
      b.addEventListener('click', function () {
        if (state.mode === 'reply') { state.replyAction = a.id; save({ replyAction: a.id }); }
        else { state.action = a.id; save({ action: a.id }); }
        renderActions();
      });
      row.appendChild(b);
    });
  }

  function applyMode() {
    var reply = state.mode === 'reply';
    Array.prototype.forEach.call($('modeSeg').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    });
    $('inLabel').textContent = reply ? "Message you're replying to" : 'Text';
    $('customLabel').textContent = reply ? 'What you want to say' : 'Extra instruction';
    $('custom').placeholder = reply
      ? 'e.g. banner is live, used the July artwork'
      : "e.g. don't make it sound like we're blaming them";
    $('goBtn').textContent = reply ? 'Draft reply' : 'Rewrite';

    // A reply is new text, so there is nothing to diff it against, and the place it
    // goes is the compose box rather than where the message was selected from.
    $('replaceBtn').hidden = reply;
    $('insertBtn').hidden = !reply;
    $('insertHint').hidden = !reply;
    $('diffBtn').hidden = reply;

    renderActions();
    renderSrcNote();
    updateOutButtons();
  }

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    save({ mode: state.mode });
    applyMode();
  });

  $('autoReply').addEventListener('change', function () {
    state.autoReply = this.checked;
    save({ autoReply: state.autoReply });
  });

  /* ------------------------------------------------------- page access */

  function activeTab() {
    return new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (t) { resolve(t && t[0] ? t[0] : null); });
    });
  }

  function injectable(tab) {
    var u = (tab && tab.url) || '';
    return /^https?:\/\//i.test(u);
  }

  function describeCapture(r, trimmed, usedDraft) {
    var what = r.kind === 'page-reply' ? 'Read the message on screen'
             : r.kind === 'page-compose' ? 'Read what you had typed'
             : r.whole ? 'Read the whole field'
             : 'Pulled in your selection';
    var extras = [];
    if (trimmed) extras.push('signature trimmed');
    if (usedDraft) extras.push('your draft used as notes');
    return what + (extras.length ? ' — ' + extras.join(', ') : '') + '.';
  }

  function setSource(res) {
    state.source = res || null;
    renderSrcNote();
    updateOutButtons();
  }

  // What this note should say depends on the mode: Reply never writes back to where the
  // text came from, so promising that there would be wrong.
  function renderSrcNote() {
    var dot = $('srcNote').querySelector('.dot');
    var txt = $('srcText');
    var res = state.source;

    if (state.mode === 'reply') {
      dot.className = 'dot' + (res ? ' live' : '');
      txt.textContent = res
        ? 'Read from the page. The reply goes wherever you put your cursor.'
        : 'Typed here.';
      return;
    }

    if (!res) {
      dot.className = 'dot';
      txt.textContent = 'Typed here — Replace on page is off.';
      return;
    }
    if (res.editable) {
      dot.className = 'dot live';
      txt.textContent = res.kind === 'page-compose'
        ? 'Read from the box you were typing in. Replace on page writes back into it.'
        : res.whole
          ? 'Whole field pulled in. Replace on page will write back into it.'
          : 'From an editable field. Replace on page will write back into it.';
    } else {
      dot.className = 'dot ro';
      txt.textContent = 'From read-only text. Copy works; Replace on page does not.';
    }
  }

  // The textarea is the source of truth once a result lands, so edits count.
  function outText() { return $('out').value.trim(); }

  function updateOutButtons() {
    var has = !!outText();
    $('replaceBtn').disabled = !has || !state.source || !state.source.editable;
    $('insertBtn').disabled = !has;
    $('copyBtn').disabled = !has;
    $('diffBtn').disabled = !has || state.mode === 'reply';
    $('chainBtn').disabled = !has;
    $('outCount').textContent = has ? (outText().length + ' chars') : '';
  }
  var updateReplaceBtn = updateOutButtons;

  $('out').addEventListener('input', function () {
    // An edit invalidates the diff view, which was rendered against the old text.
    if (state.showingDiff) toggleDiff();
    updateOutButtons();
  });

  function grab() {
    activeTab().then(function (tab) {
      if (!injectable(tab)) {
        setStatus('This page can\'t be read (browser or extension page).', 'bad');
        return;
      }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, func: Selection_.captureSelection, args: [state.mode] },
        function (res) {
          if (chrome.runtime.lastError) {
            setStatus('Could not read the page: ' + chrome.runtime.lastError.message, 'bad');
            return;
          }
          var r = res && res[0] && res[0].result;
          if (!r || !r.ok) {
            setStatus(state.mode === 'reply'
              ? 'No message found — open one, or select the text you want to answer.'
              : 'Nothing selected, and no text box found to read.', 'bad');
            return;
          }
          // Your own signature rides along whenever a compose box is read. Cut it here
          // so it never costs tokens and never comes back in the result.
          var stripped = TextUtils.stripSignature(r.text);
          $('input').value = stripped.text;
          countInput();
          setSource(r);

          // Reading a reply also picks up whatever you had already typed. Use it as the
          // notes, rather than throwing it away — but never overwrite notes you wrote.
          var usedDraft = false;
          if (state.mode === 'reply' && r.draft && r.draft.trim().length > 2 && !$('custom').value.trim()) {
            var d = TextUtils.stripSignature(r.draft);
            $('custom').value = d.text.replace(/\s*\n\s*/g, ' ').slice(0, 400);
            usedDraft = true;
          }

          setStatus(describeCapture(r, stripped.trimmed, usedDraft), 'ok');

          // Reply mode has a draft waiting before you ask for one — use it or ignore it.
          if (state.mode === 'reply' && state.autoReply && state.key) run(true);
        }
      );
    });
  }
  $('grabBtn').addEventListener('click', grab);

  // Typing over the pulled-in text breaks the link back to the page.
  $('input').addEventListener('input', function () {
    countInput();
    if (state.source) setSource(null);
    // New input means the last result no longer applies, so the button is a fresh run.
    $('goBtn').textContent = state.mode === 'reply' ? 'Draft reply' : 'Rewrite';
  });

  function countInput() {
    var n = $('input').value.length;
    $('inCount').textContent = n ? (n + ' chars') : '';
  }

  /* ---------------------------------------------------------- prompting */

  function buildSystem() {
    if (state.mode === 'reply') return buildReplySystem();
    return [
      'You are a rewriting tool. You are given a piece of text and one transformation to apply to it.',
      '',
      'Return ONLY the rewritten text. No preamble, no explanation, no commentary, no alternative versions, no markdown code fences, no surrounding quotes. Your entire response replaces the original text verbatim, so anything that is not the rewritten text is a bug.',
      '',
      'Hard rules:',
      '- Apply the requested transformation and nothing else. Do not "improve" other dimensions along the way.',
      '- Never invent facts, names, numbers, dates, prices, URLs or commitments. If something is vague in the original, it stays vague.',
      '- Preserve every URL, email address, proper noun, product name, number and date exactly as written.',
      '- Preserve the original\'s format: if it is one paragraph, return one paragraph; if it is a list, return a list.',
      '- NEVER output a signature block — no "Best,"/"Thanks,"/"Regards," closing, no name, job title, email address, phone number or website at the end. If the input ends with one, drop it and end on the last real sentence. The compose window supplies the signature; yours would duplicate it.',
      '- Match the original\'s language and point of view. Do not switch between "we" and "I".',
      '- If the text is already correct for the requested transformation, return it unchanged rather than inventing edits.',
      '',
      'House style:',
      state.style || DEFAULT_STYLE
    ].join('\n');
  }

  function buildReplySystem() {
    return [
      'You draft replies to messages on behalf of the person using you.',
      '',
      'Return ONLY the reply body. No subject line, no preamble, no explanation, no commentary, no alternative versions, no markdown, no surrounding quotes. Your entire response is pasted straight into a compose box, so anything that is not the reply is a bug.',
      '',
      'Hard rules:',
      '- NO SIGN-OFF AND NO NAME. Do not end with "Thanks,", "Best,", "Regards," or any name, job title, email address, phone number or website. The sender\'s signature is already in the compose window and yours would duplicate it. End on the last real sentence.',
      '- If the message you are replying to ends with the sender\'s own signature block, ignore it. It is not content to respond to.',
      '- A greeting is fine when the thread has them — use the sender\'s first name if you can see it. Skip it in a fast back-and-forth.',
      '- Never invent facts, dates, prices, names, URLs or commitments. Everything you state must come from the message or from the user\'s notes. If a detail is needed and missing, leave a [bracketed placeholder] rather than guessing.',
      '- Do not promise a timeline that nobody gave you.',
      '- Keep it short. Most replies are 2-5 sentences. Answer the question that was actually asked before anything else.',
      '- Mirror the register of the message you are replying to.',
      '- Reply in the language the message was written in.',
      '',
      'House style:',
      state.style || DEFAULT_STYLE
    ].join('\n');
  }

  function buildUser(text) {
    var custom = $('custom').value.trim();
    var parts;

    if (state.mode === 'reply') {
      var r = REPLY_ACTIONS.filter(function (x) { return x.id === state.replyAction; })[0] || REPLY_ACTIONS[0];
      parts = ['HOW TO REPLY: ' + r.label + ' — ' + r.instr];
      parts.push(custom
        ? 'WHAT I WANT TO SAY:\n' + custom
        : 'WHAT I WANT TO SAY:\n(nothing specific — write the reply this message calls for)');
      parts.push('MESSAGE I AM REPLYING TO:\n' + text);
      return parts.join('\n\n');
    }

    var a = ACTIONS.filter(function (x) { return x.id === state.action; })[0] || ACTIONS[0];
    parts = ['TRANSFORMATION: ' + a.label + ' — ' + a.instr];
    if (custom) parts.push('ALSO: ' + custom);
    parts.push('TEXT:\n' + text);
    return parts.join('\n\n');
  }

  /* -------------------------------------------------------- generation */

  function setBusy(b) {
    $('goBtn').disabled = b;
    $('stopBtn').disabled = !b;
    $('grabBtn').disabled = b;
  }

  function run(auto) {
    var text = $('input').value.trim();
    if (!state.key) {
      if (!auto) { setStatus('Add an API key in settings first.', 'bad'); $('settings').hidden = false; $('settingsBtn').classList.add('on'); }
      return;
    }
    // An auto-draft stays quiet when there is nothing to work with; the user did not ask.
    if (!text) { if (!auto) setStatus('Nothing to work with.', 'bad'); return; }

    state.input = text;
    state.output = '';
    state.showingDiff = false;
    $('diffBtn').setAttribute('aria-pressed', 'false');
    $('diffBtn').textContent = 'Changes';

    var out = $('out');
    out.value = '';
    $('outDiff').hidden = true;
    out.hidden = false;
    $('outCount').textContent = '';
    setBusy(true);
    setStatus(state.mode === 'reply' ? 'Drafting a reply…' : 'Rewriting…');
    $('replaceBtn').disabled = true;
    $('insertBtn').disabled = true;
    $('copyBtn').disabled = true;
    $('diffBtn').disabled = true;

    state.controller = new AbortController();

    var body = {
      model: MODEL,
      max_tokens: 8000,
      stream: true,
      output_config: { effort: 'low' },
      system: buildSystem(),
      messages: [{ role: 'user', content: buildUser(text) }],
      fallbacks: 'default'
    };
    var h = headers(state.key);
    h['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    send(h, body, true);
  }

  function send(h, body, canRetry) {
    fetch(API_URL, { method: 'POST', headers: h, body: JSON.stringify(body), signal: state.controller.signal })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            // The refusal-fallback beta is not enabled on every key; retry once plainly.
            if (canRetry && res.status === 400 && /fallback|beta/i.test(t)) {
              var h2 = headers(h['x-api-key']);
              var b2 = JSON.parse(JSON.stringify(body));
              delete b2.fallbacks;
              return send(h2, b2, false);
            }
            throw new Error('HTTP ' + res.status + ' — ' + shortErr(t));
          });
        }
        return readStream(res);
      })
      .catch(function (e) {
        if (e.name === 'AbortError') { setStatus('Stopped.', 'warn'); finish(); return; }
        setStatus(e.message, 'bad');
        setBusy(false);
        state.controller = null;
      });
  }

  function readStream(res) {
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '';
    var out = $('out');
    var refusal = null;

    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { finish(refusal); return; }
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf('data: ') !== 0) continue;
          var payload = lines[i].slice(6).trim();
          if (!payload) continue;
          var ev;
          try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
            state.output += ev.delta.text;
            out.value = state.output;
            out.scrollTop = out.scrollHeight;
          } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason === 'refusal') {
            refusal = (ev.delta.stop_details && ev.delta.stop_details.explanation) || 'The model declined this request.';
          } else if (ev.type === 'error') {
            throw new Error(ev.error && ev.error.message ? ev.error.message : 'Stream error');
          }
        }
        return pump();
      });
    }
    return pump();
  }

  function finish(refusal) {
    var out = $('out');
    state.output = state.output.trim();
    out.value = state.output;
    setBusy(false);
    state.controller = null;

    var has = !!state.output;
    $('editHint').hidden = !has;
    // Running again is the way to get a different result, so say so on the button.
    if (has) $('goBtn').textContent = state.mode === 'reply' ? 'Draft another' : 'Rewrite again';
    updateOutButtons();

    if (refusal) setStatus('Declined: ' + refusal, 'bad');
    else if (has && state.mode === 'reply') {
      setStatus('Draft ready — read it before you send it.', 'ok');
    } else if (has) {
      var d = state.output.length - state.input.length;
      var delta = d === 0 ? 'same length' : (d > 0 ? '+' + d : String(d)) + ' chars';
      setStatus('Done — ' + delta + '. Check Changes before replacing.', 'ok');
    }
  }

  $('goBtn').addEventListener('click', function () { run(false); });
  $('stopBtn').addEventListener('click', function () { if (state.controller) state.controller.abort(); });

  $('copyBtn').addEventListener('click', function () {
    navigator.clipboard.writeText(outText()).then(
      function () { setStatus('Copied.', 'ok'); },
      function () { setStatus('Copy failed.', 'bad'); }
    );
  });

  /* -------------------------------------------------------------- diff */

  function tokenize(s) { return s.split(/(\s+)/).filter(function (x) { return x !== ''; }); }

  function diffWords(a, b) {
    var n = a.length, m = b.length, i, j;
    if (n * m > 4000000) return [['+', b.join('')]];
    var lcs = [];
    for (i = 0; i <= n; i++) lcs.push(new Uint16Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        lcs[i][j] = (a[i] === b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    var ops = [], x = 0, y = 0;
    while (x < n && y < m) {
      if (a[x] === b[y]) { ops.push(['=', a[x]]); x++; y++; }
      else if (lcs[x + 1][y] >= lcs[x][y + 1]) { ops.push(['-', a[x]]); x++; }
      else { ops.push(['+', b[y]]); y++; }
    }
    while (x < n) ops.push(['-', a[x++]]);
    while (y < m) ops.push(['+', b[y++]]);
    return ops;
  }

  function toggleDiff() {
    state.showingDiff = !state.showingDiff;
    var btn = $('diffBtn');
    btn.setAttribute('aria-pressed', String(state.showingDiff));
    btn.textContent = state.showingDiff ? 'Result' : 'Changes';

    var out = $('out'), pane = $('outDiff');
    out.hidden = state.showingDiff;
    pane.hidden = !state.showingDiff;
    $('editHint').hidden = state.showingDiff || !outText();
    if (!state.showingDiff) return;

    var ops = diffWords(tokenize(state.input), tokenize(outText()));
    pane.textContent = '';
    var changed = 0;
    ops.forEach(function (op) {
      var node;
      if (op[0] === '=') node = document.createTextNode(op[1]);
      else {
        if (op[1].trim()) changed++;
        node = document.createElement(op[0] === '-' ? 'del' : 'ins');
        node.textContent = op[1];
      }
      pane.appendChild(node);
    });
    if (!changed) setStatus('No changes — it returned the text as-is.', 'warn');
  }

  $('diffBtn').addEventListener('click', toggleDiff);

  // Chaining: run a second action on the result (Shorten, then Friendlier). The page
  // target is unchanged, so Replace stays valid — only the replacement text differs.
  $('chainBtn').addEventListener('click', function () {
    var text = outText();
    if (!text) return;
    if (state.showingDiff) toggleDiff();
    $('input').value = text;
    countInput();
    state.output = '';
    $('out').value = '';
    $('editHint').hidden = true;
    $('goBtn').textContent = state.mode === 'reply' ? 'Draft reply' : 'Rewrite';
    updateOutButtons();
    setStatus('Moved up. Pick another action and run it again.', 'ok');
  });

  /* ----------------------------------------------------------- replace */

  $('replaceBtn').addEventListener('click', function () {
    activeTab().then(function (tab) {
      if (!injectable(tab)) { setStatus('Switch back to the page first.', 'bad'); return; }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, func: Selection_.replaceSelection, args: [outText()] },
        function (res) {
          if (chrome.runtime.lastError) {
            setStatus('Replace failed: ' + chrome.runtime.lastError.message, 'bad');
            return;
          }
          var r = res && res[0] && res[0].result;
          if (r && r.ok) {
            setStatus(r.undoable === false
              ? 'Replaced — but Ctrl+Z may not undo this one.'
              : 'Replaced on the page.', 'ok');
          } else if (r && r.reason === 'gone') {
            setStatus('That field is gone — the page changed. Copy instead.', 'bad');
          } else if (r && r.reason === 'readonly') {
            setStatus('That text is not editable. Copy instead.', 'bad');
          } else {
            setStatus('Nothing to replace — pull the selection in again.', 'bad');
          }
        }
      );
    });
  });

  $('insertBtn').addEventListener('click', function () {
    activeTab().then(function (tab) {
      if (!injectable(tab)) { setStatus('Switch back to the page first.', 'bad'); return; }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, func: Selection_.insertAtCursor, args: [outText()] },
        function (res) {
          if (chrome.runtime.lastError) {
            setStatus('Insert failed: ' + chrome.runtime.lastError.message, 'bad');
            return;
          }
          var r = res && res[0] && res[0].result;
          if (r && r.ok) {
            setStatus(r.undoable === false
              ? 'Inserted — but Ctrl+Z may not undo this one.'
              : 'Inserted at the cursor.', 'ok');
          } else {
            setStatus('Click into the box you\'re writing in first, then Insert.', 'bad');
          }
        }
      );
    });
  });

  /* -------------------------------------------------------------- boot */

  load().then(function () {
    applyTheme(state.theme);
    $('houseStyle').value = state.style;
    $('autoReply').checked = state.autoReply;
    applyMode();
    countInput();
    if (!state.key) {
      setStatus('Add your Anthropic API key in settings to start.', 'warn');
      $('settings').hidden = false;
      $('settingsBtn').classList.add('on');
    }
  });
})();
