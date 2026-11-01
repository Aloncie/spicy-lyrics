import { PageContainer } from "../Pages/PageView.ts";

/*
 * A short message under the fullscreen view controls that fades out on its own.
 * For feedback a click wouldn't otherwise show; it sits on the artwork, never over
 * the lyrics area, and ignores the pointer.
 */

const VISIBLE_MS = 2200;

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function ShowFullscreenHint(message: string) {
  const mediaBox = PageContainer?.querySelector<HTMLElement>(
    ".ContentBox .NowBar .Header .MediaBox"
  );
  if (!mediaBox) return;

  let hint = mediaBox.querySelector<HTMLElement>(".SL_FullscreenHint");
  if (!hint) {
    hint = document.createElement("div");
    hint.className = "SL_FullscreenHint";
    hint.setAttribute("role", "status");
    mediaBox.appendChild(hint);
  }
  hint.textContent = message;

  const el = hint;
  requestAnimationFrame(() => el.classList.add("Visible"));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove("Visible"), VISIBLE_MS);
}
