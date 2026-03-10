-- Extension.Types — Core domain types for image classification
--
-- These types encode the classification pipeline's invariants in the type system.
-- The key insight: an ImageRef captures the URL at discovery time, before CSS
-- can modify the DOM element. After that, classification operates on the URL
-- stored in the ImageRef, never reading back from the DOM.

module Extension.Types

import FFI.Core
import FFI.DOM.Element

---------------------------------------------------------------------------
-- Classification result
---------------------------------------------------------------------------

||| Why an image was classified as containing women.
public export
data BlockReason
  = FaceDetected       -- ^ Female face or uncertain gender detected
  | PersonNoFace       -- ^ Person detected but no face (strict mode)
  | CloudBlock         -- ^ Claude Haiku said YES
  | ServerBlock        -- ^ Shared server says block
  | UserBlock          -- ^ User manually flagged
  | ErrorBlock         -- ^ Analysis error (strict mode: hide)
  | NoSources          -- ^ No classification source responded

public export
Show BlockReason where
  show FaceDetected = "face"
  show PersonNoFace = "person-no-face"
  show CloudBlock   = "haiku"
  show ServerBlock  = "server"
  show UserBlock    = "user"
  show ErrorBlock   = "error"
  show NoSources    = "no-sources"

||| Why an image was classified as safe.
public export
data SafeReason
  = NoFaceNoPerson     -- ^ No face, no person detected
  | MaleOnly           -- ^ All faces confidently male (> 0.65)
  | CloudSafe          -- ^ Claude Haiku said NO
  | ServerSafe         -- ^ Shared server says safe
  | UserSafe           -- ^ User manually marked safe
  | CacheSafe          -- ^ Previously classified as safe

public export
Show SafeReason where
  show NoFaceNoPerson = "no-face-no-person"
  show MaleOnly       = "male-only"
  show CloudSafe      = "haiku-safe"
  show ServerSafe     = "server-safe"
  show UserSafe       = "user-safe"
  show CacheSafe      = "cache-safe"

||| The result of classifying an image.
public export
data ClassificationResult
  = Block BlockReason
  | Safe SafeReason

public export
isBlocked : ClassificationResult -> Bool
isBlocked (Block _) = True
isBlocked (Safe _)  = False

---------------------------------------------------------------------------
-- Classification priority (higher number = more authoritative)
---------------------------------------------------------------------------

||| Priority levels for classification sources.
||| Higher priority wins when sources conflict.
public export
data Priority
  = PCache      -- ^ 0: Local URL cache (instant)
  | PML         -- ^ 1: Local ML inference
  | PServer     -- ^ 2: Shared server lookup
  | PHaiku      -- ^ 3: Claude Haiku cloud API
  | PUser       -- ^ 4: User manual flag (absolute)

public export
Eq Priority where
  PCache  == PCache  = True
  PML     == PML     = True
  PServer == PServer = True
  PHaiku  == PHaiku  = True
  PUser   == PUser   = True
  _       == _       = False

public export
Ord Priority where
  compare PCache  PCache  = EQ
  compare PCache  _       = LT
  compare _       PCache  = GT
  compare PML     PML     = EQ
  compare PML     _       = LT
  compare _       PML     = GT
  compare PServer PServer = EQ
  compare PServer _       = LT
  compare _       PServer = GT
  compare PHaiku  PHaiku  = EQ
  compare PHaiku  _       = LT
  compare _       PHaiku  = GT
  compare PUser   PUser   = EQ

public export
Show Priority where
  show PCache  = "cache"
  show PML     = "ml"
  show PServer = "server"
  show PHaiku  = "haiku"
  show PUser   = "user"

---------------------------------------------------------------------------
-- Prioritized classification result
---------------------------------------------------------------------------

||| A classification result tagged with its source priority.
public export
record PrioritizedResult where
  constructor MkPResult
  result   : ClassificationResult
  priority : Priority
  faceCount   : Nat
  personCount : Nat

---------------------------------------------------------------------------
-- ImageRef — The key type that prevents the CSS-JS coupling bug
--
-- An ImageRef captures all the data needed to classify an image AT
-- DISCOVERY TIME. Once constructed, it never reads back from the DOM.
-- This is the Idris equivalent of the WeakMap pattern.
---------------------------------------------------------------------------

||| Reference to a discovered image. Contains the URL extracted at
||| discovery time, before CSS can modify the element.
|||
||| The element is stored as `Element Pending` — meaning the URL has
||| already been extracted and the element has been marked pending.
||| You cannot call `getImageSrc` on `Element Pending`.
public export
record ImageRef where
  constructor MkImageRef
  ||| The image URL, captured at discovery time.
  url      : ImageUrl
  ||| The DOM element (now in Pending state — CSS may have modified it).
  element  : Element Pending
  ||| The image data URL (base64), fetched for ML analysis.
  dataUrl  : Maybe DataUrl

---------------------------------------------------------------------------
-- Strict mode resolution
---------------------------------------------------------------------------

||| Resolve conflicts between classification sources using strict mode rules:
|||
||| 1. BLOCK always wins over SAFE (strict mode: false negatives are worse).
||| 2. Only USER priority can override a BLOCK to SAFE.
||| 3. Higher priority wins when both say the same thing.
|||
||| This function is pure — no IO, no side effects, fully testable.
public export
resolveConflict : PrioritizedResult -> PrioritizedResult -> PrioritizedResult
resolveConflict current new =
  case (isBlocked current.result, isBlocked new.result) of
    -- Both agree (both block or both safe): higher priority wins
    (True,  True)  => if new.priority >= current.priority then new else current
    (False, False) => if new.priority >= current.priority then new else current

    -- New says BLOCK, current says SAFE: block wins (strict mode)
    (False, True)  => new

    -- New says SAFE, current says BLOCK:
    -- Only USER can override a block to safe
    (True,  False) =>
      if new.priority == PUser
        then new       -- User says safe, override the block
        else current   -- Keep the block (strict mode)

---------------------------------------------------------------------------
-- Extension state
---------------------------------------------------------------------------

||| Mutable extension state (managed in background).
public export
record ExtensionState where
  constructor MkState
  blockingEnabled : Bool
  whitelist       : List String
  cloudMode       : String   -- "all" | "uncertain" | "never"
  hasApiKey        : Bool
  serverEnabled   : Bool
  serverUrl       : String

---------------------------------------------------------------------------
-- Stats
---------------------------------------------------------------------------

public export
record Stats where
  constructor MkStats
  scanned     : Nat
  hidden      : Nat
  hiddenFace  : Nat
  hiddenBody  : Nat

public export
emptyStats : Stats
emptyStats = MkStats 0 0 0 0

---------------------------------------------------------------------------
-- Learning data
---------------------------------------------------------------------------

||| A known face descriptor with its label and provenance.
public export
record KnownFace where
  constructor MkKnownFace
  descriptorData : List Double  -- 128-element vector
  label          : String       -- "block" or "safe"
  source         : String       -- "user" or "haiku"
  confidence     : Double
