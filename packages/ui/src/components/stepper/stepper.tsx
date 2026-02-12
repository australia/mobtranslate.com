'use client';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  activeStep: number;
  orientation?: 'horizontal' | 'vertical';
}

export const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  ({ className, activeStep, orientation = 'horizontal', children, ...props }, ref) => {
    const steps = React.Children.toArray(children);
    return (
      <div
        ref={ref}
        className={cn('mt-stepper', `mt-stepper-${orientation}`, className)}
        role="list"
        {...props}
      >
        {steps.map((child, index) => (
          <React.Fragment key={index}>
            <div
              className={cn(
                'mt-stepper-step',
                index < activeStep && 'mt-stepper-step-completed',
                index === activeStep && 'mt-stepper-step-active',
                index > activeStep && 'mt-stepper-step-pending'
              )}
              role="listitem"
              aria-current={index === activeStep ? 'step' : undefined}
            >
              <div className="mt-stepper-indicator">
                {index < activeStep ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 8l3 3 5-6" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="mt-stepper-content">{child}</div>
            </div>
            {index < steps.length - 1 && (
              <div className={cn('mt-stepper-connector', index < activeStep && 'mt-stepper-connector-completed')} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }
);
Stepper.displayName = 'Stepper';

export interface StepProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  description?: string;
}

export const Step = React.forwardRef<HTMLDivElement, StepProps>(
  ({ className, label, description, ...props }, ref) => (
    <div ref={ref} className={cn('mt-step', className)} {...props}>
      <div className="mt-step-label">{label}</div>
      {description && <div className="mt-step-description">{description}</div>}
    </div>
  )
);
Step.displayName = 'Step';
