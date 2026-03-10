-- FFI.Browser.Menus — browser.menus.* API bindings

module FFI.Browser.Menus

import FFI.Core

export
data MenuInfo : Type where [external]

export
data MenuTab : Type where [external]

---------------------------------------------------------------------------
-- Context menu creation
---------------------------------------------------------------------------

%foreign "browser:lambda:(id, title, ctx, w) => browser.menus.create({id: id, title: title, contexts: JSON.parse(ctx)})"
prim__menuCreate : String -> String -> String -> PrimIO ()

-- | Create a context menu item.
-- `contexts` is a list like ["image", "video"].
export
menuCreate : HasIO io => String -> String -> List String -> io ()
menuCreate id title contexts =
  let ctxJson = "[" ++ joinBy "," (map (\c => "\"" ++ c ++ "\"") contexts) ++ "]"
  in primIO $ prim__menuCreate id title ctxJson
  where
    joinBy : String -> List String -> String
    joinBy _ [] = ""
    joinBy _ [x] = x
    joinBy sep (x :: xs) = x ++ sep ++ joinBy sep xs

---------------------------------------------------------------------------
-- Menu click handler
---------------------------------------------------------------------------

%foreign "browser:lambda:(handler, w) => browser.menus.onClicked.addListener((info, tab) => handler(info)(tab)(w))"
prim__onMenuClicked : (MenuInfo -> MenuTab -> PrimIO ()) -> PrimIO ()

export
onMenuClicked : HasIO io => (MenuInfo -> MenuTab -> IO ()) -> io ()
onMenuClicked handler = primIO $ prim__onMenuClicked
  (\info, tab => toPrim $ handler info tab)

---------------------------------------------------------------------------
-- MenuInfo accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(info, w) => info.menuItemId || ''"
prim__menuItemId : MenuInfo -> PrimIO String

%foreign "javascript:lambda:(info, w) => info.srcUrl || ''"
prim__menuSrcUrl : MenuInfo -> PrimIO String

export
menuItemId : HasIO io => MenuInfo -> io String
menuItemId info = primIO $ prim__menuItemId info

export
menuSrcUrl : HasIO io => MenuInfo -> io String
menuSrcUrl info = primIO $ prim__menuSrcUrl info

---------------------------------------------------------------------------
-- MenuTab accessors
---------------------------------------------------------------------------

%foreign "javascript:lambda:(tab, w) => tab.id"
prim__menuTabId : MenuTab -> PrimIO Int32

export
menuTabId : HasIO io => MenuTab -> io Int32
menuTabId tab = primIO $ prim__menuTabId tab
