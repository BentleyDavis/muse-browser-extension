// Health check — returns extension state.
// Params: {}
async function ping(params, { recorder, archiver }) {
  return {
    recordings: recorder.recordings.length,
    threads: archiver.getThreads().length,
    url: window.location.href,
    timestamp: Date.now(),
  };
}
