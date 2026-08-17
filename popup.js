(() => {
  const features = document.getElementById("features");
  const enabled = document.getElementById("enabled");
  const status = document.getElementById("status");
  const radios = [...document.querySelectorAll('input[name="clickTarget"]')];

  function readForm() {
    const selected = radios.find((r) => r.checked);
    return {
      enabled: enabled.checked,
      clickTarget: selected?.value === "newTab" ? "newTab" : "sidePanel",
    };
  }

  function writeForm(settings) {
    enabled.checked = Boolean(settings.enabled);
    const target = settings.clickTarget === "newTab" ? "newTab" : "sidePanel";
    for (const radio of radios) radio.checked = radio.value === target;
    features.disabled = !settings.enabled;
  }

  function flash(message) {
    status.textContent = message;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      status.textContent = "";
    }, 2200);
  }

  async function persist() {
    const settings = await cliSaveSettings(readForm());
    writeForm(settings);
    flash("Saved");
  }

  cliGetSettings().then((settings) => {
    writeForm(settings);
    enabled.addEventListener("change", persist);
    for (const radio of radios) radio.addEventListener("change", persist);
  });
})();
