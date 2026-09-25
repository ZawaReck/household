import { PickerPanel, SelectionWheel } from "./PickerPanel";

type Props = {
  options: string[];
  value: string;
  title?: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

export function WheelPickerInline({ options, value, title = "口座選択", onChange, onClose }: Props) {
  return <PickerPanel title={title} onClose={onClose}>
    {options.length ? <div className="selection-wheel-columns"><SelectionWheel label={title} options={options}
      selectedIndex={Math.max(0, options.indexOf(value))} onSelect={(index) => onChange(options[index])} /></div>
      : <div className="selection-panel-empty">選択できる口座がありません</div>}
  </PickerPanel>;
}
