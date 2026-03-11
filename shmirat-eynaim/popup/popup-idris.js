class IdrisError extends Error { }

function __prim_js2idris_array(x){
  let acc = { h:0 };

  for (let i = x.length-1; i>=0; i--) {
      acc = { a1:x[i], a2:acc };
  }
  return acc;
}

function __prim_idris2js_array(x){
  const result = Array();
  while (x.h === undefined) {
    result.push(x.a1); x = x.a2;
  }
  return result;
}

function __lazy(thunk) {
  let res;
  return function () {
    if (thunk === undefined) return res;
    res = thunk();
    thunk = undefined;
    return res;
  };
};

function __prim_stringIteratorNew(_str) {
  return 0
}

function __prim_stringIteratorToString(_, str, it, f) {
  return f(str.slice(it))
}

function __prim_stringIteratorNext(str, it) {
  if (it >= str.length)
    return {h: 0};
  else
    return {a1: str.charAt(it), a2: it + 1};
}

function __tailRec(f,ini) {
  let obj = ini;
  while(true){
    switch(obj.h){
      case 0: return obj.a1;
      default: obj = f(obj);
    }
  }
}

const _idrisworld = Symbol('idrisworld')

const _crashExp = x=>{throw new IdrisError(x)}

const _bigIntOfString = s=> {
  try {
    const idx = s.indexOf('.')
    return idx === -1 ? BigInt(s) : BigInt(s.slice(0, idx))
  } catch (e) { return 0n }
}

const _numberOfString = s=> {
  try {
    const res = Number(s);
    return isNaN(res) ? 0 : res;
  } catch (e) { return 0 }
}

const _intOfString = s=> Math.trunc(_numberOfString(s))

const _truncToChar = x=> String.fromCodePoint(
  (x >= 0 && x <= 55295) || (x >= 57344 && x <= 1114111) ? x : 0
)

// Int8
const _truncInt8 = x => {
  const res = x & 0xff;
  return res >= 0x80 ? res - 0x100 : res;
}

const _truncBigInt8 = x => Number(BigInt.asIntN(8, x))

// Euclidian Division
const _div = (a,b) => {
  const q = Math.trunc(a / b)
  const r = a % b
  return r < 0 ? (b > 0 ? q - 1 : q + 1) : q
}

const _divBigInt = (a,b) => {
  const q = a / b
  const r = a % b
  return r < 0n ? (b > 0n ? q - 1n : q + 1n) : q
}

// Euclidian Modulo
const _mod = (a,b) => {
  const r = a % b
  return r < 0 ? (b > 0 ? r + b : r - b) : r
}

const _modBigInt = (a,b) => {
  const r = a % b
  return r < 0n ? (b > 0n ? r + b : r - b) : r
}

const _add8s = (a,b) => _truncInt8(a + b)
const _sub8s = (a,b) => _truncInt8(a - b)
const _mul8s = (a,b) => _truncInt8(a * b)
const _div8s = (a,b) => _truncInt8(_div(a,b))
const _shl8s = (a,b) => _truncInt8(a << b)
const _shr8s = (a,b) => _truncInt8(a >> b)

// Int16
const _truncInt16 = x => {
  const res = x & 0xffff;
  return res >= 0x8000 ? res - 0x10000 : res;
}

const _truncBigInt16 = x => Number(BigInt.asIntN(16, x))

const _add16s = (a,b) => _truncInt16(a + b)
const _sub16s = (a,b) => _truncInt16(a - b)
const _mul16s = (a,b) => _truncInt16(a * b)
const _div16s = (a,b) => _truncInt16(_div(a,b))
const _shl16s = (a,b) => _truncInt16(a << b)
const _shr16s = (a,b) => _truncInt16(a >> b)

//Int32
const _truncInt32 = x => x & 0xffffffff

const _truncBigInt32 = x => Number(BigInt.asIntN(32, x))

const _add32s = (a,b) => _truncInt32(a + b)
const _sub32s = (a,b) => _truncInt32(a - b)
const _div32s = (a,b) => _truncInt32(_div(a,b))

const _mul32s = (a,b) => {
  const res = a * b;
  if (res <= Number.MIN_SAFE_INTEGER || res >= Number.MAX_SAFE_INTEGER) {
    return _truncInt32((a & 0xffff) * b + (b & 0xffff) * (a & 0xffff0000))
  } else {
    return _truncInt32(res)
  }
}

