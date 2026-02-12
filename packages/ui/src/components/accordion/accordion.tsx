'use client';
import * as React from 'react';
import { Accordion as BaseAccordion } from '@base-ui-components/react/accordion';
import { cn } from '../../utils/cn';

export const Accordion = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAccordion.Root>>(
  ({ className, ...props }, ref) => (
    <BaseAccordion.Root ref={ref} className={cn('mt-accordion', className)} {...props} />
  )
);
Accordion.displayName = 'Accordion';

export const AccordionItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAccordion.Item>>(
  ({ className, ...props }, ref) => (
    <BaseAccordion.Item ref={ref} className={cn('mt-accordion-item', className)} {...props} />
  )
);
AccordionItem.displayName = 'AccordionItem';

export const AccordionHeader = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseAccordion.Header>>(
  ({ className, ...props }, ref) => (
    <BaseAccordion.Header ref={ref} className={cn('mt-accordion-header', className)} {...props} />
  )
);
AccordionHeader.displayName = 'AccordionHeader';

export const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseAccordion.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <BaseAccordion.Trigger ref={ref} className={cn('mt-accordion-trigger', className)} {...props}>
      {children}
      <svg className="mt-accordion-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </BaseAccordion.Trigger>
  )
);
AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionPanel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAccordion.Panel>>(
  ({ className, ...props }, ref) => (
    <BaseAccordion.Panel ref={ref} className={cn('mt-accordion-panel', className)} {...props} />
  )
);
AccordionPanel.displayName = 'AccordionPanel';
