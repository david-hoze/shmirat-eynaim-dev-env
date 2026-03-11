-- FFI.DOM.Element — DOM Element API bindings with type-safe property access.
--
-- KEY DESIGN: Elements carry phantom type tags that track what state they're in.
-- This prevents the CSS-JS coupling bug at the type level.

module FFI.DOM.Element

import FFI.Core

---------------------------------------------------------------------------
-- Element state tags (phantom types)
--
-- These track the lifecycle of an image element through the analysis pipeline.
-- An element in `Discovered` state has a readable background-image URL.
-- An element in `Pending` state has been marked for analysis — CSS may have
-- modified its visual properties.
-- An element in `Classified` state has a final safe/blocked result.
---------------------------------------------------------------------------

||| The element was just found by image discovery. Its URL is readable.
public export
data Discovered : Type where
  MkDiscovered : Discovered

||| The element is pending analysis. CSS has set opacity:0.
||| The URL has been extracted and stored in the ImageRef — do NOT read from DOM.
public export
data Pending : Type where
  MkPending : Pending

||| The element has been classified as safe. Visible.
public export
data Safe : Type where
  MkSafe : Safe

||| The element has been classified as blocked. Hidden.
public export
data Blocked : Type where
  MkBlocked : Blocked

||| A DOM element tagged with its current lifecycle state.
||| The state `s` is a phantom type — it exists only at compile time.
export
data Element : (s : Type) -> Type where [external]

||| An untagged element (for raw DOM operations that don't care about state).
public export
RawElement : Type
RawElement = Element ()

---------------------------------------------------------------------------
-- Core DOM operations (work on any element state)
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, w) => el.tagName"
prim__tagName : Element s -> PrimIO String

%foreign "browser:lambda:(_s, el, name, w) => el.getAttribute(name)"
prim__getAttribute : Element s -> String -> PrimIO JsValue

%foreign "browser:lambda:(_s, el, ns, name, w) => el.getAttributeNS(ns, name)"
prim__getAttributeNS : Element s -> String -> String -> PrimIO JsValue

%foreign "browser:lambda:(_s, el, w) => el.classList"
prim__classList : Element s -> PrimIO JsValue

%foreign "browser:lambda:(_s, el, cls, w) => el.classList.contains(cls)"
prim__hasClass : Element s -> String -> PrimIO Bool

%foreign "browser:lambda:(_s, el, w) => { var r = el.getBoundingClientRect(); return {width: r.width, height: r.height}; }"
prim__boundingRect : Element s -> PrimIO JsObject

export
tagName : HasIO io => Element s -> io String
tagName el = primIO $ prim__tagName el

export
getAttribute : HasIO io => Element s -> String -> io JsValue
getAttribute el name = primIO $ prim__getAttribute el name

export
getAttributeNS : HasIO io => Element s -> String -> String -> io JsValue
getAttributeNS el ns name = primIO $ prim__getAttributeNS el ns name

export
hasClass : HasIO io => Element s -> String -> io Bool
hasClass el cls = primIO $ prim__hasClass el cls

---------------------------------------------------------------------------
-- Size queries
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, w) => el.naturalWidth || 0"
prim__naturalWidth : Element s -> PrimIO Int32

%foreign "browser:lambda:(_s, el, w) => el.naturalHeight || 0"
prim__naturalHeight : Element s -> PrimIO Int32

export
naturalWidth : HasIO io => Element s -> io Int32
naturalWidth el = primIO $ prim__naturalWidth el

export
naturalHeight : HasIO io => Element s -> io Int32
naturalHeight el = primIO $ prim__naturalHeight el

export
record ElementSize where
  constructor MkSize
  width : Double
  height : Double

export
boundingRect : HasIO io => Element s -> io ElementSize
boundingRect el = do
  obj <- primIO $ prim__boundingRect el
  w <- primIO $ prim__objGetDouble obj "width"
  h <- primIO $ prim__objGetDouble obj "height"
  pure $ MkSize w h
  where
    %foreign "javascript:lambda:(o, k, w) => o[k] || 0"
    prim__objGetDouble : JsObject -> String -> PrimIO Double

---------------------------------------------------------------------------
-- SVG detection
--
-- Large SVGs (viewBox > 100x100 or rendered size > 100x100) are potential
-- ad banners or hero images that need ML classification.
-- Small SVGs without <image> children are icons — skip them.
---------------------------------------------------------------------------

%foreign "javascript:lambda:(_s, svg, w) => { var vb = svg.getAttribute('viewBox'); if (vb) { var p = vb.split(/[\\s,]+/); if (p.length === 4 && parseFloat(p[2]) > 100 && parseFloat(p[3]) > 100) return 1; } var r = svg.getBoundingClientRect(); return (r.width > 100 && r.height > 100) ? 1 : 0; }"
prim__isSvgLarge : Element s -> PrimIO Int32

