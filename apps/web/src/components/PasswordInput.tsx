import { useState, type InputHTMLAttributes } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Extra classes for the outer wrapper (default includes mb-4 like login fields). */
  wrapperClassName?: string;
};

/**
 * Password field with a show/hide toggle (react-icons).
 * Use this instead of raw `<input type="password">`.
 * Caller `title` is forwarded to the input; the toggle has its own title.
 */
export default function PasswordInput({
  className = '',
  wrapperClassName = 'mb-4',
  title,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? 'Hide password' : 'Show password';

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...props}
        title={title}
        type={visible ? 'text' : 'password'}
        className={`w-full rounded-lg border border-border bg-bg px-3 py-2.5 pr-10 text-sm text-text outline-none ring-accent focus:ring-1 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition hover:text-text"
        aria-label={toggleLabel}
        title={toggleLabel}
        tabIndex={-1}
      >
        {visible ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
      </button>
    </div>
  );
}
