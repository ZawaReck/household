import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./PickerPanel.css";

export function PickerPanel({ title, onClose, children, action }: {
  title: string; onClose: () => void; children: React.ReactNode; action?: React.ReactNode;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320, ready: false });
  useLayoutEffect(() => {
    const anchor = marker.current?.parentElement;
    if (!anchor) return;
    const trigger = anchor.querySelector<HTMLButtonElement>("button");
    const viewport = window.visualViewport;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const right = left + (viewport?.width ?? window.innerWidth) - 16;
      const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
      const width = Math.min(360, right - left);
      const height = panel.current?.offsetHeight ?? 282;
      const above = rect.bottom + 8 + height > bottom && rect.top - height - 8 >= top;
      setPosition({ left: Math.max(left, Math.min(rect.right - width, right - width)),
        top: Math.max(top, Math.min(above ? rect.top - height - 8 : rect.bottom + 8, bottom - height)), width, ready: true });
    };
    const dismiss = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); trigger?.focus(); }
    };
    const anotherPicker = () => close.current();
    const followScroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) place();
    };
    document.dispatchEvent(new Event("household:picker-open"));
    document.addEventListener("household:picker-open", anotherPicker);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", followScroll, true);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    if (panel.current) observer.observe(panel.current);
    place();
    panel.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("household:picker-open", anotherPicker);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", followScroll, true);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, []);
  return <><span ref={marker} hidden />{createPortal(
    <div ref={panel} className="selection-panel" role="dialog" aria-label={title}
      style={{ left: position.left, top: position.top, width: position.width, visibility: position.ready ? "visible" : "hidden" }}>
      <div className="selection-panel-header"><strong>{title}</strong><div>{action}<button type="button" onClick={() => {
        close.current(); marker.current?.parentElement?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      }}>完了</button></div></div>{children}
    </div>, document.body)}</>;
}

export function SelectionWheel({ label, options, selectedIndex, onSelect }: {
  label: string; options: string[]; selectedIndex: number; onSelect: (index: number) => void;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const emitted = useRef<number | null>(null);
  const [preview, setPreview] = useState(selectedIndex);
  useLayoutEffect(() => {
    setPreview(selectedIndex);
    if (emitted.current !== selectedIndex && list.current) list.current.scrollTop = selectedIndex * 44;
    emitted.current = selectedIndex;
  }, [selectedIndex, options.length]);
  const select = (index: number) => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    if (!options.length) return;
    emitted.current = next; setPreview(next); onSelect(next);
  };
  return <div className="selection-wheel-window"><div className="selection-wheel-band" />
    <div ref={list} className="selection-wheel" role="listbox" aria-label={label} aria-activedescendant={`${id}-${preview}`} tabIndex={0}
      onScroll={() => {
        const next = Math.max(0, Math.min(options.length - 1, Math.round((list.current?.scrollTop ?? 0) / 44)));
        if (next !== emitted.current) select(next);
      }}
      onKeyDown={(event) => {
        const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (!delta && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const index = Math.max(0, Math.min(options.length - 1, event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : preview + delta));
        select(index); list.current?.scrollTo({ top: index * 44, behavior: "instant" });
      }}>
      {options.map((option, index) => <div key={index} id={`${id}-${index}`} role="option" aria-selected={preview === index}
        className={`selection-wheel-option ${preview === index ? "is-selected" : ""}`}
        onClick={() => {
          list.current?.scrollTo({ top: index * 44, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          if (Math.abs((list.current?.scrollTop ?? 0) - index * 44) < 1) select(index);
        }}>{option}</div>)}
    </div></div>;
}
