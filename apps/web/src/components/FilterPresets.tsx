import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  deleteFilterPreset,
  loadFilterPresets,
  saveFilterPreset,
} from '../lib/nav-memory';
import { hasSavableFilters } from '../lib/view-search-params';

export default function FilterPresets() {
  const location = useLocation();
  const navigate = useNavigate();
  const [presets, setPresets] = useState(() => loadFilterPresets());
  const [name, setName] = useState('');
  const savable = hasSavableFilters(location.pathname, location.search);
  const path = `${location.pathname}${location.search}`;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button
            key={p.name}
            type="button"
            variant="outline"
            size="sm"
            title={`Apply preset ${p.name}`}
            onClick={() => void navigate(p.path)}
          >
            {p.name}
          </Button>
        ))}
      </div>
      {savable && (
        <div className="flex gap-2">
          <Input
            title="Name for this filter preset"
            placeholder="Preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
          <Button
            type="button"
            variant="outline"
            title="Save current filters on this device"
            disabled={!name.trim()}
            onClick={() => {
              setPresets(saveFilterPreset(name, path));
              setName('');
            }}
          >
            Save
          </Button>
        </div>
      )}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button
              key={`del-${p.name}`}
              type="button"
              variant="ghost"
              size="sm"
              title={`Delete preset ${p.name}`}
              onClick={() => setPresets(deleteFilterPreset(p.name))}
            >
              Delete {p.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
