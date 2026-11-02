// Thread matching and bulk archive for Google Messages web.

class ThreadArchiver {
  constructor(player) {
    this.player = player;
  }

  // Get all visible conversation rows
  getThreads() {
    // Messages web uses role="option" for conversation rows
    const rows = document.querySelectorAll('[role="option"]');
    return Array.from(rows).map(row => {
      const heading = row.querySelector('[role="heading"]');
      const text = heading ? heading.textContent.trim() : "";
      return { element: row, label: text };
    });
  }

  // Normalize a phone number for comparison
  // "(214) 455-7729" -> "12144557729", "+12144557729" -> "12144557729"
  normalize(addr) {
    if (addr.includes("@")) return addr.toLowerCase();
    const digits = addr.replace(/\D/g, "");
    // Strip leading 1 for US numbers for comparison
    return digits.replace(/^1(\d{10})$/, "$1");
  }

  // Find threads matching the approved address list
  findMatches(addresses) {
    const normalized = new Set(addresses.map(a => this.normalize(a)));
    return this.getThreads().filter(t => normalized.has(this.normalize(t.label)));
  }

  // Archive a single thread via its Options menu
  async archiveThread(thread) {
    const row = thread.element;

    // Hover to reveal Options button
    row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));

    const optionsBtn = row.querySelector('[aria-label*="Options"], [aria-label*="More"]');
    if (!optionsBtn) {
      console.warn("[muse] no options button for", thread.label);
      return false;
    }

    // Click options
    optionsBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // Find Archive in the menu
    const menuItems = document.querySelectorAll('[role="menuitem"]');
    for (const item of menuItems) {
      if (/archive/i.test(item.textContent)) {
        item.click();
        await new Promise(r => setTimeout(r, 800));
        return true;
      }
    }

    // Dismiss menu if archive not found
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    return false;
  }

  // Bulk archive with progress reporting
  async archiveAll(addresses, onProgress) {
    const matches = this.findMatches(addresses);
    let archived = 0, failed = [];

    for (const thread of matches) {
      // Safety: never touch pinned threads
      if (this._isPinned(thread)) {
        console.log("[muse] skipping pinned:", thread.label);
        continue;
      }

      const ok = await this.archiveThread(thread);
      if (ok) {
        archived++;
      } else {
        failed.push(thread.label);
      }

      if (onProgress) onProgress(archived, matches.length);

      // Human-like pause between actions
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    }

    return { archived, total: matches.length, failed };
  }

  _isPinned(thread) {
    // Pinned threads have a pin indicator
    return !!thread.element.querySelector('[aria-label*="pin" i], [data-pin]');
  }

  // Capture screenshot for analysis (on-demand)
  async captureScreenshot() {
    // This needs to go through background.js (tabs.captureVisibleTab)
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "screenshot" }, resolve);
    });
  }

  // Get raw HTML for analysis (on-demand)
  getHTML() {
    return document.documentElement.outerHTML;
  }
}
