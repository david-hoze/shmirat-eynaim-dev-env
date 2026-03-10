-- FFI.RxJS.Operators — RxJS pipe operators
--
-- Each operator transforms an Observable, preserving the RxJS pipe semantics.
-- The Idris type system tracks the emission type through transformations.

module FFI.RxJS.Operators

import FFI.Core
import FFI.RxJS.Observable

---------------------------------------------------------------------------
-- Transformation operators
---------------------------------------------------------------------------

%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.map(x => f(x)))"
prim__map : (a -> b) -> Observable a -> PrimIO (Observable b)

%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.map(x => f(x)(w)))"
prim__mapIO : (a -> PrimIO b) -> Observable a -> PrimIO (Observable b)

export
mapObs : HasIO io => (a -> b) -> Observable a -> io (Observable b)
mapObs f obs = primIO $ prim__map f obs

---------------------------------------------------------------------------
-- Filtering operators
---------------------------------------------------------------------------

%foreign "javascript:lambda:(pred, obs, w) => obs.pipe(rxjs.filter(x => pred(x)))"
prim__filter : (a -> Bool) -> Observable a -> PrimIO (Observable a)

export
filterObs : HasIO io => (a -> Bool) -> Observable a -> io (Observable a)
filterObs pred obs = primIO $ prim__filter pred obs

---------------------------------------------------------------------------
-- Side-effect operators
---------------------------------------------------------------------------

%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.tap(x => f(x)(w)))"
prim__tap : (a -> PrimIO ()) -> Observable a -> PrimIO (Observable a)

export
tapObs : HasIO io => (a -> IO ()) -> Observable a -> io (Observable a)
tapObs f obs = primIO $ prim__tap (\x => toPrim $ f x) obs

---------------------------------------------------------------------------
-- Error handling
---------------------------------------------------------------------------

%foreign "javascript:lambda:(handler, obs, w) => obs.pipe(rxjs.catchError(e => handler(String(e))(w)))"
prim__catchError : (String -> PrimIO (Observable a)) -> Observable a -> PrimIO (Observable a)

export
catchErrorObs : HasIO io => (String -> IO (Observable a)) -> Observable a -> io (Observable a)
catchErrorObs handler obs = primIO $ prim__catchError (\e => toPrim $ handler e) obs

---------------------------------------------------------------------------
-- Flattening operators
---------------------------------------------------------------------------

%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.mergeMap(x => f(x)(w)))"
prim__mergeMap : (a -> PrimIO (Observable b)) -> Observable a -> PrimIO (Observable b)

%foreign "javascript:lambda:(f, obs, w) => obs.pipe(rxjs.switchMap(x => f(x)(w)))"
prim__switchMap : (a -> PrimIO (Observable b)) -> Observable a -> PrimIO (Observable b)

export
mergeMapObs : HasIO io => (a -> IO (Observable b)) -> Observable a -> io (Observable b)
mergeMapObs f obs = primIO $ prim__mergeMap (\x => toPrim $ f x) obs

export
switchMapObs : HasIO io => (a -> IO (Observable b)) -> Observable a -> io (Observable b)
switchMapObs f obs = primIO $ prim__switchMap (\x => toPrim $ f x) obs

---------------------------------------------------------------------------
-- Timing operators
---------------------------------------------------------------------------

%foreign "javascript:lambda:(ms, obs, w) => obs.pipe(rxjs.debounceTime(ms))"
prim__debounceTime : Int32 -> Observable a -> PrimIO (Observable a)

%foreign "javascript:lambda:(ms, obs, w) => obs.pipe(rxjs.bufferTime(ms))"
prim__bufferTime : Int32 -> Observable a -> PrimIO (Observable (JsArray a))

export
debounceTime : HasIO io => Int32 -> Observable a -> io (Observable a)
debounceTime ms obs = primIO $ prim__debounceTime ms obs

export
bufferTime : HasIO io => Int32 -> Observable a -> io (Observable (JsArray a))
bufferTime ms obs = primIO $ prim__bufferTime ms obs

---------------------------------------------------------------------------
-- Limiting operators
---------------------------------------------------------------------------

%foreign "javascript:lambda:(n, obs, w) => obs.pipe(rxjs.take(n))"
prim__take : Int32 -> Observable a -> PrimIO (Observable a)

export
take : HasIO io => Int32 -> Observable a -> io (Observable a)
take n obs = primIO $ prim__take n obs

---------------------------------------------------------------------------
-- Default value
---------------------------------------------------------------------------

%foreign "javascript:lambda:(val, obs, w) => obs.pipe(rxjs.defaultIfEmpty(val))"
prim__defaultIfEmpty : a -> Observable a -> PrimIO (Observable a)

export
defaultIfEmpty : HasIO io => a -> Observable a -> io (Observable a)
defaultIfEmpty val obs = primIO $ prim__defaultIfEmpty val obs

---------------------------------------------------------------------------
-- Multicasting
---------------------------------------------------------------------------

%foreign "javascript:lambda:(obs, w) => obs.pipe(rxjs.share())"
prim__share : Observable a -> PrimIO (Observable a)

export
share : HasIO io => Observable a -> io (Observable a)
share obs = primIO $ prim__share obs

---------------------------------------------------------------------------
-- bufferWhen (used for server batch lookups)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(closingSelector, obs, w) => obs.pipe(rxjs.bufferWhen(() => closingSelector(w)))"
prim__bufferWhen : PrimIO (Observable JsValue) -> Observable a -> PrimIO (Observable (JsArray a))

export
bufferWhen : HasIO io => IO (Observable JsValue) -> Observable a -> io (Observable (JsArray a))
bufferWhen closingSelector obs = primIO $ prim__bufferWhen (toPrim closingSelector) obs
