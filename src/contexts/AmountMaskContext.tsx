import React from "react";

export const AmountMaskContext = React.createContext(false);

export const useAmountMask = () => React.useContext(AmountMaskContext);

export const maskedYen = (amount: number | unknown, masked: boolean) =>
  masked ? "******" : `${Math.round(Number(Array.isArray(amount) ? amount[0] : amount ?? 0)).toLocaleString()}円`;

export const maskedPercent = (value: number | null | undefined, masked: boolean) =>
  value == null ? "—" : masked ? "******" : `${value.toFixed(1)}%`;
