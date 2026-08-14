import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSearch } from '../hooks/useApi';
import { Input } from './ui/input';

export default function SearchBar() {
  const [q, setQ] = useState('');
  const { data } = useSearch(q);
  const navigate = useNavigate();
  const open = q.trim().length >= 2 && data;

  return (
    <div className="relative hidden min-w-0 flex-1 md:block">
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
            <button
              key={`${p.cluster}-${p.date}-${i}`}
              type="button"
              title={`Open ${p.cluster} on ${p.date}`}
              className="flex h-11 w-full items-center rounded-md px-2 text-left text-sm text-text transition duration-300 hover:bg-bg"
              onClick={() => {
                setQ('');
                void navigate(`/day/${p.date}`);
              }}
            >
              {p.cluster}
              <span className="ml-auto text-xs text-text-muted">{p.date}</span>
            </button>
          ))}
          {data.days.slice(0, 5).map((d) => (
            <button
              key={d.date}
              type="button"
              title={`Open ${d.date}`}
              className="flex h-11 w-full items-center rounded-md px-2 text-left text-sm text-text transition duration-300 hover:bg-bg"
              onClick={() => {
                setQ('');
                void navigate(`/day/${d.date}`);
              }}
            >
              {d.date}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
