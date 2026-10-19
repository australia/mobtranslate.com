'use client';
import {useEffect, useReducer, useRef, useState} from 'react';
import {Button} from '@mobtranslate/ui';
import './input-gestures-explorer.css';

const initialItems = [{ id: 'entry', label: 'Entry text' }, { id: 'source', label: 'Source record' }, { id: 'review', label: 'Review state' }];
type OrderAction = { type: 'step'; id: string; delta: number } | { type: 'drop'; id: string; targetId: string } | { type: 'reset' };
function orderReducer(state: { items: typeof initialItems; announcement: string }, action: OrderAction) {
  if (action.type === 'reset') return { items: initialItems, announcement: 'Example order reset.' };
  const from = state.items.findIndex((item) => item.id === action.id);
  const to = action.type === 'step' ? from + action.delta : state.items.findIndex((item) => item.id === action.targetId);
  if (from < 0 || to < 0 || to >= state.items.length || from === to) return state;
  const items = [...state.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return { items, announcement: `${item.label} moved to position ${to + 1} of ${items.length}.` };
}
export function InputGesturesExplorer() {
  const [state, dispatch] = useReducer(orderReducer, { items: initialItems, announcement: 'Drag an item or use its move buttons.' });
  const dragged = useRef<string | null>(null);
  const [dragging,setDragging]=useState<string|null>(null);
  const [dragResult,setDragResult]=useState<string|null>(null);
  const list = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const item = Array.from(list.current?.children ?? []).find(node => node.getAttribute('data-item-id') === pendingFocus.current);
    item?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    pendingFocus.current = null;
  }, [state.items]);
  const step = (id: string, delta: number) => { setDragResult(null); pendingFocus.current = id; dispatch({ type: 'step', id, delta }); };
  return <div className="reorder-lab space-y-4" data-reorder-lab>
    <p className="text-sm">Reorder this example list using drag, pointer, touch or keyboard controls. This does not change dictionary records.</p>
    <ol ref={list} data-order-preview className="space-y-3">{state.items.map((item, index) => <li key={item.id} data-item-id={item.id} data-dragging={dragging===item.id?true:undefined} draggable onDragStart={(event) => { dragged.current = item.id; setDragging(item.id); setDragResult(null); event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { if(dragged.current)setDragResult("Move cancelled. Order unchanged."); dragged.current = null; setDragging(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragged.current) { if(dragged.current===item.id)setDragResult('Order unchanged.'); else dispatch({ type: 'drop', id: dragged.current, targetId: item.id }); } dragged.current = null; setDragging(null); }} className="flex flex-wrap items-center justify-between gap-3 p-3 border border-[var(--color-border)] rounded-lg">
      <span>{index + 1}. {item.label}</span><div className="flex gap-2"><Button variant="outline" disabled={index === 0} aria-label={`Move ${item.label} up`} onClick={() => step(item.id, -1)}>Up</Button><Button variant="outline" disabled={index === state.items.length - 1} aria-label={`Move ${item.label} down`} onClick={() => step(item.id, 1)}>Down</Button></div>
    </li>)}</ol>
    <p role="status" data-reorder-status className="text-sm">{dragging?`Moving ${initialItems.find(item=>item.id===dragging)?.label}. Drop on an item to change its position; cancel the drag to keep the order.`:dragResult??state.announcement}</p>
    <Button variant="ghost" onClick={() => { dragged.current=null; setDragging(null); setDragResult(null); dispatch({ type: 'reset' }); }}>Reset order</Button>
  </div>;
}
