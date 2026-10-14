// Generated from component-bindings.json and components.css. Do not hand-edit.
// Authored specifications are not live geometry, per-instance overrides or a full CSS cascade engine.

export const buttonTokens = {
  "sm": {
    "height": "2.25rem",
    "paddingX": "0.75rem",
    "fontSize": "0.875rem"
  },
  "md": {
    "height": "2.75rem",
    "paddingX": "1rem",
    "fontSize": "1rem"
  },
  "lg": {
    "height": "3rem",
    "paddingX": "1.5rem",
    "fontSize": "1.125rem"
  },
  "icon": {
    "height": "2.75rem",
    "width": "2.75rem",
    "fontSize": "inherit"
  },
  "radius": "var(--radius-md)"
} as const;

export const inputTokens = {
  "sm": {
    "height": "2.25rem",
    "paddingX": "0.5rem",
    "fontSize": "0.875rem"
  },
  "md": {
    "height": "2.75rem",
    "paddingX": "0.75rem",
    "fontSize": "1rem"
  },
  "lg": {
    "height": "3rem",
    "paddingX": "1rem",
    "fontSize": "1.125rem"
  },
  "borderWidth": "2px",
  "radius": "var(--radius-md)"
} as const;

export const dialogTokens = {
  "sm": {
    "maxWidth": "24rem"
  },
  "md": {
    "maxWidth": "32rem"
  },
  "lg": {
    "maxWidth": "42rem"
  },
  "xl": {
    "maxWidth": "56rem"
  },
  "padding": "1.5rem",
  "backdropOpacity": "0.5",
  "radius": "var(--radius-lg)",
  "maxHeight": "calc(100dvh - 2rem)"
} as const;

export const selectTokens = {
  "triggerHeight": "auto",
  "triggerMinHeight": "44px",
  "contentMaxHeight": "min(320px, var(--available-height, 80dvh))",
  "listMaxHeight": "min(304px, calc(var(--available-height, 80dvh) - 12px))",
  "itemPaddingX": "12px",
  "itemPaddingY": "8px",
  "radius": "var(--radius-md)"
} as const;

export const tabsTokens = {
  "listHeight": "auto",
  "triggerMinHeight": "44px",
  "triggerPaddingX": "1rem",
  "radius": "0px"
} as const;

export const tooltipTokens = {
  "paddingX": "0.75rem",
  "paddingY": "0.375rem",
  "fontSize": "0.875rem",
  "radius": "var(--radius-md)",
  "maxWidth": "min(20rem, calc(100vw - 16px))"
} as const;

export const popoverTokens = {
  "padding": "1rem",
  "radius": "var(--radius-lg)",
  "maxWidth": "min(24rem, calc(100vw - 16px))"
} as const;

export const toastTokens = {
  "padding": "1rem",
  "paddingInlineEnd": "3.5rem",
  "radius": "var(--radius-lg)",
  "maxWidth": "26rem"
} as const;

export const checkboxTokens = {
  "size": "1.25rem",
  "radius": "var(--radius-sm)"
} as const;

export const switchTokens = {
  "width": "2.75rem",
  "height": "1.5rem",
  "thumbSize": "1.25rem",
  "radius": "var(--radius-full)"
} as const;

export const radioTokens = {
  "size": "1.25rem",
  "dotSize": "0.5rem"
} as const;

export const sliderTokens = {
  "trackHeight": "0.375rem",
  "thumbSize": "44px",
  "visibleThumbSize": "20px",
  "radius": "var(--radius-full)"
} as const;

export const progressTokens = {
  "height": "0.5rem",
  "radius": "var(--radius-full)"
} as const;

export const menuTokens = {
  "itemPaddingX": "0.5rem",
  "itemPaddingY": "0.375rem",
  "radius": "var(--radius-md)",
  "minWidth": "min(12rem, calc(100vw - 2rem))"
} as const;

export const accordionTokens = {
  "headerPadding": "1rem",
  "contentPadding": "0px",
  "radius": "0px"
} as const;

export const avatarTokens = {
  "sm": {
    "size": "2rem",
    "fontSize": "0.75rem"
  },
  "md": {
    "size": "2.5rem",
    "fontSize": "0.875rem"
  },
  "lg": {
    "size": "3rem",
    "fontSize": "1rem"
  },
  "xl": {
    "size": "4rem",
    "fontSize": "1.25rem"
  }
} as const;

