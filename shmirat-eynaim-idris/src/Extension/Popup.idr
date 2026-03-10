-- Extension.Popup — Popup UI entry point
--
-- Compile with: idris2 --cg javascript -o popup-idris.js src/Extension/Popup.idr

module Extension.Popup

import FFI.Core
import FFI.Browser.Runtime
import FFI.Browser.Tabs
import FFI.DOM.Element
import FFI.DOM.Document
import Extension.Types

---------------------------------------------------------------------------
-- Popup initialization
---------------------------------------------------------------------------

||| Popup entry point. Queries state and renders UI.
export
main : IO ()
main = do
  seLog "Popup initializing..."
  primIO prim__initPopup
  where
    -- The popup UI is heavily DOM-manipulation code.
    -- For pragmatism, the popup implementation stays mostly in JS
    -- with Idris providing the type-safe message protocol.
    %foreign "javascript:lambda:(w) => { (async function() { var toggle = document.getElementById('toggle'); var domainEl = document.getElementById('domain'); var statsEl = document.getElementById('stats'); var tabs = await browser.tabs.query({active: true, currentWindow: true}); var currentDomain = ''; if (tabs[0] && tabs[0].url) { try { currentDomain = new URL(tabs[0].url).hostname; } catch(e) {} } if (domainEl) domainEl.textContent = currentDomain; var state = await browser.runtime.sendMessage({type: 'getState'}); if (toggle) toggle.checked = state.blockingEnabled; if (toggle) { toggle.addEventListener('change', async function() { await browser.runtime.sendMessage({type: 'toggle'}); }); } try { var stats = await browser.runtime.sendMessage({type: 'getStats'}); if (statsEl && stats) { statsEl.textContent = 'Scanned: ' + (stats.scanned || 0) + ' | Hidden: ' + (stats.hidden || 0) + ' (face: ' + (stats.hiddenFace || 0) + ', body: ' + (stats.hiddenBody || 0) + ')'; } } catch(e) {} try { var cloud = await browser.runtime.sendMessage({type: 'getCloudStats'}); var cloudEl = document.getElementById('cloud-stats'); if (cloudEl && cloud) { cloudEl.textContent = 'API calls today: ' + (cloud.cloudCallsToday || 0) + ' | Local matches: ' + (cloud.cloudSavedCount || 0); } } catch(e) {} try { var learn = await browser.runtime.sendMessage({type: 'getLearningStats'}); var learnEl = document.getElementById('learning-stats'); if (learnEl && learn) { learnEl.textContent = 'Blocked faces: ' + (learn.knownFacesCount || 0) + ' | Safe faces: ' + (learn.knownSafeFacesCount || 0) + ' | Training: ' + (learn.trainingDataCount || 0); } } catch(e) {} console.log('[Shmirat Eynaim] Popup initialized (Idris)'); })(); }"
    prim__initPopup : PrimIO ()
