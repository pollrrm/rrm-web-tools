/*
  The two functions injected into the page.

  chrome.scripting.executeScript serialises each function to source and runs it in the
  page, so neither may reference anything from this file's scope — every helper is
  declared inside the function body. It reads repetitive; that is the constraint.

  captureSelection() also stashes WHERE the text came from on window.__rrmRw, because
  the two calls are separate injections and nothing else survives between them.

  test/selection-fixture.html loads this file directly and exercises both.
*/

var Selection_ = (function () {
  'use strict';

  /**
   * Reads the current selection and remembers where it came from.
   *
   * With nothing selected it falls back to reading the page: the compose box you are
   * typing in, and — in reply mode — the message you are replying to. That fallback is
   * the only part that knows anything about mail clients, and it is reached only when
   * there is no selection, so it can never make the selection path worse.
   */
  function captureSelection(mode) {
    var FIELD_TYPES = /^(text|search|url|email|tel|password|number)$/i;
    var QUOTE_SEL = '.gmail_quote, #divRplyFwdMsg, #appendonsend, blockquote[type="cite"]';

    function clean(s) {
      return String(s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    }

    function editableHost(node) {
      var el = (node && node.nodeType === 1) ? node : (node && node.parentElement);
      while (el) {
        if (el.isContentEditable) return el;
        el = el.parentElement;
      }
      return null;
    }

    var active = document.activeElement;

    // A focused <input>/<textarea> has its own selection model.
    if (active && (active.tagName === 'TEXTAREA' ||
        (active.tagName === 'INPUT' && FIELD_TYPES.test(active.type || 'text')))) {
      var s = active.selectionStart, e = active.selectionEnd;
      if (s !== null && s !== e) {
        window.__rrmRw = { field: active, start: s, end: e };
        return { ok: true, kind: 'field', editable: true, text: clean(active.value.slice(s, e)) };
      }
      // Nothing highlighted inside it — take the whole field.
      if (active.value) {
        window.__rrmRw = { field: active, start: 0, end: active.value.length };
        return { ok: true, kind: 'field', editable: true, whole: true, text: clean(active.value) };
      }
    }

    function visible(el) {
      var r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 40;
    }

    function composeBox() {
      var sels = [
        'div[aria-label="Message Body"][contenteditable="true"]',
        'div[aria-label="Message body"][contenteditable="true"]',
        'div.Am.Al.editable[contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]'
      ];
      for (var i = 0; i < sels.length; i++) {
        var n = document.querySelectorAll(sels[i]);
        for (var j = n.length - 1; j >= 0; j--) { if (visible(n[j])) return n[j]; }
      }
      var all = document.querySelectorAll('[contenteditable="true"]');
      var best = null, area = 0;
      for (var k = 0; k < all.length; k++) {
        var r = all[k].getBoundingClientRect();
        var a = r.width * r.height;
        if (a > area && visible(all[k])) { area = a; best = all[k]; }
      }
      return best;
    }

    /*
      Splits a compose box into what you wrote and the quoted thread under it, and
      builds a Range over just your half so it can be replaced like any other selection.
      Walks the live nodes: innerText is defined by rendered layout, so on a detached
      clone it degrades to textContent and every paragraph break is lost.
    */
    function splitCompose(box) {
      var out = { draft: '', quoted: '', quoteNode: null };
      var q = box.querySelector(QUOTE_SEL);
      if (!q) {
        out.draft = clean(box.innerText);
        return out;
      }
      var top = q;
      while (top.parentNode && top.parentNode !== box) top = top.parentNode;
      out.quoteNode = top;

      var before = [], after = [], reached = false, cut = box.childNodes.length;
      for (var i = 0; i < box.childNodes.length; i++) {
        var n = box.childNodes[i];
        if (n === top) { reached = true; cut = i; }
        var t = (n.nodeType === 1) ? n.innerText : n.textContent;
        (reached ? after : before).push(t == null ? '' : t);
      }
      out.draft = clean(before.join('\n'));
      out.quoted = clean(after.join('\n'));
      return out;
    }

    // Keyed on what is in the DOM, not the hostname — Outlook Web has already moved
    // domain once, and Gmail's and Outlook's message bodies never coexist.
    function readingPaneThread() {
      var groups = [
        'div.a3s',
        '[role="document"], div[aria-label="Message body"]:not([contenteditable="true"])'
      ];
      for (var g = 0; g < groups.length; g++) {
        var nodes = document.querySelectorAll(groups[g]);
        if (!nodes.length) continue;
        var out = [];
        for (var i = Math.max(0, nodes.length - 3); i < nodes.length; i++) {
          var t = clean(nodes[i].innerText);
          if (t) out.push(t);
        }
        if (out.length) return out.join('\n\n---\n\n');
      }
      return '';
    }

    var sel = window.getSelection();
    var haveSelection = sel && sel.rangeCount && !sel.isCollapsed && clean(String(sel)).trim();

    if (!haveSelection) {
      // --- nothing selected: read the page ---
      var box = composeBox();
      var parts = box ? splitCompose(box) : null;

      if (mode === 'reply') {
        var thread = readingPaneThread() || (parts ? parts.quoted : '');
        if (thread) {
          window.__rrmRw = null;
          return {
            ok: true, kind: 'page-reply', editable: false,
            text: thread.slice(0, 30000),
            draft: parts ? parts.draft.slice(0, 20000) : ''
          };
        }
      }

      if (parts && parts.draft) {
        window.__rrmRw = { compose: box, quoteNode: parts.quoteNode };
        return { ok: true, kind: 'page-compose', editable: true, whole: true, text: parts.draft.slice(0, 20000) };
      }

      return { ok: false, reason: 'empty' };
    }

    var text = clean(String(sel));

    var range = sel.getRangeAt(0).cloneRange();
    var host = editableHost(range.commonAncestorContainer);
    window.__rrmRw = { range: range, host: host };

    return {
      ok: true,
      kind: host ? 'editable' : 'readonly',
      editable: !!host,
      text: text
    };
  }

  /** Writes text back over whatever captureSelection() last recorded. */
  function replaceSelection(text) {
    var st = window.__rrmRw;
    if (!st) return { ok: false, reason: 'no-capture' };

    // --- plain form field ---
    if (st.field) {
      var el = st.field;
      if (!el.isConnected) return { ok: false, reason: 'gone' };
      try { el.focus(); } catch (e) {}

      // setRangeText keeps the browser's native undo stack intact.
      try {
        el.setRangeText(text, st.start, st.end, 'end');
      } catch (e2) {
        el.value = el.value.slice(0, st.start) + text + el.value.slice(st.end);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // Leave the new text selected so a second rewrite chains off this one.
      window.__rrmRw = { field: el, start: st.start, end: st.start + text.length };
      try { el.setSelectionRange(st.start, st.start + text.length); } catch (e3) {}
      return { ok: true, kind: 'field' };
    }

    /*
      --- whole compose box, read with nothing selected ---
      Explicit DOM surgery rather than execCommand. Running insertText across a range
      that ends at the boundary before the quoted thread makes Chrome merge the two,
      destroying the .gmail_quote / #divRplyFwdMsg element and the collapse behaviour
      that hangs off it. Corrupting someone's email is worse than losing Ctrl+Z, so this
      path reports undoable:false and the panel says so.
    */
    if (st.compose) {
      var box = st.compose;
      if (!box.isConnected) return { ok: false, reason: 'gone' };

      var frag = document.createDocumentFragment();
      String(text).split('\n').forEach(function (line) {
        var d = document.createElement('div');
        if (line.trim() === '') d.appendChild(document.createElement('br'));
        else d.textContent = line;
        frag.appendChild(d);
      });

      var quote = (st.quoteNode && st.quoteNode.isConnected && st.quoteNode.parentNode === box)
        ? st.quoteNode : null;

      if (quote) {
        var p = quote.previousSibling;
        while (p) { var prev = p.previousSibling; box.removeChild(p); p = prev; }
        box.insertBefore(frag, quote);
      } else {
        box.textContent = '';
        box.appendChild(frag);
      }

      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
      try { box.focus(); } catch (e6) {}
      window.__rrmRw = { compose: box, quoteNode: quote };
      return { ok: true, kind: 'compose', undoable: false };
    }

    // --- contenteditable ---
    if (st.range) {
      if (!st.host) return { ok: false, reason: 'readonly' };
      if (!st.host.isConnected) return { ok: false, reason: 'gone' };

      try { st.host.focus(); } catch (e4) {}
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(st.range);

      /*
        execCommand is deprecated but remains the only way to edit a contenteditable
        that keeps native undo AND fires the events rich editors listen for. Manual
        range surgery is the fallback, and loses both.
      */
      var done = false;
      try { done = document.execCommand('insertText', false, text); } catch (e5) { done = false; }

      if (!done) {
        st.range.deleteContents();
        var frag = document.createDocumentFragment();
        String(text).split('\n').forEach(function (line, i) {
          if (i) frag.appendChild(document.createElement('br'));
          frag.appendChild(document.createTextNode(line));
        });
        st.range.insertNode(frag);
        st.host.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }

      window.__rrmRw = null;
      return { ok: true, kind: 'editable', undoable: done };
    }

    return { ok: false, reason: 'no-capture' };
  }

  /*
    Drops text wherever the caret is RIGHT NOW, ignoring anything captureSelection
    stored earlier. Reply mode needs this: you select the message you received (usually
    read-only), get a draft back, then click into the compose box — a different place
    entirely from where the text was captured.
  */
  function insertAtCursor(text) {
    var FIELD_TYPES = /^(text|search|url|email|tel)$/i;

    function editableHost(node) {
      var el = (node && node.nodeType === 1) ? node : (node && node.parentElement);
      while (el) {
        if (el.isContentEditable) return el;
        el = el.parentElement;
      }
      return null;
    }

    var active = document.activeElement;

    if (active && (active.tagName === 'TEXTAREA' ||
        (active.tagName === 'INPUT' && FIELD_TYPES.test(active.type || 'text')))) {
      var s = active.selectionStart, e = active.selectionEnd;
      if (s === null || s === undefined) { s = e = active.value.length; }
      try { active.focus(); } catch (err) {}
      try {
        active.setRangeText(text, s, e, 'end');
      } catch (err2) {
        active.value = active.value.slice(0, s) + text + active.value.slice(e);
      }
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, kind: 'field' };
    }

    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return { ok: false, reason: 'no-cursor' };

    var host = editableHost(sel.getRangeAt(0).commonAncestorContainer);
    if (!host) return { ok: false, reason: 'not-editable' };

    try { host.focus(); } catch (err3) {}
    var done = false;
    try { done = document.execCommand('insertText', false, text); } catch (err4) { done = false; }

    if (!done) {
      var range = sel.getRangeAt(0);
      range.deleteContents();
      var frag = document.createDocumentFragment();
      String(text).split('\n').forEach(function (line, i) {
        if (i) frag.appendChild(document.createElement('br'));
        frag.appendChild(document.createTextNode(line));
      });
      range.insertNode(frag);
      host.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return { ok: true, kind: 'editable', undoable: done };
  }

  return {
    captureSelection: captureSelection,
    replaceSelection: replaceSelection,
    insertAtCursor: insertAtCursor
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Selection_;
