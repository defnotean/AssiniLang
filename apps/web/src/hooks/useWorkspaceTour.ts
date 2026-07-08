import { useState, type Dispatch, type SetStateAction } from "react";
import type { TourStep } from "../components/GuidedTour";
import { getBrowserThemeStorage } from "../lib/theme";

export const TOUR_STORAGE_KEY = "workspace.tourSeen";

export const TOUR_STEPS: TourStep[] = [
  { titleKey: "tour.welcomeTitle", bodyKey: "tour.welcomeBody" },
  { selector: ".sidebar", titleKey: "tour.sidebarTitle", bodyKey: "tour.sidebarBody" },
  { selector: ".brand-controls", titleKey: "tour.settingsTitle", bodyKey: "tour.settingsBody" },
  { selector: ".language-nav", titleKey: "tour.languagesTitle", bodyKey: "tour.languagesBody" },
  { selector: ".sidebar-footer", titleKey: "tour.createTitle", bodyKey: "tour.createBody" },
  { titleKey: "tour.workflowTitle", bodyKey: "tour.workflowBody" },
  { selector: ".prototype-notice", titleKey: "tour.prototypeTitle", bodyKey: "tour.prototypeBody" },
  { selector: ".stat-strip", titleKey: "tour.statsTitle", bodyKey: "tour.statsBody" },
  { selector: ".section-nav", titleKey: "tour.screensTitle", bodyKey: "tour.screensBody" },
  { titleKey: "tour.paletteTitle", bodyKey: "tour.paletteBody" },
  { titleKey: "tour.doneTitle", bodyKey: "tour.doneBody" }
];

type WorkspaceTourState = {
  showTour: boolean;
  setShowTour: Dispatch<SetStateAction<boolean>>;
  dismissTour: () => void;
};

export function useWorkspaceTour(): WorkspaceTourState {
  const [showTour, setShowTour] = useState(() => {
    try {
      const storage = getBrowserThemeStorage();
      return !!storage && storage.getItem(TOUR_STORAGE_KEY) !== "1";
    } catch {
      return false;
    }
  });

  function dismissTour() {
    try {
      getBrowserThemeStorage()?.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // Ignore localStorage failures in test runners or locked-down browsers.
    }
    setShowTour(false);
  }

  return { showTour, setShowTour, dismissTour };
}
