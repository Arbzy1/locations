import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSearch } from '../hooks/useApi';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { placePath } from '../lib/paths';

export default function SearchBar() {
  const [q, setQ] = useState('');
  const { data } = useSearch(q);
  const navigate = useNavigate();
  const open = q.trim().length >= 2 && data;

  return (
    <div className="relative min-w-0 flex-1">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        title="Search places and dates"
        placeholder="Search places or dates"
        className="h-11 pl-8"
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-lg">
          {(data.places.length === 0 && data.days.length === 0) && (
            <p className="px-2 py-1 text-xs text-text-muted">No matches</p>
          )}
          {data.places.slice(0, 8).map((p, i) => (
            <Button
              key={`${p.cluster}-${p.date}-${i}`}
              type="button"
              variant="ghost"
              title={`Open place ${p.cluster}`}
              className="h-11 w-full justify-start px-2 text-left font-normal"
              onClick={() => {
                setQ('');
                void navigate(placePath(p.cluster));
              }}
            >
              {p.cluster}
              <span className="ml-auto text-xs text-text-muted">{p.date}</span>
            </Button>
          ))}
          {data.days.slice(0, 5).map((d) => (
            <Button
              key={d.date}
              type="button"
              variant="ghost"
              title={`Open ${d.date}`}
              className="h-11 w-full justify-start px-2 text-left font-normal"
              onClick={() => {
                setQ('');
                void navigate(`/day/${d.date}`);
              }}
            >
              {d.date}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
