-- FFI.RxJS.Observable — Core Observable type and creation functions
--
-- RxJS Observables are wrapped as opaque types. The Idris type parameter
-- tracks the emission type, giving us type-safe stream composition.

module FFI.RxJS.Observable

import FFI.Core

---------------------------------------------------------------------------
-- Core types
---------------------------------------------------------------------------

||| An RxJS Observable that emits values of type `a`.
export
data Observable : Type -> Type where [external]

||| An RxJS Subscription (returned by subscribe).
export
data Subscription : Type where [external]

---------------------------------------------------------------------------
-- Creation
---------------------------------------------------------------------------

%foreign "javascript:lambda:(x, w) => rxjs.of(x)"
prim__of : a -> PrimIO (Observable a)

%foreign "javascript:lambda:(w) => rxjs.EMPTY"
prim__empty : PrimIO (Observable a)

%foreign "javascript:lambda:(promise, w) => rxjs.from(promise)"
prim__fromPromise : Promise a -> PrimIO (Observable a)

%foreign "javascript:lambda:(fn, w) => rxjs.defer(() => fn(w))"
prim__defer : PrimIO (Observable a) -> PrimIO (Observable a)

%foreign "javascript:lambda:(ms, w) => rxjs.timer(ms)"
prim__timer : Int32 -> PrimIO (Observable Int32)

export
ofValue : HasIO io => a -> io (Observable a)
ofValue x = primIO $ prim__of x

export
empty : HasIO io => io (Observable a)
empty = primIO prim__empty

export
fromPromise : HasIO io => Promise a -> io (Observable a)
fromPromise p = primIO $ prim__fromPromise p

export
defer : HasIO io => IO (Observable a) -> io (Observable a)
defer fn = primIO $ prim__defer (toPrim fn)

export
timer : HasIO io => Int32 -> io (Observable Int32)
timer ms = primIO $ prim__timer ms

---------------------------------------------------------------------------
-- Combining
---------------------------------------------------------------------------

%foreign "javascript:lambda:(a, b, w) => rxjs.merge(a, b)"
prim__merge2 : Observable a -> Observable a -> PrimIO (Observable a)

%foreign "javascript:lambda:(a, b, c, w) => rxjs.merge(a, b, c)"
prim__merge3 : Observable a -> Observable a -> Observable a -> PrimIO (Observable a)

%foreign "javascript:lambda:(a, b, c, d, w) => rxjs.merge(a, b, c, d)"
prim__merge4 : Observable a -> Observable a -> Observable a -> Observable a -> PrimIO (Observable a)

%foreign "javascript:lambda:(a, b, w) => rxjs.race(a, b)"
prim__race : Observable a -> Observable a -> PrimIO (Observable a)

%foreign "javascript:lambda:(a, b, w) => rxjs.forkJoin([a, b])"
prim__forkJoin2 : Observable a -> Observable b -> PrimIO (Observable JsValue)

export
merge2 : HasIO io => Observable a -> Observable a -> io (Observable a)
merge2 a b = primIO $ prim__merge2 a b

export
merge3 : HasIO io => Observable a -> Observable a -> Observable a -> io (Observable a)
merge3 a b c = primIO $ prim__merge3 a b c

export
merge4 : HasIO io => Observable a -> Observable a -> Observable a -> Observable a -> io (Observable a)
merge4 a b c d = primIO $ prim__merge4 a b c d

export
race : HasIO io => Observable a -> Observable a -> io (Observable a)
race a b = primIO $ prim__race a b

---------------------------------------------------------------------------
-- Subscribe
---------------------------------------------------------------------------

%foreign "javascript:lambda:(obs, onNext, onError, onComplete, w) => obs.subscribe({next: x => onNext(x)(w), error: e => onError(String(e))(w), complete: () => onComplete(w)})"
prim__subscribe : Observable a
  -> (a -> PrimIO ())
  -> (String -> PrimIO ())
  -> PrimIO ()
  -> PrimIO Subscription

export
subscribe : HasIO io => Observable a
  -> (a -> IO ())
  -> (String -> IO ())
  -> IO ()
  -> io Subscription
subscribe obs onNext onError onComplete =
  primIO $ prim__subscribe obs
    (\x => toPrim $ onNext x)
    (\e => toPrim $ onError e)
    (toPrim onComplete)

---------------------------------------------------------------------------
-- Unsubscribe
---------------------------------------------------------------------------

%foreign "javascript:lambda:(sub, w) => sub.unsubscribe()"
prim__unsubscribe : Subscription -> PrimIO ()

export
unsubscribe : HasIO io => Subscription -> io ()
unsubscribe sub = primIO $ prim__unsubscribe sub

---------------------------------------------------------------------------
-- firstValueFrom (Observable -> Promise)
---------------------------------------------------------------------------

%foreign "javascript:lambda:(obs, w) => rxjs.firstValueFrom(obs)"
prim__firstValueFrom : Observable a -> PrimIO (Promise a)

export
firstValueFrom : HasIO io => Observable a -> io (Promise a)
firstValueFrom obs = primIO $ prim__firstValueFrom obs
