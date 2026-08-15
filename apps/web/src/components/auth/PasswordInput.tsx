import { useState, type InputHTMLAttributes } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Input } from './ui/input';
import { Button } from './ui/button';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  wrapperClassName?: string;
};

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
      <Input
        {...props}
        title={title}
        type={visible ? 'text' : 'password'}
        className={`pr-12 ${className}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted"
        aria-label={toggleLabel}
        title={toggleLabel}
        tabIndex={-1}
      >
        {visible ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
      </Button>
    </div>
  );
}
