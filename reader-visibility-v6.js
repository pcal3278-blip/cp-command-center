(() => {
  "use strict";

  function enhanceReaderAccess() {
    const nav = document.querySelector(".bottom-nav");
    const home = nav?.querySelector('[data-nav="dashboard"]');
    const reader = nav?.querySelector('[data-nav="reader"]');

    if (home && reader && home.nextElementSibling !== reader) {
      home.insertAdjacentElement("afterend", reader);
    }

    if (!document.querySelector('script[data-cp-neural-reader]')) {
      const script = document.createElement("script");
      script.src = "./neural-reader.js?v=6.1.1";
      script.defer = true;
      script.dataset.cpNeuralReader = "true";
      document.head.appendChild(script);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceReaderAccess, { once: true });
  } else {
    enhanceReaderAccess();
  }
})();
