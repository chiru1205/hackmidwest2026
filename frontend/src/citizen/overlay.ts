import { createContext, useContext } from "react";

/** The element inside the phone frame that full-screen overlays (scan, reveal) portal into. */
export const OverlayCtx = createContext<HTMLElement | null>(null);
export const useOverlayRoot = () => useContext(OverlayCtx);
