import { router } from "expo-router";
import { Button } from "../../components/ui";
import { hrErrorView, type HrRecovery } from "./errors";
import type { HrErrorCode } from "./types";
import { HrHero, useHrUi } from "./ui";

/**
 * Full error state (prototype 20–25). The screen supplies handlers for the
 * recoveries it supports; navigation recoveries are handled here.
 */
export function HrErrorState({ code, onRetrySame, onRescan, onRecheck, onCancel }: { code: HrErrorCode; onRetrySame?: () => void; onRescan?: () => void; onRecheck?: () => void; onCancel?: () => void }) {
  const { pick, t, path } = useHrUi();
  const view = hrErrorView(code);
  const handlers: Record<HrRecovery, (() => void) | undefined> = {
    retry_same: onRetrySame,
    rescan: onRescan,
    recheck: onRecheck ?? (() => router.replace(path())),
    reactivate: () => router.replace(path("activate")),
    dismiss: onCancel,
    back_today: () => router.replace(path("today")),
  };
  const primary = handlers[view.primary.recovery];
  return (
    <>
      <HrHero icon={view.icon} tone={view.tone} title={pick(view.title)} body={pick(view.body)} />
      {primary ? <Button testID={`hr-error-${view.primary.recovery}`} size="lg" onPress={primary}>{pick(view.primary.label)}</Button> : null}
      {view.cancel && onCancel ? <Button testID="hr-error-cancel" variant="ghost" onPress={onCancel}>{t("إلغاء", "Cancel")}</Button> : null}
    </>
  );
}
