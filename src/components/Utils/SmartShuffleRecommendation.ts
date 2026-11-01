import Global from "../Global/Global.ts";
import { PageContainer } from "../Pages/PageView.ts";

/*
 * Smart shuffle mixes recommended tracks into a playlist, and Spotify offers a
 * "remove recommendation" button for them next to the track in the playbar. The
 * fullscreen button presses that native button, so the track is skipped and the
 * feedback sent exactly as Spotify does it (including its delayed send).
 */

const PAGE_CLASS = "SL_SmartShuffleRecommendation";

export function IsSmartShuffleRecommendation(): boolean {
  return Spicetify.Player.data?.item?.metadata?.provider === "enhanced_recommendation";
}

// For a recommendation the playbar's action wrapper holds two buttons: remove first,
// then add to the playlist. Matched by position, since the labels are localised.
function findNativeRemoveButton(): HTMLButtonElement | null {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    '[data-testid="now-playing-widget"] .main-nowPlayingWidget-actionButtonWrapper button'
  );
  return buttons.length === 2 ? buttons[0] : null;
}

/** Presses Spotify's own remove button. False when it isn't there to press. */
export function RemoveCurrentRecommendation(): boolean {
  if (!IsSmartShuffleRecommendation()) return false;
  const button = findNativeRemoveButton();
  if (!button) return false;
  button.click();
  return true;
}

/** Shows the fullscreen button only while a recommendation is playing. */
export function SyncRecommendationState() {
  PageContainer?.classList.toggle(PAGE_CLASS, IsSmartShuffleRecommendation());
}

Global.Event.listen("playback:songchange", () => SyncRecommendationState());
