import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_MOOD_ID,
  getMood,
  injectMoodStyles,
  resolveMoodId,
  shuffleMoodId,
  type MoodId,
} from './theme/moods';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'locations-theme';
const MOOD_KEY = 'locations-mood';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mood: MoodId;
  moodName: string;
  setMood: (mood: MoodId) => void;
  shuffleMood: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredMood(): MoodId {
  try {
    return resolveMoodId(localStorage.getItem(MOOD_KEY));
  } catch {
    return DEFAULT_MOOD_ID;
  }
}

function systemTheme(): Theme {
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyMood(mood: MoodId) {
  document.documentElement.setAttribute('data-mood', mood);
}

if (typeof document !== 'undefined') {
  injectMoodStyles();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') return attr;
    }
    return resolveInitialTheme();
  });
  const [mood, setMoodState] = useState<MoodId>(() => {
    if (typeof document !== 'undefined') {
      return resolveMoodId(
        document.documentElement.getAttribute('data-mood') ?? readStoredMood(),
      );
    }
    return DEFAULT_MOOD_ID;
  });
  const [hasExplicitChoice, setHasExplicitChoice] = useState(() => readStoredTheme() !== null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyMood(mood);
  }, [mood]);

  useEffect(() => {
    if (hasExplicitChoice) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setThemeState(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hasExplicitChoice]);

  const setTheme = useCallback((next: Theme) => {
    setHasExplicitChoice(true);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const setMood = useCallback((next: MoodId) => {
    const id = resolveMoodId(next);
    try {
      localStorage.setItem(MOOD_KEY, id);
    } catch {
      /* ignore */
    }
    setMoodState(id);
  }, []);

  const shuffleMood = useCallback(() => {
    setMood(shuffleMoodId(mood));
  }, [mood, setMood]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      mood,
      moodName: getMood(mood).name,
      setMood,
      shuffleMood,
    }),
    [theme, setTheme, toggleTheme, mood, setMood, shuffleMood],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
