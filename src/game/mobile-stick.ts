/** 半浮动摇杆只产生输入轴；不修改角色位置。 */
import type { Input } from '../engine/input';
export function stickForce(
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } {
  const distance = Math.hypot(x, y),
    push = Math.min(1, distance / radius);
  if (push <= 0.08 || !distance) return { x: 0, y: 0 };
  const speed = Math.pow(Math.min(1, (push - 0.08) / 0.67), 0.9);
  return { x: (x / distance) * speed, y: (y / distance) * speed };
}
export function bindMobileStick(
  root: HTMLElement,
  input: Input,
  enabled: () => boolean,
): () => void {
  const stick = root.querySelector<HTMLElement>('#av-stick2')!,
    knob = root.querySelector<HTMLElement>('#av-stick-knob')!;
  const zone = document.createElement('div');
  zone.id = 'av-stick-zone';
  stick.parentElement!.prepend(zone);
  const button = root.querySelector<HTMLButtonElement>('#av-stick-mode')!;
  let mode: 'float' | 'fixed' = 'float',
    pointer: number | null = null,
    source: HTMLElement | null = null,
    ox = 0,
    oy = 0;
  try {
    if (localStorage.getItem('ashen-vale.stick') === 'fixed') mode = 'fixed';
  } catch {
    /* 设置不影响开局 */
  }
  const label = (): void => {
    button.textContent = mode === 'float' ? '摇杆：半浮动' : '摇杆：固定';
    root.classList.toggle('stick-fixed', mode === 'fixed');
  };
  const reset = (): void => {
    if (pointer === null) return;
    const old = pointer,
      target = source;
    pointer = null;
    source = null;
    input.setTouchAxis(0, 0);
    knob.style.transform = 'translate(-50%,-50%)';
    stick.style.removeProperty('left');
    stick.style.removeProperty('top');
    stick.style.removeProperty('bottom');
    if (target?.hasPointerCapture(old)) target.releasePointerCapture(old);
    stick.classList.remove('held');
  };
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    if (!enabled()) {
      reset();
      return;
    }
    const radius = stick.getBoundingClientRect().width * 0.4,
      dx = e.clientX - ox,
      dy = e.clientY - oy,
      length = Math.hypot(dx, dy),
      k = Math.min(1, radius / (length || 1));
    knob.style.transform = `translate(calc(-50% + ${dx * k}px),calc(-50% + ${dy * k}px))`;
    const force = stickForce(dx, dy, radius);
    input.setTouchAxis(force.x, force.y);
  };
  for (const target of [stick, zone]) {
    target.addEventListener('pointerdown', (e) => {
      if (
        !enabled() ||
        pointer !== null ||
        (target === zone && mode === 'fixed')
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      pointer = e.pointerId;
      source = target;
      if (mode === 'float') {
        const r = stick.getBoundingClientRect(),
          half = r.width / 2;
        const cx = Math.max(
          104,
          half + 30,
          Math.min(innerWidth * 0.35 - half, e.clientX),
        );
        const cy = Math.max(
          innerHeight * 0.52,
          Math.min(innerHeight - half - 66, e.clientY),
        );
        stick.style.left = `${cx - half}px`;
        stick.style.top = `${cy - half}px`;
        stick.style.bottom = 'auto';
        ox = e.clientX;
        oy = e.clientY;
        input.setTouchAxis(0, 0);
      } else {
        const r = stick.getBoundingClientRect();
        ox = r.left + r.width / 2;
        oy = r.top + r.height / 2;
      }
      stick.classList.add('held');
      target.setPointerCapture(pointer);
      if (mode === 'fixed') move(e);
    });
    target.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      target.addEventListener(name, (e) => {
        if ((e as PointerEvent).pointerId === pointer) reset();
      });
  }
  button.onclick = () => {
    reset();
    mode = mode === 'float' ? 'fixed' : 'float';
    label();
    try {
      localStorage.setItem('ashen-vale.stick', mode);
    } catch {
      /* 可继续操作 */
    }
  };
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  document.addEventListener('visibilitychange', reset);
  label();
  return reset;
}
