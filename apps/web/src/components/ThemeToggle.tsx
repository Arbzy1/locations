import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

interface Props {
  className?: string;
}

/** Compact sun/moon control for sidebar and login. */
export default function ThemeToggle({ className = '' }: Props) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors duration-ui-emphasis ease-ui hover:bg-bg/50 hover:text-text ${className}`}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
