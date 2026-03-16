import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

function normalizeToastText(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (/<html[\s>]/i.test(value) || /<body[\s>]/i.test(value) || /<title>/i.test(value)) {
    return "Сервер временно недоступен. Попробуйте ещё раз через минуту.";
  }
  return value;
}

export function Toaster() {
  const { currentToast, dismiss } = useToast({ subscribe: true });
  const safeTitle = normalizeToastText(currentToast?.title);
  const safeDescription = normalizeToastText(currentToast?.description);

  return (
    <ToastProvider>
      {currentToast && (
        <Toast key={currentToast.id} {...currentToast}>
          <div className="grid gap-1">
            {safeTitle && <ToastTitle>{safeTitle}</ToastTitle>}
            {safeDescription && (
              <ToastDescription>{safeDescription}</ToastDescription>
            )}
          </div>
          {currentToast.action}
          <ToastClose
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              dismiss(currentToast.id);
            }}
          />
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
