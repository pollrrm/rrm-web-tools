# Hospice fill diagnostic

Open DevTools (F12) → **Console** tab on the Hospice WP New Post page.
Paste each of these blocks one at a time. Send me the output.

## 1. Is the content textarea present?

```js
({
  contentTextareaExists: !!document.getElementById('content'),
  contentTextareaValue: (document.getElementById('content') || {}).value?.slice(0, 200) || '(empty)',
  visualMode: !!document.querySelector('#wp-content-wrap.tmce-active'),
  textMode: !!document.querySelector('#wp-content-wrap.html-active'),
  tinymceReady: !!(window.tinymce && window.tinymce.get && window.tinymce.get('content')),
  tinymceContent: window.tinymce?.get?.('content')?.getContent?.()?.slice(0, 200) || '(none)',
  wpbakeryActive: !!window.vc || !!document.querySelector('.vc_backend_editor_inner'),
  url: location.href
});
```

## 2. Yoast labels — what are they actually called?

```js
[...document.querySelectorAll('[class*="replacevar__label"], [class*="yst-replacevar__label"]')]
  .map(l => ({
    text: l.textContent.trim(),
    id: l.id,
    classes: l.className.slice(0, 80)
  }));
```

## 3. Yoast Draft.js editors — what IDs do they have?

```js
[...document.querySelectorAll('div.public-DraftEditor-content[contenteditable="true"]')]
  .map(e => ({
    id: e.id || '(no id)',
    ariaLabelledBy: e.getAttribute('aria-labelledby'),
    parentClass: e.closest('[class*="replacevar"]')?.className?.slice(0, 80) || '(no replacevar wrapper)'
  }));
```

## 4. Yoast metabox visibility

```js
({
  yoastMetaboxFound: !!document.getElementById('wpseo_meta'),
  yoastMetaboxVisible: document.getElementById('wpseo_meta')?.offsetParent !== null,
  yoastMetaboxClassList: document.getElementById('wpseo_meta')?.className || '(none)'
});
```

Send me all four outputs and I'll fix whichever selector is mismatched.
