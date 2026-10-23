// Applies the saved theme and colour mood before React loads, so the page never
// flashes the wrong colours. Loaded from index.html; keep it tiny and dependency-free.
(function () {
  try {
    var t = localStorage.getItem('locations-theme');
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  try {
    var m = localStorage.getItem('locations-mood') || 'unsolicited-linkedin-advice';
    document.documentElement.setAttribute('data-mood', m);
  } catch (e) {
    document.documentElement.setAttribute('data-mood', 'unsolicited-linkedin-advice');
  }
})();
