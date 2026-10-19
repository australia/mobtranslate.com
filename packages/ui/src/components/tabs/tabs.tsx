'use client';
import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui-components/react/tabs';
import { cn } from '../../utils/cn';

export const Tabs = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTabs.Root>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Root ref={ref} className={state => cn('mt-tabs', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
Tabs.displayName = 'Tabs';

export const TabsList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTabs.List>>(
  ({ className, ...props }, ref) => {
    const scroller = React.useRef<HTMLDivElement>(null);
    const list = React.useRef<HTMLDivElement>(null);
    const setListRef = React.useCallback((node: HTMLDivElement | null) => {
      list.current = node;
      if (typeof ref === 'function') return ref(node);
      else if (ref) ref.current = node;
    }, [ref]);
    React.useEffect(() => {
      const viewport = scroller.current;
      const element = list.current;
      if (!viewport || !element) return;
      let frame = 0;
      function keepVisible() {
        if (!viewport || !element || element.getAttribute('data-orientation') !== 'horizontal') return;
        const focused = document.activeElement;
        const target = focused instanceof HTMLElement && element.contains(focused) && focused.getAttribute('role') === 'tab'
          ? focused : element.querySelector<HTMLElement>('[role="tab"][data-active]');
        if (!target) return;
        const bounds = viewport.getBoundingClientRect();
        const tab = target.getBoundingClientRect();
        if (tab.right > bounds.right) viewport.scrollLeft += tab.right - bounds.right;
        else if (tab.left < bounds.left) viewport.scrollLeft += tab.left - bounds.left;
      }
      function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(keepVisible); }
      // Selection can change label metrics after native focus scrolling. The
      // inner list remains a stable coordinate space for the indicator.
      const mutations = new MutationObserver(schedule);
      mutations.observe(element, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-active', 'data-orientation']});
      const sizes = new ResizeObserver(schedule);
      sizes.observe(element); sizes.observe(viewport); schedule();
      return () => { mutations.disconnect(); sizes.disconnect(); cancelAnimationFrame(frame); };
    }, [props.render]);
    return <div ref={scroller} className="mt-tabs-scroller"><BaseTabs.List ref={setListRef} className={state => cn('mt-tabs-list', typeof className === 'function' ? className(state) : className)} {...props}>
      {props.children}
      <BaseTabs.Indicator className="mt-tabs-indicator" />
    </BaseTabs.List></div>;
  }
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<Element, React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Tab ref={ref} className={state => cn('mt-tabs-trigger', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>>(
  ({ className, ...props }, ref) => (
    <BaseTabs.Panel ref={ref} className={state => cn('mt-tabs-content', typeof className === 'function' ? className(state) : className)} {...props} />
  )
);
TabsContent.displayName = 'TabsContent';
