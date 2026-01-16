/* src/components/TransactionHistory.tsx */

import React, { useMemo, useRef, useState, useEffect } from "react";
import type { Transaction } from "../types/Transaction";
import "./TransactionHistory.css";

type Props = {
  monthlyData: Transaction[];
  onDeleteTransaction: (id: string) => void;
  onEditTransaction: (t: Transaction) => void;
  onSelectGroup: (groupId: string, date: string) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const normalizeTaxRate = (v: unknown) => (v === 0 || v === 8 ? v : 10);
const calcExternalGross = (items: Array<Pick<Transaction, "type" | "amount" | "taxRate" | "isTaxAdjustment">>) => {
  let sum10 = 0;
  let sum8 = 0;
  let sum0 = 0;

  for (const t of items) {
    if (t.type !== "expense") continue;
    if ((t as any).isTaxAdjustment) continue;
    const r = normalizeTaxRate((t as any).taxRate);
    if (r === 8) sum8 += t.amount || 0;
    else if (r === 0) sum0 += t.amount || 0;
    else sum10 += t.amount || 0;
  }

  const gross = Math.floor(sum10 * 1.1) + Math.floor(sum8 * 1.08) + sum0;
  const base = sum10 + sum8 + sum0;
  const tax = gross - base;

  return { base, gross, tax };
};

export const TransactionHistory: React.FC<Props> = ({
  monthlyData,
  onDeleteTransaction,
  onEditTransaction,
  onSelectGroup,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  // ✕ボタンの露出幅（px）
  const ACTION_W = 64;
  const OPEN_X = -ACTION_W;
  const DELETE_X = -200;

  // “今どの行が開いているか” を保持（離しても戻らない）
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!openId) return;
      if (!listRef.current) return;

      if (!listRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
    };

    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [openId]);

  // ドラッグ中の追従（行ごと）
  const [dragXById, setDragXById] = useState<Record<string, number>>({});

  // ドラッグ開始点
  const dragStart = useRef<{
    id: string;
    startX: number;
    baseX: number; // 開いてたら -ACTION_W, 閉じてたら 0
    active: boolean;
  } | null>(null);

  const wheelXById = useRef<Record<string, number>>({});
  const wheelTimerById = useRef<Record<string, number>>({});

  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

  const formatDateHeader = (date: string) => {
    // date は "YYYY-MM-DD"
    const d = new Date(`${date}T00:00:00`);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const w = WEEKDAYS[d.getDay()];

    const currentYear = new Date().getFullYear();
    const prefix = y !== currentYear ? `${y}年` : "";

    return `${prefix}${m}月${day}日（${w}）`;
  };


  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of monthlyData) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    // 日付降順にしたいならここでソート
    const entries = Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return entries;
  }, [monthlyData]);

  const getCurrentX = (id: string) => {
    // ドラッグ中なら dragX、そうでなければ openId に応じて固定位置
    if (dragXById[id] !== undefined) return dragXById[id];
    return openId === id ? OPEN_X : 0;
  };

  const onPointerDownRow = (e: React.PointerEvent, id: string) => {
    // 別の行が開いていたら閉じる（タップした瞬間に）
    if (openId && openId !== id) setOpenId(null);

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const baseX = openId === id ? OPEN_X : 0;

    dragStart.current = {
      id,
      startX: e.clientX,
      baseX,
      active: true,
    };
  };

  const onPointerMoveRow = (e: React.PointerEvent) => {
    const s = dragStart.current;
    if (!s?.active) return;

    const dx = e.clientX - s.startX;
    // 左スワイプのみ（右に引っ張っても 0 まで）
    const nextX = clamp(s.baseX + dx, DELETE_X, 0);

    setDragXById((prev) => ({ ...prev, [s.id]: nextX }));
  };

  const onPointerUpRow = () => {
    const s = dragStart.current;
    if (!s?.active) return;

    const x = dragXById[s.id] ?? (openId === s.id ? OPEN_X : 0);

    // どの程度開いたら固定で開くか
    const shouldOpen = x < OPEN_X / 2; // 例：-32pxより左なら open

    setOpenId(shouldOpen ? s.id : null);

    // ドラッグ追従値はクリア（以後は openId で固定）
    setDragXById((prev) => {
      const { [s.id]: _, ...rest } = prev;
      return rest;
    });

    dragStart.current = null;
  };

  const onClickDelete = (id: string) => {
    const ok = window.confirm("この項目を削除しますか？");
    if (!ok) return;
    onDeleteTransaction(id);
    setOpenId(null);
  };

  return (
    <div className="history-list" ref={listRef}>
      {grouped.map(([date, items]) => {
        const visibleItems = items.filter((t: any) => t.isTaxAdjustment !== true);
        if (visibleItems.length === 0) return null;
        const groupMeta = new Map<
          string,
          {
            items: Transaction[];
            hasAdjustment: boolean;
            isExternal: boolean;
            total: number;
          }
        >();
        const groupLastId = new Map<string, string>();

        for (const t of items) {
          const gid = (t as any).groupId as string | undefined;
          if (!gid) continue;
          const current = groupMeta.get(gid) ?? { items: [], hasAdjustment: false, isExternal: false, total: 0 };
          if ((t as any).isTaxAdjustment) {
            current.hasAdjustment = true;
          } else {
            current.items.push(t);
          }
          groupMeta.set(gid, current);
        }

        for (const [gid, meta] of groupMeta.entries()) {
          const isExternal = meta.hasAdjustment || meta.items.some((t: any) => t.taxMode === "exclusive");
          const total = isExternal
            ? calcExternalGross(meta.items as any).gross
            : meta.items.reduce((sum, t) => sum + (t.amount || 0), 0);
          groupMeta.set(gid, { ...meta, isExternal, total });
        }

        visibleItems.forEach((t) => {
          const gid = (t as any).groupId as string | undefined;
          if (gid) groupLastId.set(gid, t.id);
        });

        return (
          <React.Fragment key={date}>
            <div className="date-header">{formatDateHeader(date)}</div>

            {visibleItems.map((t, idx) => {
              const x = getCurrentX(t.id);
              const gid = (t as any).groupId as string | undefined;
              const meta = gid ? groupMeta.get(gid) : null;
              const displayAmount =
                meta && meta.isExternal && meta.items.length === 1 ? meta.total : t.amount;
              const showGroupTotal =
                gid && meta && meta.items.length >= 2 && groupLastId.get(gid) === t.id;
              const isGrouped = Boolean(gid && meta && meta.items.length >= 2);
              const prev = idx > 0 ? visibleItems[idx - 1] : null;
              const prevGid = prev ? ((prev as any).groupId as string | undefined) : undefined;
              const prevMeta = prevGid ? groupMeta.get(prevGid) : null;
              const prevIsGrouped = Boolean(prevGid && prevMeta && prevMeta.items.length >= 2);
              const boundaryTop =
                idx > 0 &&
                ((isGrouped && (!prevIsGrouped || gid !== prevGid)) || (prevIsGrouped && !isGrouped));

              return (
                <React.Fragment key={t.id}>
                  <div
                    className="swipe-row"
                    onWheel={(e) => {
                      const raw =
                        Math.abs(e.deltaX) > Math.abs(e.deltaY)
                          ? e.deltaX
                          : e.shiftKey
                            ? e.deltaY
                            : 0;
                      if (raw === 0) return;

                      // 慣性スクロール抑制：小さい揺れは無視
                      const DEAD_ZONE = 2; // 1〜4あたりで好み調整．大きいほど遅くなる
                      if (Math.abs(raw) < DEAD_ZONE) return;

                      // 親（カラムや画面）のスクロールに伝播させない
                      e.preventDefault();

                      // 慣性抑制：移動量を減衰＆1イベントの最大移動量を制限
                      const WHEEL_SCALE = 0.35; // 0.15〜0.35あたりで好み調整
                      const MAX_STEP = 8; // 8〜20あたりで好み調整

                      const dx = clamp(raw * WHEEL_SCALE, -MAX_STEP, MAX_STEP);
                      const base =
                        wheelXById.current[t.id] ??
                        (openId === t.id ? OPEN_X : 0);

                      const nextX = clamp(base - dx, DELETE_X, 0); // dx の向きに合わせて -dx（自然な体感になりやすい）
                      if (nextX <= DELETE_X) {
                        const ok = window.confirm("この項目を削除しますか？");
                        if (ok) {
                          onDeleteTransaction(t.id);
                        }

                        // 状態をリセット
                        setOpenId(null);
                        setDragXById((prev) => {
                          const { [t.id]: _, ...rest } = prev;
                          return rest;
                        });
                        delete wheelXById.current[t.id];
                        delete wheelTimerById.current[t.id];
                        return;
                      }
                      wheelXById.current[t.id] = nextX;
                      // wheel 操作中は dragXById に一時反映（表示追従）
                      setDragXById((prev) => ({ ...prev, [t.id]: nextX }));

                      // wheel が止まったら open / close を確定（離した瞬間に戻る問題の対策）
                      const prevTimer = wheelTimerById.current[t.id];
                      if (prevTimer) window.clearTimeout(prevTimer);

                      wheelTimerById.current[t.id] = window.setTimeout(() => {
                        const x = wheelXById.current[t.id] ?? 0;
                        const shouldOpen = x < OPEN_X / 2;

                        setOpenId(shouldOpen ? t.id : null);

                        // 一時値を掃除（以後は openId で固定）
                        setDragXById((prev) => {
                          const { [t.id]: _, ...rest } = prev;
                          return rest;
                        });
                        delete wheelXById.current[t.id];
                        delete wheelTimerById.current[t.id];
                      }, 120);
                    }}
                  >
                    {/* 背面の削除ボタン */}
                    <button
                      className="swipe-delete"
                      onClick={() => onClickDelete(t.id)}
                      aria-label="delete"
                    >
                      ✕
                    </button>

                    {/* 前面（スワイプする本体） */}
                    <div
                      className={`transaction-item swipe-front type-${t.type} ${boundaryTop ? "group-boundary-top" : ""}`}
                      style={{ transform: `translateX(${x}px)` }}
                      onPointerDown={(e) => onPointerDownRow(e, t.id)}
                      onPointerMove={onPointerMoveRow}
                      onPointerUp={onPointerUpRow}
                      onPointerCancel={onPointerUpRow}
                      onClick={() => {
                        // 開いている時の誤タップ編集を防ぐ
                        if (openId) return;
                        onEditTransaction(t);
                      }}
                    >
                      <div className="row-layout">
                        {t.type === "move" ? (
                          <>
                            <div className="cat is-move">
                              <span className="category-text">{t.source}</span>
                              <span className="move-arrow">→</span>
                            </div>

                            <div className={`nm ${(t.destination || "").length >= 9 ? "nm-small" : ""}`}>
                              {t.destination}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="cat">
                              <span className="category-text">{t.category}</span>
                            </div>

                            <div className={`nm ${t.name.length >= 9 ? "nm-small" : ""}`}>
                              {t.name}
                            </div>
                          </>
                        )}
                        <div className={`amt ${String(displayAmount).length >= 7 ? "amt-small" : ""}`}>
                          {displayAmount.toLocaleString()}円
                        </div>
                      </div>
                    </div>
                  </div>

                  {showGroupTotal && gid && meta && (
                    <div
                      className="transaction-item group-total-row"
                      onClick={() => {
                        setOpenId(null);
                        onSelectGroup(gid, date);
                      }}
                    >
                      <div className="row-layout">
                        <div className="cat">
                          <span className="category-text">合計</span>
                        </div>
                        <div className="nm" />
                        <div className={`amt ${String(meta.total).length >= 7 ? "amt-small" : ""}`}>
                          {meta.total.toLocaleString()}円
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
