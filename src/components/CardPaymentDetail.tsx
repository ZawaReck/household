import React from "react";
import type { Transaction } from "../types/Transaction";
import { cardPaymentLineItems } from "../utils/cardPayments";
import "./CardPaymentDetail.css";

type Props = {
  payment: Transaction;
  transactions: Transaction[];
  onClose: () => void;
};

const formatYen = (amount: number) => `${Math.round(amount).toLocaleString()}円`;

/** Displays the uses that compose a card-payment Move selected from calendar history. */
export const CardPaymentDetail: React.FC<Props> = ({ payment, transactions, onClose }) => {
  const items = cardPaymentLineItems(transactions, payment);

  return (
    <div className="card-payment-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="card-payment-detail" role="dialog" aria-modal="true" aria-labelledby="card-payment-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="card-payment-detail-header">
          <div>
            <h2 id="card-payment-detail-title">{payment.name}の明細</h2>
            <p>{payment.date} · {payment.source}から引落</p>
          </div>
          <button type="button" className="card-payment-detail-close" aria-label="閉じる" onClick={onClose}>×</button>
        </div>
        <div className="card-payment-detail-total"><span>引落額</span><strong>−{formatYen(payment.amount)}</strong></div>
        <div className="card-payment-detail-list" aria-label="引落対象の明細">
          {items.length === 0 ? <p>この引落に含まれる明細はありません。</p> : items.map((item) => (
            <div key={item.id}>
              <span>{item.date.slice(5).replace("-", "/")}</span>
              <span><strong>{item.name || item.category}</strong><small>{item.category}</small></span>
              <strong>−{formatYen(item.amount)}</strong>
            </div>
          ))}
        </div>
        <div className="card-payment-detail-footer"><button type="button" onClick={onClose}>閉じる</button></div>
      </section>
    </div>
  );
};