//Int64
const _truncBigInt64 = x => BigInt.asIntN(64, x)

const _add64s = (a,b) => _truncBigInt64(a + b)
const _sub64s = (a,b) => _truncBigInt64(a - b)
const _mul64s = (a,b) => _truncBigInt64(a * b)
const _shl64s = (a,b) => _truncBigInt64(a << b)
const _div64s = (a,b) => _truncBigInt64(_divBigInt(a,b))
const _shr64s = (a,b) => _truncBigInt64(a >> b)

//Bits8
const _truncUInt8 = x => x & 0xff

const _truncUBigInt8 = x => Number(BigInt.asUintN(8, x))

const _add8u = (a,b) => (a + b) & 0xff
const _sub8u = (a,b) => (a - b) & 0xff
const _mul8u = (a,b) => (a * b) & 0xff
const _div8u = (a,b) => Math.trunc(a / b)
const _shl8u = (a,b) => (a << b) & 0xff
const _shr8u = (a,b) => (a >> b) & 0xff

//Bits16
const _truncUInt16 = x => x & 0xffff

const _truncUBigInt16 = x => Number(BigInt.asUintN(16, x))

const _add16u = (a,b) => (a + b) & 0xffff
const _sub16u = (a,b) => (a - b) & 0xffff
const _mul16u = (a,b) => (a * b) & 0xffff
const _div16u = (a,b) => Math.trunc(a / b)
const _shl16u = (a,b) => (a << b) & 0xffff
const _shr16u = (a,b) => (a >> b) & 0xffff

//Bits32
const _truncUBigInt32 = x => Number(BigInt.asUintN(32, x))

const _truncUInt32 = x => {
  const res = x & -1;
  return res < 0 ? res + 0x100000000 : res;
}

const _add32u = (a,b) => _truncUInt32(a + b)
const _sub32u = (a,b) => _truncUInt32(a - b)
const _mul32u = (a,b) => _truncUInt32(_mul32s(a,b))
const _div32u = (a,b) => Math.trunc(a / b)

const _shl32u = (a,b) => _truncUInt32(a << b)
const _shr32u = (a,b) => _truncUInt32(a <= 0x7fffffff ? a >> b : (b == 0 ? a : (a >> b) ^ ((-0x80000000) >> (b-1))))
const _and32u = (a,b) => _truncUInt32(a & b)
const _or32u = (a,b)  => _truncUInt32(a | b)
const _xor32u = (a,b) => _truncUInt32(a ^ b)

//Bits64
const _truncUBigInt64 = x => BigInt.asUintN(64, x)

const _add64u = (a,b) => BigInt.asUintN(64, a + b)
const _mul64u = (a,b) => BigInt.asUintN(64, a * b)
const _div64u = (a,b) => a / b
const _shl64u = (a,b) => BigInt.asUintN(64, a << b)
const _shr64u = (a,b) => BigInt.asUintN(64, a >> b)
const _sub64u = (a,b) => BigInt.asUintN(64, a - b)

//String
const _strReverse = x => x.split('').reverse().join('')

const _substr = (o,l,x) => x.slice(o, o + l)

