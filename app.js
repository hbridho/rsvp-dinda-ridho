(function () {
  'use strict';

  var CFG = window.RSVP_CONFIG || {};
  var MIN_CHARS = CFG.MIN_CHARS || 3;
  var DEBOUNCE_MS = 300;
  var TIMEOUT_MS = 20000;

  /* ---------------------------------------------------------------- */
  /* API (Apps Script, or demo data when API_URL is empty)             */
  /* ---------------------------------------------------------------- */

  function request(url, options) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    options = options || {};
    options.signal = ctrl.signal;
    return fetch(url, options)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  var api = CFG.API_URL ? {
    search: function (q) {
      return request(CFG.API_URL + '?action=search&q=' + encodeURIComponent(q));
    },
    submit: function (payload) {
      // text/plain avoids a CORS preflight, which Apps Script can't answer.
      return request(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
    },
  } : demoApi();

  function demoApi() {
    console.info('RSVP: API_URL is empty — using demo guest list.');
    var guests = [
      { id: '0:5', name: 'Ibu Contoh Sekar Ayu (Mama Dinda)', side: 'Tamu Dinda', max: 1 },
      { id: '0:6', name: 'Kak Bima Prasetyo - Mba Laras', side: 'Tamu Dinda', max: 3 },
      { id: '0:7', name: 'Bp. Hendra Wijaya - Ibu Ratna', side: 'Tamu Dinda', max: 2 },
      { id: '0:8', name: 'Mas Andi - Istri', side: 'Tamu Dinda', max: 4 },
      { id: '1:5', name: 'Mas Andi - Istri', side: 'Tamu Ridho', max: 2 },
      { id: '1:6', name: 'Bp. Rahmat Hidayat - Ibu Sari', side: 'Tamu Ridho', max: 2 },
      { id: '1:7', name: 'Kak Nadia', side: 'Tamu Ridho', max: 1 },
      { id: '1:8', name: 'Keluarga Besar Pakde Joko', side: 'Tamu Ridho', max: 2 },
      { id: '1:9', name: 'Tamu Gagal Kirim', side: 'Tamu Ridho', max: 2 },
    ];
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    return {
      search: function (q) {
        var tokens = normalize(q).split(' ');
        var counts = {};
        guests.forEach(function (g) { counts[normalize(g.name)] = (counts[normalize(g.name)] || 0) + 1; });
        var results = guests
          .filter(function (g) {
            var key = normalize(g.name);
            return tokens.every(function (t) { return key.indexOf(t) !== -1; });
          })
          .map(function (g) {
            return { id: g.id, name: g.name, max: g.max, side: counts[normalize(g.name)] > 1 ? g.side : '' };
          });
        return wait(350).then(function () { return { ok: true, results: results }; });
      },
      submit: function (p) {
        return wait(700).then(function () {
          if (/gagal/i.test(p.name)) throw new Error('demo network failure');
          return { ok: true, name: p.name, status: p.status, count: p.status === 'Hadir' ? p.count : 0 };
        });
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  function normalize(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Wraps the parts of `name` that match the typed words in <mark>. */
  function highlight(name, query) {
    var tokens = normalize(query).split(' ').filter(Boolean);
    if (!tokens.length) return escapeHtml(name);
    var flat = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    var marks = new Array(name.length).fill(false);
    tokens.forEach(function (t) {
      var i = flat.indexOf(t);
      while (i !== -1) {
        for (var k = i; k < i + t.length; k++) marks[k] = true;
        i = flat.indexOf(t, i + t.length);
      }
    });
    // NFD can change length for accented names; fall back to plain text then.
    if (flat.length !== name.length) return escapeHtml(name);
    var out = '';
    var open = false;
    for (var j = 0; j < name.length; j++) {
      if (marks[j] && !open) { out += '<mark>'; open = true; }
      if (!marks[j] && open) { out += '</mark>'; open = false; }
      out += escapeHtml(name[j]);
    }
    return out + (open ? '</mark>' : '');
  }

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------- */
  /* Elements + state                                                  */
  /* ---------------------------------------------------------------- */

  var el = {
    formView: $('form-view'),
    thanksView: $('thanks-view'),
    form: $('rsvp-form'),
    searchField: $('search-field'),
    input: $('name-input'),
    list: $('name-list'),
    spinner: $('search-spinner'),
    searchHint: $('search-hint'),
    chosen: $('chosen'),
    chosenName: $('chosen-name'),
    changeName: $('change-name'),
    attendField: $('attend-field'),
    countField: $('count-field'),
    countValue: $('count-value'),
    countDec: $('count-dec'),
    countInc: $('count-inc'),
    countHint: $('count-hint'),
    error: $('form-error'),
    submit: $('submit-btn'),
    thanksTitle: $('thanks-title'),
    thanksText: $('thanks-text'),
    editAnswer: $('edit-answer'),
  };

  var state = {
    guest: null,      // { id, name, side, max }
    status: '',
    count: 1,
    results: [],
    active: -1,
    seq: 0,
    submitting: false,
  };

  if (CFG.COUPLE) {
    document.querySelectorAll('[data-couple]').forEach(function (n) {
      var v = CFG.COUPLE[n.getAttribute('data-couple')];
      if (v) n.textContent = v;
    });
    document.title = 'RSVP · ' + CFG.COUPLE.first + ' & ' + CFG.COUPLE.second;
  }
  el.input.placeholder = 'Ketik minimal ' + MIN_CHARS + ' huruf…';

  /* ---------------------------------------------------------------- */
  /* Autocomplete                                                      */
  /* ---------------------------------------------------------------- */

  var debounceTimer;

  el.input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    var q = el.input.value;
    if (normalize(q).replace(/ /g, '').length < MIN_CHARS) {
      state.seq++;
      closeList();
      setSearching(false);
      el.searchHint.textContent = '';
      return;
    }
    debounceTimer = setTimeout(function () { runSearch(q); }, DEBOUNCE_MS);
  });

  function runSearch(q) {
    var seq = ++state.seq;
    setSearching(true);
    api.search(q)
      .then(function (res) {
        if (seq !== state.seq) return;
        if (!res || !res.ok) throw new Error((res && res.error) || 'search failed');
        renderResults(res.results || [], q);
      })
      .catch(function (err) {
        if (seq !== state.seq) return;
        console.error(err);
        closeList();
        el.searchHint.textContent = 'Gagal memuat daftar tamu. Periksa koneksi Anda lalu coba lagi.';
      })
      .finally(function () {
        if (seq === state.seq) setSearching(false);
      });
  }

  function setSearching(on) { el.spinner.hidden = !on; }

  function renderResults(results, q) {
    state.results = results;
    state.active = -1;
    if (!results.length) {
      closeList();
      el.searchHint.textContent = CFG.NOT_FOUND_TEXT || 'Nama tidak ditemukan.';
      return;
    }
    el.searchHint.textContent = '';
    el.list.innerHTML = results.map(function (r, i) {
      return '<li role="option" id="opt-' + i + '" data-i="' + i + '" aria-selected="false">' +
        highlight(r.name, q) +
        (r.side ? '<span class="side">' + escapeHtml(r.side) + '</span>' : '') +
        '</li>';
    }).join('');
    el.list.hidden = false;
    el.input.setAttribute('aria-expanded', 'true');
  }

  function closeList() {
    el.list.hidden = true;
    el.list.innerHTML = '';
    el.input.setAttribute('aria-expanded', 'false');
    el.input.removeAttribute('aria-activedescendant');
    state.results = [];
    state.active = -1;
  }

  function setActive(i) {
    var items = el.list.querySelectorAll('li');
    if (!items.length) return;
    state.active = (i + items.length) % items.length;
    items.forEach(function (li, k) { li.setAttribute('aria-selected', String(k === state.active)); });
    var cur = items[state.active];
    el.input.setAttribute('aria-activedescendant', cur.id);
    cur.scrollIntoView({ block: 'nearest' });
  }

  el.input.addEventListener('keydown', function (e) {
    if (el.list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(state.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(state.active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      choose(state.results[state.active >= 0 ? state.active : 0]);
    }
    else if (e.key === 'Escape') closeList();
  });

  // Keep focus in the input while tapping an option so blur doesn't close the list first.
  el.list.addEventListener('pointerdown', function (e) { e.preventDefault(); });
  el.list.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-i]');
    if (li) choose(state.results[Number(li.getAttribute('data-i'))]);
  });

  el.input.addEventListener('blur', function () {
    setTimeout(function () { if (document.activeElement !== el.input) closeList(); }, 120);
  });

  /* ---------------------------------------------------------------- */
  /* Selection + answer                                                */
  /* ---------------------------------------------------------------- */

  function choose(guest) {
    if (!guest) return;
    state.guest = guest;
    state.status = '';
    state.count = 1;
    closeList();
    el.searchHint.textContent = '';
    el.chosenName.textContent = guest.name + (guest.side ? ' · ' + guest.side : '');
    el.searchField.hidden = true;
    el.chosen.hidden = false;
    el.attendField.disabled = false;
    el.form.querySelectorAll('input[name="status"]').forEach(function (r) { r.checked = false; });
    hideError();
    renderAnswer();
    el.form.querySelector('input[name="status"]').focus();
  }

  el.changeName.addEventListener('click', function () {
    state.guest = null;
    state.status = '';
    el.chosen.hidden = true;
    el.searchField.hidden = false;
    el.attendField.disabled = true;
    el.form.querySelectorAll('input[name="status"]').forEach(function (r) { r.checked = false; });
    el.input.value = '';
    hideError();
    renderAnswer();
    el.input.focus();
  });

  el.form.addEventListener('change', function (e) {
    if (e.target.name !== 'status') return;
    state.status = e.target.value;
    hideError();
    renderAnswer();
  });

  el.countDec.addEventListener('click', function () { setCount(state.count - 1); });
  el.countInc.addEventListener('click', function () { setCount(state.count + 1); });

  function setCount(n) {
    var max = state.guest ? state.guest.max : 1;
    state.count = Math.min(Math.max(n, 1), max);
    renderAnswer();
  }

  function renderAnswer() {
    var attending = state.status === 'Hadir' && state.guest;
    el.countField.hidden = !attending;
    if (attending) {
      var max = state.guest.max;
      el.countValue.textContent = state.count;
      el.countDec.disabled = state.count <= 1;
      el.countInc.disabled = state.count >= max;
      el.countHint.textContent = 'Maksimal ' + max + ' orang sesuai undangan';
    }
    el.submit.disabled = state.submitting || !state.guest || !state.status;
  }

  /* ---------------------------------------------------------------- */
  /* Submit                                                            */
  /* ---------------------------------------------------------------- */

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.submitting || !state.guest || !state.status) return;

    state.submitting = true;
    el.submit.classList.add('loading');
    el.submit.querySelector('.submit-text').textContent = 'Mengirim';
    hideError();
    renderAnswer();

    api.submit({
      id: state.guest.id,
      name: state.guest.name,
      status: state.status,
      count: state.status === 'Hadir' ? state.count : 0,
    })
      .then(function (res) {
        if (!res || !res.ok) {
          showError((res && res.error) || 'Konfirmasi gagal dikirim. Silakan coba lagi.');
          return;
        }
        showThanks(res);
      })
      .catch(function (err) {
        console.error(err);
        showError('Konfirmasi gagal dikirim. Periksa koneksi Anda lalu coba lagi.');
      })
      .finally(function () {
        state.submitting = false;
        el.submit.classList.remove('loading');
        el.submit.querySelector('.submit-text').textContent = 'Kirim Konfirmasi';
        renderAnswer();
      });
  });

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
  }

  function hideError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function showThanks(res) {
    var name = state.guest.name;
    if (res.status === 'Hadir') {
      el.thanksTitle.textContent = 'Sampai Jumpa!';
      el.thanksText.textContent = 'Terima kasih, ' + name + '. Kami sangat menantikan kehadiran ' +
        (res.count > 1 ? res.count + ' orang' : 'Anda') + ' di hari bahagia kami.';
    } else {
      el.thanksTitle.textContent = 'Terima Kasih';
      el.thanksText.textContent = 'Terima kasih atas konfirmasinya, ' + name +
        '. Doa dan restu Anda sangat berarti bagi kami.';
    }
    el.formView.hidden = true;
    el.thanksView.hidden = false;
    el.thanksView.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  el.editAnswer.addEventListener('click', function () {
    el.thanksView.hidden = true;
    el.formView.hidden = false;
    renderAnswer();
  });
})();
