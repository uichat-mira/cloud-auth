import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface ModalOpenValue {
  open: boolean;
  setOpen(next: boolean): void;
}

const ModalOpenContext = createContext<ModalOpenValue | null>(null);

/**
 * Tracks whether a modal (currently the change-password dialog) is on screen.
 *
 * The account console renders one alert region for the shared auth failure. A
 * dialog renders its own copy of that failure, so while it is open the page-level
 * region has to yield — otherwise the same state answers with two role="alert"
 * nodes. CSS (`:has(dialog[open])`) can hide the region, but it would still be in
 * the accessible tree for tests and non-browser clients; state keeps it honest.
 */
export function ModalOpenProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <ModalOpenContext.Provider value={{ open, setOpen }}>
      {children}
    </ModalOpenContext.Provider>
  );
}

export function useModalOpen(): boolean {
  return useContext(ModalOpenContext)?.open ?? false;
}

/** Register a controlled dialog: registers while open, clears on close/unmount. */
export function useRegisterModalOpen(open: boolean) {
  const setOpen = useContext(ModalOpenContext)?.setOpen;

  useEffect(() => {
    if (!setOpen) return;
    setOpen(open);
    return () => setOpen(false);
  }, [open, setOpen]);
}
