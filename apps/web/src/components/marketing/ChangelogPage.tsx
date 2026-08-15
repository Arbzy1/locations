import { useEffect } from 'react';
import MarketingLayout from './MarketingLayout';
import ChangelogList from './ChangelogList';

export default function ChangelogPage() {
  useEffect(() => {
    document.title = 'Changelog · Locations';
  }, []);

  return (
    <MarketingLayout title="Changelog">
      <p>Product notes for the hosted app. Engineering detail lives in the repository docs.</p>
      <ChangelogList />
    </MarketingLayout>
  );
}
