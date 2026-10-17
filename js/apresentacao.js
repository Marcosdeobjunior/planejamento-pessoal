function setEnterLoading(loading) {
  var btn = document.querySelector(".btn-enter");
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.querySelector("span").textContent = "✦   Entrando…   ✦";
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.querySelector("span").innerHTML = "✦ &nbsp; Entrar &nbsp; ✦";
  }
}

function enterSite() {
  setEnterLoading(true);
  sessionStorage.setItem("soter_allow_index", "1");
  if (window.SoterStorage && typeof window.SoterStorage.tryAutoEnter === "function") {
    window.SoterStorage.tryAutoEnter("index.html").then(function (entered) {
      if (entered) return;
      setEnterLoading(false);
      if (window.SoterStorage && typeof window.SoterStorage.openAuthModal === "function") {
        window.SoterStorage.openAuthModal({ redirectUrl: "index.html" });
        return;
      }
      window.location.href = "index.html";
    }).catch(function () {
      setEnterLoading(false);
    });
    return;
  }
  setEnterLoading(false);
  if (window.SoterStorage && typeof window.SoterStorage.openAuthModal === "function") {
    window.SoterStorage.openAuthModal({ redirectUrl: "index.html" });
    return;
  }
  window.location.href = "index.html";
}

function setupEnterButtonRipple() {
  const button = document.querySelector(".btn-enter");
  if (!button) return;

  function updateRippleOrigin(evt) {
    const rect = button.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const maxX = Math.max(x, rect.width - x);
    const maxY = Math.max(y, rect.height - y);
    const radius = Math.ceil(Math.sqrt(maxX * maxX + maxY * maxY)) * 2;
    button.style.setProperty("--ripple-x", `${x}px`);
    button.style.setProperty("--ripple-y", `${y}px`);
    button.style.setProperty("--ripple-size", `${radius}px`);
  }

  button.addEventListener("pointerenter", updateRippleOrigin);
  button.addEventListener("pointermove", updateRippleOrigin);
  button.addEventListener("click", enterSite);
}

// fundo de estrelas: js/starfield.js (mesmo desenho, com pausa e sem custo quadrático)
setupEnterButtonRipple();
if (window.SoterStarfield) window.SoterStarfield.start(document.getElementById("bg-canvas"));
