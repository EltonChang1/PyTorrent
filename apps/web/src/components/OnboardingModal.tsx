import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "torflix_onboarding_done";

export function OnboardingModal() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== "1";
    } catch {
      return true;
    }
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const elts = [...focusables];
    const first = elts[0];
    const last = elts[elts.length - 1];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (e.key !== "Tab" || elts.length === 0) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => panel.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div className="onb-root" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <button type="button" className="onb-backdrop" aria-label="Close welcome" onClick={dismiss} />
      <div className="onb-panel" ref={panelRef}>
        <h2 id="onb-title" className="onb-title">
          Welcome to Torflix
        </h2>
        <p className="onb-body muted">
          Browse the catalog, add magnets to your local daemon, and use <strong>Watch while downloading</strong> for
          in-browser playback. Your dashboard and My List can be customized from the account page. Only access content
          you have the right to use.
        </p>
        <button type="button" className="btn-primary btn-lg onb-cta" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
