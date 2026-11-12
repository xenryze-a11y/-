/** 横屏是浏览器显示能力，不写入角色/存档，也不伪造旋转后的触控坐标。 */
export function bindLandscapeButtons(
  root: HTMLElement,
  toast: (message: string) => void,
): void {
  const buttons = [
    ...root.querySelectorAll<HTMLButtonElement>('[data-landscape]'),
  ];
  type FullscreenDoc = Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  type FullscreenRoot = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const doc = document as FullscreenDoc;
  const orientation = screen.orientation as
    | (ScreenOrientation & { lock?: (value: string) => Promise<void> })
    | undefined;
  let busy = false,
    ownedLock = false;
  const fullscreen = (): boolean =>
    !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  const update = (): void => {
    const active = fullscreen();
    for (const button of buttons) {
      button.textContent =
        button.id === 'av-landscape-button'
          ? active
            ? '退出'
            : '横屏'
          : active
            ? '退出全屏'
            : '手机横屏';
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute(
        'aria-label',
        active ? '退出全屏' : '切换手机全屏横屏',
      );
      button.title = active
        ? '退出全屏并恢复旋转设置'
        : '进入全屏横屏；不支持自动旋转时请手动横放手机';
      button.disabled = busy;
    }
    if (!active && ownedLock) {
      orientation?.unlock?.();
      ownedLock = false;
    }
  };
  const toggle = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    update();
    try {
      if (fullscreen()) {
        const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
        await exit?.call(doc);
        return;
      }
      const element = document.documentElement as FullscreenRoot;
      const request =
        element.requestFullscreen || element.webkitRequestFullscreen;
      if (!request) {
        toast('请将手机横放，画面和按键会自动切换横屏布局');
        return;
      }
      // 必须直接从点击进入，不得先等保存/动画而丢失用户手势授权。
      await request.call(element);
      if (orientation?.lock) {
        try {
          await orientation.lock('landscape');
          ownedLock = true;
          return;
        } catch {
          /* Safari/部分浏览器允许全屏但不允许锁定方向 */
        }
      }
      toast(
        innerWidth >= innerHeight
          ? '已进入全屏横屏'
          : '已进入全屏，请将手机横放',
      );
    } catch {
      toast('浏览器未允许全屏；请将手机横放，按键会自动适配');
    } finally {
      busy = false;
      update();
    }
  };
  for (const button of buttons)
    button.onclick = () => {
      void toggle();
    };
  doc.addEventListener('fullscreenchange', update);
  doc.addEventListener('webkitfullscreenchange', update);
  update();
}
