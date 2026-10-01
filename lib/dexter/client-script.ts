/**
 * The only browser code in Dexter. The viewer route serves this text at
 * `/deck/<token>/.dexter.js`, and a deck pulls it in with one script tag.
 * It saves the deck's named form fields to `/deck/<token>/.state` as the
 * client types, and fills them back in when the link is opened again.
 *
 * `app/(dashboard)/dexter/DECK-AUTHORING.md` is the author's contract —
 * change the two together. Plain ES2017 with no dependencies, and no
 * template literals inside: this is one TypeScript template literal, so a
 * `${` in the script would be interpolated here instead of in the browser.
 */
export const DEXTER_CLIENT_SCRIPT = `(function () {
  'use strict';

  // Only act when served through a deck link; from disk, do nothing.
  var match = /^\\/deck\\/[A-Za-z0-9_-]{22}\\//.exec(location.pathname);
  if (!match) return;
  var url = match[0] + '.state';

  var SKIP = ['button', 'submit', 'reset', 'file', 'password', 'image'];
  var root = document.documentElement;
  var dirty = false;
  var submitted = false;
  var timer = null;

  function fields() {
    var all = document.querySelectorAll('input[name], select[name], textarea[name]');
    return Array.prototype.filter.call(all, function (el) {
      return SKIP.indexOf(el.type) === -1;
    });
  }

  function named(name) {
    return fields().filter(function (el) { return el.name === name; });
  }

  function collect() {
    var out = {};
    fields().forEach(function (el) {
      var name = el.name;
      if (name in out && el.type !== 'checkbox') return;
      if (el.type === 'checkbox') {
        var group = named(name);
        out[name] = group.length === 1 ? el.checked : group.filter(function (g) { return g.checked; }).map(function (g) { return g.value; });
      } else if (el.type === 'radio') {
        var picked = named(name).filter(function (r) { return r.checked; })[0];
        out[name] = picked ? picked.value : '';
      } else if (el.tagName === 'SELECT' && el.multiple) {
        out[name] = Array.prototype.filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
      } else {
        out[name] = String(el.value);
      }
    });
    return out;
  }

  function fill(saved) {
    fields().forEach(function (el) {
      if (!Object.prototype.hasOwnProperty.call(saved, el.name)) return;
      var value = saved[el.name];
      if (el.type === 'checkbox') {
        if (typeof value === 'boolean') el.checked = value;
        else if (Array.isArray(value)) el.checked = value.indexOf(el.value) !== -1;
      } else if (el.type === 'radio') {
        if (typeof value === 'string') el.checked = el.value === value;
      } else if (el.tagName === 'SELECT' && el.multiple) {
        if (Array.isArray(value)) Array.prototype.forEach.call(el.options, function (o) { o.selected = value.indexOf(o.value) !== -1; });
      } else if (typeof value === 'string') {
        el.value = value;
      }
    });
  }

  function save(keepalive) {
    root.dataset.dexter = 'saving';
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ fields: collect(), submitted: submitted }),
        keepalive: !!keepalive
      }).then(function (res) {
        if (!res.ok) throw new Error('save failed');
        dirty = false;
        root.dataset.dexter = 'saved';
        if (submitted) root.dataset.dexterSent = 'true';
      }).catch(function () { root.dataset.dexter = 'error'; });
    } catch (e) {
      root.dataset.dexter = 'error';
    }
  }

  function listen() {
    function changed() {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(function () { save(false); }, 800);
    }
    document.addEventListener('input', changed);
    document.addEventListener('change', changed);
    document.addEventListener('submit', function (event) {
      event.preventDefault();
      clearTimeout(timer);
      submitted = true;
      save(false);
    });
    window.addEventListener('pagehide', function () { if (dirty) save(true); });
  }

  function start() {
    fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('load failed');
      return res.json();
    }).then(function (state) {
      fill(state.fields || {});
      if (state.submitted) root.dataset.dexterSent = 'true';
      root.dataset.dexter = 'saved';
    }).catch(function () {
      root.dataset.dexter = 'error';
    }).then(listen);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
