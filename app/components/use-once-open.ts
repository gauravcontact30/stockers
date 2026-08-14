"use client";

import { useEffect, useState } from "react";

/**
 * True from the first time something is opened, and true forever after.
 *
 * This exists to make `next/dynamic` actually pay off on modals. A dynamically imported component
 * fetches its chunk when it is first *rendered*, not when it is first imported — so a modal that
 * is always in the tree with `open={false}` downloads on page load exactly as a static import
 * would, and the split buys nothing. Gating the render on this hook means the chunk is not asked
 * for until somebody opens the thing.
 *
 * It latches rather than tracking `open` directly because `AppleModal` animates on the way out: it
 * holds itself mounted for 220ms after `open` goes false. Unmounting the moment it closed would
 * cut that short and the panel would snap away instead of settling.
 *
 * `open || opened` rather than `opened` alone, so the render that opens it already returns true —
 * waiting for the effect would cost a frame on every first open.
 */
export function useOnceOpen(open: boolean): boolean {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-way latch: it only ever goes false→true, and only when `open` is already true, so this cannot loop.
    if (open) setOpened(true);
  }, [open]);

  return open || opened;
}