||| Check if an SVG element is large enough to be a potential image
||| (ad banner, hero image, etc.) rather than an icon.
||| Checks viewBox dimensions > 100x100, falling back to bounding rect.
export
isSvgLarge : HasIO io => Element s -> io Bool
isSvgLarge el = do
  r <- primIO $ prim__isSvgLarge el
  pure (r == 1)

%foreign "javascript:lambda:(_s, svg, w) => svg.querySelector('image[href], image[xlink\\\\:href]') !== null ? 1 : 0"
prim__svgHasImageChild : Element s -> PrimIO Int32

||| Check if an SVG contains an <image> child element.
export
svgHasImageChild : HasIO io => Element s -> io Bool
svgHasImageChild el = do
  r <- primIO $ prim__svgHasImageChild el
  pure (r == 1)

||| An SVG should be treated as a discoverable image if it either
||| contains an <image> child OR is large enough to be a potential ad/photo.
export
isSvgImage : HasIO io => Element s -> io Bool
isSvgImage el = do
  hasChild <- svgHasImageChild el
  if hasChild then pure True else isSvgLarge el

%foreign "javascript:lambda:(_s, svg, w) => { try { var s = new XMLSerializer().serializeToString(svg); return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s))); } catch(e) { return ''; } }"
prim__svgSerializeUrl : Element s -> PrimIO String

||| Serialize an SVG element to a data:image/svg+xml;base64,... URL.
||| This captures the SVG content as an Idris String, independent of the DOM.
export
svgSerializeUrl : HasIO io => Element s -> io String
svgSerializeUrl el = primIO $ prim__svgSerializeUrl el

---------------------------------------------------------------------------
-- Image source extraction
--
-- CRITICAL: This is the function that was broken by the CSS-JS coupling bug.
-- In the JS version, getComputedStyle returned "none" because CSS had set
-- `background-image: none !important` on pending elements.
--
-- In Idris, we enforce this at the type level:
--   getImageSrc ONLY accepts Element Discovered
-- You literally cannot call it on an Element Pending.
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, w) => el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || ''"
prim__imgSrc : Element s -> PrimIO String

%foreign "browser:lambda:(_s, el, w) => el.getAttribute('poster') || ''"
prim__posterSrc : Element s -> PrimIO String

%foreign "browser:lambda:(_s, el, w) => { var img = el.querySelector('image[href], image[xlink\\\\:href]'); return img ? (img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '') : ''; }"
prim__svgImageHref : Element s -> PrimIO String

-- Read inline style (immune to CSS cascade overrides)
%foreign "browser:lambda:(_s, el, w) => { var bg = el.style.backgroundImage; if (bg && bg !== 'none' && bg.includes('url(')) { var m = bg.match(/url\\([\"']?(.+?)[\"']?\\)/); return m ? m[1] : ''; } return ''; }"
prim__inlineBgUrl : Element s -> PrimIO String

-- Fallback: read computed style (affected by CSS rules — use only for non-inline BG)
%foreign "browser:lambda:(_s, el, w) => { var bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') { var m = bg.match(/url\\([\"']?(.+?)[\"']?\\)/); return m ? m[1] : ''; } return ''; }"
prim__computedBgUrl : Element s -> PrimIO String

||| Extract the image URL from a discovered element.
|||
||| TYPE SAFETY: This function only accepts `Element Discovered`.
||| Once an element transitions to `Pending` (via `markPending`),
||| you can no longer call this function — the type checker prevents it.
||| The URL must be extracted BEFORE marking pending.
|||
||| For SVG elements: if the SVG has an <image> child, extracts the href.
||| If the SVG is large (ad banner) but has no <image> child, serializes
||| the entire SVG to a data URL — capturing its content before CSS can
||| modify it.
export
getImageSrc : HasIO io => Element Discovered -> io ImageUrl
getImageSrc el = do
  tag <- tagName el
  case tag of
    "IMG"   => primIO $ prim__imgSrc el
    "IMAGE" => primIO $ prim__imgSrc el
    "VIDEO" => primIO $ prim__posterSrc el
    "svg"   => svgSrc el
    "SVG"   => svgSrc el
    _       => do
      -- Background image: read inline first (immune to CSS), then computed
      inlineBg <- primIO $ prim__inlineBgUrl el
      if inlineBg /= ""
        then pure inlineBg
        else primIO $ prim__computedBgUrl el
  where
    svgSrc : Element Discovered -> io ImageUrl
    svgSrc svg = do
      href <- primIO $ prim__svgImageHref svg
      if href /= ""
        then pure href
        else do
          large <- isSvgLarge svg
          if large
            then svgSerializeUrl svg  -- Capture SVG content as data URL
            else pure ""

---------------------------------------------------------------------------
-- State transitions
--
-- These are the key type-level operations. Each transition consumes the
-- input element and produces an element in the new state.
-- In practice, the underlying JS reference is the same — only the
-- Idris type changes. But the type system enforces the protocol.
---------------------------------------------------------------------------

