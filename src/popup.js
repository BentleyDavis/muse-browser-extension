// Popup UI logic
document.getElementById("recordBtn").addEventListener("click", async (e) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const recording = e.target.textContent.includes("Start");
  chrome.tabs.sendMessage(tab.id, {
    action: "record",
    enable: recording,
  });
  e.target.textContent = recording ? "Stop Recording Movements" : "Start Recording Movements";
});

document.getElementById("pingBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: "ping" });
});
