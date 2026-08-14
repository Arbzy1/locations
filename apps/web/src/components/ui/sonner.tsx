import { Toaster as Sonner } from "sonner";
import { useTheme } from "../../lib/theme";

export function Toaster() {
  const { theme } = useTheme();
  return <Sonner theme={theme} richColors closeButton />;
}
