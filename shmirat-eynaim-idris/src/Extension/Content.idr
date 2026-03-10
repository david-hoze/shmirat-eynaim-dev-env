-- Extension.Content — Content script entry point
--
-- This is the main module for the content script context.
-- Compile with: idris2 --cg javascript -o content-idris.js src/Extension/Content.idr
--
-- Responsibilities:
--   - Discover images on the page
--   - Extract URLs BEFORE marking pending (type-enforced)
--   - Send images to background for classification
--   - Apply results (hide/show) to DOM elements
--   - MutationObserver for dynamic content

module Extension.Content

import FFI.Core
import FFI.Browser.Runtime
import FFI.DOM.Element
import FFI.DOM.Document
import FFI.DOM.Observer
import FFI.DOM.Style
import Data.Maybe
import Data.String
import Extension.Types
import Extension.Properties

---------------------------------------------------------------------------
-- Configuration
---------------------------------------------------------------------------

||| Maximum concurrent image analyses.
maxConcurrent : Nat
maxConcurrent = 3

||| Minimum image dimensions to analyze.
minDimension : Int32
minDimension = 40

||| Icon CDN domains to skip.
iconDomains : List String
iconDomains =
  [ "fonts.googleapis.com"
  , "fonts.gstatic.com"
  , "cdnjs.cloudflare.com"
  , "use.fontawesome.com"
  , "ka-f.fontawesome.com"
  ]

---------------------------------------------------------------------------
-- Skip filters (pure)
---------------------------------------------------------------------------

||| Check if a URL is from an icon CDN.
isIconDomain : String -> Bool
isIconDomain url =
  -- Simplified check — in production, parse URL and check hostname
  any (\d => isInfixOf d url) iconDomains

---------------------------------------------------------------------------
-- Image discovery
--
-- CRITICAL: This uses the type-safe `discoverImage` function from
-- Extension.Properties. The URL is extracted BEFORE markPending is called.
-- After discovery, the URL lives in ImageRef.url (an Idris String),
-- not in the DOM.
---------------------------------------------------------------------------

||| Discover all images in a subtree and create ImageRefs for them.
||| Each ImageRef captures the URL at discovery time (immune to CSS).
export
discoverImages : HasIO io => RawElement -> io (List ImageRef)
discoverImages root = do
  -- Find all potential image elements
  imgs     <- querySelectorAll root "img"
  bgEls    <- querySelectorAll root "[style*='background-image']"
  videos   <- querySelectorAll root "video[poster]"
  svgAds   <- querySelectorAll root "svg.img_ad, svg.image"

  -- Process each element through the type-safe discovery protocol
  imgRefs    <- liftIO $ processElements imgs
  bgRefs     <- liftIO $ processElements bgEls
  videoRefs  <- liftIO $ processElements videos
  svgRefs    <- liftIO $ processElements svgAds

  pure (imgRefs ++ bgRefs ++ videoRefs ++ svgRefs)
  where
    processElements : JsArray RawElement -> IO (List ImageRef)
    processElements els = do
      len <- arrayLength els
      go 0 len []
      where
        go : Int32 -> Int32 -> List ImageRef -> IO (List ImageRef)
        go i n acc =
          if i >= n then pure (reverse acc)
          else do
            el <- arrayGet els i
            -- Check if already processed
            hasPending <- hasClass el "shmirat-eynaim-pending"
            hasSafe    <- hasClass el "shmirat-eynaim-safe"
            hasBlocked <- hasClass el "shmirat-eynaim-blocked"
            if hasPending || hasSafe || hasBlocked
              then go (i + 1) n acc
              else do
                -- Type-safe discovery: extract URL THEN mark pending
                -- This is enforced by the types — see Extension.Properties
                mRef <- discoverImage el
                case mRef of
                  Nothing  => go (i + 1) n acc
                  Just ref => go (i + 1) n (ref :: acc)

---------------------------------------------------------------------------
-- Image analysis queue
---------------------------------------------------------------------------

