'use client';
import * as React from 'react';
import { Menubar as BaseMenubar } from '@base-ui-components/react/menubar';
import { cn } from '../../utils/cn';

export interface MenubarProps extends React.ComponentPropsWithoutRef<typeof BaseMenubar> {}
export const Menubar = React.forwardRef<HTMLDivElement, MenubarProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => <BaseMenubar ref={ref} orientation={orientation} aria-orientation={orientation} data-orientation={orientation} className={state => cn('mt-menubar', typeof className === 'function' ? className(state) : className)} {...props} />
);
Menubar.displayName = 'Menubar';
