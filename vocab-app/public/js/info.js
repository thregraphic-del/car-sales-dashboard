// The green «i» beside the flame, on every page: it starts the tour of the page you are on — one icon or button lit at a
// time (the rest of the page greyed), one line about what it does, «التالي» or «تخطّي». Nothing runs in the background.
export function startInfo() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#infoBtn, #infoBtnSide, #infoBtnPage')) return;
    import('./tour.js').then((m) => m.startTour(m.currentTour())).catch(() => {});
  });
}
