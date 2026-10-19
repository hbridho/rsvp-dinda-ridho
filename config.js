// Settings the page reads at runtime. Wording of the invitation itself lives in index.html.
window.RSVP_CONFIG = {
  // Apps Script web app URL (ends in /exec). Leave empty to use demo data locally.
  API_URL: 'https://script.google.com/macros/s/AKfycbyHrR0F_N6H_FTqxDXxla9GpRAzTCS9RcY9LwUggUK7GawbupGyDrs5bXip854vqLEZ/exec',

  // Letters a guest must type before suggestions appear.
  MIN_CHARS: 3,

  // Shown when a guest can't find their name.
  NOT_FOUND_TEXT: 'Nama tidak ditemukan? Silakan hubungi keluarga mempelai.',
};
