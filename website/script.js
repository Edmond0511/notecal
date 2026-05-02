(() => {
  const carousel = document.getElementById("carousel");
  if (!carousel) return;

  const slides = Array.from(carousel.querySelectorAll(".slide"));

  const AUTO_MS = 4000;
  const SWIPE_PX = 40;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let active = 0;
  let timer = null;
  let inView = true;
  let hovering = false;

  const setActive = (i) => {
    active = (i + slides.length) % slides.length;
    slides.forEach((s, idx) => s.classList.toggle("is-active", idx === active));
  };

  const stop = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const start = () => {
    if (reduce || hovering || !inView || timer) return;
    timer = window.setInterval(() => setActive(active + 1), AUTO_MS);
  };

  const restart = () => {
    stop();
    start();
  };

  // Pause on hover.
  carousel.addEventListener("mouseenter", () => {
    hovering = true;
    stop();
  });
  carousel.addEventListener("mouseleave", () => {
    hovering = false;
    start();
  });

  // Swipe (touch + mouse drag).
  let dragStartX = null;
  let dragging = false;

  const onDragStart = (x) => {
    dragStartX = x;
    dragging = true;
    stop();
  };

  const onDragEnd = (x) => {
    if (!dragging || dragStartX === null) return;
    const delta = x - dragStartX;
    if (Math.abs(delta) > SWIPE_PX) {
      setActive(active + (delta < 0 ? 1 : -1));
    }
    dragging = false;
    dragStartX = null;
    if (!hovering) start();
  };

  carousel.addEventListener("touchstart", (e) => {
    onDragStart(e.touches[0].clientX);
  }, { passive: true });
  carousel.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    onDragEnd(t.clientX);
  }, { passive: true });

  carousel.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onDragStart(e.clientX);
  });
  window.addEventListener("mouseup", (e) => {
    if (dragging) onDragEnd(e.clientX);
  });

  // Only run while the hero is visible.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) start();
        else stop();
      },
      { threshold: 0.15 }
    );
    io.observe(carousel);
  }

  setActive(0);
  start();
})();
