import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="not-found">
      <SearchX size={42} />
      <p className="eyebrow">404 / Off route</p>
      <h1>This track doesn&apos;t exist.</h1>
      <p>The page may have moved or the address is incomplete.</p>
      <Link className="button button--primary button--md" to="/">
        <ArrowLeft size={16} />Return to overview
      </Link>
    </div>
  );
}
