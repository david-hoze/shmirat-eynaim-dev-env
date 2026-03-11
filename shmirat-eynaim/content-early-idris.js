// From Extension.ContentEarly — minimal, no Idris runtime needed
(function() {
  var s = document.createElement('style');
  s.id = 'shmirat-eynaim-early-hide';
  s.textContent = 'img, video[poster] { opacity: 0 !important; }';
  (document.head || document.documentElement).appendChild(s);
})();