||| Analyze a single image by sending it to the background for classification.
export
analyzeImage : HasIO io => ImageRef -> io ()
analyzeImage ref = do
  -- Send classification request to background
  msg <- mkMessage "classifyImage"
  -- The URL comes from ImageRef.url — NEVER from the DOM
  -- This is the key safety invariant enforced by the type system.
  primIO $ prim__analyzeAndApply ref.url ref.element
  where
    %foreign "javascript:lambda:(url, element, w) => { (async function() { try { var result = await browser.runtime.sendMessage({ type: 'classifyImage', url: url, imageDataUrl: null }); if (!result) return; if (result.containsWomen) { element.classList.remove('shmirat-eynaim-pending'); element.classList.add('shmirat-eynaim-blocked'); } else { element.classList.remove('shmirat-eynaim-pending'); element.classList.add('shmirat-eynaim-safe'); } } catch(err) { console.warn('[SE] Analysis failed for', url.substring(0, 60), err); element.classList.remove('shmirat-eynaim-pending'); element.classList.add('shmirat-eynaim-blocked'); } })(); }"
    prim__analyzeAndApply : ImageUrl -> Element Pending -> PrimIO ()

---------------------------------------------------------------------------
-- Override handler (when later sources disagree)
---------------------------------------------------------------------------

||| Listen for classification overrides from the background.
export
listenForOverrides : HasIO io => io ()
listenForOverrides = do
  onMessage handleOverride
  where
    %foreign "javascript:lambda:(msg, w) => { var url = msg.url; var containsWomen = msg.containsWomen; document.querySelectorAll('img, [style*=\"background-image\"], video[poster]').forEach(function(el) { var src = el.currentSrc || el.src || el.getAttribute('poster') || ''; if (!src) { var bg = el.style.backgroundImage; if (bg) { var m = bg.match(/url\\([\"']?(.+?)[\"']?\\)/); if (m) src = m[1]; } } if (src === url) { el.classList.remove('shmirat-eynaim-safe', 'shmirat-eynaim-blocked', 'shmirat-eynaim-pending'); el.classList.add(containsWomen ? 'shmirat-eynaim-blocked' : 'shmirat-eynaim-safe'); } }); }"
    prim__handleOverride : RuntimeMessage -> PrimIO ()

    handleOverride : RuntimeMessage -> MessageSender -> (JsValue -> IO ()) -> IO ()
    handleOverride msg _ respond = do
      t <- msgType msg
      case t of
        "classificationOverride" => do
          primIO $ prim__handleOverride msg
          respond =<< jsNull
        _ => respond =<< jsNull

---------------------------------------------------------------------------
-- MutationObserver
---------------------------------------------------------------------------

||| Set up MutationObserver to detect dynamically added images.
export
setupObserver : HasIO io => io ()
setupObserver = do
  bodyEl <- body
  obs <- newObserver handleMutations
  observe obs bodyEl
  where
    handleMutations : JsArray MutationRecord -> IO ()
    handleMutations records = do
      -- Batch mutations and process new images
      len <- arrayLength records
      processRecords 0 len
      where
        processAddedNodes : JsArray RawElement -> Int32 -> Int32 -> IO ()
        processAddedNodes nodes i n = if i >= n then pure () else do
          node <- arrayGet nodes i
          -- Check if the added node is an image or contains images
          refs <- discoverImages node
          traverse_ analyzeImage refs
          processAddedNodes nodes (i + 1) n

        processRecords : Int32 -> Int32 -> IO ()
        processRecords i n = if i >= n then pure () else do
          rec <- arrayGet records i
          recType <- recordType rec
          case recType of
            "childList" => do
              nodes <- addedNodes rec
              nodesLen <- arrayLength nodes
              processAddedNodes nodes 0 nodesLen
            "attributes" => do
              target <- recordTarget rec
              -- Re-analyze if src or style changed
              mRef <- discoverImage target
              case mRef of
                Nothing  => pure ()
                Just ref => analyzeImage ref
            _ => pure ()
          processRecords (i + 1) n

---------------------------------------------------------------------------
-- Main entry point
---------------------------------------------------------------------------

||| Content script initialization.
export
main : IO ()
main = do
  -- Check blocking state
  msg <- mkMessage "getBlockingState"
  statePromise <- sendMessage msg

  primIO $ prim__initContent
  where
    %foreign "javascript:lambda:(w) => { (async function() { try { var state = await browser.runtime.sendMessage({type: 'getBlockingState'}); if (!state.blockingEnabled || state.whitelisted) { var earlyHide = document.getElementById('shmirat-eynaim-early-hide'); if (earlyHide) earlyHide.remove(); return; } console.log('[Shmirat Eynaim] Content script initialized (Idris)'); } catch(err) { console.error('[Shmirat Eynaim] Content init failed:', err); } })(); }"
    prim__initContent : PrimIO ()
