import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n, type MessageKey } from "../i18n";

export interface TourStep {
  /** Optional CSS selector to spotlight. If absent or not found, the card centers. */
  selector?: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 8;
const CARD_WIDTH = 360;
const GAP = 16;

/**
 * Place the card beside the spotlight where there is room (right -> below ->
 * above -> left), centred on the target's relevant axis, and always clamped
 * fully on-screen. Falls back to screen-centre when there is no target or no
 * room — so the card is never positioned off the viewport, even for full-height
 * targets like the sidebar.
 */
function placeCard(rect: Rect | null, cardWidth: number, cardHeight: number, vw: number, vh: number): CSSProperties {
  if (!rect) {
    return { top: Math.round((vh - cardHeight) / 2), left: Math.round((vw - cardWidth) / 2) };
  }
  const clampLeft = (value: number) => Math.min(Math.max(value, 16), Math.max(vw - cardWidth - 16, 16));
  const clampTop = (value: number) => Math.min(Math.max(value, 16), Math.max(vh - cardHeight - 16, 16));
  const spotRight = rect.left + rect.width + SPOTLIGHT_PAD;
  const spotBottom = rect.top + rect.height + SPOTLIGHT_PAD;
  const spotTop = rect.top - SPOTLIGHT_PAD;
  const spotLeft = rect.left - SPOTLIGHT_PAD;
  const centreY = clampTop(rect.top + rect.height / 2 - cardHeight / 2);
  const centreX = clampLeft(rect.left + rect.width / 2 - cardWidth / 2);

  if (vw - spotRight >= cardWidth + GAP) return { top: centreY, left: spotRight + GAP };
  if (vh - spotBottom >= cardHeight + GAP) return { top: spotBottom + GAP, left: centreX };
  if (spotTop >= cardHeight + GAP) return { top: spotTop - cardHeight - GAP, left: centreX };
  if (spotLeft >= cardWidth + GAP) return { top: centreY, left: spotLeft - cardWidth - GAP };
  return { top: Math.round((vh - cardHeight) / 2), left: Math.round((vw - cardWidth) / 2) };
}

/**
 * A dismissible, first-run guided tour. Each step optionally spotlights a real
 * element (dimming the rest of the screen and ringing it in gold); steps with
 * no on-screen target show a centred card. Back / Next / Skip, arrow keys, and
 * Escape all work; dismissing is the caller's responsibility (it persists a flag
 * so the tour does not reappear).
 */
export function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 220 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Scroll the spotlight target into view once per step (not on every measure,
  // which would feed scroll events back into the measure listener).
  useEffect(() => {
    if (!step?.selector) return;
    document.querySelector(step.selector)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index, step]);

  // Track the target rect and viewport. Both updates bail when nothing changed,
  // so resize/scroll measurements never trigger an infinite re-render loop.
  useLayoutEffect(() => {
    function measure() {
      setViewport((prev) =>
        prev.width === window.innerWidth && prev.height === window.innerHeight
          ? prev
          : { width: window.innerWidth, height: window.innerHeight }
      );
      const el = step?.selector ? document.querySelector(step.selector) : null;
      setRect((prev) => {
        if (!el) return prev === null ? prev : null;
        const r = el.getBoundingClientRect();
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        if (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        return next;
      });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Keep the measured card size current so positioning accounts for its real height.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    setCardSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, steps.length - 1));
      else if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, onClose]);

  if (!step) return null;

  const cardStyle = placeCard(rect, cardSize.width, cardSize.height, viewport.width, viewport.height);

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label={t("tour.aria")}>
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2
          }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      <div ref={cardRef} className="tour-card" style={cardStyle}>
        <div className="tour-step-count">{t("tour.step", { current: index + 1, total: steps.length })}</div>
        <h3 className="tour-title">{t(step.titleKey)}</h3>
        <p className="tour-body">{t(step.bodyKey)}</p>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, dotIndex) => (
            <span key={dotIndex} className={dotIndex === index ? "tour-dot on" : "tour-dot"} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onClose}>
            {t("tour.skip")}
          </button>
          <div className="tour-nav">
            {index > 0 && (
              <button type="button" className="tour-back" onClick={() => setIndex((value) => value - 1)}>
                {t("tour.back")}
              </button>
            )}
            <button
              type="button"
              className="tour-next"
              onClick={() => (isLast ? onClose() : setIndex((value) => value + 1))}
            >
              {isLast ? t("tour.done") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
