(function () {
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  var svg = document.querySelector(".orbit svg");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (svg && svg.pauseAnimations) {
    var apply = function () {
      if (reduce.matches) svg.pauseAnimations();
      else svg.unpauseAnimations();
    };
    apply();
    if (reduce.addEventListener) reduce.addEventListener("change", apply);
  }
})();