const Extension_Popup_prim__initPopup = ((w) => { var cd = ''; var cs = {}; var toggle = document.getElementById('toggle'); var domainEl = document.getElementById('domain'); var wlBtn = document.getElementById('whitelist-btn'); var wlList = document.getElementById('whitelist-list'); var emptyMsg = document.getElementById('empty-msg'); var statsEl = document.getElementById('stats'); var learnEl = document.getElementById('learning-stats'); var classEl = document.getElementById('classifier-status'); var resetBtn = document.getElementById('reset-btn'); var exportBtn = document.getElementById('export-btn'); var importBtn = document.getElementById('import-btn'); var importFile = document.getElementById('import-file'); var apiKeyInput = document.getElementById('api-key'); var saveKeyBtn = document.getElementById('save-key-btn'); var cloudStatsEl = document.getElementById('cloud-stats'); var cloudRadios = document.querySelectorAll('input[name="cloud-mode"]'); var serverStatusEl = document.getElementById('server-status'); function renderWhitelist(wl) { if (!wlList) return; wlList.innerHTML = ''; if (!wl || wl.length === 0) { if (emptyMsg) emptyMsg.style.display = 'block'; return; } if (emptyMsg) emptyMsg.style.display = 'none'; for (var i = 0; i < wl.length; i++) { (function(domain) { var li = document.createElement('li'); var span = document.createElement('span'); span.textContent = domain; var btn = document.createElement('button'); btn.className = 'btn remove'; btn.textContent = '\u00d7'; btn.title = 'Remove from trusted sites'; btn.addEventListener('click', function() { browser.runtime.sendMessage({ type: 'removeWhitelist', domain: domain }).then(function(resp) { cs = resp; render(); }); }); li.appendChild(span); li.appendChild(btn); wlList.appendChild(li); })(wl[i]); } } function updateWlBtn() { if (!wlBtn) return; var wl = cs.whitelist && cs.whitelist.includes(cd); wlBtn.textContent = wl ? 'Remove trust' : 'Trust this site'; } function updateStats() { browser.runtime.sendMessage({ type: 'getStats' }).then(function(s) { if (statsEl && s) statsEl.textContent = (s.scanned || 0) + ' scanned, ' + (s.hidden || 0) + ' hidden'; }).catch(function() { if (statsEl) statsEl.textContent = '0 scanned, 0 hidden'; }); } function updateLearning() { browser.runtime.sendMessage({ type: 'getLearningStats' }).then(function(s) { if (!s) return; var total = s.knownFacesCount + s.knownSafeFacesCount; if (learnEl) { if (total === 0) learnEl.textContent = 'No faces learned yet.'; else learnEl.textContent = 'Faces learned: ' + total + ' (' + s.knownFacesCount + ' blocked, ' + s.knownSafeFacesCount + ' safe)'; } if (classEl) { if (s.classifierTrained) classEl.textContent = 'Custom model: trained on ' + s.trainingDataCount + ' examples'; else if (s.trainingDataCount > 0) classEl.textContent = 'Custom model: need ' + (10 - s.trainingDataCount) + ' more examples'; else classEl.textContent = 'Custom model: not enough data'; } }).catch(function() { if (learnEl) learnEl.textContent = 'No faces learned yet.'; }); } function updateCloud() { browser.runtime.sendMessage({ type: 'getCloudStats' }).then(function(s) { if (!s) return; cloudRadios.forEach(function(r) { r.checked = r.value === s.cloudMode; }); if (cloudStatsEl) { if (!s.hasApiKey) cloudStatsEl.textContent = 'No API key set.'; else { var cost = (s.cloudCallsToday * 0.002).toFixed(3); cloudStatsEl.textContent = 'Today: ' + s.cloudCallsToday + ' API calls (~$' + cost + ') | ' + s.cloudSavedCount + ' saved locally | ' + s.cloudCacheSize + ' cached URLs'; } } }).catch(function() { if (cloudStatsEl) cloudStatsEl.textContent = 'No API key set.'; }); } function updateServer() { browser.runtime.sendMessage({ type: 'getServerConfig' }).then(function(c) { if (!serverStatusEl) return; if (c && c.serverEnabled) { serverStatusEl.textContent = 'Connected'; serverStatusEl.className = 'server-status connected'; } else { serverStatusEl.textContent = 'Not connected.'; serverStatusEl.className = 'server-status'; } }).catch(function() { if (serverStatusEl) { serverStatusEl.textContent = 'Not connected.'; serverStatusEl.className = 'server-status'; } }); } function render() { if (toggle) toggle.checked = cs.blockingEnabled; if (domainEl) domainEl.textContent = cd || '\u2014'; renderWhitelist(cs.whitelist); updateWlBtn(); updateStats(); updateLearning(); updateCloud(); updateServer(); } browser.tabs.query({ active: true, currentWindow: true }).then(function(tabs) { if (tabs[0] && tabs[0].url) { try { cd = new URL(tabs[0].url).hostname; } catch(e) {} } return browser.runtime.sendMessage({ type: 'getState', domain: cd }); }).then(function(state) { cs = state; render(); }); if (toggle) toggle.addEventListener('change', function() { browser.runtime.sendMessage({ type: 'toggle' }).then(function(resp) { cs = resp; render(); }); }); if (wlBtn) wlBtn.addEventListener('click', function() { if (!cd) return; var isWl = cs.whitelist && cs.whitelist.includes(cd); browser.runtime.sendMessage({ type: isWl ? 'removeWhitelist' : 'addWhitelist', domain: cd }).then(function(resp) { cs = resp; render(); }); }); if (resetBtn) resetBtn.addEventListener('click', function() { if (confirm('Reset all learned faces and the custom model? This cannot be undone.')) { browser.runtime.sendMessage({ type: 'resetLearning' }).then(function() { updateLearning(); }); } }); if (exportBtn) exportBtn.addEventListener('click', function() { browser.runtime.sendMessage({ type: 'exportLearning' }).then(function(data) { var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'shmirat-eynaim-learned.json'; a.click(); URL.revokeObjectURL(url); }); }); if (importBtn) importBtn.addEventListener('click', function() { if (importFile) importFile.click(); }); if (importFile) importFile.addEventListener('change', function(e) { var file = e.target.files[0]; if (!file) return; file.text().then(function(text) { var data = JSON.parse(text); return browser.runtime.sendMessage({ type: 'importLearning', data: data }); }).then(function() { updateLearning(); }).catch(function() { alert('Invalid JSON file.'); }); }); if (saveKeyBtn) saveKeyBtn.addEventListener('click', function() { var key = apiKeyInput ? apiKeyInput.value.trim() : ''; browser.runtime.sendMessage({ type: 'setApiKey', key: key }).then(function() { if (apiKeyInput) { apiKeyInput.value = ''; apiKeyInput.placeholder = key ? 'Key saved' : 'Anthropic API key'; } updateCloud(); }); }); cloudRadios.forEach(function(radio) { radio.addEventListener('change', function(e) { browser.runtime.sendMessage({ type: 'setCloudMode', mode: e.target.value }).then(function() { updateCloud(); }); }); }); console.log('[SE] Popup initialized (Idris)'); });
/* {__mainExpression:0} */
function __mainExpression_0() {
 return PrimIO_unsafePerformIO($2 => Extension_Popup_main($2));
}