%foreign "browser:lambda:(el, w) => { el.classList.add('shmirat-eynaim-pending'); return el; }"
prim__addPendingClass : Element Discovered -> PrimIO (Element Pending)

%foreign "browser:lambda:(el, w) => { el.classList.remove('shmirat-eynaim-pending'); el.classList.add('shmirat-eynaim-safe'); return el; }"
prim__markSafeClass : Element Pending -> PrimIO (Element Safe)

%foreign "browser:lambda:(el, w) => { el.classList.remove('shmirat-eynaim-pending'); el.classList.add('shmirat-eynaim-blocked'); return el; }"
prim__markBlockedClass : Element Pending -> PrimIO (Element Blocked)

||| Mark an element as pending analysis.
||| Consumes the `Discovered` element and returns a `Pending` element.
||| After this, `getImageSrc` cannot be called — the type has changed.
export
markPending : HasIO io => Element Discovered -> io (Element Pending)
markPending el = primIO $ prim__addPendingClass el

||| Mark a pending element as safe (show it).
export
markSafe : HasIO io => Element Pending -> io (Element Safe)
markSafe el = primIO $ prim__markSafeClass el

||| Mark a pending element as blocked (hide it).
export
markBlocked : HasIO io => Element Pending -> io (Element Blocked)
markBlocked el = primIO $ prim__markBlockedClass el

---------------------------------------------------------------------------
-- Override transitions (for when a later classification source disagrees)
---------------------------------------------------------------------------

%foreign "browser:lambda:(el, w) => { el.classList.remove('shmirat-eynaim-safe'); el.classList.add('shmirat-eynaim-blocked'); return el; }"
prim__overrideToBlocked : Element Safe -> PrimIO (Element Blocked)

%foreign "browser:lambda:(el, w) => { el.classList.remove('shmirat-eynaim-blocked'); el.classList.add('shmirat-eynaim-safe'); return el; }"
prim__overrideToSafe : Element Blocked -> PrimIO (Element Safe)

export
overrideToBlocked : HasIO io => Element Safe -> io (Element Blocked)
overrideToBlocked el = primIO $ prim__overrideToBlocked el

export
overrideToSafe : HasIO io => Element Blocked -> io (Element Safe)
overrideToSafe el = primIO $ prim__overrideToSafe el

---------------------------------------------------------------------------
-- Casting (escape hatch for runtime element lookups)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(_s, _t, el, w) => el"
prim__castElement : Element s -> PrimIO (Element t)

||| Unsafe cast — use only when you have runtime evidence of the state
||| (e.g., checking classList contains "shmirat-eynaim-pending").
export
unsafeCastElement : HasIO io => Element s -> io (Element t)
unsafeCastElement el = primIO $ prim__castElement el

---------------------------------------------------------------------------
-- Event listeners
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, event, handler, w) => el.addEventListener(event, e => handler(e)(w))"
prim__addEventListener : Element s -> String -> (JsValue -> PrimIO ()) -> PrimIO ()

export
addEventListener : HasIO io => Element s -> String -> (JsValue -> IO ()) -> io ()
addEventListener el event handler =
  primIO $ prim__addEventListener el event (\e => toPrim $ handler e)

---------------------------------------------------------------------------
-- Query selectors (return untyped / Discovered elements)
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, sel, w) => el.querySelectorAll(sel)"
prim__querySelectorAll : Element s -> String -> PrimIO (JsArray RawElement)

%foreign "browser:lambda:(_s, el, sel, w) => el.querySelector(sel)"
prim__querySelector : Element s -> String -> PrimIO JsValue

export
querySelectorAll : HasIO io => Element s -> String -> io (JsArray RawElement)
querySelectorAll el sel = primIO $ prim__querySelectorAll el sel

---------------------------------------------------------------------------
-- Image element properties
---------------------------------------------------------------------------

%foreign "browser:lambda:(_s, el, w) => el.complete || false"
prim__imgComplete : Element s -> PrimIO Bool

export
imgComplete : HasIO io => Element s -> io Bool
imgComplete el = primIO $ prim__imgComplete el

---------------------------------------------------------------------------
-- Background image detection
---------------------------------------------------------------------------

%foreign "javascript:lambda:(_s, el, w) => { var bg = el.style.backgroundImage; return (bg && bg !== 'none' && bg.includes('url(')) ? 1 : 0; }"
prim__hasBgImage : Element s -> PrimIO Int32

||| Check if an element has a background-image set in its inline style.
export
hasBgImage : HasIO io => Element s -> io Bool
hasBgImage el = do
  r <- primIO $ prim__hasBgImage el
  pure (r == 1)

%foreign "javascript:lambda:(_s, el, w) => el.hasAttribute('poster') ? 1 : 0"
prim__hasPoster : Element s -> PrimIO Int32

||| Check if a video element has a poster attribute.
export
hasPoster : HasIO io => Element s -> io Bool
hasPoster el = do
  r <- primIO $ prim__hasPoster el
  pure (r == 1)
