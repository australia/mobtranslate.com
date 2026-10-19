'use client';
import { createContext } from 'react';

// Context follows React portals. Only fully modal surfaces obscure/block the page.
export const DialogModalityContext = createContext(true);
