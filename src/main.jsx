import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@fontsource-variable/noto-sans-jp";
import "@fontsource-variable/noto-serif-jp";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
