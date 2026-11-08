const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
  Space: 'Space',
  Enter: 'Enter',
};

export function configKeyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key.length === 1 ? key.toUpperCase() : key;
}
