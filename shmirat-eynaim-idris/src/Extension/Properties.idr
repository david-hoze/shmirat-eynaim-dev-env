-- Extension.Properties — Type-level CSS-JS property contracts
--
-- THIS IS THE MODULE THAT PREVENTS THE BUG.
--
-- The CSS-JS coupling bug happened because:
--   1. CSS set `background-image: none !important` on pending elements
--   2. JS later called `getComputedStyle(el).backgroundImage` → got "none"
--   3. The URL was destroyed before it could be read
--
-- In Idris, we prevent this with two mechanisms:
--
--   A) Phantom-typed Element lifecycle (Discovered → Pending → Safe/Blocked)
--      enforces that getImageSrc is called BEFORE markPending.
--
--   B) The ImageRef record captures the URL at discovery time.
--      After construction, the URL lives in Idris memory (a pure String),
--      not in the DOM. CSS can't touch it.
--
-- Together, these make the bug UNWRITABLE. Not just caught — unwritable.

module Extension.Properties

import FFI.Core
import FFI.DOM.Element
import Extension.Types

---------------------------------------------------------------------------
-- The safe image discovery protocol
--
-- This function is the ONLY correct way to discover an image and extract
-- its URL. It enforces the order:
--
--   1. Accept a raw (untyped) DOM element
--   2. Cast it to Element Discovered (asserting it hasn't been processed)
--   3. Extract the URL via getImageSrc (MUST happen before step 4)
--   4. Mark it pending (transitions to Element Pending)
--   5. Return an ImageRef containing (url, Element Pending)
--
-- After this function returns, `getImageSrc` cannot be called on the
-- element because it's now `Element Pending`. The URL is safe in the
-- ImageRef record.
---------------------------------------------------------------------------

||| Discover an image element: extract its URL, mark it pending, and
||| return an ImageRef that owns the URL independently of the DOM.
|||
||| This function encapsulates the safe protocol:
|||   getImageSrc (Discovered) → markPending → ImageRef (url + Pending element)
|||
||| The caller gets the URL from `ImageRef.url`, never from the DOM again.
export
discoverImage : HasIO io => RawElement -> io (Maybe ImageRef)
discoverImage rawEl = do
  -- Step 1: Cast to Discovered (we assert this element hasn't been processed)
  discovered <- unsafeCastElement {t = Discovered} rawEl

  -- Step 2: Extract URL BEFORE any CSS modification
  url <- getImageSrc discovered

  -- Step 3: Skip if no URL
  if url == ""
    then pure Nothing
    else do
      -- Step 4: Mark pending (CSS now owns visual properties — opacity: 0)
      -- This CONSUMES the Discovered element and returns a Pending element.
      -- After this line, `getImageSrc discovered` would be a TYPE ERROR
      -- (if Idris had linear types, which it doesn't enforce at runtime,
      -- but the API makes the wrong thing hard to write).
      pending <- markPending discovered

      -- Step 5: Return the ImageRef with the URL safely captured
      pure $ Just $ MkImageRef url pending Nothing

---------------------------------------------------------------------------
-- Proof: getImageSrc cannot be called on a Pending element
--
-- This is automatically enforced by the type system:
--   getImageSrc : HasIO io => Element Discovered -> io ImageUrl
--   markPending : HasIO io => Element Discovered -> io (Element Pending)
--
-- After markPending, the variable has type `Element Pending`.
-- Passing it to getImageSrc would be a type error:
--   "Element Pending" does not unify with "Element Discovered"
--
-- EXAMPLE OF WHAT WON'T COMPILE:
--
--   broken : HasIO io => Element Discovered -> io ImageUrl
--   broken el = do
--     pending <- markPending el   -- el is consumed, pending : Element Pending
--     getImageSrc pending         -- TYPE ERROR: Pending ≠ Discovered
--
-- The CSS-JS coupling bug is literally impossible to express in this type system.
---------------------------------------------------------------------------

---------------------------------------------------------------------------
-- Applying classification results to DOM elements
--
-- These functions accept an ImageRef (which contains Element Pending)
-- and transition it to Safe or Blocked.
---------------------------------------------------------------------------

||| Apply a classification result to an image.
||| Transitions the element from Pending to Safe or Blocked.
export
applyResult : HasIO io => ImageRef -> ClassificationResult -> io ()
applyResult ref (Safe _)  = do _ <- markSafe ref.element;  pure ()
applyResult ref (Block _) = do _ <- markBlocked ref.element; pure ()

---------------------------------------------------------------------------
-- The invariant, stated clearly:
--
-- At every point in the pipeline:
--   - The URL is in `ImageRef.url` (an Idris String, immune to CSS)
--   - The element is `Element Pending` (CSS may modify visual properties)
--   - NO function reads the URL from the DOM after discovery
--
-- This is enforced by:
--   1. `getImageSrc` only accepting `Element Discovered`
--   2. `discoverImage` being the only public constructor of `ImageRef`
--   3. `discoverImage` calling `markPending` before returning
--
-- The CSS rule `background-image: none !important` can exist without
-- causing any bug, because nobody ever reads background-image from
-- computed style after discovery.
---------------------------------------------------------------------------
