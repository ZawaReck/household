export const historyEntryFlowTop = (target: Element) => {
  let top = 0;
  let preceding = target.previousElementSibling;
  while (preceding) {
    top += preceding.getBoundingClientRect().height;
    preceding = preceding.previousElementSibling;
  }
  return top;
};
