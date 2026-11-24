/**
 * 官方默认立绘：艾拉（时空管家）。
 * 用内联 SVG 绘制，不依赖任何外部图片；玩家放入同名 PNG 后会自动优先使用图片。
 */

const ELLA_LABELS = ['常态微笑', '开心眨眼', '害羞脸红', '认真思考'];

export function isEllaLabel(name: string): boolean {
  return ELLA_LABELS.includes(name);
}

export function ellaSvg(label: string): string {
  const isHappy = /开心|笑|眨眼/.test(label);
  const isShy = /害羞|脸红|委屈/.test(label);
  const isThink = /思考|认真|生气/.test(label);
  const mouthPath = isHappy
    ? 'M148 164 Q160 176 172 164'
    : isShy
      ? 'M154 166 Q160 163 166 166'
      : isThink
        ? 'M153 166 L167 165'
        : 'M150 164 Q160 171 170 164';
  const rightEye = isHappy
    ? '<path d="M174 142 Q183 135 192 142" stroke="#5D4B8A" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : '<ellipse cx="183" cy="142" rx="7" ry="8" fill="#6F5CC4"/><circle cx="185" cy="140" r="2.5" fill="#FFF"/>';
  const blush = isShy
    ? '<ellipse cx="132" cy="154" rx="13" ry="6" fill="#E7B5D5" opacity="0.65"/><ellipse cx="188" cy="154" rx="13" ry="6" fill="#E7B5D5" opacity="0.65"/>'
    : '<ellipse cx="132" cy="154" rx="9" ry="4" fill="#E7B5D5" opacity="0.3"/><ellipse cx="188" cy="154" rx="9" ry="4" fill="#E7B5D5" opacity="0.3"/>';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="320" height="440">
  <defs>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F6F2FF"/>
      <stop offset="55%" stop-color="#D7CEF0"/>
      <stop offset="100%" stop-color="#A699C9"/>
    </linearGradient>
    <linearGradient id="coat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2E2554"/>
      <stop offset="100%" stop-color="#171633"/>
    </linearGradient>
  </defs>
  <path d="M90 120 Q60 220 75 340 Q160 365 245 340 Q260 220 230 120 Q205 55 160 55 Q115 55 90 120 Z" fill="url(#hair)"/>
  <path d="M88 260 Q110 225 160 225 Q210 225 232 260 L255 435 L65 435 Z" fill="url(#coat)" stroke="#DCC39A" stroke-width="2"/>
  <path d="M132 228 L160 288 L188 228 Z" fill="#F7F3FA"/>
  <polygon points="160,245 142,258 160,268 178,258" fill="#3B4CB8" stroke="#DCC39A" stroke-width="1.5"/>
  <circle cx="160" cy="256" r="5" fill="#7CA7FF"/>
  <circle cx="204" cy="296" r="14" fill="#F7F3FA" stroke="#DCC39A" stroke-width="3"/>
  <path d="M204 296 L204 288 M204 296 L210 299" stroke="#241C3D" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="148" y="190" width="24" height="38" rx="10" fill="#FCEAE8"/>
  <ellipse cx="160" cy="145" rx="46" ry="54" fill="#FFF1EF"/>
  ${blush}
  <ellipse cx="137" cy="142" rx="7" ry="8" fill="#6F5CC4"/>
  <circle cx="139" cy="140" r="2.5" fill="#FFF"/>
  ${rightEye}
  <path d="${mouthPath}" stroke="#B97B8C" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M108 135 Q125 82 160 80 Q195 82 212 135 Q190 105 162 115 Q138 102 108 135 Z" fill="url(#hair)"/>
  <g transform="translate(208, 92) rotate(14)">
    <polygon points="0,-16 4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4" fill="#DCC39A"/>
    <circle cx="0" cy="0" r="5" fill="#5D8BFF"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
