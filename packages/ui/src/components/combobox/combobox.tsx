'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'value' | 'onSelect'
  > {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  onOptionSelect?: (option: ComboboxOption) => void;
  placeholder?: string;
}

export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(
  ({ className, options, value, onChange, onOptionSelect, placeholder, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const listRef = React.useRef<HTMLUListElement>(null);
    const selected = options.find((o) => o.value === value);
    const filtered = options.filter(
      (o) => !o.disabled && o.label.toLowerCase().includes(query.toLowerCase())
    );

    const selectOption = (option: ComboboxOption) => {
      onChange?.(option.value);
      onOptionSelect?.(option);
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!open || filtered.length === 0) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            selectOption(filtered[activeIndex]);
          }
          break;
        case 'Escape':
          setOpen(false);
          setActiveIndex(-1);
          break;
      }
    };

    React.useEffect(() => {
      if (activeIndex >= 0 && listRef.current) {
        const item = listRef.current.children[activeIndex] as HTMLElement;
        item?.scrollIntoView({ block: 'nearest' });
      }
    }, [activeIndex]);

    return (
      <div className="mt-combobox">
        <input
          ref={ref}
          className={cn('mt-combobox-input', className)}
          value={query || selected?.label || ''}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `mt-cb-option-${activeIndex}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          {...props}
        />
        <button
          type="button"
          className="mt-combobox-trigger"
          onClick={() => setOpen(!open)}
          tabIndex={-1}
          aria-label="Toggle options"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {open && filtered.length > 0 && (
          <ul className="mt-combobox-list" ref={listRef} role="listbox">
            {filtered.map((option, index) => (
              <li
                key={option.value}
                id={`mt-cb-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  'mt-combobox-item',
                  option.value === value && 'mt-combobox-item-selected',
                  index === activeIndex && 'mt-combobox-item-active'
                )}
                onMouseDown={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
Combobox.displayName = 'Combobox';
