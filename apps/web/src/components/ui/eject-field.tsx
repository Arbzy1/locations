import {
  Children,
  cloneElement,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/utils';
import { isControlFilled, usesSpacePlaceholder } from '../../lib/ejectField';

type ControlProps = {
  id?: string;
  name?: string;
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  placeholder?: string;
  type?: string;
  className?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
};

export function EjectField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactElement;
}) {
  const child = Children.only(children) as ReactElement<ControlProps>;
  const isSelect = child.type === 'select';
  const type = child.props.type;
  const controlled = child.props.value !== undefined;
  const [uncontrolledFilled, setUncontrolledFilled] = useState(() =>
    isControlFilled(child.props.defaultValue ?? child.props.value),
  );
  const filled = controlled ? isControlFilled(child.props.value) : uncontrolledFilled;
  const spacePlaceholder = usesSpacePlaceholder(type, isSelect);

  const cloned = cloneElement(child, {
    id: child.props.id ?? htmlFor,
    ...(spacePlaceholder ? { placeholder: ' ' } : {}),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      if (!controlled) setUncontrolledFilled(isControlFilled(event.currentTarget.value));
      child.props.onChange?.(event);
    },
  });

  return (
    <div className={cn('le-field', filled && 'is-filled', className)}>
      <div className="le-field__box">
        {cloned as ReactNode}
        <label className="le__label" htmlFor={htmlFor}>
          <span className="le__back" aria-hidden="true" />
          <span className="le__text">{label}</span>
        </label>
      </div>
    </div>
  );
}
