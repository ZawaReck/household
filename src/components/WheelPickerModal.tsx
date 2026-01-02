/* src/components/WheelPickerModal.tsx */

import React, { useEffect, useState, useRef } from "react";
import "./WheelPickerModal.css";

type Props = {
  title: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
};

const VISIBLE = 5;           // 表示行数（奇数推奨）

export const WheelPickerModal: React.FC<Props> = ({ title, options, value, onChange, onClose }) => {
  const listRef = useRef<HTMLDivElement | null>(null);
	const ITEM_H = 46;
	const PAD_ITEMS = 2;

	const [tempIndex, setTempIndex] = useState(0);

	useEffect(() => {
		const el = listRef.current;
		if (!el) return;

		const idx = Math.max(0, options.indexOf(value));
		setTempIndex(idx);

		requestAnimationFrame(() => {
			el.scrollTop = (idx + PAD_ITEMS) * ITEM_H;
		});
	}, [value, options]);


	const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

	const onConfirm = () => {
		onChange(options[tempIndex]);
		onClose();
	};

	const onCancel = () => {
		onClose();
	};

  return (
    <div className="wheel-overlay" onClick={onClose}>
      <div className="wheel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wheel-head">
          <button className="wheel-cancel" type="button" onClick={onCancel}>キャンセル</button>
          <div className="wheel-title">{title}</div>
					<button className="wheel-done" type="button" onClick={onConfirm}>OK</button>
        </div>
        <div className="wheel-body">
          <div className="wheel-window" style={{ height: ITEM_H * VISIBLE }}>
            <div className="wheel-highlight" style={{ height: ITEM_H }} />
							<div
								ref={listRef}
								className="picker-list"
								onScroll={() => {
									const el = listRef.current;
									if (!el) return;

									const centerY = el.scrollTop + el.clientHeight / 2;
									const raw = Math.round((centerY - ITEM_H / 2) / ITEM_H) - PAD_ITEMS;
									const next = clamp(raw, 0, options.length - 1);
									setTempIndex(next);
								}}
							>
								{/* 上spacer */}
								{Array.from({ length: PAD_ITEMS }).map((_, i) => (
									<div key={`pad-top-${i}`} className="picker-item pad" />
								))}

								{options.map((opt, i) => (
									<div
										key={opt}
										className={`picker-item ${i === tempIndex ? "is-selected" : ""}`}
									>
										{opt}
									</div>
								))}

								{/* 下spacer */}
								{Array.from({ length: PAD_ITEMS }).map((_, i) => (
									<div key={`pad-bot-${i}`} className="picker-item pad" />
								))}
							</div>
          </div>
        </div>
      </div>
    </div>
  );
};
