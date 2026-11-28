/* A transparent sparkle layer leaves the existing nebula and mascot scene visible. */
(() => {
  const panel = document.querySelector('#orbitPanel');
  if (!panel) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'starfield-sparkles';
  canvas.setAttribute('aria-hidden', 'true');
  panel.prepend(canvas);
  const context = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, points = [];
  let elapsed = 0, previous = null;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    let seed = 11929;
    const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    points = Array.from({length: Math.min(130, Math.max(40, Math.round(width * height / 6500)))}, (_, i) => ({
      x: random(), y: random(), radius: .35 + random() * .8,
      phase: random() * Math.PI * 2, speed: .4 + random() * .6,
      dust: i % 4 === 0
    }));
    draw();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    if (!width || !height) return;
    for (const point of points) {
      const wave = (Math.sin(elapsed * .001 * point.speed + point.phase) + 1) / 2;
      const alpha = reduced.matches ? .3 : .12 + wave * .48;
      const x = (point.x * width + elapsed * .0014 * point.speed) % width;
      const y = ((point.y * height - elapsed * .0008 * point.speed) % height + height) % height;
      context.beginPath();
      context.fillStyle = point.dust ? 'rgba(224,201,244,' + alpha * .55 + ')' : 'rgba(233,240,255,' + alpha + ')';
      context.arc(x, y, point.radius, 0, Math.PI * 2);
      context.fill();
      if (!point.dust && point.radius > 1 && wave > .68) {
        const glow = (wave - .68) * .48;
        context.strokeStyle = 'rgba(239,224,194,' + glow + ')';
        context.lineWidth = .6;
        context.beginPath();
        context.moveTo(x - 3, y); context.lineTo(x + 3, y);
        context.moveTo(x, y - 3); context.lineTo(x, y + 3);
        context.stroke();
      }
    }
  }

  new ResizeObserver(resize).observe(canvas);
  reduced.addEventListener('change', draw);
  function frame(time) {
    const active = !document.hidden && !panel.hidden && !reduced.matches &&
      !document.body.classList.contains('paused') && !document.body.classList.contains('arrival-open');
    if (active) {
      if (previous !== null) elapsed += Math.min(64, time - previous);
      draw();
    }
    previous = active ? time : null;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