/* prim__sub_Integer : Integer -> Integer -> Integer */
function prim__sub_Integer($0, $1) {
 return ($0-$1);
}

/* Extension.Popup.main : IO () */
function Extension_Popup_main($0) {
 return Extension_Popup_prim__initPopup($0);
}

/* Prelude.Types.prim__integerToNat : Integer -> Nat */
function Prelude_Types_prim__integerToNat($0) {
 switch(((0n<=$0)?1:0)) {
  case 0: return 0n;
  default: return $0;
 }
}

/* Prelude.EqOrd.compare */
function Prelude_EqOrd_compare_Ord_Integer($0, $1) {
 switch(Prelude_EqOrd_x3c_Ord_Integer($0, $1)) {
  case 1: return 0;
  case 0: {
   switch(Prelude_EqOrd_x3dx3d_Eq_Integer($0, $1)) {
    case 1: return 1;
    case 0: return 2;
   }
  }
 }
}

/* Prelude.EqOrd.== */
function Prelude_EqOrd_x3dx3d_Eq_Integer($0, $1) {
 switch((($0===$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.< */
function Prelude_EqOrd_x3c_Ord_Integer($0, $1) {
 switch((($0<$1)?1:0)) {
  case 0: return 0;
  default: return 1;
 }
}

/* Prelude.EqOrd.compareInteger : Integer -> Integer -> Ordering */
function Prelude_EqOrd_compareInteger($0, $1) {
 return Prelude_EqOrd_compare_Ord_Integer($0, $1);
}

/* PrimIO.unsafePerformIO : IO a -> a */
function PrimIO_unsafePerformIO($0) {
 return PrimIO_unsafeCreateWorld(w => $0(w));
}

/* PrimIO.unsafeCreateWorld : (1 _ : ((1 _ : %World) -> a)) -> a */
function PrimIO_unsafeCreateWorld($0) {
 return $0(_idrisworld);
}


try{__mainExpression_0()}catch(e){if(e instanceof IdrisError){console.log('ERROR: ' + e.message)}else{throw e} }
