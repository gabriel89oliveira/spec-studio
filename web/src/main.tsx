import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Gate from "./Gate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
);
