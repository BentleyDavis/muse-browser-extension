// Bulk archive threads matching an address list.
// Params: {addresses: [...], dryRun: false}
// Returns: {archived, skipped, failed, total}

async function bulkArchive(params, { archiver }) {
  const { addresses, dryRun = false } = params;
  const normalize = (addr) => {
    if (addr.includes("@")) return addr.toLowerCase();
    const digits = addr.replace(/\D/g, "");
    return digits.replace(/^1(\d{10})$/, "$1");
  };

  const targetSet = new Set(addresses.map(normalize));
  const threads = archiver.getThreads();
  const matches = threads.filter(t => targetSet.has(normalize(t.label)));

  let archived = 0, skipped = 0;
  const failed = [];

  for (const thread of matches) {
    // Safety: never touch pinned
    const isPinned = !!thread.element.querySelector('[aria-label*="pin" i]');
    if (isPinned) {
      skipped++;
      continue;
    }

    if (dryRun) {
      archived++; // count as would-archive
      continue;
    }

    try {
      const ok = await archiver.archiveThread(thread);
      if (ok) archived++;
      else failed.push(thread.label);
    } catch (e) {
      failed.push(thread.label + ": " + e.message);
    }

    // Human-like pause
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
  }

  return { archived, skipped, failed, total: matches.length, dryRun };
}
