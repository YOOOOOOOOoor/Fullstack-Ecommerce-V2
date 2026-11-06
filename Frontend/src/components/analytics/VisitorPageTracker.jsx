import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import API from "../../../API/api.js";
import { createVisitorPathTracker, getOrCreateVisitorId } from "./visitorTracking.js";

export default function VisitorPageTracker() {
  const { pathname } = useLocation();
  const trackPath = useMemo(() => createVisitorPathTracker({
    getVisitorId: () => getOrCreateVisitorId(window.localStorage, window.crypto),
    send: (event) => API.post("/trueanalytics/events", event),
  }), []);

  useEffect(() => {
    trackPath(pathname);
  }, [pathname, trackPath]);

  return null;
}
