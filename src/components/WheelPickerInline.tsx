/* src/components/WheelPickerInline.tsx */

import React, { useEffect, useRef, useState } from "react";
import "./WheelPickerInline.css";

type Props = {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onClose: () => void; // スクロール確定時に閉じる
};

const ITEM_H = 46;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2);
const PAD_ITEMS = PAD; // 2

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const WheelPickerInline: React.FC<Props> = ({ options, value, onChange, onClose }) => {
	const commitTimerRef = useRef<number | null>(null);
	const ignoreScrollRef = useRef(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [tempIndex, setTempIndex] = useState(0);
  const settleTimer = useRef<number | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);

  // 開いた瞬間に value を中央に合わせる
	useEffect(() => {
		const el = listRef.current;
		if (!el) return;

		// 初期スクロール中は確定させない
		ignoreScrollRef.current = true;

		const idx = Math.max(0, options.indexOf(value));
		setTempIndex(idx);

		requestAnimationFrame(() => {
			el.scrollTop = idx * ITEM_H;

			// さらに1フレーム待ってから scroll を有効化（初期 scroll による即確定防止）
			requestAnimationFrame(() => {
				ignoreScrollRef.current = false;
			});
		});
	}, [value, options]);

	// タイマー類の後始末（アンマウント時）
	useEffect(() => {
		return () => {
			if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
			if (settleTimer.current) window.clearTimeout(settleTimer.current);
		};
	}, []);

useEffect(() => {
  const onPointerDown = (e: PointerEvent) => {
    const root = rootRef.current;
    if (!root) return;

    // wheel領域の外をクリックしたら閉じる
    if (!root.contains(e.target as Node)) {
      // スクロール中のタイマーが残ってたら止める
      if (commitTimerRef.current) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }

      // いま選択中の値で確定して閉じる
      onChange(options[tempIndex]);
      onClose();
    }
  };

  // pointerdown にすると「クリック/タップ」どちらも自然に拾える
  document.addEventListener("pointerdown", onPointerDown);
  return () => document.removeEventListener("pointerdown", onPointerDown);
}, [tempIndex, options, onChange, onClose]);

  return (
    <div
			ref={rootRef}
      className="wheel-inline"
      onWheel={(e) => e.stopPropagation()}       // 親スクロールを止める
      onTouchMove={(e) => e.stopPropagation()}  // iOS系も止める
    >
      <div className="wheel-window" style={{ height: ITEM_H * VISIBLE }}>
        <div className="wheel-highlight" style={{ height: ITEM_H }} />

        <div
          ref={listRef}
          className="picker-list"
					onScroll={() => {
						const el = listRef.current;
						if (!el) return;

						// ★追加：初期位置合わせ中は確定処理しない
						if (ignoreScrollRef.current) return;

						const raw = Math.round(el.scrollTop / ITEM_H);
						const next = clamp(raw, 0, options.length - 1);
						setTempIndex(next);

						if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
						commitTimerRef.current = window.setTimeout(() => {
							onChange(options[next]);
							onClose();
						}, 500);
					}}
        >
          {/* 上spacer */}
          {Array.from({ length: PAD_ITEMS }).map((_, i) => (
            <div key={`pad-top-${i}`} className="picker-item pad" style={{ height: ITEM_H }} />
          ))}

          {options.map((opt, i) => (
            <div
              key={opt}
              className={`picker-item ${i === tempIndex ? "is-selected" : ""}`}
              style={{ height: ITEM_H }}
            >
              {opt}
            </div>
          ))}

          {/* 下spacer */}
          {Array.from({ length: PAD_ITEMS }).map((_, i) => (
            <div key={`pad-bot-${i}`} className="picker-item pad" style={{ height: ITEM_H }} />
          ))}
        </div>
      </div>
    </div>
  );
};
