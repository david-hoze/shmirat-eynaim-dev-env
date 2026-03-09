// popup.js — Extension popup UI logic

const toggle = document.getElementById("toggle");
const domainEl = document.getElementById("domain");
const whitelistBtn = document.getElementById("whitelist-btn");
const whitelistList = document.getElementById("whitelist-list");
const emptyMsg = document.getElementById("empty-msg");
const statsEl = document.getElementById("stats");
const learningStatsEl = document.getElementById("learning-stats");
const classifierStatusEl = document.getElementById("classifier-status");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const apiKeyInput = document.getElementById("api-key");
const saveKeyBtn = document.getElementById("save-key-btn");
const cloudStatsEl = document.getElementById("cloud-stats");
const cloudModeRadios = document.querySelectorAll('input[name="cloud-mode"]');
const serverStatusEl = document.getElementById("server-status");

let currentDomain = "";
let currentState = {};

// Get the active tab's domain
async function getActiveDomain() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return "";
    }
  }
  return "";
}

// Render the whitelist
function renderWhitelist(wl) {
  whitelistList.innerHTML = "";
  if (!wl || wl.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }
  emptyMsg.style.display = "none";
  for (const domain of wl) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = domain;
    const btn = document.createElement("button");
    btn.className = "btn remove";
    btn.textContent = "\u00d7";
    btn.title = "Remove from trusted sites";
    btn.addEventListener("click", async () => {
      const resp = await browser.runtime.sendMessage({
        type: "removeWhitelist",
        domain,
      });
      currentState = resp;
      render();
    });
    li.appendChild(span);
    li.appendChild(btn);
    whitelistList.appendChild(li);
  }
}

// Update whitelist button text
function updateWhitelistBtn() {
  const isWhitelisted =
    currentState.whitelist && currentState.whitelist.includes(currentDomain);
  whitelistBtn.textContent = isWhitelisted ? "Remove trust" : "Trust this site";
}

// Fetch and display stats from content script
async function updateStats() {
  try {
    const stats = await browser.runtime.sendMessage({ type: "getStats" });
    statsEl.textContent = `${stats.scanned} scanned, ${stats.hidden} hidden`;
  } catch {
    statsEl.textContent = "0 scanned, 0 hidden";
  }
}

async function updateLearningStats() {
  try {
    const stats = await browser.runtime.sendMessage({ type: "getLearningStats" });
    const total = stats.knownFacesCount + stats.knownSafeFacesCount;
    if (total === 0) {
      learningStatsEl.textContent = "No faces learned yet.";
    } else {
      learningStatsEl.textContent = `Faces learned: ${total} (${stats.knownFacesCount} blocked, ${stats.knownSafeFacesCount} safe)`;
    }
    if (stats.classifierTrained) {
      classifierStatusEl.textContent = `Custom model: trained on ${stats.trainingDataCount} examples`;
    } else if (stats.trainingDataCount > 0) {
      classifierStatusEl.textContent = `Custom model: need ${10 - stats.trainingDataCount} more examples`;
    } else {
      classifierStatusEl.textContent = "Custom model: not enough data";
    }
  } catch {
    learningStatsEl.textContent = "No faces learned yet.";
  }
}

async function updateServerStatus() {
  try {
    const config = await browser.runtime.sendMessage({ type: "getServerConfig" });
    if (config.serverEnabled) {
      serverStatusEl.textContent = "Connected";
      serverStatusEl.className = "server-status connected";
    } else {
      serverStatusEl.textContent = "Not connected.";
      serverStatusEl.className = "server-status";
    }
  } catch {
    serverStatusEl.textContent = "Not connected.";
    serverStatusEl.className = "server-status";
  }
}

async function updateCloudStats() {
  try {
    const stats = await browser.runtime.sendMessage({ type: "getCloudStats" });
    // Set the radio button
    cloudModeRadios.forEach(r => { r.checked = r.value === stats.cloudMode; });
    if (!stats.hasApiKey) {
      cloudStatsEl.textContent = "No API key set.";
    } else {
      const cost = (stats.cloudCallsToday * 0.002).toFixed(3);
      cloudStatsEl.textContent =
        `Today: ${stats.cloudCallsToday} API calls (~$${cost}) | ${stats.cloudSavedCount} saved locally | ${stats.cloudCacheSize} cached URLs`;
    }
  } catch {
    cloudStatsEl.textContent = "No API key set.";
  }
}

function render() {
  toggle.checked = currentState.blockingEnabled;
  domainEl.textContent = currentDomain || "\u2014";
  renderWhitelist(currentState.whitelist);
  updateWhitelistBtn();
  updateStats();
  updateLearningStats();
  updateCloudStats();
  updateServerStatus();
}

// Init
(async () => {
  currentDomain = await getActiveDomain();
  currentState = await browser.runtime.sendMessage({
    type: "getState",
    domain: currentDomain,
  });
  render();
})();

// Toggle handler
toggle.addEventListener("change", async () => {
  const resp = await browser.runtime.sendMessage({ type: "toggle" });
  currentState = resp;
  render();
});

// Reset learning handler
resetBtn.addEventListener("click", async () => {
  if (confirm("Reset all learned faces and the custom model? This cannot be undone.")) {
    await browser.runtime.sendMessage({ type: "resetLearning" });
    updateLearningStats();
  }
});

// Export learning handler
exportBtn.addEventListener("click", async () => {
  const data = await browser.runtime.sendMessage({ type: "exportLearning" });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shmirat-eynaim-learned.json";
  a.click();
  URL.revokeObjectURL(url);
});

// Import learning handler
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    await browser.runtime.sendMessage({ type: "importLearning", data });
    updateLearningStats();
  } catch {
    alert("Invalid JSON file.");
  }
});

// Whitelist button handler
whitelistBtn.addEventListener("click", async () => {
  if (!currentDomain) return;
  const isWhitelisted =
    currentState.whitelist && currentState.whitelist.includes(currentDomain);
  const resp = await browser.runtime.sendMessage({
    type: isWhitelisted ? "removeWhitelist" : "addWhitelist",
    domain: currentDomain,
  });
  currentState = resp;
  render();
});

// Cloud API key save handler
saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  await browser.runtime.sendMessage({ type: "setApiKey", key });
  apiKeyInput.value = "";
  apiKeyInput.placeholder = key ? "Key saved" : "Anthropic API key";
  updateCloudStats();
});

// Cloud mode toggle handler
cloudModeRadios.forEach(radio => {
  radio.addEventListener("change", async (e) => {
    await browser.runtime.sendMessage({ type: "setCloudMode", mode: e.target.value });
    updateCloudStats();
  });
});
