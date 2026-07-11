(() => {
  "use strict";

  const TARGET_MINUTES = 35;
  const BASE_WORDS_PER_MINUTE = 150;

  function enhanceReaderAccess() {
    const nav = document.querySelector(".bottom-nav");
    const home = nav?.querySelector('[data-nav="dashboard"]');
    const reader = nav?.querySelector('[data-nav="reader"]');

    if (home && reader && home.nextElementSibling !== reader) {
      home.insertAdjacentElement("afterend", reader);
    }

    installDurationGuide();

    if (!document.querySelector('script[data-cp-neural-reader]')) {
      const script = document.createElement("script");
      script.src = "./neural-reader.js?v=6.1.1";
      script.defer = true;
      script.dataset.cpNeuralReader = "true";
      document.head.appendChild(script);
    }
  }

  function installDurationGuide() {
    const readerMain = document.querySelector(".reader-main");
    const text = document.querySelector("#readerText");
    const rate = document.querySelector("#readerRate");
    if (!readerMain || !text || !rate || document.querySelector("#readerDurationGuide")) return;

    const guide = document.createElement("p");
    guide.id = "readerDurationGuide";
    guide.className = "muted";
    guide.setAttribute("aria-live", "polite");

    const status = document.querySelector("#readerStatus");
    if (status) status.insertAdjacentElement("afterend", guide);
    else readerMain.appendChild(guide);

    const update = () => {
      const words = text.value.trim().split(/\s+/).filter(Boolean).length;
      const selectedRate = Number(rate.value || 0.8);
      const effectiveWpm = Math.max(90, BASE_WORDS_PER_MINUTE * selectedRate);
      const estimatedMinutes = words ? words / effectiveWpm : 0;
      const targetWords = Math.round(TARGET_MINUTES * effectiveWpm / 100) * 100;
      const difference = estimatedMinutes - TARGET_MINUTES;

      let readiness = "Add a script to estimate its narration length.";
      if (words) {
        if (Math.abs(difference) <= 2) readiness = "Ready for the 35-minute target.";
        else if (difference < 0) readiness = `About ${Math.ceil(Math.abs(difference))} minutes short of the target.`;
        else readiness = `About ${Math.ceil(difference)} minutes longer than the target.`;
      }

      guide.textContent = `35-minute narration mode · ${words.toLocaleString()} words · estimated ${estimatedMinutes.toFixed(1)} minutes at ${selectedRate.toFixed(1)}×. ${readiness} Target is roughly ${targetWords.toLocaleString()} words at this pace.`;
    };

    text.addEventListener("input", update);
    rate.addEventListener("change", update);
    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceReaderAccess, { once: true });
  } else {
    enhanceReaderAccess();
  }
})();