'use client';
import * as React from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui-components/react/scroll-area';
import { cn } from '../../utils/cn';
import {DirectionProvider} from '@base-ui-components/react/direction-provider';
export interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof BaseScrollArea.Root> {
  viewportProps?:Omit<React.ComponentPropsWithoutRef<typeof BaseScrollArea.Viewport>,'children'>&{[attribute:`data-${string}`]:string|number|boolean|undefined};
  viewportRef?:React.Ref<HTMLDivElement>;
}


export const ScrollArea = React.forwardRef<
  HTMLDivElement,
  ScrollAreaProps
>(({ className, children, viewportProps, viewportRef, dir, ...props }, ref) => {
  const area=(
  <BaseScrollArea.Root
    ref={ref}
    className={state=>cn('mt-scroll-area',typeof className==='function'?className(state):className)}
    dir={dir}
    {...props}
  >
    <BaseScrollArea.Viewport {...viewportProps} ref={viewportRef} className={state=>cn('mt-scroll-area-viewport',typeof viewportProps?.className==='function'?viewportProps.className(state):viewportProps?.className)}>
      <BaseScrollArea.Content className="mt-scroll-area-content">{children}</BaseScrollArea.Content>
    </BaseScrollArea.Viewport>
    <BaseScrollArea.Scrollbar
      className="mt-scroll-area-scrollbar"
      orientation="vertical"
    >
      <BaseScrollArea.Thumb className="mt-scroll-area-thumb" />
    </BaseScrollArea.Scrollbar>
    <BaseScrollArea.Scrollbar
      className="mt-scroll-area-scrollbar mt-scroll-area-scrollbar-horizontal"
      orientation="horizontal"
    >
      <BaseScrollArea.Thumb className="mt-scroll-area-thumb" />
    </BaseScrollArea.Scrollbar>
    <BaseScrollArea.Corner className="mt-scroll-area-corner" />
  </BaseScrollArea.Root>
  );
  return dir==='rtl'||dir==='ltr'?<DirectionProvider direction={dir}>{area}</DirectionProvider>:area;
});
ScrollArea.displayName = 'ScrollArea';
