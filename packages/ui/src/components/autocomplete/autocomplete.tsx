'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AutocompleteOption {
  value: string;
  label: string;
}

export interface AutocompleteProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSelect'> {
  options: AutocompleteOption[];
  value?: string;
  onChange?: (value: string) => void;
  onOptionSelect?: (option: AutocompleteOption) => void;
}

export const Autocomplete = React.forwardRef<HTMLInputElement, AutocompleteProps>(
  ({ className, options, value, onChange, onOptionSelect, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState(value || '');
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const listRef = React.useRef<HTMLUListElement>(null);

    const filtered = options.filter((o) =>
      o.label.toLowerCase().includes(inputValue.toLowerCase())
    );

    const selectOption = (option: AutocompleteOption) => {
      setInputValue(option.label);
      onOptionSelect?.(option);
      setOpen(false);
      setActiveIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!open || filtered.length === 0) return;

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
      <div className="mt-autocomplete">
        <input
          ref={ref}
          className={cn('mt-autocomplete-input', className)}
          value={inputValue}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `mt-ac-option-${activeIndex}` : undefined}
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange?.(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          {...props}
        />
        {open && filtered.length > 0 && (
          <ul className="mt-autocomplete-list" ref={listRef} role="listbox">
            {filtered.map((option, index) => (
              <li
                key={option.value}
                id={`mt-ac-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn('mt-autocomplete-item', index === activeIndex && 'mt-autocomplete-item-active')}
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
Autocomplete.displayName = 'Autocomplete';
