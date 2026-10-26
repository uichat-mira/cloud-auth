/** CSS is intentionally inlined: OAuth browser form has a restrictive CSP and no JS/assets. */
export const authorizationStyles = `
:root {color-scheme:light;font-family:Inter,"SF Pro Display","PingFang SC","Microsoft YaHei",ui-sans-serif,system-ui,sans-serif;color:#20201e;background:#faf9f7;font-synthesis:none;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh}
main{width:min(100%,505px);margin:0 auto;padding:clamp(3.75rem,11vh,6rem) 24px 6rem}
.brand{display:flex;align-items:center;gap:11px;margin-bottom:65px;font-size:14px;font-weight:650;letter-spacing:-.02em}
.mark{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#20201e;color:#fff;font-size:17px;font-weight:700;letter-spacing:-.09em}
.app-mark{width:44px;height:44px;border-radius:14px;background:#efede8;display:grid;place-items:center;margin-bottom:35px;color:#45433d}
.app-mark svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round}
.eyebrow{display:block;margin:0 0 22px;color:#92908a;text-transform:uppercase;font-size:10px;letter-spacing:.18em;font-weight:680}
h1{margin:0;font-size:32px;font-weight:650;letter-spacing:-.05em;line-height:1.3}
.lead{margin:16px 0 34px;font-size:13px;line-height:1.9;color:#77746c}
.lead strong{font-weight:650;color:#34332f}
form{display:grid;gap:19px}
.field{display:grid;gap:9px}
label{font-size:12px;color:#46443f;font-weight:600}
input:not([type=hidden]){display:block;width:100%;min-width:0;min-height:46px;border:1px solid #dcd9d2;border-radius:9px;background:#fff;color:#20201e;padding:12px 13px;font:inherit;font-size:13px}
input:not([type=hidden]):focus-visible,button:focus-visible{outline:3px solid #8c8b84;outline-offset:2px}
button{width:100%;min-height:46px;margin-top:15px;padding:13px 20px;border:1px solid #22211e;border-radius:9px;background:#22211e;color:#fff;font:inherit;font-size:13px;font-weight:620;cursor:pointer}
button:hover{background:#45433d}
.error{margin:0;padding:12px;border-left:2px solid #b45b54;background:#fbf0ee;color:#9b514c;font-size:12px;line-height:1.7}
.note{padding-top:23px;margin:29px 0 0;border-top:1px solid #e8e6e1;color:#88857f;font-size:11px;line-height:1.9}
@media(max-width:480px){main{padding-top:55px}.brand{margin-bottom:42px}h1{font-size:29px}}
`;
