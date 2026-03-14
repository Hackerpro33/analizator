import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { currentToast, dismiss } = useToast({ subscribe: true });

  return (
    <ToastProvider>
      {currentToast && (
        <Toast key={currentToast.id} {...currentToast}>
          <div className="grid gap-1">
            {currentToast.title && <ToastTitle>{currentToast.title}</ToastTitle>}
            {currentToast.description && (
              <ToastDescription>{currentToast.description}</ToastDescription>
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
