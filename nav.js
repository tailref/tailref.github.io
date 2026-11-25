/* TailRef Studio — small screen navigation */
(() => {
  "use strict";

  const button = document.querySelector(".nav-btn");
  const nav = document.querySelector(".site-nav");
  if (!button || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-open", open);
  };

  button.addEventListener("click", () => {
    setOpen(button.getAttribute("aria-expanded") !== "true");
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      button.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (button.getAttribute("aria-expanded") !== "true") return;
    if (event.target.closest(".site-head")) return;
    setOpen(false);
  });

  const desktop = window.matchMedia("(min-width: 901px)");
  desktop.addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
})();
