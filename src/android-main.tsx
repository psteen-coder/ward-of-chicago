import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WardGame } from "@/components/WardGame";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Ward of Chicago has no root element");

createRoot(root).render(
  <StrictMode>
    <WardGame />
  </StrictMode>,
);
