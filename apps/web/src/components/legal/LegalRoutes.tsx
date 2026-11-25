import { Fragment, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import LegalPage from './LegalPage';
import { parsePolicyDocument } from './policyParser';
import { legalConfig } from '../../config/legal';
import { interactiveMotion, reducedInteractiveMotion } from '../../lib/motion';
import privacy from '../../../../../docs/legal/privacy.md?raw';
import terms from '../../../../../docs/legal/terms.md?raw';
import cookies from '../../../../../docs/legal/cookies.md?raw';
import dpa from '../../../../../docs/legal/dpa.md?raw';
import accessibility from '../../../../../docs/legal/accessibility.md?raw';
import impressum from '../../../../../docs/legal/impressum.md?raw';
import subprocessors from '../../../../../docs/legal/subprocessors.md?raw';

function InlineText({ text }: { text: string }) {
  const reduced = useReducedMotion();
  return (
    <>
      {text.split(/(https:\/\/[^\s]+)/g).map((part, i) => {
        if (!part.startsWith('https://')) {
          return <Fragment key={i}>{part}</Fragment>;
        }
        const match = part.match(/^(https:\/\/[^\s]+?)([.,;:)]*)$/);
        const url = match ? match[1] : part;
        const trailing = match ? match[2] : '';
        return (
          <Fragment key={i}>
            <motion.a
              href={url}
              title="Open referenced source"
              className="inline-block text-accent underline focus-visible:ring-2"
              {...(reduced ? reducedInteractiveMotion : interactiveMotion)}
            >
              {url}
            </motion.a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}

function Paragraph({ text }: { text: string }) {
  return (
    <p>
      <InlineText text={text} />
    </p>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Policy({
  source,
  inventory,
}: {
  source: string;
  inventory?: 'storage' | 'vendors' | 'data';
}) {
  const { title, blocks } = parsePolicyDocument(source);
  useEffect(() => {
    document.title = `${title} · Locations`;
  }, [title]);

  return (
    <LegalPage title={title}>
      <p>Last updated: {legalConfig.updated}</p>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <h2 key={i} className="pt-4 text-lg font-semibold text-text">
              {block.text}
            </h2>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return <Paragraph key={i} text={block.text} />;
      })}
      {inventory === 'data' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-3 text-left font-semibold text-text">
              Personal data processing inventory
            </caption>
            <thead>
              <tr>
                {['Data', 'Purpose', 'Lawful basis', 'Deletion trigger'].map((h) => (
                  <th key={h} scope="col" className="border border-border p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {legalConfig.data.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="border border-border p-2 font-medium">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className="border border-border p-2">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inventory === 'storage' && (
        <section aria-label="Storage inventory" className="space-y-3">
          {legalConfig.storage.map(([name, type, purpose, lifetime]) => (
            <dl key={name} className="rounded-lg border border-border bg-surface p-4">
              <dt className="break-words font-semibold text-text">{name}</dt>
              <dd>
                {type}, first party. {purpose}.
              </dd>
              <dd>Lifetime: {lifetime}.</dd>
            </dl>
          ))}
        </section>
      )}
      {inventory === 'vendors' && (
        <section aria-label="Service provider inventory" className="space-y-3">
          {legalConfig.vendors.map((v) => (
            <dl key={v.name} className="rounded-lg border border-border bg-surface p-4">
              <dt className="font-semibold text-text">{v.name}</dt>
              <dd>{v.purpose}</dd>
              <dd>Location: {v.region}</dd>
              <dd>Safeguards: {v.safeguard}</dd>
            </dl>
          ))}
        </section>
      )}
      <section aria-label="Operator contact" className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-semibold text-text">Operator and contact</h2>
        <dl>
          {Object.entries(legalConfig.operator).map(([key, value]) => (
            <div key={key} className="mt-2">
              <dt className="capitalize text-text">{key}</dt>
              <dd>
                {key === 'email' && EMAIL_RE.test(value) ? (
                  <a title="Contact the operator" href={`mailto:${value}`} className="text-accent underline">
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </LegalPage>
  );
}

export function PrivacyRoute() {
  return <Policy source={privacy} inventory="data" />;
}
export function TermsRoute() {
  return <Policy source={terms} />;
}
export function CookiesRoute() {
  return <Policy source={cookies} inventory="storage" />;
}
export function DpaRoute() {
  return <Policy source={dpa} />;
}
export function AccessibilityRoute() {
  return <Policy source={accessibility} />;
}
export function ImpressumRoute() {
  return <Policy source={impressum} />;
}
export function SubprocessorsRoute() {
  return <Policy source={subprocessors} inventory="vendors" />;
}
