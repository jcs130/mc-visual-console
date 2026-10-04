/** ViewerSessionSlots keeps temporary capture connections separate from audience connections. */
export class ViewerSessionSlots {
  #viewers = 0;
  #captures = 0;

  constructor(maxViewers, maxCaptures) {
    this.maxViewers = maxViewers;
    this.maxCaptures = maxCaptures;
  }

  reserve(capture) {
    if (capture ? this.#captures >= this.maxCaptures : this.#viewers >= this.maxViewers) return null;
    if (capture) this.#captures++;
    else this.#viewers++;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (capture) this.#captures--;
      else this.#viewers--;
    };
  }

  status() {
    return { viewers: this.#viewers, maxSessions: this.maxViewers,
      captureSessions: this.#captures, maxCaptureSessions: this.maxCaptures };
  }
}