export const separatorTokens = {
  "thickness": "1px"
} as const;

export const meterTokens = {
  "height": "0.5rem",
  "radius": "var(--radius-full)"
} as const;

export const scrollAreaTokens = {
  "scrollbarSize": "24px",
  "horizontalScrollbarSize": "24px",
  "scrollbarRadius": "var(--radius-sm)"
} as const;

export const componentPresets = { buttonTokens, inputTokens, dialogTokens, selectTokens, tabsTokens, tooltipTokens, popoverTokens, toastTokens, checkboxTokens, switchTokens, radioTokens, sliderTokens, progressTokens, menuTokens, accordionTokens, avatarTokens, separatorTokens, meterTokens, scrollAreaTokens } as const;

export const componentTokenSpecifications = [
  {
    "exportName": "buttonTokens",
    "path": "sm.height",
    "selector": ".mt-btn-sm",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "2.25rem",
    "value": "2.25rem",
    "source": "packages/ui/src/components/components.css",
    "line": 33,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "sm.paddingX",
    "selector": ".mt-btn-sm",
    "property": "padding-inline",
    "computedProperty": "padding-inline",
    "sourceValue": "0.75rem",
    "value": "0.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 33,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "sm.fontSize",
    "selector": ".mt-btn-sm",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-sm)",
    "value": "0.875rem",
    "source": "packages/ui/src/components/components.css",
    "line": 33,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "md.height",
    "selector": ".mt-btn-md",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "2.75rem",
    "value": "2.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 34,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "md.paddingX",
    "selector": ".mt-btn-md",
    "property": "padding-inline",
    "computedProperty": "padding-inline",
    "sourceValue": "1rem",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 34,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "md.fontSize",
    "selector": ".mt-btn-md",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-base)",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 34,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "lg.height",
    "selector": ".mt-btn-lg",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "3rem",
    "value": "3rem",
    "source": "packages/ui/src/components/components.css",
    "line": 35,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "lg.paddingX",
    "selector": ".mt-btn-lg",
    "property": "padding-inline",
    "computedProperty": "padding-inline",
    "sourceValue": "1.5rem",
    "value": "1.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 35,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "lg.fontSize",
    "selector": ".mt-btn-lg",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-lg)",
    "value": "1.125rem",
    "source": "packages/ui/src/components/components.css",
    "line": 35,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "icon.height",
    "selector": ".mt-btn-icon",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "2.75rem",
    "value": "2.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 36,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "icon.width",
    "selector": ".mt-btn-icon",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "2.75rem",
    "value": "2.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 36,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "buttonTokens",
    "path": "icon.fontSize",
    "selector": ".mt-btn-icon",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "inherit",
    "value": "inherit",
    "source": "packages/ui/src/components/components.css",
    "line": null,
    "origin": "preflight",
    "note": "Tailwind preflight inherits font size for native buttons; this is not a fixed text size."
  },
  {
    "exportName": "buttonTokens",
    "path": "radius",
    "selector": ".mt-btn",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-md)",
    "value": "var(--radius-md)",
    "source": "packages/ui/src/components/components.css",
    "line": 18,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "sm.height",
    "selector": ".mt-input-sm",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "2.25rem",
    "value": "2.25rem",
    "source": "packages/ui/src/components/components.css",
    "line": 138,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "sm.paddingX",
    "selector": ".mt-input-sm",
    "property": "padding-inline",
    "computedProperty": "padding-inline",
    "sourceValue": "0.5rem",
    "value": "0.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 138,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "sm.fontSize",
    "selector": ".mt-input-sm",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-sm)",
    "value": "0.875rem",
    "source": "packages/ui/src/components/components.css",
    "line": 138,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "md.height",
    "selector": ".mt-input-md",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "2.75rem",
    "value": "2.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 139,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "md.paddingX",
    "selector": ".mt-input-md",
    "property": "padding-inline",
    "computedProperty": "padding-inline",
    "sourceValue": "0.75rem",
    "value": "0.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 139,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "md.fontSize",
    "selector": ".mt-input-md",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-base)",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 139,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "lg.height",
    "selector": ".mt-input-lg",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "3rem",
    "value": "3rem",
    "source": "packages/ui/src/components/components.css",
    "line": 140,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "lg.paddingX",
    "selector": ".mt-input-lg",
    "property": "padding-inline",
    "computedProperty": "padding-inline",
    "sourceValue": "1rem",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 140,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "lg.fontSize",
    "selector": ".mt-input-lg",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-lg)",
    "value": "1.125rem",
    "source": "packages/ui/src/components/components.css",
    "line": 140,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "borderWidth",
    "selector": ".mt-input",
    "property": "border",
    "computedProperty": "border-top-width",
    "sourceValue": "2px solid var(--color-border)",
    "value": "2px",
    "source": "packages/ui/src/components/components.css",
    "line": 128,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "inputTokens",
    "path": "radius",
    "selector": ".mt-input",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-md)",
    "value": "var(--radius-md)",
    "source": "packages/ui/src/components/components.css",
    "line": 129,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "sm.maxWidth",
    "selector": ".mt-dialog-sm",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "24rem",
    "value": "24rem",
    "source": "packages/ui/src/components/components.css",
    "line": 340,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "md.maxWidth",
    "selector": ".mt-dialog-md",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "32rem",
    "value": "32rem",
    "source": "packages/ui/src/components/components.css",
    "line": 341,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "lg.maxWidth",
    "selector": ".mt-dialog-lg",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "42rem",
    "value": "42rem",
    "source": "packages/ui/src/components/components.css",
    "line": 342,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "xl.maxWidth",
    "selector": ".mt-dialog-xl",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "56rem",
    "value": "56rem",
    "source": "packages/ui/src/components/components.css",
    "line": 343,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "padding",
    "selector": ".mt-dialog-popup",
    "property": "padding",
    "computedProperty": "padding",
    "sourceValue": "1.5rem",
    "value": "1.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 334,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "backdropOpacity",
    "selector": ".mt-dialog-backdrop",
    "property": "background",
    "computedProperty": "background-color",
    "sourceValue": "rgba(0, 0, 0, 0.5)",
    "value": "0.5",
    "source": "packages/ui/src/components/components.css",
    "line": 321,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "radius",
    "selector": ".mt-dialog-popup",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-lg)",
    "value": "var(--radius-lg)",
    "source": "packages/ui/src/components/components.css",
    "line": 333,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "dialogTokens",
    "path": "maxHeight",
    "selector": ".mt-dialog-popup",
    "property": "max-height",
    "computedProperty": "max-height",
    "sourceValue": "calc(100dvh - 2rem)",
    "value": "calc(100dvh - 2rem)",
    "source": "packages/ui/src/components/components.css",
    "line": 1316,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "selectTokens",
    "path": "triggerHeight",
    "selector": ".mt-select-trigger",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "auto",
    "value": "auto",
    "source": "packages/ui/src/components/components.css",
    "line": 1512,
    "origin": "declaration",
    "note": "Content-driven height; use triggerMinHeight for the target minimum."
  },
  {
    "exportName": "selectTokens",
    "path": "triggerMinHeight",
    "selector": ".mt-select-trigger",
    "property": "min-height",
    "computedProperty": "min-height",
    "sourceValue": "44px",
    "value": "44px",
    "source": "packages/ui/src/components/components.css",
    "line": 1512,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "selectTokens",
    "path": "contentMaxHeight",
    "selector": ".mt-select-popup",
    "property": "max-height",
    "computedProperty": "max-height",
    "sourceValue": "min(320px, var(--available-height, 80dvh))",
    "value": "min(320px, var(--available-height, 80dvh))",
    "source": "packages/ui/src/components/components.css",
    "line": 1516,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "selectTokens",
    "path": "listMaxHeight",
    "selector": ".mt-select-list",
    "property": "max-height",
    "computedProperty": "max-height",
    "sourceValue": "min(304px, calc(var(--available-height, 80dvh) - 12px))",
    "value": "min(304px, calc(var(--available-height, 80dvh) - 12px))",
    "source": "packages/ui/src/components/components.css",
    "line": 1518,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "selectTokens",
    "path": "itemPaddingX",
    "selector": ".mt-select-item",
    "property": "padding",
    "computedProperty": "padding-inline-start",
    "sourceValue": "8px 12px",
    "value": "12px",
    "source": "packages/ui/src/components/components.css",
    "line": 1519,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "selectTokens",
    "path": "itemPaddingY",
    "selector": ".mt-select-item",
    "property": "padding",
    "computedProperty": "padding-top",
    "sourceValue": "8px 12px",
    "value": "8px",
    "source": "packages/ui/src/components/components.css",
    "line": 1519,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "selectTokens",
    "path": "radius",
    "selector": ".mt-select-popup",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-md)",
    "value": "var(--radius-md)",
    "source": "packages/ui/src/components/components.css",
    "line": 260,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tabsTokens",
    "path": "listHeight",
    "selector": ".mt-tabs-list",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "auto",
    "value": "auto",
    "source": "packages/ui/src/components/components.css",
    "line": null,
    "origin": "initial",
    "note": "CSS initial height is auto; a horizontal list includes its border and sized triggers."
  },
  {
    "exportName": "tabsTokens",
    "path": "triggerMinHeight",
    "selector": ".mt-tabs-trigger",
    "property": "min-height",
    "computedProperty": "min-height",
    "sourceValue": "44px",
    "value": "44px",
    "source": "packages/ui/src/components/components.css",
    "line": 1447,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tabsTokens",
    "path": "triggerPaddingX",
    "selector": ".mt-tabs-trigger",
    "property": "padding",
    "computedProperty": "padding-inline-start",
    "sourceValue": "0.5rem 1rem",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 294,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tabsTokens",
    "path": "radius",
    "selector": ".mt-tabs-list",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "0px",
    "value": "0px",
    "source": "packages/ui/src/components/components.css",
    "line": null,
    "origin": "initial",
    "note": "The list has no rounded surface. Focus styling on triggers is separate."
  },
  {
    "exportName": "tooltipTokens",
    "path": "paddingX",
    "selector": ".mt-tooltip-popup",
    "property": "padding",
    "computedProperty": "padding-inline-start",
    "sourceValue": "0.375rem 0.75rem",
    "value": "0.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 352,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tooltipTokens",
    "path": "paddingY",
    "selector": ".mt-tooltip-popup",
    "property": "padding",
    "computedProperty": "padding-top",
    "sourceValue": "0.375rem 0.75rem",
    "value": "0.375rem",
    "source": "packages/ui/src/components/components.css",
    "line": 352,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tooltipTokens",
    "path": "fontSize",
    "selector": ".mt-tooltip-popup",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-sm)",
    "value": "0.875rem",
    "source": "packages/ui/src/components/components.css",
    "line": 353,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tooltipTokens",
    "path": "radius",
    "selector": ".mt-tooltip-popup",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-md)",
    "value": "var(--radius-md)",
    "source": "packages/ui/src/components/components.css",
    "line": 354,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "tooltipTokens",
    "path": "maxWidth",
    "selector": ".mt-tooltip-popup",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "min(20rem, calc(100vw - 16px))",
    "value": "min(20rem, calc(100vw - 16px))",
    "source": "packages/ui/src/components/components.css",
    "line": 1573,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "popoverTokens",
    "path": "padding",
    "selector": ".mt-popover-popup",
    "property": "padding",
    "computedProperty": "padding",
    "sourceValue": "1rem",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 436,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "popoverTokens",
    "path": "radius",
    "selector": ".mt-popover-popup",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-lg)",
    "value": "var(--radius-lg)",
    "source": "packages/ui/src/components/components.css",
    "line": 435,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "popoverTokens",
    "path": "maxWidth",
    "selector": ".mt-popover-popup",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "min(24rem, calc(100vw - 16px))",
    "value": "min(24rem, calc(100vw - 16px))",
    "source": "packages/ui/src/components/components.css",
    "line": 1572,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "toastTokens",
    "path": "padding",
    "selector": ".mt-toast",
    "property": "padding",
    "computedProperty": "padding-top",
    "sourceValue": "1rem",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 516,
    "origin": "declaration",
    "note": "Base padding, inspected through the block start. The logical end override is a separate field."
  },
  {
    "exportName": "toastTokens",
    "path": "paddingInlineEnd",
    "selector": ".mt-toast",
    "property": "padding-inline-end",
    "computedProperty": "padding-inline-end",
    "sourceValue": "3.5rem",
    "value": "3.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 523,
    "origin": "declaration",
    "note": "Reserves space for the close action; differs from the base padding."
  },
  {
    "exportName": "toastTokens",
    "path": "radius",
    "selector": ".mt-toast",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-lg)",
    "value": "var(--radius-lg)",
    "source": "packages/ui/src/components/components.css",
    "line": 515,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "toastTokens",
    "path": "maxWidth",
    "selector": ".mt-toast-viewport",
    "property": "max-width",
    "computedProperty": "max-width",
    "sourceValue": "26rem",
    "value": "26rem",
    "source": "packages/ui/src/components/components.css",
    "line": 506,
    "origin": "declaration",
    "note": "The viewport bounds the toast stack; individual toasts fill that context."
  },
  {
    "exportName": "checkboxTokens",
    "path": "size",
    "selector": ".mt-checkbox",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "1.25rem",
    "value": "1.25rem",
    "source": "packages/ui/src/components/components.css",
    "line": 159,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "checkboxTokens",
    "path": "radius",
    "selector": ".mt-checkbox",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-sm)",
    "value": "var(--radius-sm)",
    "source": "packages/ui/src/components/components.css",
    "line": 162,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "switchTokens",
    "path": "width",
    "selector": ".mt-switch",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "2.75rem",
    "value": "2.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 180,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "switchTokens",
    "path": "height",
    "selector": ".mt-switch",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "1.5rem",
    "value": "1.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 181,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "switchTokens",
    "path": "thumbSize",
    "selector": ".mt-switch-thumb",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "1.25rem",
    "value": "1.25rem",
    "source": "packages/ui/src/components/components.css",
    "line": 194,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "switchTokens",
    "path": "radius",
    "selector": ".mt-switch",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-full)",
    "value": "var(--radius-full)",
    "source": "packages/ui/src/components/components.css",
    "line": 182,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "radioTokens",
    "path": "size",
    "selector": ".mt-radio",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "1.25rem",
    "value": "1.25rem",
    "source": "packages/ui/src/components/components.css",
    "line": 212,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "radioTokens",
    "path": "dotSize",
    "selector": ".mt-radio-indicator",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "0.5rem",
    "value": "0.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 227,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "sliderTokens",
    "path": "trackHeight",
    "selector": ".mt-slider-track",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "0.375rem",
    "value": "0.375rem",
    "source": "packages/ui/src/components/components.css",
    "line": 584,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "sliderTokens",
    "path": "thumbSize",
    "selector": ".mt-slider-thumb",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "44px",
    "value": "44px",
    "source": "packages/ui/src/components/components.css",
    "line": 1343,
    "origin": "declaration",
    "note": "Interactive target dimension, not the smaller painted marker."
  },
  {
    "exportName": "sliderTokens",
    "path": "visibleThumbSize",
    "selector": ".mt-slider-thumb::after",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "20px",
    "value": "20px",
    "source": "packages/ui/src/components/components.css",
    "line": 1344,
    "origin": "declaration",
    "note": "Painted marker; its border is included under border-box sizing."
  },
  {
    "exportName": "sliderTokens",
    "path": "radius",
    "selector": ".mt-slider-track",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-full)",
    "value": "var(--radius-full)",
    "source": "packages/ui/src/components/components.css",
    "line": 586,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "progressTokens",
    "path": "height",
    "selector": ".mt-progress-track",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "0.5rem",
    "value": "0.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 555,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "progressTokens",
    "path": "radius",
    "selector": ".mt-progress-track",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-full)",
    "value": "var(--radius-full)",
    "source": "packages/ui/src/components/components.css",
    "line": 557,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "menuTokens",
    "path": "itemPaddingX",
    "selector": ".mt-menu-item",
    "property": "padding",
    "computedProperty": "padding-inline-start",
    "sourceValue": "0.375rem 0.5rem",
    "value": "0.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 460,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "menuTokens",
    "path": "itemPaddingY",
    "selector": ".mt-menu-item",
    "property": "padding",
    "computedProperty": "padding-top",
    "sourceValue": "0.375rem 0.5rem",
    "value": "0.375rem",
    "source": "packages/ui/src/components/components.css",
    "line": 460,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "menuTokens",
    "path": "radius",
    "selector": ".mt-menu-popup",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-md)",
    "value": "var(--radius-md)",
    "source": "packages/ui/src/components/components.css",
    "line": 451,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "menuTokens",
    "path": "minWidth",
    "selector": ".mt-menu-popup",
    "property": "min-width",
    "computedProperty": "min-width",
    "sourceValue": "min(12rem, calc(100vw - 2rem))",
    "value": "min(12rem, calc(100vw - 2rem))",
    "source": "packages/ui/src/components/components.css",
    "line": 1416,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "accordionTokens",
    "path": "headerPadding",
    "selector": ".mt-accordion-trigger",
    "property": "padding",
    "computedProperty": "padding",
    "sourceValue": "1rem",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 382,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "accordionTokens",
    "path": "contentPadding",
    "selector": ".mt-accordion-panel",
    "property": "padding",
    "computedProperty": "padding",
    "sourceValue": "0px",
    "value": "0px",
    "source": "packages/ui/src/components/components.css",
    "line": null,
    "origin": "initial",
    "note": "Panel has no default padding. Consuming content may supply its own spacing."
  },
  {
    "exportName": "accordionTokens",
    "path": "radius",
    "selector": ".mt-accordion",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "0px",
    "value": "0px",
    "source": "packages/ui/src/components/components.css",
    "line": null,
    "origin": "initial",
    "note": "Root has no rounded surface; items use dividing lines."
  },
  {
    "exportName": "avatarTokens",
    "path": "sm.size",
    "selector": ".mt-avatar-sm",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "2rem",
    "value": "2rem",
    "source": "packages/ui/src/components/components.css",
    "line": 680,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "sm.fontSize",
    "selector": ".mt-avatar-sm",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-xs)",
    "value": "0.75rem",
    "source": "packages/ui/src/components/components.css",
    "line": 680,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "md.size",
    "selector": ".mt-avatar-md",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "2.5rem",
    "value": "2.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 681,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "md.fontSize",
    "selector": ".mt-avatar-md",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-sm)",
    "value": "0.875rem",
    "source": "packages/ui/src/components/components.css",
    "line": 681,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "lg.size",
    "selector": ".mt-avatar-lg",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "3rem",
    "value": "3rem",
    "source": "packages/ui/src/components/components.css",
    "line": 682,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "lg.fontSize",
    "selector": ".mt-avatar-lg",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-base)",
    "value": "1rem",
    "source": "packages/ui/src/components/components.css",
    "line": 682,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "xl.size",
    "selector": ".mt-avatar-xl",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "4rem",
    "value": "4rem",
    "source": "packages/ui/src/components/components.css",
    "line": 683,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "avatarTokens",
    "path": "xl.fontSize",
    "selector": ".mt-avatar-xl",
    "property": "font-size",
    "computedProperty": "font-size",
    "sourceValue": "var(--text-xl)",
    "value": "1.25rem",
    "source": "packages/ui/src/components/components.css",
    "line": 683,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "separatorTokens",
    "path": "thickness",
    "selector": ".mt-separator",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "1px",
    "value": "1px",
    "source": "packages/ui/src/components/components.css",
    "line": 364,
    "origin": "declaration",
    "note": "Horizontal thickness. Vertical orientation uses width instead."
  },
  {
    "exportName": "meterTokens",
    "path": "height",
    "selector": ".mt-meter-track",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "0.5rem",
    "value": "0.5rem",
    "source": "packages/ui/src/components/components.css",
    "line": 705,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "meterTokens",
    "path": "radius",
    "selector": ".mt-meter-track",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-full)",
    "value": "var(--radius-full)",
    "source": "packages/ui/src/components/components.css",
    "line": 707,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "scrollAreaTokens",
    "path": "scrollbarSize",
    "selector": ".mt-scroll-area-scrollbar[data-orientation=\"vertical\"]",
    "property": "width",
    "computedProperty": "width",
    "sourceValue": "24px",
    "value": "24px",
    "source": "packages/ui/src/components/components.css",
    "line": 1607,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "scrollAreaTokens",
    "path": "horizontalScrollbarSize",
    "selector": ".mt-scroll-area-scrollbar-horizontal",
    "property": "height",
    "computedProperty": "height",
    "sourceValue": "24px",
    "value": "24px",
    "source": "packages/ui/src/components/components.css",
    "line": 1608,
    "origin": "declaration",
    "note": ""
  },
  {
    "exportName": "scrollAreaTokens",
    "path": "scrollbarRadius",
    "selector": ".mt-scroll-area-thumb",
    "property": "border-radius",
    "computedProperty": "border-radius",
    "sourceValue": "var(--radius-sm)",
    "value": "var(--radius-sm)",
    "source": "packages/ui/src/components/components.css",
    "line": 1609,
    "origin": "declaration",
    "note": "Thumb corner radius; the outer track is rectangular."
  }
] as const;
