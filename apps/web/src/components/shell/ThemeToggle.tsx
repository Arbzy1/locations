import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Props {
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({ className = '', showLabel = false }: Props) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? 'default' : 'icon'}
      onClick={toggleTheme}
      className={cn(showLabel && 'h-11 w-full justify-start gap-2 px-3', className)}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      {showLabel && <span className="truncate text-sm capitalize">{next}</span>}
    </Button>
  );
}
